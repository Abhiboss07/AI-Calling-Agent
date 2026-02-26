const openai = require('./openaiClient');
const logger = require('../utils/logger');
const metrics = require('./metrics');
const costControl = require('./costControl');
const config = require('../config');
const { getLanguage } = require('../config/languages');
const { WaveFile } = require('wavefile');

// ══════════════════════════════════════════════════════════════════════════════
// TTS SERVICE — OpenAI Speech Synthesis
// ══════════════════════════════════════════════════════════════════════════════

// In-memory LRU cache for frequently spoken phrases (avoid re-synthesis)
// FIX H3: Cache keyed by hash, with memory cap to prevent OOM
const ttsCache = new Map();    // fullText → { url, mulawBuffer }
const MAX_CACHE = config.tts?.cacheMaxEntries || 100;
const MAX_CACHE_BYTES = config.tts?.cacheMaxBytes || (3 * 1024 * 1024); // 3MB
let currentCacheBytes = 0;

function cacheKey(text, language) {
  // Simple FNV-1a hash for fast unique key generation
  const input = `${language || 'en-IN'}:${text}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return `${hash}_${input.length}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// µ-LAW ENCODING (for bidirectional stream playback)
// ══════════════════════════════════════════════════════════════════════════════
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

function pcm16ToMulaw(sample) {
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  if (sample < -MULAW_CLIP) sample = -MULAW_CLIP;
  const sign = (sample < 0) ? 0x80 : 0;
  if (sign) sample = -sample;
  sample = sample + MULAW_BIAS;
  let exponent = 7;
  const expMask = 0x4000;
  for (; exponent > 0; exponent--) {
    if (sample & expMask) break;
    sample <<= 1;
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

function pcmBufferToMulaw(pcmBuffer) {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const mulaw = Buffer.alloc(numSamples);
  for (let i = 0; i < numSamples; i++) {
    mulaw[i] = pcm16ToMulaw(pcmBuffer.readInt16LE(i * 2));
  }
  return mulaw;
}

// Simple 3:1 downsampling (24kHz → 8kHz)
// Instead of simple averaging, use wavefile's built-in resampler (better LPF)
function resample24kTo8k(pcm24kBuffer) {
  // 1. Convert Buffer to Int16Array
  const samples = new Int16Array(pcm24kBuffer.buffer, pcm24kBuffer.byteOffset, pcm24kBuffer.length / 2);

  // 2. Initialize a wave file with the 24kHz data
  const wav = new WaveFile();
  wav.fromScratch(1, 24000, '16', samples);

  // 3. Resample using cubic/sinc algorithm natively
  wav.toSampleRate(8000, { method: 'sinc' });

  // 4. Extract the resampled 8kHz audio back into a Buffer
  const resampledSamples = wav.getSamples(false, Int16Array);
  return Buffer.from(resampledSamples.buffer, resampledSamples.byteOffset, resampledSamples.byteLength);
}

// ══════════════════════════════════════════════════════════════════════════════
// synthesizeRaw() — Returns µ-law buffer for DIRECT bidirectional stream playback
// ══════════════════════════════════════════════════════════════════════════════
// CRITICAL: This is the PRIMARY synthesis method. It returns µ-law audio
// that can be sent directly through the WebSocket without any REST API calls.
// This avoids the fatal bug where client.calls(sid).update({twiml}) kills
// the <Connect><Stream>.
async function synthesizeRaw(text, callSid, language = 'en-IN') {
  if (!text || text.trim().length === 0) {
    logger.warn('TTS: empty text, skipping');
    return null;
  }

  const cleanText = text.trim();
  const key = cacheKey(cleanText, language);

  // Check cache
  if (ttsCache.has(key)) {
    logger.debug('TTS cache hit:', cleanText.substring(0, 30));
    return ttsCache.get(key);
  }

  const startMs = Date.now();

  try {
    metrics.incrementTtsRequest(true);

    // Request PCM output from OpenAI TTS
    const langConfig = getLanguage(language);
    const voice = langConfig.ttsVoice || 'alloy';
    const rawBuffer = await openai.ttsSynthesize(cleanText, voice, 'pcm');
    const synthMs = Date.now() - startMs;

    if (!rawBuffer || rawBuffer.length === 0) {
      logger.error('TTS returned empty buffer');
      return null;
    }

    // OpenAI PCM output is 24kHz 16-bit mono
    // Resample to 8kHz for Vobiz bidirectional stream
    const pcm8k = resample24kTo8k(Buffer.from(rawBuffer));

    // Encode to µ-law for Vobiz bidirectional stream
    const mulawBuffer = pcmBufferToMulaw(pcm8k);

    logger.debug(`TTS raw: ${cleanText.length} chars → ${mulawBuffer.length} bytes µ-law (${synthMs}ms)`);

    if (callSid) costControl.addTtsUsage(callSid, cleanText.length);

    const result = { mulawBuffer, pcmBuffer: pcm8k };

    // Cache (FIX H3: evict based on both count AND memory)
    while (ttsCache.size >= MAX_CACHE || currentCacheBytes + result.mulawBuffer.length >= MAX_CACHE_BYTES) {
      if (ttsCache.size === 0) break;
      const firstKey = ttsCache.keys().next().value;
      const evicted = ttsCache.get(firstKey);
      currentCacheBytes -= (evicted.mulawBuffer?.length || 0);
      ttsCache.delete(firstKey);
    }
    currentCacheBytes += result.mulawBuffer.length;
    ttsCache.set(key, result);

    return result;
  } catch (err) {
    logger.error('TTS raw error:', err.message || err);
    metrics.incrementTtsRequest(false);
    return null;
  }
}

module.exports = { synthesizeRaw, pcm16ToMulaw, pcmBufferToMulaw };

const openai = require('./openaiClient');
const logger = require('../utils/logger');
const metrics = require('./metrics');
const costControl = require('./costControl');
const config = require('../config');
const { getLanguage } = require('../config/languages');

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

// ══════════════════════════════════════════════════════════════════════════════
// RESAMPLE: OpenAI TTS outputs 24kHz, Vobiz needs 8kHz
// ══════════════════════════════════════════════════════════════════════════════
// High-quality resampling with anti-aliasing low-pass filter + linear interpolation

// Pre-computed low-pass FIR filter coefficients (cutoff ~3.5kHz for 24kHz input)
// This prevents aliasing artifacts when downsampling to 8kHz (Nyquist = 4kHz)
const LPF_TAPS = [
  0.0078, 0.0156, 0.0312, 0.0547, 0.0781,
  0.0938, 0.1016, 0.1016, 0.0938, 0.0781,
  0.0547, 0.0312, 0.0156, 0.0078
];
const LPF_LEN = LPF_TAPS.length;

function applyLowPassFilter(samples) {
  const filtered = new Float32Array(samples.length);
  const halfLen = Math.floor(LPF_LEN / 2);

  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (let j = 0; j < LPF_LEN; j++) {
      const idx = i - halfLen + j;
      if (idx >= 0 && idx < samples.length) {
        sum += samples[idx] * LPF_TAPS[j];
      }
    }
    filtered[i] = sum;
  }
  return filtered;
}

function resample24kTo8k(pcm24kBuffer) {
  const numSamples24 = Math.floor(pcm24kBuffer.length / 2);
  if (numSamples24 === 0) return Buffer.alloc(0);

  // Step 1: Convert to float array for processing
  const samples24 = new Float32Array(numSamples24);
  for (let i = 0; i < numSamples24; i++) {
    samples24[i] = pcm24kBuffer.readInt16LE(i * 2);
  }

  // Step 2: Apply low-pass anti-aliasing filter
  const filtered = applyLowPassFilter(samples24);

  // Step 3: Linear interpolation resampling (24kHz → 8kHz = ratio 3:1)
  const ratio = 3.0;
  const numSamples8 = Math.floor(numSamples24 / ratio);
  const result = Buffer.alloc(numSamples8 * 2);

  for (let i = 0; i < numSamples8; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    // Linear interpolation between two adjacent samples
    const s0 = filtered[srcIdx] || 0;
    const s1 = filtered[Math.min(srcIdx + 1, numSamples24 - 1)] || 0;
    const interpolated = s0 + frac * (s1 - s0);

    // Clamp and write
    const sample = Math.round(Math.max(-32768, Math.min(32767, interpolated)));
    result.writeInt16LE(sample, i * 2);
  }

  return result;
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

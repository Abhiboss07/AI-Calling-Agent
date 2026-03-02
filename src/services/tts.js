const openai = require('./openaiClient');
const logger = require('../utils/logger');
const metrics = require('./metrics');
const costControl = require('./costControl');
const config = require('../config');
const { getLanguage } = require('../config/languages');

// In-memory LRU cache for frequently spoken phrases.
// fullTextHash -> { mulawBuffer, pcmBuffer }
const ttsCache = new Map();
const MAX_CACHE = config.tts?.cacheMaxEntries || 100;
const MAX_CACHE_BYTES = config.tts?.cacheMaxBytes || (3 * 1024 * 1024); // 3MB
let currentCacheBytes = 0;

function cacheKey(text, language) {
  const input = `${language || 'en-IN'}:${text}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return `${hash}_${input.length}`;
}

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

// Fast telephony-oriented downsampling: 24kHz -> 8kHz (3:1).
// This is significantly faster than sinc and keeps enough quality for phone calls.
function downsample24kTo8kFast(pcm24kBuffer) {
  const inputSamples = Math.floor(pcm24kBuffer.length / 2);
  const outputSamples = Math.floor(inputSamples / 3);
  const out = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const idx = i * 3;
    const s1 = pcm24kBuffer.readInt16LE(idx * 2);
    const s2 = pcm24kBuffer.readInt16LE((idx + 1) * 2);
    const s3 = pcm24kBuffer.readInt16LE((idx + 2) * 2);
    const avg = Math.round((s1 + s2 + s3) / 3);
    out.writeInt16LE(avg, i * 2);
  }

  return out;
}

function resample24kTo8k(pcm24kBuffer) {
  const mode = String(config.tts?.resampleMode || 'fast').toLowerCase();
  if (mode !== 'sinc') {
    return downsample24kTo8kFast(pcm24kBuffer);
  }

  try {
    // Lazy require so startup is lightweight when running in fast mode.
    const { WaveFile } = require('wavefile');
    const samples = new Int16Array(
      pcm24kBuffer.buffer,
      pcm24kBuffer.byteOffset,
      Math.floor(pcm24kBuffer.length / 2)
    );
    const wav = new WaveFile();
    wav.fromScratch(1, 24000, '16', samples);
    wav.toSampleRate(8000, { method: 'sinc' });
    const resampled = wav.getSamples(false, Int16Array);
    return Buffer.from(resampled.buffer, resampled.byteOffset, resampled.byteLength);
  } catch (err) {
    logger.warn('TTS sinc resample failed, falling back to fast mode', err.message || err);
    return downsample24kTo8kFast(pcm24kBuffer);
  }
}

function addToCache(key, value) {
  while (ttsCache.size >= MAX_CACHE || (currentCacheBytes + value.mulawBuffer.length) >= MAX_CACHE_BYTES) {
    if (ttsCache.size === 0) break;
    const oldestKey = ttsCache.keys().next().value;
    const evicted = ttsCache.get(oldestKey);
    currentCacheBytes -= (evicted?.mulawBuffer?.length || 0);
    ttsCache.delete(oldestKey);
  }

  currentCacheBytes += value.mulawBuffer.length;
  ttsCache.set(key, value);
}

async function synthesizeRaw(text, callSid, language = 'en-IN') {
  if (!text || text.trim().length === 0) {
    logger.warn('TTS: empty text, skipping');
    return null;
  }

  const cleanText = text.trim();
  const key = cacheKey(cleanText, language);

  if (ttsCache.has(key)) {
    return ttsCache.get(key);
  }

  const startMs = Date.now();

  try {
    metrics.incrementTtsRequest(true);

    const langConfig = getLanguage(language);
    const voice = langConfig.ttsVoice || 'alloy';
    const rawBuffer = await openai.ttsSynthesize(cleanText, voice, 'pcm');
    const synthMs = Date.now() - startMs;

    if (!rawBuffer || rawBuffer.length === 0) {
      logger.error('TTS returned empty buffer');
      return null;
    }

    // OpenAI PCM output is 24kHz 16-bit mono; Vobiz playback needs 8kHz mu-law.
    const pcm8k = resample24kTo8k(Buffer.from(rawBuffer));
    const mulawBuffer = pcmBufferToMulaw(pcm8k);

    if (callSid) costControl.addTtsUsage(callSid, cleanText.length);

    const result = { mulawBuffer, pcmBuffer: pcm8k };
    addToCache(key, result);

    logger.debug(`TTS raw: ${cleanText.length} chars -> ${mulawBuffer.length} bytes mu-law (${synthMs}ms)`);
    return result;
  } catch (err) {
    logger.error('TTS raw error:', err.message || err);
    metrics.incrementTtsRequest(false);
    return null;
  }
}

async function prewarmPhrases(phrases, language = 'en-IN') {
  if (!Array.isArray(phrases) || phrases.length === 0) {
    return { attempted: 0, warmed: 0 };
  }

  const unique = Array.from(new Set(
    phrases
      .map((p) => String(p || '').trim())
      .filter((p) => p.length > 0)
  ));

  let warmed = 0;
  const results = await Promise.allSettled(unique.map((text) => synthesizeRaw(text, null, language)));
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.mulawBuffer) warmed++;
  }

  return { attempted: unique.length, warmed };
}

// ── Streaming TTS ───────────────────────────────────────────────────────────

async function* synthesizeStream(text, callSid, language = 'en-IN') {
  if (!text || text.trim().length === 0) return;

  const cleanText = text.trim();
  const startMs = Date.now();

  try {
    metrics.incrementTtsRequest(true);

    const langConfig = getLanguage(language);
    const voice = langConfig.ttsVoice || 'alloy';

    // Call the streaming endpoint from our openaiClient
    const stream = await openai.ttsSynthesizeStream(cleanText, voice, 'pcm');

    // We expect 24kHz 16-bit PCM mono from OpenAI
    // We need to chunk it, resample to 8kHz, convert to mu-law, and yield.
    // Optimal chunk size for resampling is important. 
    // Let's use 4800 bytes of 24kHz = 2400 samples = 100ms of audio.
    const CHUNK_SIZE = 4800;
    let buffer = Buffer.alloc(0);

    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= CHUNK_SIZE) {
        // Take a complete chunk
        const processBuf = buffer.subarray(0, CHUNK_SIZE);
        buffer = buffer.subarray(CHUNK_SIZE);

        // Resample 24kHz -> 8kHz (use fast downsampling to avoid sinc boundary artifacts on chunks)
        const pcm8k = downsample24kTo8kFast(processBuf);

        // Convert to mu-law explicitly for Vobiz
        const mulawBuffer = pcmBufferToMulaw(pcm8k);

        yield mulawBuffer;
      }
    }

    // Process any remaining bytes at the end of the stream
    if (buffer.length > 0) {
      // Ensure we have an even number of bytes for 16-bit PCM and divisible by 6 for 3:1 average downsampling
      const extra = buffer.length % 6;
      const safeBuffer = extra === 0 ? buffer : buffer.subarray(0, buffer.length - extra);
      if (safeBuffer.length > 0) {
        const pcm8k = downsample24kTo8kFast(safeBuffer);
        const mulawBuffer = pcmBufferToMulaw(pcm8k);
        yield mulawBuffer;
      }
    }

    const synthMs = Date.now() - startMs;
    if (callSid) costControl.addTtsUsage(callSid, cleanText.length);
    logger.debug(`TTS stream complete: ${cleanText.length} chars (${synthMs}ms)`);

  } catch (err) {
    logger.error('TTS stream error:', err.message || err);
    metrics.incrementTtsRequest(false);
  }
}

module.exports = {
  synthesizeRaw,
  synthesizeStream,
  prewarmPhrases,
  pcm16ToMulaw,
  pcmBufferToMulaw,
  downsample24kTo8kFast
};

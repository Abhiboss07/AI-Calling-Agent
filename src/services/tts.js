/**
 * TTS Service — Sarvam AI
 *
 * Replaces: OpenAI TTS-1
 * API: POST https://api.sarvam.ai/text-to-speech
 * Output: base64 WAV at 8kHz 16-bit PCM mono → strip header → μ-law encode
 *
 * Preserves the same public API surface as the old tts.js so ws-media-optimized.js
 * requires zero changes.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const metrics = require('./metrics');
const costControl = require('./costControl');
const config = require('../config');
const { getLanguage } = require('../config/languages');

// ── Sarvam Language & Speaker Mapping ────────────────────────────────────────
// Valid model: bulbul:v2 (bulbul:v3-beta / bulbul:v3 also available)
// Valid female speakers (professional): anushka, priya, neha, kavya, ishita, shruti
// Valid male speakers: rahul, rohan, amit, dev, karun, hitesh
const SARVAM_LANGUAGE_MAP = {
  'en-IN':    { code: 'en-IN',    speaker: 'anushka' },
  'hi-IN':    { code: 'hi-IN',    speaker: 'anushka' },
  'hinglish': { code: 'hi-IN',    speaker: 'anushka' },
  'ta-IN':    { code: 'ta-IN',    speaker: 'anushka' },
  'te-IN':    { code: 'te-IN',    speaker: 'anushka' },
  'kn-IN':    { code: 'kn-IN',    speaker: 'anushka' },
  'ml-IN':    { code: 'ml-IN',    speaker: 'anushka' },
  'mr-IN':    { code: 'mr-IN',    speaker: 'anushka' },
  'bn-IN':    { code: 'bn-IN',    speaker: 'anushka' },
  'gu-IN':    { code: 'gu-IN',    speaker: 'anushka' }
};

function getSarvamConfig(language) {
  return SARVAM_LANGUAGE_MAP[language] || SARVAM_LANGUAGE_MAP['en-IN'];
}

// ── μ-law Encoder ─────────────────────────────────────────────────────────────
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

// Strip WAV header (44 bytes standard) and return raw PCM buffer
function stripWavHeader(wavBuffer) {
  // Verify RIFF header
  if (wavBuffer.length < 44) {
    logger.warn('TTS: WAV buffer too small to strip header');
    return wavBuffer;
  }
  const riff = wavBuffer.slice(0, 4).toString('ascii');
  if (riff !== 'RIFF') {
    logger.warn('TTS: No RIFF header found, treating as raw PCM');
    return wavBuffer;
  }
  // Find 'data' subchunk (may not always be at byte 36)
  let dataOffset = 12;
  while (dataOffset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.slice(dataOffset, dataOffset + 4).toString('ascii');
    const chunkSize = wavBuffer.readUInt32LE(dataOffset + 4);
    if (chunkId === 'data') {
      return wavBuffer.slice(dataOffset + 8);
    }
    dataOffset += 8 + chunkSize;
  }
  // Fallback: skip first 44 bytes
  return wavBuffer.slice(44);
}

// Downsample helper kept for fallback if Sarvam returns non-8kHz audio
function downsample24kTo8kFast(pcm24kBuffer) {
  const inputSamples = Math.floor(pcm24kBuffer.length / 2);
  const outputSamples = Math.floor(inputSamples / 3);
  const out = Buffer.alloc(outputSamples * 2);
  const readSample = (idx) => {
    if (idx < 0 || idx >= inputSamples) return 0;
    return pcm24kBuffer.readInt16LE(idx * 2);
  };
  for (let i = 0; i < outputSamples; i++) {
    const center = i * 3 + 1;
    const filtered = (
      readSample(center - 2) * 1 +
      readSample(center - 1) * 2 +
      readSample(center)     * 3 +
      readSample(center + 1) * 2 +
      readSample(center + 2) * 1
    ) / 9;
    const clamped = Math.max(-32768, Math.min(32767, Math.round(filtered)));
    out.writeInt16LE(clamped, i * 2);
  }
  return out;
}

// ── LRU Cache ────────────────────────────────────────────────────────────────
const ttsCache = new Map();
const MAX_CACHE = config.tts?.cacheMaxEntries || 100;
const MAX_CACHE_BYTES = config.tts?.cacheMaxBytes || (3 * 1024 * 1024);
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

// ── Sarvam API Call ───────────────────────────────────────────────────────────
async function callSarvamTTS(text, language) {
  if (!config.sarvamApiKey) throw new Error('SARVAM_API_KEY missing');

  const { code: targetLanguage, speaker } = getSarvamConfig(language);
  const timeout = Math.max(8000, text.length * 80);

  const response = await axios.post(
    'https://api.sarvam.ai/text-to-speech',
    {
      inputs: [text],
      target_language_code: targetLanguage,
      speaker,
      pitch: 0,
      pace: 1.55,          // Slightly faster for phone conversations
      loudness: 1.5,
      speech_sample_rate: 8000,   // Request 8kHz directly — no resampling needed
      enable_preprocessing: true,
      model: 'bulbul:v2'
    },
    {
      headers: {
        'api-subscription-key': config.sarvamApiKey,
        'Content-Type': 'application/json'
      },
      timeout
    }
  );

  const base64Audio = response.data?.audios?.[0];
  if (!base64Audio) throw new Error('Sarvam TTS returned no audio');

  const wavBuffer = Buffer.from(base64Audio, 'base64');
  const pcm8k = stripWavHeader(wavBuffer);
  return pcm8k;
}

// ── synthesizeRaw ─────────────────────────────────────────────────────────────
// Primary API: synthesize and return { mulawBuffer, pcmBuffer }
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

    const pcm8k = await callSarvamTTS(cleanText, language);
    const synthMs = Date.now() - startMs;

    if (!pcm8k || pcm8k.length === 0) {
      logger.error('TTS returned empty PCM buffer');
      return null;
    }

    const mulawBuffer = pcmBufferToMulaw(pcm8k);

    if (callSid) costControl.addTtsUsage(callSid, cleanText.length);

    const result = { mulawBuffer, pcmBuffer: pcm8k };
    addToCache(key, result);

    logger.debug(`TTS (Sarvam ${synthMs}ms): ${cleanText.length} chars → ${mulawBuffer.length} bytes μ-law`);
    return result;
  } catch (err) {
    logger.error('TTS synthesizeRaw error:', err.message || err);
    metrics.incrementTtsRequest(false);
    return null;
  }
}

// ── synthesizeStream ──────────────────────────────────────────────────────────
// Sarvam does not stream; we return the full buffer as an async generator
// to keep the same API surface as before.
async function* synthesizeStream(text, callSid, language = 'en-IN') {
  if (!text || text.trim().length === 0) return;

  const result = await synthesizeRaw(text, callSid, language);
  if (!result?.mulawBuffer) return;

  // Yield in 160-byte (20ms) chunks for natural pacing
  const CHUNK = 160;
  let offset = 0;
  while (offset < result.mulawBuffer.length) {
    yield result.mulawBuffer.slice(offset, offset + CHUNK);
    offset += CHUNK;
  }
}

// ── synthesizeRawCached ───────────────────────────────────────────────────────
// Synchronous cache-only lookup — used by speculative early response.
function synthesizeRawCached(text, language = 'en-IN') {
  if (!text || text.trim().length === 0) return null;
  const key = cacheKey(text.trim(), language);
  return ttsCache.get(key) || null;
}

// ── prewarmPhrases ────────────────────────────────────────────────────────────
async function prewarmPhrases(phrases, language = 'en-IN') {
  if (!Array.isArray(phrases) || phrases.length === 0) return { attempted: 0, warmed: 0 };
  const unique = Array.from(new Set(
    phrases.map((p) => String(p || '').trim()).filter((p) => p.length > 0)
  ));
  let warmed = 0;
  const results = await Promise.allSettled(unique.map((text) => synthesizeRaw(text, null, language)));
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.mulawBuffer) warmed++;
  }
  return { attempted: unique.length, warmed };
}

module.exports = {
  synthesizeRaw,
  synthesizeRawCached,
  synthesizeStream,
  prewarmPhrases,
  pcm16ToMulaw,
  pcmBufferToMulaw,
  downsample24kTo8kFast   // exported for backward compat (used in ws-media-optimized.js)
};

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

const getStream = require('get-stream');
const ffmpeg = require('fluent-ffmpeg');

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

// Convert audio stream to 8kHz PCM using ffmpeg instead of fast downsampling
async function convertTo8kPcm(audioStream) {
  const pcmStream = ffmpeg(audioStream)
    .inputFormat('mp3')
    .audioFrequency(8000)
    .audioChannels(1)
    .audioCodec('pcm_s16le')
    .format('s16le')
    .on('error', err => logger.error('ffmpeg conversion error:', err.message))
    .pipe();

  const buffer = await getStream.buffer(pcmStream);
  return buffer;
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
    // Use MP3 generation for better ffmpeg compatibility and smaller transfer size
    const rawBuffer = await openai.ttsSynthesize(cleanText, voice, 'mp3');
    const synthMs = Date.now() - startMs;

    if (!rawBuffer || rawBuffer.length === 0) {
      logger.error('TTS returned empty buffer');
      return null;
    }

    const { PassThrough } = require('stream');
    const bStream = new PassThrough();
    bStream.end(Buffer.from(rawBuffer));

    const pcm8k = await convertTo8kPcm(bStream);
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

// Removed Streaming TTS as instructed to avoid node ffmpeg iterable bugs

module.exports = {
  synthesizeRaw,
  prewarmPhrases,
  pcm16ToMulaw,
  pcmBufferToMulaw
};

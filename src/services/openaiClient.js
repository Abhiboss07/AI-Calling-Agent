const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

const OPENAI_BASE = 'https://api.openai.com';

// Reusable axios instance with connection keep-alive for lower latency
const apiClient = axios.create({
  baseURL: OPENAI_BASE,
  headers: { Authorization: `Bearer ${config.openaiApiKey}` },
  httpAgent: new (require('http').Agent)({ keepAlive: true }),
  httpsAgent: new (require('https').Agent)({ keepAlive: true, maxSockets: 20 })
});

// ── STT: Whisper Transcription ──────────────────────────────────────────────
async function transcribeAudio(buffer, mimeType = 'audio/wav') {
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY missing');

  const fn = async () => {
    // CRITICAL: Create a NEW FormData on every attempt.
    const form = new FormData();
    form.append('file', Buffer.from(buffer), { filename: 'audio.wav', contentType: mimeType });
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');

    const resp = await apiClient.post('/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders() },
      timeout: 15000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    return resp.data;
  };
  return retry(fn, { retries: 2, minDelay: 300, factor: 2 });
}

// ── LLM: Chat Completion ────────────────────────────────────────────────────
async function chatCompletion(messages, model = 'gpt-4o-mini', opts = {}) {
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY missing');

  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 200
  };

  const fn = async () => {
    const resp = await apiClient.post('/v1/chat/completions', body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000
    });
    return resp.data;
  };
  return retry(fn, { retries: 1, minDelay: 200, factor: 1 });
}

// ── TTS: Text-to-Speech ─────────────────────────────────────────────────────
// format: 'mp3' (default, for S3 upload) or 'pcm' (for direct stream playback)
// PCM output: 24kHz 16-bit mono little-endian (needs resampling to 8kHz for Twilio)
async function ttsSynthesize(text, voice = 'alloy', format = 'mp3') {
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY missing');

  const body = {
    model: 'gpt-4o-mini-tts',
    voice,
    input: text,
    response_format: format === 'pcm' ? 'pcm' : 'mp3'
  };

  const fn = async () => {
    const resp = await apiClient.post('/v1/audio/speech', body, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
      timeout: 10000
    });
    return resp.data;
  };
  return retry(fn, { retries: 1, minDelay: 200, factor: 1 });
}

module.exports = { transcribeAudio, chatCompletion, ttsSynthesize };

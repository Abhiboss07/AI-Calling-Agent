const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');
const CircuitBreaker = require('../utils/circuitBreaker');

// Circuit breakers for each OpenAI service (M11)
const sttBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 });
const llmBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 });
const ttsBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 });

const OPENAI_BASE = 'https://api.openai.com';

// Reusable axios instance with connection keep-alive for lower latency
const apiClient = axios.create({
  baseURL: OPENAI_BASE,
  headers: { Authorization: `Bearer ${config.openaiApiKey}` },
  httpAgent: new (require('http').Agent)({ keepAlive: true }),
  httpsAgent: new (require('https').Agent)({ keepAlive: true, maxSockets: 20 })
});

// ── STT: Whisper Transcription ──────────────────────────────────────────────
/** @param {Buffer} buffer - WAV audio buffer (8kHz mono 16-bit PCM)
 *  @param {string} mimeType
 *  @returns {Promise<{text: string, segments?: Array}>} */
async function transcribeAudio(buffer, mimeType = 'audio/wav', language = 'en') {
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY missing');

  return sttBreaker.exec(async () => {
    const fn = async () => {
      // CRITICAL: Create a NEW FormData on every attempt.
      const form = new FormData();
      form.append('file', Buffer.from(buffer), { filename: 'audio.wav', contentType: mimeType });
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');
      if (language) form.append('language', language);

      const resp = await apiClient.post('/v1/audio/transcriptions', form, {
        headers: { ...form.getHeaders() },
        timeout: 10000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      return resp.data;
    };
    return retry(fn, { retries: 2, minDelay: 300, factor: 2 });
  });
}

// ── LLM: Chat Completion ────────────────────────────────────────────────────
/** @param {Array<{role:string,content:string}>} messages
 *  @param {string} model
 *  @param {{temperature?:number, max_tokens?:number}} opts */
async function chatCompletion(messages, model = 'gpt-4o-mini', opts = {}) {
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY missing');

  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 200
  };

  return llmBreaker.exec(async () => {
    const fn = async () => {
      const resp = await apiClient.post('/v1/chat/completions', body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000
      });
      return resp.data;
    };
    return retry(fn, { retries: 1, minDelay: 200, factor: 1 });
  });
}

// ── TTS: Text-to-Speech ─────────────────────────────────────────────────────
// format: 'mp3' (default, for S3 upload) or 'pcm' (for direct stream playback)
// PCM output: 24kHz 16-bit mono little-endian (needs resampling to 8kHz for Vobiz)
/** @param {string} text - The text to synthesize
 *  @param {string} voice - Voice id (alloy, echo, fable, onyx, nova, shimmer)
 *  @param {string} format - 'mp3' or 'pcm' */
async function ttsSynthesize(text, voice = 'alloy', format = 'mp3') {
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY missing');

  const body = {
    model: 'tts-1',  // FIX C1: was 'gpt-4o-mini-tts' (invalid model)
    voice,
    input: text,
    response_format: format === 'pcm' ? 'pcm' : 'mp3'
  };

  // FIX H6: Dynamic timeout — 100ms per character, minimum 10s
  const timeout = Math.max(10000, text.length * 100);

  return ttsBreaker.exec(async () => {
    const fn = async () => {
      try {
        const resp = await apiClient.post('/v1/audio/speech', body, {
          headers: { 'Content-Type': 'application/json' },
          responseType: 'arraybuffer',
          timeout
        });
        return resp.data;
      } catch (err) {
        // Enhanced error logging for TTS failures
        const status = err.response?.status;
        const detail = err.response?.data
          ? Buffer.isBuffer(err.response.data) || err.response.data instanceof ArrayBuffer
            ? Buffer.from(err.response.data).toString('utf8').substring(0, 300)
            : JSON.stringify(err.response.data).substring(0, 300)
          : '';
        logger.error(`TTS API error: HTTP ${status || 'N/A'} — ${err.message}`, detail ? `Detail: ${detail}` : '');
        throw err;
      }
    };
    return retry(fn, { retries: 2, minDelay: 300, factor: 1.5 });
  });
}

// ── Startup Validation ──────────────────────────────────────────────────────
// Quick check to verify the API key is valid (uses free /v1/models endpoint)
async function validateApiKey() {
  if (!config.openaiApiKey) return { valid: false, error: 'OPENAI_API_KEY missing' };
  try {
    await apiClient.get('/v1/models', { timeout: 8000 });
    return { valid: true };
  } catch (err) {
    const status = err.response?.status;
    return { valid: false, error: `HTTP ${status || 'N/A'}: ${err.message}` };
  }
}

module.exports = { transcribeAudio, chatCompletion, ttsSynthesize, validateApiKey };

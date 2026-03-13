/**
 * Gemini AI Client
 * Mirrors openaiClient.js interface exactly so all services (stt, tts, llm) work unchanged.
 *
 * API routing:
 *   LLM  → Gemini's OpenAI-compatible endpoint (/v1beta/openai/chat/completions)
 *           — identical SSE format, so llm.js stream parser works without changes
 *   STT  → Native Gemini multimodal API (gemini-1.5-flash, audio + transcribe prompt)
 *   TTS  → Native Gemini TTS API (gemini-2.5-flash-preview-tts, returns 24kHz PCM)
 */

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');
const CircuitBreaker = require('../utils/circuitBreaker');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// Circuit breakers (same thresholds as openaiClient)
const sttBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 });
const llmBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 });
const ttsBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 });

// ── LLM client: OpenAI-compatible endpoint ───────────────────────────────────
// Gemini exposes /v1beta/openai/ which is drop-in OpenAI API compatible.
// Auth: standard Bearer token with the Gemini API key.
const llmClient = axios.create({
  baseURL: `${GEMINI_BASE}/v1beta/openai`,
  headers: { Authorization: `Bearer ${config.geminiApiKey}` },
  httpsAgent: new (require('https').Agent)({ keepAlive: true, maxSockets: 20 })
});

// ── Native client: STT and TTS via Gemini native REST API ───────────────────
// Auth: x-goog-api-key header
const nativeClient = axios.create({
  baseURL: GEMINI_BASE,
  headers: {
    'x-goog-api-key': config.geminiApiKey,
    'Content-Type': 'application/json'
  },
  httpsAgent: new (require('https').Agent)({ keepAlive: true, maxSockets: 20 })
});

// ── OpenAI voice → Gemini voice mapping ─────────────────────────────────────
const VOICE_MAP = {
  shimmer: 'Aoede',   // warm female — closest to shimmer
  alloy:   'Puck',    // neutral
  nova:    'Leda',    // young female
  echo:    'Charon',  // male
  onyx:    'Orus',    // deep male
  fable:   'Fenrir'   // expressive
};

// ── STT: Gemini multimodal transcription ────────────────────────────────────
/**
 * @param {Buffer} buffer   WAV audio (8kHz mono 16-bit PCM with WAV header)
 * @param {string} mimeType
 * @param {string} language  Whisper-style code like 'en', 'hi', 'ta', etc.
 * @returns {Promise<{text: string, segments: Array}>}
 */
async function transcribeAudio(buffer, mimeType = 'audio/wav', language = 'en') {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY missing');

  return sttBreaker.exec(async () => {
    const fn = async () => {
      const base64Audio = Buffer.from(buffer).toString('base64');
      const langHint = language ? ` The spoken language is ${language}.` : '';

      const resp = await nativeClient.post(
        '/v1beta/models/gemini-1.5-flash:generateContent',
        {
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64Audio } },
              { text: `Transcribe this audio verbatim.${langHint} Return only the transcription text with no commentary, labels, or punctuation changes.` }
            ]
          }],
          generationConfig: { temperature: 0 }
        },
        { timeout: 15000 }
      );

      const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Return in whisper-compatible shape (no segments = confidence fallback to 0.8 in stt.js)
      return { text: text.trim(), segments: [] };
    };
    return retry(fn, { retries: 2, minDelay: 300, factor: 2 });
  });
}

// ── LLM: Chat Completion (OpenAI-compatible) ─────────────────────────────────
/**
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} model   e.g. 'gemini-2.0-flash' or 'gemini-1.5-flash'
 * @param {{temperature?:number, max_tokens?:number, response_format?:object}} opts
 */
async function chatCompletion(messages, model = 'gemini-2.0-flash', opts = {}) {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY missing');

  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 200
  };
  if (opts.response_format) body.response_format = opts.response_format;

  return llmBreaker.exec(async () => {
    const fn = async () => {
      const resp = await llmClient.post('/chat/completions', body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000
      });
      return resp.data;
    };
    return retry(fn, { retries: 1, minDelay: 200, factor: 1 });
  });
}

// ── LLM: Streaming Chat Completion (OpenAI-compatible SSE) ───────────────────
// Gemini's OpenAI-compatible endpoint returns identical SSE chunks as OpenAI.
// llm.js stream parser (`data: {...}\n\n` with choices[0].delta.content) works unchanged.
async function chatCompletionStream(messages, model = 'gemini-2.0-flash', opts = {}) {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY missing');

  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 200,
    stream: true
  };
  if (opts.response_format) body.response_format = opts.response_format;

  const resp = await llmClient.post('/chat/completions', body, {
    headers: { 'Content-Type': 'application/json' },
    responseType: 'stream',
    timeout: 30000
  });
  return resp.data;
}

// ── TTS: Gemini 2.5 Flash Text-to-Speech ────────────────────────────────────
// Output: base64-encoded 24kHz 16-bit mono PCM (Linear16) — same as OpenAI PCM output.
// The tts.js resampling (24kHz → 8kHz) and µ-law encoding work unchanged.
/**
 * @param {string} text
 * @param {string} voice  OpenAI voice name — mapped to Gemini voice
 * @param {string} format  'pcm' or 'mp3' (Gemini only supports PCM output here)
 * @returns {Promise<Buffer>}  Raw 24kHz PCM buffer (same format as OpenAI 'pcm')
 */
async function ttsSynthesize(text, voice = 'alloy', format = 'pcm') {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY missing');

  const geminiVoice = VOICE_MAP[voice] || 'Aoede';
  const timeout = Math.max(10000, text.length * 100);

  return ttsBreaker.exec(async () => {
    const fn = async () => {
      const resp = await nativeClient.post(
        '/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',
        {
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice } }
            }
          }
        },
        { timeout }
      );

      const inlineData = resp.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) throw new Error('Gemini TTS returned no audio data');

      // Gemini returns base64 raw PCM (L16, 24kHz mono) — convert to Buffer
      return Buffer.from(inlineData.data, 'base64');
    };
    return retry(fn, { retries: 2, minDelay: 300, factor: 1.5 });
  });
}

// ── TTS: Streaming (simulated) ───────────────────────────────────────────────
// Gemini TTS has no streaming endpoint — return the full buffer as a Readable stream
// so tts.js synthesizeStream() works without changes.
async function ttsSynthesizeStream(text, voice = 'alloy', format = 'pcm') {
  const { Readable } = require('stream');
  const data = await ttsSynthesize(text, voice, format);
  return Readable.from([data]);
}

// ── Startup Validation ───────────────────────────────────────────────────────
async function validateApiKey() {
  if (!config.geminiApiKey) return { valid: false, error: 'GEMINI_API_KEY missing' };
  try {
    await nativeClient.get('/v1beta/models', { timeout: 8000 });
    return { valid: true };
  } catch (err) {
    const status = err.response?.status;
    return { valid: false, error: `HTTP ${status || 'N/A'}: ${err.message}` };
  }
}

module.exports = {
  transcribeAudio,
  chatCompletion,
  chatCompletionStream,
  ttsSynthesize,
  ttsSynthesizeStream,
  validateApiKey
};

const openai = require('./openaiClient');
const logger = require('../utils/logger');
const metrics = require('./metrics');
const costControl = require('./costControl');

// ══════════════════════════════════════════════════════════════════════════════
// STT SERVICE — Whisper Transcription
// ══════════════════════════════════════════════════════════════════════════════
// Input: WAV buffer (8kHz mono 16-bit PCM with proper header)
// The µ-law→PCM→WAV conversion happens in ws-media.js BEFORE calling this.

async function transcribe(buffer, callSid, mime = 'audio/wav', language = 'en') {
  // ── Guard: Empty or missing buffer ────────────────────────────────────
  if (!buffer || buffer.length === 0) {
    return { text: '', confidence: 0, empty: true };
  }

  // ── Guard: Too small to contain speech (WAV header + data) ────────────
  // 44-byte header + at least 2000 bytes of PCM data (~125ms of audio)
  if (buffer.length < 2044) {
    logger.debug('STT: buffer too small', buffer.length, 'bytes');
    return { text: '', confidence: 0, empty: true };
  }

  // ── Compute actual audio duration for cost tracking ───────────────────
  // WAV: data starts at byte 44, 8kHz mono 16-bit = 16000 bytes/sec
  const dataBytes = Math.max(0, buffer.length - 44);
  const durationSec = dataBytes / 16000;

  try {
    const startMs = Date.now();
    metrics.incrementSttRequest(true);

    // Extract Whisper language code (e.g., 'en' from 'en-IN')
    const whisperLang = language ? language.split('-')[0] : 'en';
    const resp = await openai.transcribeAudio(buffer, mime, whisperLang);
    const latencyMs = Date.now() - startMs;
    const text = (resp.text || '').trim();

    // Track cost with actual duration
    if (callSid) costControl.addSttUsage(callSid, durationSec);

    // Filter noise-only transcriptions
    // Whisper sometimes returns ".", "...", "you", "Thank you." for silence/noise
    const NOISE_PATTERNS = /^[.\s…]+$|^(you\.?|thank you\.?|thanks\.?|bye\.?)$/i;
    if (!text || text.length < 2 || NOISE_PATTERNS.test(text)) {
      logger.debug(`STT: noise filtered "${text}" (${latencyMs}ms)`);
      return { text: '', confidence: 0, empty: true };
    }

    logger.debug(`STT: "${text}" (${latencyMs}ms, ${durationSec.toFixed(1)}s audio)`);

    return {
      text,
      confidence: resp?.segments?.[0]?.avg_logprob
        ? Math.exp(resp.segments[0].avg_logprob)   // Convert log-prob to probability
        : 0.8,
      empty: false,
      latencyMs,
      audioDurationSec: durationSec
    };
  } catch (err) {
    logger.error('STT transcription error:', err.message || err);
    metrics.incrementSttRequest(false);
    return { text: '', confidence: 0, empty: true, error: err.message };
  }
}

module.exports = { transcribe };

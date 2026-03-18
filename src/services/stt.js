/**
 * STT Service — Deepgram (streaming + batch)
 *
 * Replaces: OpenAI Whisper
 * Provides:
 *   transcribe(wavBuffer, callSid, mime, language)     — batch PreRecorded API
 *   createLiveSession({ language, onInterim, onFinal, onError })  — live streaming
 */

const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const logger = require('../utils/logger');
const metrics = require('./metrics');
const costControl = require('./costControl');
const { normalizeLanguageCode } = require('../config/languages');
const config = require('../config');

// ── Language mapping: internal code → Deepgram language ──────────────────────
const DG_LANGUAGE_MAP = {
  'en-IN': 'en-IN',
  'hi-IN': 'hi',
  'ta-IN': 'ta',
  'te-IN': 'te',
  'kn-IN': 'kn',
  'ml-IN': 'ml',
  'mr-IN': 'mr',
  'bn-IN': 'bn',
  'gu-IN': 'gu',
  'hinglish': 'hi'    // best approximation for mixed Hindi-English
};

function toDgLanguage(language) {
  return DG_LANGUAGE_MAP[language] || 'en-IN';
}

function getDeepgramClient() {
  if (!config.deepgramApiKey) throw new Error('DEEPGRAM_API_KEY missing');
  return createClient(config.deepgramApiKey);
}

function normalizeTranscriptText(text) {
  let out = String(text || '').trim();
  if (!out) return '';
  const replacements = [
    [/\b(yeahh|yea|yup|yupp)\b/gi, 'yes'],
    [/\b(haanji|hanji)\b/gi, 'haan ji'],
    [/\b(naah|nah)\b/gi, 'no'],
    [/\b(okay+)\b/gi, 'ok']
  ];
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }
  return out.trim();
}

// ── Batch Transcription (PreRecorded) ────────────────────────────────────────
// Drop-in replacement for Whisper — accepts WAV buffer, returns { text, confidence, empty }
async function transcribe(buffer, callSid, mime = 'audio/wav', language = 'en-IN') {
  if (!buffer || buffer.length === 0) return { text: '', confidence: 0, empty: true };

  // 44-byte WAV header + at least 1200 bytes of PCM data
  if (buffer.length < 844) {
    logger.debug('STT: buffer too small', buffer.length, 'bytes');
    return { text: '', confidence: 0, empty: true };
  }

  // Cap at 30 seconds
  if (buffer.length > 480044) {
    logger.warn('STT: buffer too large, truncating to 30s');
    buffer = buffer.subarray(0, 480044);
  }

  const dataBytes = Math.max(0, buffer.length - 44);
  const durationSec = dataBytes / 16000; // 8kHz 16-bit = 16000 bytes/sec

  try {
    const startMs = Date.now();
    metrics.incrementSttRequest(true);

    const dgLang = toDgLanguage(normalizeLanguageCode(language, 'en-IN'));
    const deepgram = getDeepgramClient();

    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: 'nova-2',
        language: dgLang,
        smart_format: true,
        punctuate: true,
        utterances: false,
        filler_words: false,
        diarize: false
      }
    );

    if (error) {
      logger.error('Deepgram batch STT error:', error);
      metrics.incrementSttRequest(false);
      return { text: '', confidence: 0, empty: true, error: String(error) };
    }

    const latencyMs = Date.now() - startMs;
    const alternative = result?.results?.channels?.[0]?.alternatives?.[0];
    const rawText = String(alternative?.transcript || '').trim();
    const confidence = alternative?.confidence ?? 0.8;
    const text = normalizeTranscriptText(rawText);

    logger.log(`STT (Deepgram ${latencyMs}ms, ${durationSec.toFixed(1)}s): "${rawText}"`);

    if (callSid) costControl.addSttUsage(callSid, durationSec);

    // Noise filter
    const noisePattern = /^[.\s…]+$/i;
    if (!text || text.length < 2 || noisePattern.test(text)) {
      return { text: '', confidence: 0, empty: true };
    }

    return { text, confidence, empty: false, latencyMs, audioDurationSec: durationSec };
  } catch (err) {
    logger.error('STT transcription error:', err.message || err);
    metrics.incrementSttRequest(false);
    return { text: '', confidence: 0, empty: true, error: err.message };
  }
}

// ── Live Streaming Session ────────────────────────────────────────────────────
// Creates a Deepgram live WebSocket connection.
// Sends PCM16 LE 8kHz chunks via session.send(buffer).
// Returns { send(buffer), close() }.
function createLiveSession({ language = 'en-IN', onInterim, onFinal, onError } = {}) {
  if (!config.deepgramApiKey) {
    logger.warn('Deepgram live session skipped: DEEPGRAM_API_KEY missing');
    return null;
  }

  let closed = false;
  let connection = null;

  try {
    const deepgram = getDeepgramClient();
    const dgLang = toDgLanguage(normalizeLanguageCode(language, 'en-IN'));

    connection = deepgram.listen.live({
      model: 'nova-2',
      language: dgLang,
      smart_format: true,
      interim_results: true,
      endpointing: 300,         // ms of silence to trigger speech_final
      utterance_end_ms: 1000,   // ms after last word before utterance end
      encoding: 'linear16',
      sample_rate: 8000,
      channels: 1,
      punctuate: true,
      filler_words: false
    });

    connection.on(LiveTranscriptionEvents.Open, () => {
      logger.debug('Deepgram live session opened');
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      if (closed) return;
      const alt = data?.channel?.alternatives?.[0];
      const text = normalizeTranscriptText(alt?.transcript || '');
      if (!text) return;

      if (data.is_final && data.speech_final) {
        // Authoritative endpoint
        if (typeof onFinal === 'function') onFinal(text);
      } else if (data.is_final) {
        // Sentence boundary but stream still open
        if (typeof onFinal === 'function') onFinal(text);
      } else {
        // Partial interim result
        if (typeof onInterim === 'function') onInterim(text);
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (err) => {
      if (!closed) {
        logger.warn('Deepgram live error:', err?.message || err);
        if (typeof onError === 'function') onError(err);
      }
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      closed = true;
      logger.debug('Deepgram live session closed');
    });

  } catch (err) {
    logger.warn('Failed to create Deepgram live session:', err.message);
    if (typeof onError === 'function') onError(err);
    return null;
  }

  return {
    send(pcmBuffer) {
      if (closed || !connection) return;
      try {
        connection.send(pcmBuffer);
      } catch (e) {
        logger.debug('Deepgram send error:', e.message);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        if (connection) connection.requestClose();
      } catch (e) { /* ignore */ }
    }
  };
}

module.exports = { transcribe, createLiveSession, normalizeTranscriptText };

/**
 * STT Service — Deepgram SDK v5
 *
 * Batch:  transcribe(wavBuffer, callSid, mime, language)
 * Live:   createLiveSession({ language, onInterim, onFinal, onError })
 */

const { DeepgramClient } = require('@deepgram/sdk');
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
  return new DeepgramClient(config.deepgramApiKey);
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

    logger.debug(`STT RAW LENGTH: ${buffer.length} bytes, ${durationSec.toFixed(2)}s`);

    // SDK v5: client.listen.v1.media.transcribeFile(buffer, options) → { data, rawResponse }
    // nova-2-phonecall is optimized for 8kHz telephony (vs nova-2 which expects 16kHz+)
    const response = await deepgram.listen.v1.media.transcribeFile(
      buffer,
      {
        model: 'nova-2-phonecall',
        language: dgLang,
        smart_format: true,
        punctuate: true,
        utterances: false,
        filler_words: false,
        diarize: false,
        encoding: 'linear16',
        sample_rate: 8000
      }
    );

    const result = response.data;
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
    logger.error('STT transcription error:', err?.response?.data || err.message || err);
    metrics.incrementSttRequest(false);
    return { text: '', confidence: 0, empty: true, error: err.message };
  }
}

// ── Live Streaming Session ────────────────────────────────────────────────────
// Creates a Deepgram live WebSocket connection (SDK v5).
// Sends PCM16 LE 8kHz chunks via session.send(buffer).
// Returns { send(buffer), close() }.
function createLiveSession({ language = 'en-IN', onInterim, onFinal, onError } = {}) {
  if (!config.deepgramApiKey) {
    logger.warn('Deepgram live session skipped: DEEPGRAM_API_KEY missing');
    return null;
  }

  let closed = false;
  let connection = null;

  // SDK v5: client.listen.v1.connect(options) is async — returns V1Socket
  // We return the wrapper immediately and connect in the background.
  const deepgram = getDeepgramClient();
  const dgLang = toDgLanguage(normalizeLanguageCode(language, 'en-IN'));

  // Queue for audio sent before socket is open
  const sendQueue = [];

  deepgram.listen.v1.connect({
    model: 'nova-2-phonecall',
    language: dgLang,
    smart_format: true,
    interim_results: true,
    endpointing: 300,
    utterance_end_ms: 1000,
    encoding: 'linear16',
    sample_rate: 8000,
    channels: 1,
    punctuate: true,
    filler_words: false
  }).then((socket) => {
    if (closed) {
      socket.close();
      return;
    }
    connection = socket;

    socket.on('open', () => {
      logger.debug('Deepgram live session opened');
      // Drain any queued audio
      for (const buf of sendQueue) {
        try { socket.sendMedia(buf); } catch (e) { /* ignore */ }
      }
      sendQueue.length = 0;
    });

    socket.on('message', (data) => {
      if (closed) return;
      const alt = data?.channel?.alternatives?.[0];
      const text = normalizeTranscriptText(alt?.transcript || '');
      if (!text) return;

      if (data.is_final && data.speech_final) {
        if (typeof onFinal === 'function') onFinal(text);
      } else if (data.is_final) {
        if (typeof onFinal === 'function') onFinal(text);
      } else {
        if (typeof onInterim === 'function') onInterim(text);
      }
    });

    socket.on('error', (err) => {
      if (!closed) {
        logger.warn('Deepgram live error:', err?.message || err);
        if (typeof onError === 'function') onError(err);
      }
    });

    socket.on('close', () => {
      closed = true;
      logger.debug('Deepgram live session closed');
    });

  }).catch((err) => {
    logger.warn('Failed to create Deepgram live session:', err.message);
    if (typeof onError === 'function') onError(err);
  });

  return {
    send(pcmBuffer) {
      if (closed) return;
      if (!connection) {
        // Buffer until connected
        sendQueue.push(pcmBuffer);
        return;
      }
      try {
        connection.sendMedia(pcmBuffer);
      } catch (e) {
        logger.debug('Deepgram send error:', e.message);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      sendQueue.length = 0;
      try {
        if (connection) connection.close();
      } catch (e) { /* ignore */ }
    }
  };
}

module.exports = { transcribe, createLiveSession, normalizeTranscriptText };

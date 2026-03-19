/**
 * STT Service — Deepgram SDK v5
 *
 * Batch:  transcribe(pcmBuffer, callSid, mime, language)
 *         Receives raw PCM16 LE 8kHz (NO WAV header). Sends with explicit
 *         encoding/sample_rate so Deepgram doesn't guess format.
 * Live:   createLiveSession({ language, onInterim, onFinal, onError })
 *         Receives raw PCM chunks via send(buffer) → socket.sendMedia()
 */

const fs = require('fs');
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

// ── One-time audio dump for verification (first utterance only) ──────────────
let _dumpDone = false;
function _maybeDump(pcmBuffer) {
  if (_dumpDone) return;
  _dumpDone = true;
  try {
    const rawPath = '/tmp/stt_decoded_pcm.raw';
    fs.writeFileSync(rawPath, pcmBuffer);
    logger.log(`[STT DEBUG] Saved decoded PCM: ${pcmBuffer.length}B → ${rawPath}`);
    logger.log(`[STT DEBUG] Verify: ffmpeg -f s16le -ar 8000 -ac 1 -i ${rawPath} /tmp/stt_decoded.wav && play /tmp/stt_decoded.wav`);
  } catch (e) { /* ignore */ }
}

// ── Batch Transcription (PreRecorded) ────────────────────────────────────────
// Receives raw PCM16 LE 8kHz (NO WAV header).
// Deepgram reads encoding/sample_rate from the request params, not a WAV header.
async function transcribe(buffer, callSid, mime = 'audio/wav', language = 'en-IN') {
  if (!buffer || buffer.length === 0) return { text: '', confidence: 0, empty: true };

  // Minimum: 0.5s = 8000 bytes at 8kHz PCM16
  if (buffer.length < 8000) {
    logger.debug('STT: buffer too small', buffer.length, 'bytes');
    return { text: '', confidence: 0, empty: true };
  }

  // Cap at 30 seconds = 480000 bytes raw PCM
  if (buffer.length > 480000) {
    logger.warn('STT: buffer too large, truncating to 30s');
    buffer = buffer.subarray(0, 480000);
  }

  const durationSec = buffer.length / 16000; // 8kHz 16-bit = 16000 bytes/sec

  // Dump first utterance to disk for offline verification
  _maybeDump(buffer);

  try {
    const startMs = Date.now();
    metrics.incrementSttRequest(true);

    const dgLang = toDgLanguage(normalizeLanguageCode(language, 'en-IN'));
    const deepgram = getDeepgramClient();

    logger.log(`STT: sending ${buffer.length} bytes raw PCM16 LE 8kHz to Deepgram`);

    // SDK v5: transcribeFile with explicit encoding (raw PCM, no WAV header).
    // nova-2-phonecall is trained on telephony 8kHz audio.
    // IMPORTANT: SDK v5's MediaTranscribeRequestOctetStream does NOT include sample_rate
    // or channels fields — pass them via requestOptions.queryParams (3rd argument) or
    // they are silently dropped and Deepgram returns 400 "corrupt or unsupported data".
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
      },
      {
        queryParams: {
          sample_rate: 8000,
          channels: 1
        }
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

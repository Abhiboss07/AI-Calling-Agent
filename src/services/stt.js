const openai = require('./openaiClient');
const logger = require('../utils/logger');
const metrics = require('./metrics');
const costControl = require('./costControl');

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

// Input: WAV buffer (8kHz mono 16-bit PCM with proper header)
async function transcribe(buffer, callSid, mime = 'audio/wav', language = 'en') {
  if (!buffer || buffer.length === 0) {
    return { text: '', confidence: 0, empty: true };
  }

  // 44-byte WAV header + at least 1200 bytes of PCM data
  if (buffer.length < 1244) {
    logger.debug('STT: buffer too small', buffer.length, 'bytes');
    return { text: '', confidence: 0, empty: true };
  }

  // Guard: cap to ~30 seconds to prevent excessive costs
  if (buffer.length > 480044) {
    logger.warn('STT: buffer too large, truncating to 30s', buffer.length, 'bytes');
    buffer = buffer.subarray(0, 480044);
  }

  // WAV at 8kHz mono 16-bit => 16000 bytes/sec
  const dataBytes = Math.max(0, buffer.length - 44);
  const durationSec = dataBytes / 16000;

  try {
    const startMs = Date.now();
    metrics.incrementSttRequest(true);

    const langCode = String(language || '').toLowerCase().trim();
    const whisperLang = (langCode && langCode !== 'auto' && !langCode.startsWith('en') && langCode !== 'hinglish')
      ? langCode.split('-')[0]
      : undefined;

    const resp = await openai.transcribeAudio(buffer, mime, whisperLang);
    const latencyMs = Date.now() - startMs;
    const rawText = String(resp.text || '').trim();
    const text = normalizeTranscriptText(rawText);

    // Log raw Whisper output BEFORE any filtering (critical for debugging)
    logger.log(`STT raw (${latencyMs}ms, ${durationSec.toFixed(1)}s audio): "${rawText}"`, { callSid });

    if (callSid) costControl.addSttUsage(callSid, durationSec);

    // Filter noise-only transcriptions
    const noisePattern = /^[.\s…]+$/i;
    if (!text || text.length < 2 || noisePattern.test(text)) {
      logger.log(`STT: noise filtered "${text}"`, { callSid, latencyMs });
      return { text: '', confidence: 0, empty: true };
    }

    // Filter known Whisper hallucination phrases (produced on noise/silence input)
    // NOTE: Only include phrases that are NEVER real caller speech
    const WHISPER_HALLUCINATIONS = new Set([
      'blooper', 'bloopers', 'the end', 'thanks for watching',
      'thank you for watching', 'subscribe', 'like and subscribe',
      'please subscribe', 'subtitles by', 'amara.org', 'transcribed by',
      'music', 'applause', 'laughter', 'silence', 'inaudible',
      'foreign', 'sigh', 'cough'
    ]);
    const lowerText = text.toLowerCase().trim();
    if (WHISPER_HALLUCINATIONS.has(lowerText)) {
      logger.log(`STT: hallucination filtered "${text}"`, { callSid, latencyMs });
      return { text: '', confidence: 0, empty: true };
    }

    logger.log(`STT: "${text}" (${latencyMs}ms, ${durationSec.toFixed(1)}s audio)`, { callSid });

    return {
      text,
      confidence: resp?.segments?.[0]?.avg_logprob
        ? Math.exp(resp.segments[0].avg_logprob)
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

module.exports = { transcribe, normalizeTranscriptText };

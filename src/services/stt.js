const openai = require('./aiClient');
const logger = require('../utils/logger');
const metrics = require('./metrics');
const costControl = require('./costControl');
const { getLanguage, normalizeLanguageCode } = require('../config/languages');

function computePcm16Rms(pcmBuffer) {
  if (!pcmBuffer || pcmBuffer.length < 2) return 0;
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  let sumSq = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2) / 32768;
    sumSq += sample * sample;
  }
  return Math.sqrt(sumSq / sampleCount);
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

// Input: WAV buffer (8kHz mono 16-bit PCM with proper header)
async function transcribe(buffer, callSid, mime = 'audio/wav', language = 'en-IN') {
  if (!buffer || buffer.length === 0) {
    return { text: '', confidence: 0, empty: true };
  }

  // 44-byte WAV header + at least 1200 bytes of PCM data
  if (buffer.length < 844) {
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
  const pcmRms = computePcm16Rms(buffer.subarray(44));

  // Drop ultra-low-energy short snippets before paying Whisper cost.
  // This avoids false transcriptions from line hiss/comfort noise.
  if (durationSec <= 0.5 && pcmRms < 0.0008) {
    logger.log(`STT: prefilter low-energy audio skipped (${durationSec.toFixed(1)}s, rms=${pcmRms.toFixed(4)})`, { callSid });
    return { text: '', confidence: 0, empty: true };
  }

  try {
    const startMs = Date.now();
    metrics.incrementSttRequest(true);

    const langCode = String(language || '').toLowerCase().trim();
    let whisperLang;
    if (langCode && langCode !== 'auto') {
      const normalizedLanguage = normalizeLanguageCode(language, 'en-IN');
      // For hinglish (mixed Hindi-English), don't set language so Whisper auto-detects
      if (normalizedLanguage === 'hinglish') {
        whisperLang = undefined;
      } else {
        const langConfig = getLanguage(normalizedLanguage);
        whisperLang = langConfig?.whisperCode || undefined;
      }
    }

    const resp = await openai.transcribeAudio(buffer, mime, whisperLang);
    const latencyMs = Date.now() - startMs;
    const rawText = String(resp.text || '').trim();
    const text = normalizeTranscriptText(rawText);
    const confidence = resp?.segments?.[0]?.avg_logprob
      ? Math.exp(resp.segments[0].avg_logprob)
      : 0.8;

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

    // Additional short-utterance guard for common Whisper noise artifacts.
    if (durationSec <= 0.8) {
      const SAFE_SHORT_UTTERANCES = new Set([
        'yes', 'no', 'ok', 'okay', 'hello', 'hi', 'hey',
        'haan', 'haan ji', 'han', 'ji', 'ha', 'ha ji',
        'nahi', 'nahin', 'hmm', 'hmmm', 'accha', 'achha',
        'namaste', 'namaskar', 'theek hai', 'thik hai',
        'bilkul', 'zaroor', 'boliye', 'bolo', 'haa',
        'sure', 'yeah', 'yep', 'right', 'correct'
      ]);
      const SHORT_AMBIGUOUS = new Set([
        'and i\'ll', 'oh', 'uh', 'uhh', 'huh',
        'margaret', 'margaret?'
      ]);

      // Strip punctuation for safe utterance matching ("Hello." → "hello")
      const strippedText = lowerText.replace(/[^a-z0-9\s]/gi, '').trim();
      const words = strippedText.split(/\s+/).filter(Boolean);
      const looksAmbiguousShort = SHORT_AMBIGUOUS.has(strippedText)
        || (words.length <= 2 && confidence < 0.55 && !SAFE_SHORT_UTTERANCES.has(strippedText));

      if (looksAmbiguousShort) {
        logger.log(`STT: short ambiguous filtered "${text}"`, {
          callSid,
          latencyMs,
          durationSec: Number(durationSec.toFixed(2)),
          confidence: Number(confidence.toFixed(2))
        });
        return { text: '', confidence: 0, empty: true };
      }
    }

    logger.log(`STT: "${text}" (${latencyMs}ms, ${durationSec.toFixed(1)}s audio)`, { callSid });

    return {
      text,
      confidence,
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

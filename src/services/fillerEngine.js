/**
 * Filler Engine — Level 2 latency layer
 *
 * Plays a short cached filler phrase ("Hmm...", "Okay...") when
 * LLM hasn't produced its first chunk within FILLER_DELAY_MS.
 * The filler is interrupted the instant real audio starts.
 *
 * Usage:
 *   const fillerEngine = require('./fillerEngine');
 *   await fillerEngine.prewarm(tts, languages);           // at startup
 *   const handle = fillerEngine.start(session, ws, tts);  // after STT
 *   handle.cancel();                                       // when LLM chunk arrives
 */

const logger = require('../utils/logger');

// ── Per-language filler pools ─────────────────────────────────────────────────
const FILLER_POOLS = {
  'en-IN':    ['Hmm...', 'Okay...', 'Got it...', 'Right...', 'I see...'],
  'hi-IN':    ['हम्म...', 'ठीक है...', 'समझ गया...', 'जी...', 'हाँ...'],
  'hinglish': ['Hmm...', 'Haan...', 'Okay...', 'Sahi hai...', 'Got it...'],
  'ta-IN':    ['சரி...', 'ஆமாம்...', 'புரிந்தது...'],
  'te-IN':    ['సరే...', 'అర్థమైంది...'],
};
const FILLER_DEFAULT = ['Hmm...', 'Okay...', 'I see...'];

// ── In-memory buffer cache: language:phrase → mulawBuffer ────────────────────
const _cache = new Map();

// ── Filler delay — fire if LLM hasn't started within this many ms ────────────
const FILLER_DELAY_MS = 150;

// ── Rotation state per callSid (round-robin, avoid repeating) ────────────────
const _rotationIndex = new Map();

function _getPool(language) {
  return FILLER_POOLS[language] || FILLER_DEFAULT;
}

function _getNext(language) {
  const pool = _getPool(language);
  const idx = (_rotationIndex.get(language) || 0) % pool.length;
  _rotationIndex.set(language, idx + 1);
  return pool[idx];
}

function _cacheKey(phrase, language) {
  return `${language}:${phrase}`;
}

/**
 * Pre-synthesize all filler phrases for the given languages.
 * Call once at startup after TTS service is ready.
 * @param {object} tts  - TTS service (must expose synthesizeRaw)
 * @param {string[]} languages
 */
async function prewarm(tts, languages = ['en-IN', 'hinglish', 'hi-IN']) {
  let warmed = 0;
  const tasks = [];

  for (const lang of languages) {
    const pool = _getPool(lang);
    for (const phrase of pool) {
      const key = _cacheKey(phrase, lang);
      if (_cache.has(key)) continue;
      tasks.push(
        tts.synthesizeRaw(phrase, null, lang)
          .then((result) => {
            if (result?.mulawBuffer) {
              _cache.set(key, result.mulawBuffer);
              warmed++;
            }
          })
          .catch((err) => {
            logger.debug(`[FILLER] Prewarm failed for "${phrase}" (${lang}): ${err.message}`);
          })
      );
    }
  }

  await Promise.allSettled(tasks);
  logger.log(`[FILLER] Prewarmed ${warmed} filler phrases`);
  return warmed;
}

/**
 * Get a cached filler buffer (null if not cached yet).
 * Falls back to lazy synthesis if tts is provided.
 */
async function _getBuffer(phrase, language, tts) {
  const key = _cacheKey(phrase, language);
  if (_cache.has(key)) return _cache.get(key);

  if (!tts) return null;
  try {
    const result = await tts.synthesizeRaw(phrase, null, language);
    if (result?.mulawBuffer) {
      _cache.set(key, result.mulawBuffer);
      return result.mulawBuffer;
    }
  } catch (err) {
    logger.debug(`[FILLER] Lazy synthesis failed: ${err.message}`);
  }
  return null;
}

/**
 * Start the filler timer for a pipeline turn.
 *
 * After FILLER_DELAY_MS, if not cancelled, plays a cached filler phrase
 * over the WebSocket using the same sendAudioThroughStream path.
 *
 * Returns a handle with:
 *   - cancel()  — call when first LLM chunk arrives (stops filler)
 *   - metrics() — { fillerUsed, fillerPhrase, fillerDurationMs, llmDelayMs }
 *
 * @param {object} session
 * @param {object} ws
 * @param {function} sendAudio  - sendAudioThroughStream(session, ws, buf)
 * @param {object} tts          - tts service for lazy synthesis fallback
 */
function start(session, ws, sendAudio, tts) {
  let cancelled = false;
  let fillerUsed = false;
  let fillerPhrase = null;
  let fillerDurationMs = 0;
  let fillerStartMs = null;
  const startMs = Date.now();

  let timer;
  const playLoop = async () => {
    if (cancelled) return;
    if (session._wsClosed || ws.readyState !== 1) return;
    
    // Avoid overlapping with real LLM audio that might have just started
    if (session.isPlaying && !session._fillerPlaying) return;

    const phrase = _getNext(session.language || 'en-IN');
    const buf = await _getBuffer(phrase, session.language || 'en-IN', tts);
    if (!buf || cancelled) return;

    fillerPhrase = phrase;
    fillerUsed = true;
    const currentFillerStart = Date.now();
    if (!fillerStartMs) fillerStartMs = currentFillerStart;
    session._fillerPlaying = true;

    logger.debug(`[FILLER] Playing "${phrase}" (${Date.now() - startMs}ms after STT)`, { callSid: session.callSid });

    try {
      await sendAudio(session, ws, buf);
      // Recurse after a short pause if still not cancelled
      if (!cancelled) {
        timer = setTimeout(playLoop, 800); 
      }
    } catch (err) {
      logger.debug(`[FILLER] Playback error: ${err.message}`);
    } finally {
      if (currentFillerStart) fillerDurationMs += (Date.now() - currentFillerStart);
      session._fillerPlaying = false;
    }
  };

  timer = setTimeout(playLoop, FILLER_DELAY_MS);

  return {
    /**
     * Cancel the filler.
     * If filler audio is already queued, clears the playback queue
     * so real LLM audio can start immediately.
     */
    cancel(clearQueue = false) {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(timer);
      session._fillerPlaying = false;

      // If filler was already enqueued but real audio hasn't started yet,
      // flush the queue to avoid mixing filler + real response
      if (clearQueue && session.playbackQueue?.length > 0) {
        session.playbackQueue = [];
        session.audioResidue = Buffer.alloc(0);
        try {
          ws.send(JSON.stringify({ event: 'clearAudio', streamSid: session.streamSid }));
          ws.send(JSON.stringify({ event: 'clear',      streamSid: session.streamSid }));
        } catch { /* ignore */ }
        logger.debug('[FILLER] Cleared filler audio — real response starting', { callSid: session.callSid });
      }
    },

    metrics() {
      return {
        fillerUsed,
        fillerPhrase,
        fillerDurationMs,
        llmDelayMs: Date.now() - startMs
      };
    }
  };
}

module.exports = { prewarm, start, FILLER_DELAY_MS };

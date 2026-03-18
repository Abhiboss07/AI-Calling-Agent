/**
 * Call Debugger — structured per-call debug tracking
 *
 * Enabled via DEBUG_CALL=true in .env
 * Tracks: per-turn latency, transcripts, FSM states, pipeline issues
 * Post-call: auto-analysis, report generation, file + DB persistence
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DEBUG_CALL = process.env.DEBUG_CALL === 'true';
const DEBUG_LOG_DIR = process.env.DEBUG_LOG_DIR || path.join(process.cwd(), 'debug-reports');

// Latency thresholds (ms)
const WARN_THRESHOLD = 1000;
const ERROR_THRESHOLD = 1500;

// ── In-memory debug sessions ───────────────────────────────────────────────
const sessions = new Map(); // callSid → DebugSession

function startSession(callSid, meta = {}) {
  if (!callSid) return;
  sessions.set(callSid, {
    callSid,
    startedAt: Date.now(),
    direction: meta.direction || 'outbound',
    language: meta.language || 'en-IN',
    callerNumber: meta.callerNumber || 'unknown',
    turns: [],           // Array of turn records
    issues: [],          // Auto-detected issues
    fsmStates: [],       // FSM state history
    interruptions: 0,    // Barge-in count
    silenceEvents: 0,    // Silence timeout count
    sttFallbacks: 0,     // Times Deepgram live wasn't available
    llmFallbacks: 0,     // Times OpenAI fallback was used
    ttsCacheHits: 0,     // TTS cache hits
    meta
  });

  if (DEBUG_CALL) {
    logger.log(`[DEBUG] Session started`, { callSid, direction: meta.direction, language: meta.language });
  }
}

function recordTurn(callSid, {
  turnNumber,
  transcript,          // Customer speech
  response,            // Agent response
  stt_time,            // ms
  llm_time,            // ms (time to first sentence)
  tts_time,            // ms (cumulative TTS API time)
  total_time,          // ms (stt + full LLM+TTS pipeline)
  fsmState,
  fsmIntent,
  action,              // continue | hangup | escalate | book_visit
  sttSource,           // 'deepgram_live' | 'batch'
  llmProvider,         // 'gemini' | 'openai'
  ttsCached,           // boolean
  audioDurationSec
} = {}) {
  const session = sessions.get(callSid);

  // Always log latency thresholds regardless of DEBUG_CALL
  const latencyLog = { callSid, turnNumber, stt_time, llm_time, tts_time, total_time };
  if (total_time >= ERROR_THRESHOLD) {
    logger.error(`[LATENCY] Turn ${turnNumber} SLOW (${total_time}ms > ${ERROR_THRESHOLD}ms threshold)`, latencyLog);
    _suggestLatencyFix({ stt_time, llm_time, tts_time, total_time, callSid, turnNumber });
  } else if (total_time >= WARN_THRESHOLD) {
    logger.warn(`[LATENCY] Turn ${turnNumber} slow (${total_time}ms > ${WARN_THRESHOLD}ms threshold)`, latencyLog);
  } else if (DEBUG_CALL) {
    logger.debug(`[DEBUG] Turn ${turnNumber} latency OK (${total_time}ms)`, latencyLog);
  }

  if (!session) return;

  const turn = {
    turnNumber,
    ts: Date.now(),
    transcript,
    response,
    stt_time,
    llm_time,
    tts_time,
    total_time,
    fsmState,
    fsmIntent,
    action,
    sttSource,
    llmProvider,
    ttsCached,
    audioDurationSec,
    latencyStatus: total_time >= ERROR_THRESHOLD ? 'error' : total_time >= WARN_THRESHOLD ? 'warn' : 'ok'
  };

  session.turns.push(turn);

  if (sttSource === 'batch') session.sttFallbacks++;
  if (llmProvider === 'openai') session.llmFallbacks++;
  if (ttsCached) session.ttsCacheHits++;

  // Auto-detect per-turn issues
  if (stt_time > 800) {
    session.issues.push({ turn: turnNumber, type: 'slow_stt', value: stt_time });
  }
  if (llm_time > 600) {
    session.issues.push({ turn: turnNumber, type: 'slow_llm', value: llm_time });
  }
  if (tts_time > 500) {
    session.issues.push({ turn: turnNumber, type: 'slow_tts', value: tts_time });
  }

  if (DEBUG_CALL) {
    logger.log(`[DEBUG] Turn ${turnNumber}`, {
      callSid,
      transcript: transcript?.substring(0, 80),
      response: response?.substring(0, 80),
      latency: `STT=${stt_time}ms LLM=${llm_time}ms TTS=${tts_time}ms TOTAL=${total_time}ms`,
      fsmState,
      action,
      sttSource,
      llmProvider
    });
  }
}

function recordFsmState(callSid, state, event) {
  const session = sessions.get(callSid);
  if (!session) return;
  session.fsmStates.push({ ts: Date.now(), state, event });
}

function recordInterruption(callSid) {
  const session = sessions.get(callSid);
  if (session) session.interruptions++;
}

function recordSilence(callSid) {
  const session = sessions.get(callSid);
  if (session) session.silenceEvents++;
}

// ── Post-call analysis and report generation ─────────────────────────────────
async function finalizeSession(callSid, { endReason, finalFsmState } = {}) {
  const session = sessions.get(callSid);
  if (!session) return null;

  const durationMs = Date.now() - session.startedAt;
  const durationSec = Math.round(durationMs / 1000);
  const turns = session.turns;

  // Compute latency stats
  const totalTimes = turns.map(t => t.total_time).filter(Boolean);
  const sttTimes   = turns.map(t => t.stt_time).filter(Boolean);
  const llmTimes   = turns.map(t => t.llm_time).filter(Boolean);
  const ttsTimes   = turns.map(t => t.tts_time).filter(Boolean);

  const avg = arr => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
  const max = arr => arr.length ? Math.max(...arr) : 0;

  const slowTurns = turns.filter(t => t.latencyStatus !== 'ok');
  const errorTurns = turns.filter(t => t.latencyStatus === 'error');

  // Auto-analysis
  const analysis = [];

  if (avg(sttTimes) > 600) {
    analysis.push({
      type: 'SLOW_STT',
      detail: `Average STT latency ${avg(sttTimes)}ms — consider verifying Deepgram API key, check network to api.deepgram.com`,
      fix: 'Ensure DEEPGRAM_API_KEY is valid. Deepgram Live session should be reused per call — check openDeepgramStream() is called at session start.'
    });
  }

  if (avg(llmTimes) > 500) {
    analysis.push({
      type: 'SLOW_LLM',
      detail: `Average LLM time-to-first-sentence ${avg(llmTimes)}ms — Gemini latency high`,
      fix: 'Check GEMINI_API_KEY and GEMINI_MODEL=gemini-2.0-flash. Deterministic fast-path may not be triggering — review deterministicTurnReply() regexes.'
    });
  }

  if (avg(ttsTimes) > 400) {
    analysis.push({
      type: 'SLOW_TTS',
      detail: `Average TTS latency ${avg(ttsTimes)}ms — Sarvam API slow`,
      fix: 'Check SARVAM_API_KEY. Prewarm common phrases at startup via prewarmPhrases(). TTS cache should reduce repeat latency.'
    });
  }

  if (session.sttFallbacks > 0) {
    analysis.push({
      type: 'STT_LIVE_MISS',
      detail: `${session.sttFallbacks} turns used batch STT (Deepgram live wasn't ready)`,
      fix: 'openDeepgramStream() must be called at session start. Verify Deepgram WS connection is established before VAD fires.'
    });
  }

  if (session.llmFallbacks > 0) {
    analysis.push({
      type: 'LLM_FALLBACK',
      detail: `${session.llmFallbacks} turns fell back to OpenAI (Gemini failed)`,
      fix: 'Check GEMINI_API_KEY validity and quota. Gemini 2.0-flash should be the primary path.'
    });
  }

  if (session.interruptions > 2) {
    analysis.push({
      type: 'HIGH_INTERRUPTIONS',
      detail: `${session.interruptions} barge-ins — caller interrupted frequently`,
      fix: 'Agent responses may be too long. Review LLM prompt to keep responses under 2 sentences for first few turns.'
    });
  }

  const report = {
    callSid,
    generatedAt: new Date().toISOString(),
    summary: {
      direction: session.direction,
      language: session.language,
      callerNumber: session.callerNumber,
      durationSec,
      totalTurns: turns.length,
      endReason: endReason || 'unknown',
      finalFsmState: finalFsmState || 'unknown'
    },
    latency: {
      avg_total: avg(totalTimes),
      max_total: max(totalTimes),
      avg_stt: avg(sttTimes),
      max_stt: max(sttTimes),
      avg_llm: avg(llmTimes),
      max_llm: max(llmTimes),
      avg_tts: avg(ttsTimes),
      max_tts: max(ttsTimes),
      slow_turns: slowTurns.length,
      error_turns: errorTurns.length
    },
    reliability: {
      stt_fallbacks: session.sttFallbacks,
      llm_fallbacks: session.llmFallbacks,
      tts_cache_hits: session.ttsCacheHits,
      interruptions: session.interruptions,
      silence_events: session.silenceEvents,
      issues_detected: session.issues.length
    },
    analysis,
    turns: DEBUG_CALL ? turns : undefined  // Full turn detail only in debug mode
  };

  // Log report summary
  _logReport(report);

  // Save to file if DEBUG_CALL
  if (DEBUG_CALL) {
    _saveReportToFile(report);
  }

  // Save to MongoDB (always, for prod visibility)
  _saveReportToDB(report);

  sessions.delete(callSid);
  return report;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _suggestLatencyFix({ stt_time, llm_time, tts_time, total_time, callSid, turnNumber }) {
  const suggestions = [];
  if (stt_time > 800) suggestions.push(`STT=${stt_time}ms: Deepgram live session may have disconnected — check dgSession health`);
  if (llm_time > 600) suggestions.push(`LLM=${llm_time}ms: Gemini slow — deterministic fast-path not triggering or API quota pressure`);
  if (tts_time > 500) suggestions.push(`TTS=${tts_time}ms: Sarvam slow — phrase not cached, check TTS_CACHE_MAX_ENTRIES`);
  if (suggestions.length) {
    logger.error(`[LATENCY FIX] Turn ${turnNumber} (${total_time}ms):`, { callSid, suggestions });
  }
}

function _logReport(report) {
  const { summary, latency, reliability, analysis } = report;
  logger.log(`[CALL REPORT] ${report.callSid}`, {
    duration: `${summary.durationSec}s`,
    turns: summary.totalTurns,
    endReason: summary.endReason,
    avgTotal: `${latency.avg_total}ms`,
    avgStt: `${latency.avg_stt}ms`,
    avgLlm: `${latency.avg_llm}ms`,
    avgTts: `${latency.avg_tts}ms`,
    slowTurns: latency.slow_turns,
    errorTurns: latency.error_turns,
    sttFallbacks: reliability.stt_fallbacks,
    llmFallbacks: reliability.llm_fallbacks,
    issues: analysis.length
  });

  if (analysis.length > 0) {
    logger.warn(`[CALL REPORT] ${report.callSid} — ${analysis.length} issue(s) detected:`);
    for (const issue of analysis) {
      logger.warn(`  [${issue.type}] ${issue.detail}`);
      logger.warn(`  FIX: ${issue.fix}`);
    }
  }
}

function _saveReportToFile(report) {
  try {
    if (!fs.existsSync(DEBUG_LOG_DIR)) {
      fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true });
    }
    const filename = path.join(DEBUG_LOG_DIR, `${report.callSid}_${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    logger.log(`[DEBUG] Report saved to ${filename}`);
  } catch (err) {
    logger.warn('Failed to save debug report to file:', err.message);
  }
}

function _saveReportToDB(report) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return;

    const db = mongoose.connection.db;
    db.collection('call_debug_reports').insertOne({
      ...report,
      _savedAt: new Date()
    }).catch(err => logger.warn('Failed to save call debug report to DB:', err.message));
  } catch (err) {
    // Non-critical — don't throw
  }
}

module.exports = {
  DEBUG_CALL,
  WARN_THRESHOLD,
  ERROR_THRESHOLD,
  startSession,
  recordTurn,
  recordFsmState,
  recordInterruption,
  recordSilence,
  finalizeSession
};

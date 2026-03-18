/**
 * Call Optimizer — real-time adaptive optimization engine
 *
 * Tracks per-call latency trends and adjusts DURING the call:
 *   - max_tokens: reduced when LLM is slow (100 → 60 → 40)
 *   - fastMode: short response hints when total latency > 1000ms
 *   - modelPref: switch Gemini → OpenAI when Gemini latency > 700ms (2 turns)
 *
 * Cross-call system learning:
 *   - If average call latencyScore < 70 → reduce global default max_tokens
 *   - If average call latencyScore > 85 → restore default max_tokens
 *
 * Logs every optimization decision with [OPTIMIZER] prefix.
 */

const logger = require('../utils/logger');

// ── Thresholds ────────────────────────────────────────────────────────────────
const LLM_FAST_THRESHOLD_MS    = 450;   // LLM > 450ms → reduce tokens
const TOTAL_FAST_MODE_MS       = 900;   // total > 900ms → enter fast mode
const LLM_SWITCH_MODEL_MS      = 650;   // Gemini > 650ms (2 turns) → prefer OpenAI
const FAST_MODE_TOKENS         = 40;
const NORMAL_TOKENS            = 100;
const REDUCED_TOKENS           = 60;

// ── System-level learning (cross-call, in-process) ───────────────────────────
const systemAdjustments = {
  defaultMaxTokens: NORMAL_TOKENS,
  totalCalls: 0,
  lowScoreCalls: 0,
  interventionCount: 0
};

// ── Per-call state ────────────────────────────────────────────────────────────
const callStates = new Map();

function getState(callSid) {
  if (!callStates.has(callSid)) {
    callStates.set(callSid, {
      callSid,
      maxTokens: systemAdjustments.defaultMaxTokens,
      fastMode: false,
      modelPref: 'openai',   // OpenAI is primary for real-time calls; lower/more consistent latency
      recentLatencies: [],       // last 5 turns: {stt, llm, tts, total, ts}
      interventions: 0,
      qualityData: {
        interruptions: 0,
        emptyStts: 0,
        llmFallbacks: 0,
        turns: 0,
        geminiSlowTurns: 0,
        naturalnessIssues: 0,
        speechWordCounts: [],
        fillersUsed: 0
      }
    });
  }
  return callStates.get(callSid);
}

// ── Public: get current call configuration ───────────────────────────────────
/**
 * Returns the current optimization settings for this call.
 * Called before each LLM invocation.
 */
function getCallConfig(callSid) {
  const state = getState(callSid);
  return {
    maxTokens: state.maxTokens,
    fastMode: state.fastMode,
    modelPref: state.modelPref
  };
}

// ── Public: record a completed turn ──────────────────────────────────────────
/**
 * Update optimizer state after each pipeline turn.
 * Returns {changed, actions} describing what was adjusted.
 */
function recordTurn(callSid, { sttMs = 0, llmMs = 0, ttsMs = 0, totalMs = 0, modelUsed = 'gemini' } = {}) {
  const state = getState(callSid);
  state.qualityData.turns++;

  // Store latency snapshot
  state.recentLatencies.push({ stt: sttMs, llm: llmMs, tts: ttsMs, total: totalMs, ts: Date.now() });
  if (state.recentLatencies.length > 5) state.recentLatencies.shift();

  if (modelUsed === 'gemini') state.qualityData.llmFallbacks++;          // Gemini used = fallback event
  if (modelUsed === 'gemini' && llmMs > LLM_SWITCH_MODEL_MS) state.qualityData.geminiSlowTurns++;

  const actions = [];
  let prevTokens = state.maxTokens;
  let prevFastMode = state.fastMode;
  let prevModelPref = state.modelPref;

  // ── 1. Fast mode: total > 1000ms ────────────────────────────────────────
  if (totalMs >= TOTAL_FAST_MODE_MS && !state.fastMode) {
    state.fastMode = true;
    state.maxTokens = FAST_MODE_TOKENS;
    state.interventions++;
    systemAdjustments.interventionCount++;
    actions.push(`Entered FAST MODE (total=${totalMs}ms > ${TOTAL_FAST_MODE_MS}ms) → max_tokens=${FAST_MODE_TOKENS}`);
  } else if (totalMs < 600 && state.fastMode) {
    // Recover from fast mode if latency improves
    state.fastMode = false;
    state.maxTokens = systemAdjustments.defaultMaxTokens;
    actions.push(`Exited fast mode (total=${totalMs}ms < 600ms)`);
  }

  // ── 2. Token reduction: LLM > 500ms (without full fast mode) ────────────
  if (!state.fastMode && llmMs > LLM_FAST_THRESHOLD_MS && state.maxTokens > REDUCED_TOKENS) {
    state.maxTokens = REDUCED_TOKENS;
    state.interventions++;
    actions.push(`Reduced max_tokens ${prevTokens} → ${REDUCED_TOKENS} (LLM=${llmMs}ms > ${LLM_FAST_THRESHOLD_MS}ms)`);
  }

  // ── 3. Model preference: OpenAI is always primary.
  //       Only switch to Gemini if OpenAI has been unavailable / erroring.
  //       If currently on Gemini (fallback) and it's been slow, force back to OpenAI.
  if (state.modelPref === 'gemini' && llmMs > LLM_SWITCH_MODEL_MS) {
    state.modelPref = 'openai';
    state.interventions++;
    actions.push(`Forced back to OpenAI — Gemini slow (${llmMs}ms > ${LLM_SWITCH_MODEL_MS}ms)`);
  }

  // Log all actions
  for (const action of actions) {
    logger.warn(`[OPTIMIZER] ${callSid?.slice(-8)}: ${action}`);
  }

  return {
    changed: actions.length > 0,
    actions,
    config: getCallConfig(callSid)
  };
}

// ── Public: record specific events ───────────────────────────────────────────
function recordInterruption(callSid, latencyMs = 0) {
  const state = callStates.get(callSid);
  if (!state) return;
  state.qualityData.interruptions++;
  if (latencyMs > 0) {
    logger.debug(`[OPTIMIZER] Interruption latency: ${latencyMs}ms`, { callSid });
  }
}

function recordSpeechTurn(callSid, { wordCount = 0, issueCount = 0, fillerUsed = false } = {}) {
  const state = callStates.get(callSid);
  if (!state) return;
  if (wordCount > 0) state.qualityData.speechWordCounts.push(wordCount);
  state.qualityData.naturalnessIssues += issueCount;
  if (fillerUsed) state.qualityData.fillersUsed++;
}

function recordEmptyStt(callSid) {
  const state = callStates.get(callSid);
  if (state) state.qualityData.emptyStts++;
}

function recordLlmFallback(callSid) {
  const state = callStates.get(callSid);
  if (state) state.qualityData.llmFallbacks++;
}

// ── Public: compute quality score and finalize ────────────────────────────────
/**
 * Compute a 0-100 quality score for the call.
 * Saves to MongoDB and updates system-level adjustments.
 */
async function finalizeCall(callSid, { durationSec = 0, leadQualityScore = 0 } = {}) {
  const state = callStates.get(callSid);
  callStates.delete(callSid);
  if (!state) return null;

  const { recentLatencies, qualityData } = state;

  // Compute scores
  const allLatencies = recentLatencies.map(l => l.total);
  const avgTotal = allLatencies.length ? _avg(allLatencies) : 0;
  const allLlm = recentLatencies.map(l => l.llm);
  const avgLlm = allLlm.length ? _avg(allLlm) : 0;

  // latencyScore: 100 at 400ms, 0 at 1500ms
  const latencyScore = Math.round(Math.max(0, Math.min(100, 100 - ((avgTotal - 400) / 11))));

  // interruptionHandling: fewer interruptions = better (0 interrupts on N turns = 100)
  const turns = Math.max(1, qualityData.turns);
  const interruptionScore = Math.round(Math.max(0, 100 - (qualityData.interruptions / turns) * 200));

  // sttAccuracy: based on empty STT count
  const sttScore = Math.round(Math.max(0, 100 - (qualityData.emptyStts / turns) * 100));

  // responseQuality: FSM lead score × 2 + bonus for full conversation
  const responseScore = Math.min(100, Math.round((leadQualityScore || 0) * 2 + Math.min(turns * 8, 40)));

  // naturalnessScore: from humanSpeechEngine stats
  let naturalnessScore = 75; // default mid-score
  try {
    const humanSpeech = require('./humanSpeechEngine');
    naturalnessScore = humanSpeech.computeNaturalnessScore({
      issues: Array(qualityData.naturalnessIssues).fill('issue'),
      wordCounts: qualityData.speechWordCounts,
      fillersUsed: qualityData.fillersUsed
    });
  } catch { /* humanSpeechEngine not available */ }

  // overallScore: weighted (added naturalnessScore)
  const overallScore = Math.round(
    latencyScore * 0.25 +
    interruptionScore * 0.20 +
    sttScore * 0.15 +
    responseScore * 0.25 +
    naturalnessScore * 0.15
  );

  const score = {
    latencyScore,
    interruptionHandling: interruptionScore,
    sttAccuracy: sttScore,
    responseQuality: responseScore,
    naturalnessScore,
    overallScore,
    avgLatencyMs: Math.round(avgTotal),
    avgLlmMs: Math.round(avgLlm),
    fastModeUsed: state.fastMode || state.interventions > 0,
    interventions: state.interventions
  };

  logger.log('[OPTIMIZER] Call quality score', { callSid, ...score });

  // ── System-level cross-call learning ──────────────────────────────────
  systemAdjustments.totalCalls++;
  if (overallScore < 70) {
    systemAdjustments.lowScoreCalls++;
    if (systemAdjustments.defaultMaxTokens > 60) {
      systemAdjustments.defaultMaxTokens -= 10;
      logger.warn(`[OPTIMIZER] System: reduced default max_tokens to ${systemAdjustments.defaultMaxTokens} (low quality call score: ${overallScore})`);
    }
  } else if (overallScore > 85 && systemAdjustments.defaultMaxTokens < NORMAL_TOKENS) {
    systemAdjustments.defaultMaxTokens = Math.min(NORMAL_TOKENS, systemAdjustments.defaultMaxTokens + 5);
    logger.log(`[OPTIMIZER] System: restored default max_tokens to ${systemAdjustments.defaultMaxTokens} (good quality: ${overallScore})`);
  }

  // ── Persist score to MongoDB — fire-and-forget, never block main pipeline ─
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {   // 1 = connected
      const Call = require('../models/call.model');
      Call.findOneAndUpdate(
        { callSid },
        { $set: { qualityScore: score, avgLatencyMs: score.avgLatencyMs } }
      ).maxTimeMS(3000).exec().catch(err =>
        logger.warn('[OPTIMIZER] DB quality score write failed:', err.message)
      );
    } else {
      logger.debug('[OPTIMIZER] MongoDB not ready — skipping quality score write');
    }
  } catch (err) {
    logger.warn('[OPTIMIZER] Quality score persistence error:', err.message);
  }

  return score;
}

// ── Public: get system health snapshot ───────────────────────────────────────
function getSystemAdjustments() {
  return { ...systemAdjustments };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _avg(arr) {
  return arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
}

module.exports = {
  getCallConfig,
  recordTurn,
  recordInterruption,
  recordEmptyStt,
  recordLlmFallback,
  recordSpeechTurn,
  finalizeCall,
  getSystemAdjustments,
  // Constants exposed for use in ws-media-optimized
  FAST_MODE_TOKENS,
  NORMAL_TOKENS,
  TOTAL_FAST_MODE_MS
};

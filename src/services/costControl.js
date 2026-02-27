const logger = require('../utils/logger');

// Track costs per call — bounded Map to prevent memory leaks
const costTracker = new Map();
const MAX_TRACKED = 1000; // Safety cap

// ── Accurate cost rates (₹ per unit) ────────────────────────────────────────
// Target: ₹2/min total
const COSTS = {
  vobiz_per_min: 0.50,       // ₹0.50/min telephony
  whisper_per_min: 0.50,     // ₹0.50/min (~$0.006/min OpenAI Whisper)
  gpt4o_mini_input_per_token: 0.000012,  // ~$0.15/1M input tokens
  gpt4o_mini_output_per_token: 0.00006,  // ~$0.60/1M output tokens
  tts_per_char: 0.00125      // ₹0.00125/char (~$15/1M chars OpenAI TTS)
};

// Per-call budget cap (₹) — auto-hangup if exceeded
const PER_CALL_BUDGET_RS = 30; // ₹30 max per call (~15 min)

function trackCall(callSid) {
  // Prevent unbounded growth
  if (costTracker.size >= MAX_TRACKED) {
    const oldest = costTracker.keys().next().value;
    costTracker.delete(oldest);
    logger.warn('Cost tracker at capacity, evicted oldest entry');
  }
  costTracker.set(callSid, {
    inputTokens: 0,
    outputTokens: 0,
    sttMinutes: 0,
    sttCount: 0,
    ttsCount: 0,
    ttsChars: 0,
    callDurationSec: 0,
    startedAt: Date.now()
  });
}

function addTokenUsage(callSid, inputTokens = 0, outputTokens = 0) {
  const cost = costTracker.get(callSid);
  if (!cost) return;
  cost.inputTokens += inputTokens;
  cost.outputTokens += outputTokens;
}

function addSttUsage(callSid, durationSec) {
  const cost = costTracker.get(callSid);
  if (!cost) return;
  cost.sttCount++;
  cost.sttMinutes += durationSec / 60;
}

function addTtsUsage(callSid, charCount) {
  const cost = costTracker.get(callSid);
  if (!cost) return;
  cost.ttsCount++;
  cost.ttsChars += charCount;
}

function getEstimatedCost(callSid) {
  const entry = costTracker.get(callSid);
  if (!entry) return 0;

  // Total call duration in minutes
  const callMinutes = (Date.now() - entry.startedAt) / 60000;

  const vobizCost = callMinutes * COSTS.vobiz_per_min;
  const sttCost = entry.sttMinutes * COSTS.whisper_per_min;
  const llmCost = (entry.inputTokens * COSTS.gpt4o_mini_input_per_token) +
    (entry.outputTokens * COSTS.gpt4o_mini_output_per_token);
  const ttsCost = entry.ttsChars * COSTS.tts_per_char;

  return vobizCost + sttCost + llmCost + ttsCost;
}

function isWithinBudget(callSid) {
  return getEstimatedCost(callSid) < PER_CALL_BUDGET_RS;
}

function getSnapshot() {
  const activeCalls = [];
  let activeEstimatedCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalSttMinutes = 0;
  let totalTtsChars = 0;

  for (const [callSid, entry] of costTracker) {
    const estimatedCost = getEstimatedCost(callSid);
    activeEstimatedCost += estimatedCost;
    totalInputTokens += entry.inputTokens || 0;
    totalOutputTokens += entry.outputTokens || 0;
    totalSttMinutes += entry.sttMinutes || 0;
    totalTtsChars += entry.ttsChars || 0;

    activeCalls.push({
      callSid,
      startedAt: entry.startedAt,
      estimatedCost
    });
  }

  const sorted = activeCalls.sort((a, b) => a.startedAt - b.startedAt);
  const burnRatePerMin = sorted.reduce((sum, c) => {
    const ageMin = Math.max(1 / 60, (Date.now() - c.startedAt) / 60000);
    return sum + (c.estimatedCost / ageMin);
  }, 0);

  return {
    activeCalls: sorted,
    activeCallsCount: sorted.length,
    activeEstimatedCost,
    burnRatePerMin,
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      sttMinutes: totalSttMinutes,
      ttsChars: totalTtsChars
    }
  };
}

function endCallTracking(callSid) {
  const entry = costTracker.get(callSid);
  if (!entry) return 0;

  const callMinutes = ((Date.now() - entry.startedAt) / 60000);
  const vobizCost = callMinutes * COSTS.vobiz_per_min;
  const sttCost = entry.sttMinutes * COSTS.whisper_per_min;
  const llmCost = (entry.inputTokens * COSTS.gpt4o_mini_input_per_token) +
    (entry.outputTokens * COSTS.gpt4o_mini_output_per_token);
  const ttsCost = entry.ttsChars * COSTS.tts_per_char;
  const finalCost = vobizCost + sttCost + llmCost + ttsCost;

  logger.log(`Call ${callSid} ended — cost: ₹${finalCost.toFixed(2)}, duration: ${callMinutes.toFixed(1)}min, STT:${entry.sttCount} TTS:${entry.ttsCount}`);

  // Persist cost to database for historical analysis
  if (callSid && entry) {
    const Call = require('../models/call.model');
    Call.findOneAndUpdate(
      { callSid },
      {
        $set: {
          estimatedCost: finalCost,
          costBreakdown: {
            vobiz: vobizCost,
            whisper: sttCost,
            gpt: llmCost,
            tts: ttsCost
          },
          callDurationMin: callMinutes
        }
      }
    ).catch(err => logger.warn('Failed to persist cost data', err.message));
  }

  costTracker.delete(callSid);
  return finalCost;
}

// Periodic cleanup: remove stale entries older than 1 hour (orphan calls)
setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of costTracker) {
    if (now - entry.startedAt > 3600000) {
      logger.warn('Cleaning stale cost entry', sid);
      costTracker.delete(sid);
    }
  }
}, 300000);

module.exports = {
  trackCall, addTokenUsage, addSttUsage, addTtsUsage,
  getEstimatedCost, isWithinBudget, endCallTracking,
  PER_CALL_BUDGET_RS, getSnapshot
};

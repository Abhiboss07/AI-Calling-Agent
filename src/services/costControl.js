const logger = require('../utils/logger');
const config = require('../config');

// Track costs per call - bounded Map to prevent memory leaks
const costTracker = new Map();
const MAX_TRACKED = 1000; // Safety cap

// Cost rates (INR per unit)
// Target: <= INR 2/min total
const COSTS = {
  vobiz_per_min: 0.50,                 // INR 0.50/min telephony
  whisper_per_min: 0.50,               // INR 0.50/min OpenAI Whisper (approx)
  gpt4o_mini_input_per_token: 0.000012,
  gpt4o_mini_output_per_token: 0.00006,
  tts_per_char: 0.00125
};

// Per-call hard cap (safety)
const PER_CALL_BUDGET_RS = 30;
const TARGET_PER_MIN_RS = Number(config?.budget?.targetPerMinuteRs || 2);

function trackCall(callSid) {
  if (!callSid) return;

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
  cost.sttMinutes += (durationSec / 60);
}

function addTtsUsage(callSid, charCount) {
  const cost = costTracker.get(callSid);
  if (!cost) return;
  cost.ttsCount++;
  cost.ttsChars += charCount;
}

function getCallAgeMinutes(callSid) {
  const entry = costTracker.get(callSid);
  if (!entry) return 0;
  return Math.max(0, (Date.now() - entry.startedAt) / 60000);
}

function getEstimatedCost(callSid) {
  const entry = costTracker.get(callSid);
  if (!entry) return 0;

  const callMinutes = getCallAgeMinutes(callSid);
  const vobizCost = callMinutes * COSTS.vobiz_per_min;
  const sttCost = entry.sttMinutes * COSTS.whisper_per_min;
  const llmCost = (entry.inputTokens * COSTS.gpt4o_mini_input_per_token) +
    (entry.outputTokens * COSTS.gpt4o_mini_output_per_token);
  const ttsCost = entry.ttsChars * COSTS.tts_per_char;

  return vobizCost + sttCost + llmCost + ttsCost;
}

function getEstimatedBurnRatePerMin(callSid) {
  const estimated = getEstimatedCost(callSid);
  if (!estimated) return 0;
  const ageMin = Math.max(1 / 60, getCallAgeMinutes(callSid));
  return estimated / ageMin;
}

function isWithinBudget(callSid) {
  return getEstimatedCost(callSid) < PER_CALL_BUDGET_RS;
}

function isWithinTargetPerMinute(callSid) {
  return getEstimatedBurnRatePerMin(callSid) <= TARGET_PER_MIN_RS;
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
    const burnRatePerMin = getEstimatedBurnRatePerMin(callSid);

    activeEstimatedCost += estimatedCost;
    totalInputTokens += entry.inputTokens || 0;
    totalOutputTokens += entry.outputTokens || 0;
    totalSttMinutes += entry.sttMinutes || 0;
    totalTtsChars += entry.ttsChars || 0;

    activeCalls.push({
      callSid,
      startedAt: entry.startedAt,
      estimatedCost,
      burnRatePerMin,
      overTarget: burnRatePerMin > TARGET_PER_MIN_RS
    });
  }

  const sorted = activeCalls.sort((a, b) => a.startedAt - b.startedAt);
  const burnRatePerMin = sorted.reduce((sum, c) => sum + c.burnRatePerMin, 0);
  const overTargetCalls = sorted.filter((c) => c.overTarget).length;

  return {
    activeCalls: sorted,
    activeCallsCount: sorted.length,
    activeEstimatedCost,
    burnRatePerMin,
    overTargetCalls,
    targetPerMinuteRs: TARGET_PER_MIN_RS,
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

  const callMinutes = Math.max(0, (Date.now() - entry.startedAt) / 60000);
  const vobizCost = callMinutes * COSTS.vobiz_per_min;
  const sttCost = entry.sttMinutes * COSTS.whisper_per_min;
  const llmCost = (entry.inputTokens * COSTS.gpt4o_mini_input_per_token) +
    (entry.outputTokens * COSTS.gpt4o_mini_output_per_token);
  const ttsCost = entry.ttsChars * COSTS.tts_per_char;
  const finalCost = vobizCost + sttCost + llmCost + ttsCost;

  logger.log(`Call ${callSid} ended - cost: INR ${finalCost.toFixed(2)}, duration: ${callMinutes.toFixed(1)}min, STT:${entry.sttCount} TTS:${entry.ttsCount}`);

  // Persist cost to database for historical analysis
  if (callSid) {
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
          callDurationMin: callMinutes,
          burnRatePerMin: callMinutes > 0 ? (finalCost / callMinutes) : 0,
          targetPerMinuteRs: TARGET_PER_MIN_RS
        }
      }
    ).catch((err) => logger.warn('Failed to persist cost data', err.message));
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
  trackCall,
  addTokenUsage,
  addSttUsage,
  addTtsUsage,
  getEstimatedCost,
  getEstimatedBurnRatePerMin,
  isWithinBudget,
  isWithinTargetPerMinute,
  endCallTracking,
  PER_CALL_BUDGET_RS,
  TARGET_PER_MIN_RS,
  getSnapshot
};

const logger = require('../utils/logger');

// Track costs per call — bounded Map to prevent memory leaks
const costTracker = new Map();
const MAX_TRACKED = 1000; // Safety cap

const COSTS = {
  twilio_per_min: 0.50,    // ₹0.50/min
  whisper_per_min: 0.40,    // ₹0.40/min
  gpt4o_mini_per_token: 0.00001, // ~₹0.00001/token
  tts_per_char: 0.00002  // ~₹0.00002/char
};

function trackCall(callSid) {
  // Prevent unbounded growth
  if (costTracker.size >= MAX_TRACKED) {
    const oldest = costTracker.keys().next().value;
    costTracker.delete(oldest);
    logger.warn('Cost tracker at capacity, evicted oldest entry');
  }
  costTracker.set(callSid, { tokens: 0, minutes: 0, sttCount: 0, ttsCount: 0, ttsChars: 0, startedAt: Date.now() });
}

function addTokenUsage(callSid, tokenCount) {
  const cost = costTracker.get(callSid);
  if (!cost) return;
  cost.tokens += tokenCount;
}

function addSttUsage(callSid, durationSec) {
  const cost = costTracker.get(callSid);
  if (!cost) return;
  cost.sttCount++;
  cost.minutes += durationSec / 60;
}

function addTtsUsage(callSid, charCount) {
  const cost = costTracker.get(callSid);
  if (!cost) return;
  cost.ttsCount++;
  cost.ttsChars += charCount;
}

function getEstimatedCost(callSid) {
  const cost = costTracker.get(callSid);
  if (!cost) return 0;
  return (
    cost.minutes * COSTS.twilio_per_min +
    cost.minutes * COSTS.whisper_per_min +
    cost.tokens * COSTS.gpt4o_mini_per_token +
    cost.ttsChars * COSTS.tts_per_char
  );
}

function isWithinBudget(callSid, maxCostRs) {
  return getEstimatedCost(callSid) < maxCostRs;
}

function endCallTracking(callSid) {
  const finalCost = getEstimatedCost(callSid);
  const entry = costTracker.get(callSid);
  const durationMin = entry ? ((Date.now() - entry.startedAt) / 60000).toFixed(1) : '?';
  logger.log(`Call ${callSid} ended — cost: ₹${finalCost.toFixed(2)}, duration: ${durationMin}min`);
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
  getEstimatedCost, isWithinBudget, endCallTracking
};

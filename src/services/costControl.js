const logger = require('../utils/logger');

// Track costs per call and campaign
const costTracker = new Map(); // callSid -> {tokens: N, minutes: N, sttCount: N, ttsCount: N, ttsChars: N}

const COSTS = {
  twiilio_per_min: 0.5,      // ₹0.5/min
  whisper_per_min: 0.4,      // ₹0.4/min
  gpt4o_mini_per_token: 0.00001,  // approx, depends on provider
  tts_per_char: 0.00002       // approx ₹0.00002/char
};

function trackCall(callSid) {
  costTracker.set(callSid, { tokens: 0, minutes: 0, sttCount: 0, ttsCount: 0, ttsChars: 0 });
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
  const twiilioCost = cost.minutes * COSTS.twiilio_per_min;
  const sttCost = cost.minutes * COSTS.whisper_per_min;
  const gptCost = cost.tokens * COSTS.gpt4o_mini_per_token;
  const ttsCost = cost.ttsChars * COSTS.tts_per_char;
  const total = twiilioCost + sttCost + gptCost + ttsCost;
  return total;
}

function isWithinBudget(callSid, maxCostRs) {
  const estimated = getEstimatedCost(callSid);
  return estimated < maxCostRs;
}

function endCallTracking(callSid) {
  const finalCost = getEstimatedCost(callSid);
  logger.log(`Call ${callSid} final cost: ₹${finalCost.toFixed(2)}`);
  costTracker.delete(callSid);
  return finalCost;
}

module.exports = {
  trackCall, addTokenUsage, addSttUsage, addTtsUsage, getEstimatedCost, isWithinBudget, endCallTracking
};

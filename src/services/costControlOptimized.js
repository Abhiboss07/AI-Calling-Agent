/**
 * Cost Control Service - Aggressive Optimization
 * Target: Keep total cost under ₹2/minute
 * Current breakdown: Vobiz ₹0.50 + Whisper ₹0.50 + GPT-4o-mini ₹0.05 + TTS ₹0.90 = ₹1.95
 */

const logger = require('../utils/logger');
const config = require('../config');

// Cost rates (in rupees)
const COST_RATES = {
  whisperPerMinute: 0.50,  // ₹0.50 per minute of audio
  gpt4oMiniPer1KTokens: 0.0375,  // ₹0.015 input + ₹0.06 output per 1K tokens (avg)
  ttsPer1KChars: 1.125,  // ₹0.90 per ~800 chars (OpenAI TTS-1)
  vobizPerMinute: 0.50   // ₹0.50 per minute call cost
};

// Per-call tracking
const callTracking = new Map();

// Global stats
let globalStats = {
  totalCalls: 0,
  totalDuration: 0,
  totalCost: 0,
  ttsChars: 0,
  sttMinutes: 0,
  llmTokens: 0
};

class CallCostTracker {
  constructor(callSid) {
    this.callSid = callSid;
    this.startTime = Date.now();
    this.endTime = null;
    
    // Usage tracking
    this.sttSeconds = 0;
    this.llmInputTokens = 0;
    this.llmOutputTokens = 0;
    this.ttsChars = 0;
    this.ttsRequests = 0;
    this.cachedTtsHits = 0;
    
    // Costs
    this.sttCost = 0;
    this.llmCost = 0;
    this.ttsCost = 0;
    
    // Budget enforcement
    this.maxCostPerCall = (config.budget?.targetPerMinuteRs || 2) * 10; // ₹20 max per call (10 min)
    this.warningThreshold = this.maxCostPerCall * 0.8;
    this.hardLimitHit = false;
  }
  
  addSttUsage(audioDurationSec) {
    this.sttSeconds += audioDurationSec;
    this.sttCost = (this.sttSeconds / 60) * COST_RATES.whisperPerMinute;
    this.checkBudget();
  }
  
  addLlmUsage(inputTokens, outputTokens) {
    this.llmInputTokens += inputTokens;
    this.llmOutputTokens += outputTokens;
    const totalTokens = inputTokens + outputTokens;
    this.llmCost = (totalTokens / 1000) * COST_RATES.gpt4oMiniPer1KTokens;
    this.checkBudget();
  }
  
  addTtsUsage(charCount, fromCache = false) {
    if (fromCache) {
      this.cachedTtsHits++;
      return; // No cost for cache hits
    }
    
    this.ttsChars += charCount;
    this.ttsRequests++;
    this.ttsCost = (this.ttsChars / 1000) * COST_RATES.ttsPer1KChars;
    this.checkBudget();
  }
  
  getTotalCost() {
    const vobizCost = ((Date.now() - this.startTime) / 60000) * COST_RATES.vobizPerMinute;
    return this.sttCost + this.llmCost + this.ttsCost + vobizCost;
  }
  
  getBurnRatePerMinute() {
    const durationMin = (Date.now() - this.startTime) / 60000;
    if (durationMin < 0.1) return 0; // Avoid division by small numbers
    return this.getTotalCost() / durationMin;
  }
  
  checkBudget() {
    const total = this.getTotalCost();
    
    if (total > this.maxCostPerCall && !this.hardLimitHit) {
      this.hardLimitHit = true;
      logger.warn('CALL BUDGET EXCEEDED', {
        callSid: this.callSid,
        cost: total.toFixed(2),
        limit: this.maxCostPerCall
      });
      return false; // Signal to end call
    }
    
    if (total > this.warningThreshold && !this.warningSent) {
      this.warningSent = true;
      logger.warn('CALL BUDGET WARNING', {
        callSid: this.callSid,
        cost: total.toFixed(2),
        threshold: this.warningThreshold
      });
    }
    
    return true;
  }
  
  isWithinBudget() {
    return this.getTotalCost() < this.maxCostPerCall;
  }
  
  finalize() {
    this.endTime = Date.now();
    const durationMin = (this.endTime - this.startTime) / 60000;
    const totalCost = this.getTotalCost();
    
    // Update global stats
    globalStats.totalCalls++;
    globalStats.totalDuration += durationMin;
    globalStats.totalCost += totalCost;
    globalStats.ttsChars += this.ttsChars;
    globalStats.sttMinutes += this.sttSeconds / 60;
    globalStats.llmTokens += this.llmInputTokens + this.llmOutputTokens;
    
    return {
      durationMin,
      sttCost: this.sttCost,
      llmCost: this.llmCost,
      ttsCost: this.ttsCost,
      vobizCost: durationMin * COST_RATES.vobizPerMinute,
      totalCost,
      burnRate: totalCost / durationMin,
      cacheHitRate: this.ttsRequests > 0 ? this.cachedTtsHits / (this.ttsRequests + this.cachedTtsHits) : 0
    };
  }
}

// Track new call
function trackCall(callSid) {
  if (!callSid) return;
  callTracking.set(callSid, new CallCostTracker(callSid));
  logger.debug('Cost tracking started', callSid);
}

// End call tracking
function endCallTracking(callSid) {
  if (!callSid) return null;
  const tracker = callTracking.get(callSid);
  if (!tracker) return null;
  
  const summary = tracker.finalize();
  callTracking.delete(callSid);
  
  logger.log('Call cost summary', {
    callSid,
    duration: `${summary.durationMin.toFixed(1)}min`,
    total: `₹${summary.totalCost.toFixed(2)}`,
    burnRate: `₹${summary.burnRate.toFixed(2)}/min`,
    cacheHit: `${(summary.cacheHitRate * 100).toFixed(0)}%`
  });
  
  return summary;
}

// Add usage
function addSttUsage(callSid, audioDurationSec) {
  const tracker = callTracking.get(callSid);
  if (tracker) tracker.addSttUsage(audioDurationSec);
}

function addTokenUsage(callSid, inputTokens, outputTokens) {
  const tracker = callTracking.get(callSid);
  if (tracker) tracker.addLlmUsage(inputTokens, outputTokens);
}

function addTtsUsage(callSid, charCount, fromCache = false) {
  const tracker = callTracking.get(callSid);
  if (tracker) tracker.addTtsUsage(charCount, fromCache);
}

// Getters
function getEstimatedBurnRatePerMin(callSid) {
  const tracker = callTracking.get(callSid);
  return tracker ? tracker.getBurnRatePerMinute() : 0;
}

function isWithinBudget(callSid) {
  const tracker = callTracking.get(callSid);
  return tracker ? tracker.isWithinBudget() : false;
}

// Get optimization recommendations
function getOptimizationReport() {
  const avgDuration = globalStats.totalCalls > 0 
    ? globalStats.totalDuration / globalStats.totalCalls 
    : 0;
  const avgCost = globalStats.totalCalls > 0 
    ? globalStats.totalCost / globalStats.totalCalls 
    : 0;
  
  return {
    totalCalls: globalStats.totalCalls,
    avgDurationMin: avgDuration.toFixed(1),
    avgCostPerCall: `₹${avgCost.toFixed(2)}`,
    targetCostPerCall: `₹${(COST_RATES.vobizPerMinute + COST_RATES.whisperPerMinute + 0.05 + 0.90).toFixed(2)}`,
    breakdown: {
      vobiz: `₹${COST_RATES.vobizPerMinute}/min`,
      stt: `₹${COST_RATES.whisperPerMinute}/min`,
      llm: `~₹0.05/min`,
      tts: `~₹0.90/min`
    },
    recommendations: [
      'Use TTS cache aggressively - each cache hit saves ~₹0.02',
      'Keep responses under 20 words - TTS is 60% of cost',
      'Compress conversation history every 5 turns',
      'Use deterministic responses for common intents',
      'Pre-warm greetings and frequent phrases'
    ]
  };
}

// Reset stats (for testing)
function resetStats() {
  globalStats = {
    totalCalls: 0,
    totalDuration: 0,
    totalCost: 0,
    ttsChars: 0,
    sttMinutes: 0,
    llmTokens: 0
  };
}

module.exports = {
  trackCall,
  endCallTracking,
  addSttUsage,
  addTokenUsage,
  addTtsUsage,
  getEstimatedBurnRatePerMin,
  isWithinBudget,
  getOptimizationReport,
  resetStats,
  COST_RATES
};

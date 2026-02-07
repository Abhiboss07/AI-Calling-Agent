// Simple metrics collector
const metrics = {
  callsStarted: 0,
  callsCompleted: 0,
  callsFailed: 0,
  totalCallDurationSec: 0,
  sttRequests: 0,
  sttErrors: 0,
  llmRequests: 0,
  llmErrors: 0,
  ttsRequests: 0,
  ttsErrors: 0,
  avgLatencyMs: 0
};

function incrementCallsStarted() {
  metrics.callsStarted++;
}

function incrementCallsCompleted() {
  metrics.callsCompleted++;
}

function incrementCallsFailed() {
  metrics.callsFailed++;
}

function addCallDuration(sec) {
  metrics.totalCallDurationSec += sec;
}

function incrementSttRequest(success = true) {
  metrics.sttRequests++;
  if (!success) metrics.sttErrors++;
}

function incrementLlmRequest(success = true) {
  metrics.llmRequests++;
  if (!success) metrics.llmErrors++;
}

function incrementTtsRequest(success = true) {
  metrics.ttsRequests++;
  if (!success) metrics.ttsErrors++;
}

function getMetrics() {
  return {
    ...metrics,
    avgCallDurationSec: metrics.callsCompleted > 0 ? (metrics.totalCallDurationSec / metrics.callsCompleted).toFixed(2) : 0,
    successRate: metrics.callsStarted > 0 ? ((metrics.callsCompleted / metrics.callsStarted) * 100).toFixed(2) : 0
  };
}

module.exports = {
  incrementCallsStarted, incrementCallsCompleted, incrementCallsFailed, addCallDuration,
  incrementSttRequest, incrementLlmRequest, incrementTtsRequest, getMetrics
};

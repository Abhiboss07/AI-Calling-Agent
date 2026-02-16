// ══════════════════════════════════════════════════════════════════════════════
// METRICS SERVICE — In-memory counters + latency tracking
// ══════════════════════════════════════════════════════════════════════════════

const metrics = {
  // Call counters
  callsStarted: 0,
  callsCompleted: 0,
  callsFailed: 0,
  totalCallDurationSec: 0,
  activeCalls: 0,
  peakConcurrent: 0,

  // Service counters
  sttRequests: 0,
  sttErrors: 0,
  llmRequests: 0,
  llmErrors: 0,
  ttsRequests: 0,
  ttsErrors: 0,

  // Pipeline latency tracking (rolling window of last 100)
  pipelineLatencies: [],   // [{total, stt, llm, tts, ts}]
  webhookLatencies: [],    // [ms]

  // Error tracking
  wsErrors: 0,
  wsDisconnects: 0,
  bufferOverflows: 0,
  interruptCount: 0,       // Times user interrupted AI mid-response

  // Start time
  startedAt: Date.now()
};

const MAX_LATENCY_SAMPLES = 100;

function incrementCallsStarted() {
  metrics.callsStarted++;
  metrics.activeCalls++;
  if (metrics.activeCalls > metrics.peakConcurrent) {
    metrics.peakConcurrent = metrics.activeCalls;
  }
}

function incrementCallsCompleted() {
  metrics.callsCompleted++;
  metrics.activeCalls = Math.max(0, metrics.activeCalls - 1);
}

function incrementCallsFailed() {
  metrics.callsFailed++;
  metrics.activeCalls = Math.max(0, metrics.activeCalls - 1);
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

// Pipeline latency: track STT, LLM, TTS, and total per turn
function addPipelineLatency(sttMs, llmMs, ttsMs) {
  const entry = { total: sttMs + llmMs + ttsMs, stt: sttMs, llm: llmMs, tts: ttsMs, ts: Date.now() };
  metrics.pipelineLatencies.push(entry);
  if (metrics.pipelineLatencies.length > MAX_LATENCY_SAMPLES) {
    metrics.pipelineLatencies.shift();
  }
}

function addWebhookLatency(ms) {
  metrics.webhookLatencies.push(ms);
  if (metrics.webhookLatencies.length > MAX_LATENCY_SAMPLES) {
    metrics.webhookLatencies.shift();
  }
}

function incrementWsError() { metrics.wsErrors++; }
function incrementWsDisconnect(reason) {
  metrics.wsDisconnects++;
  // FIX M7: Track disconnect reasons
  if (reason === 'error' || reason === 'unknown') {
    metrics.wsErrors++;
  }
}
function incrementBufferOverflow() { metrics.bufferOverflows++; }
function incrementInterrupt() { metrics.interruptCount++; }

function getMetrics() {
  // Compute latency percentiles
  const latencies = metrics.pipelineLatencies.map(l => l.total).sort((a, b) => a - b);
  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;

  const avgStt = metrics.pipelineLatencies.length > 0
    ? Math.round(metrics.pipelineLatencies.reduce((s, l) => s + l.stt, 0) / metrics.pipelineLatencies.length) : 0;
  const avgLlm = metrics.pipelineLatencies.length > 0
    ? Math.round(metrics.pipelineLatencies.reduce((s, l) => s + l.llm, 0) / metrics.pipelineLatencies.length) : 0;
  const avgTts = metrics.pipelineLatencies.length > 0
    ? Math.round(metrics.pipelineLatencies.reduce((s, l) => s + l.tts, 0) / metrics.pipelineLatencies.length) : 0;

  return {
    // Calls
    callsStarted: metrics.callsStarted,
    callsCompleted: metrics.callsCompleted,
    callsFailed: metrics.callsFailed,
    activeCalls: metrics.activeCalls,
    peakConcurrent: metrics.peakConcurrent,
    avgCallDurationSec: metrics.callsCompleted > 0
      ? (metrics.totalCallDurationSec / metrics.callsCompleted).toFixed(1) : 0,
    successRate: metrics.callsStarted > 0
      ? ((metrics.callsCompleted / metrics.callsStarted) * 100).toFixed(1) + '%' : '0%',

    // Services
    sttRequests: metrics.sttRequests,
    sttErrors: metrics.sttErrors,
    sttErrorRate: metrics.sttRequests > 0
      ? ((metrics.sttErrors / metrics.sttRequests) * 100).toFixed(1) + '%' : '0%',
    llmRequests: metrics.llmRequests,
    llmErrors: metrics.llmErrors,
    ttsRequests: metrics.ttsRequests,
    ttsErrors: metrics.ttsErrors,

    // Latency (ms)
    latency: {
      p50, p95, p99,
      avgStt, avgLlm, avgTts,
      avgTotal: p50,  // Approximate
      samples: latencies.length
    },

    // Health
    wsErrors: metrics.wsErrors,
    wsDisconnects: metrics.wsDisconnects,
    bufferOverflows: metrics.bufferOverflows,
    interrupts: metrics.interruptCount,

    // System
    uptimeSec: Math.round((Date.now() - metrics.startedAt) / 1000),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  };
}

module.exports = {
  incrementCallsStarted, incrementCallsCompleted, incrementCallsFailed, addCallDuration,
  incrementSttRequest, incrementLlmRequest, incrementTtsRequest,
  addPipelineLatency, addWebhookLatency,
  incrementWsError, incrementWsDisconnect, incrementBufferOverflow, incrementInterrupt,
  getMetrics
};

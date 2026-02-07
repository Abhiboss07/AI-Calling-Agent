#!/usr/bin/env node

/**
 * Load testing script for AI outbound calling agent
 * Simulates 5-10 concurrent calls to test throughput and latency
 * Run with: node scripts/load-test.js
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CAMPAIGN_ID = process.env.CAMPAIGN_ID || '507f1f77bcf86cd799439011';
const CONCURRENT_CALLS = parseInt(process.env.CONCURRENT_CALLS || '5');
const CALL_DURATION_SEC = parseInt(process.env.CALL_DURATION_SEC || '60');

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} ${msg}`)
};

async function simulateCall(callNumber, duration) {
  const callId = `test-call-${Date.now()}-${callNumber}`;
  const phoneNumber = `+1650555${String(1000 + callNumber).slice(-4)}`;
  const startTime = Date.now();

  try {
    // POST /v1/calls/start
    logger.info(`Call ${callNumber}: Starting call to ${phoneNumber}`);
    const startResp = await axios.post(`${BASE_URL}/api/v1/calls/start`, {
      campaignId: CAMPAIGN_ID,
      phoneNumber,
      fromNumber: process.env.TWILIO_CALLER_ID || '+19856141493'
    }, { timeout: 10000 });

    if (!startResp.data.ok) {
      logger.error(`Call ${callNumber}: Failed to start - ${startResp.data.error}`);
      return { callNumber, success: false, error: startResp.data.error, latencyMs: Date.now() - startTime };
    }

    const { callId: dbCallId, callSid } = startResp.data;
    logger.success(`Call ${callNumber}: Started (callSid=${callSid})`);

    // Simulate call duration
    await new Promise(resolve => setTimeout(resolve, duration * 1000));

    // POST /v1/calls/:id/end
    logger.info(`Call ${callNumber}: Ending call`);
    const endResp = await axios.post(`${BASE_URL}/api/v1/calls/${dbCallId}/end`, {}, { timeout: 10000 });

    if (!endResp.data.ok) {
      logger.error(`Call ${callNumber}: Failed to end - ${endResp.data.error}`);
      return { callNumber, success: false, error: endResp.data.error, latencyMs: Date.now() - startTime };
    }

    const latencyMs = Date.now() - startTime;
    logger.success(`Call ${callNumber}: Completed in ${latencyMs}ms`);

    return { callNumber, success: true, callSid, durationSec: endResp.data.durationSec, latencyMs };
  } catch (err) {
    logger.error(`Call ${callNumber}: Error - ${err.message}`);
    return { callNumber, success: false, error: err.message, latencyMs: Date.now() - startTime };
  }
}

async function runLoadTest() {
  logger.info(`Starting load test: ${CONCURRENT_CALLS} concurrent calls, ${CALL_DURATION_SEC}s each`);
  const startTime = Date.now();
  const results = [];

  // Launch all concurrent calls
  const promises = [];
  for (let i = 0; i < CONCURRENT_CALLS; i++) {
    promises.push(simulateCall(i, CALL_DURATION_SEC).then(result => results.push(result)));
  }

  await Promise.all(promises);

  // Fetch metrics
  let metricsData = {};
  try {
    const metricsResp = await axios.get(`${BASE_URL}/api/v1/metrics`, { timeout: 5000 });
    metricsData = metricsResp.data.data || {};
  } catch (err) {
    logger.error(`Failed to fetch metrics: ${err.message}`);
  }

  // Report results
  const totalTime = Date.now() - startTime;
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const avgLatency = results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length) : 0;

  console.log(`
╔════════════════════════════════════════════════╗
║ LOAD TEST REPORT                               ║
╚════════════════════════════════════════════════╝

Total Time:           ${totalTime}ms
Concurrent Calls:     ${CONCURRENT_CALLS}
Successful:           ${successful}
Failed:               ${failed}
Success Rate:         ${((successful / results.length) * 100).toFixed(2)}%
Average Latency:      ${avgLatency}ms

System Metrics:
- Calls Started:      ${metricsData.callsStarted || 'N/A'}
- Calls Completed:    ${metricsData.callsCompleted || 'N/A'}
- Calls Failed:       ${metricsData.callsFailed || 'N/A'}
- STT Requests:       ${metricsData.sttRequests || 'N/A'} (errors: ${metricsData.sttErrors || 'N/A'})
- LLM Requests:       ${metricsData.llmRequests || 'N/A'} (errors: ${metricsData.llmErrors || 'N/A'})
- TTS Requests:       ${metricsData.ttsRequests || 'N/A'} (errors: ${metricsData.ttsErrors || 'N/A'})

═════════════════════════════════════════════════
  `);

  if (failed > 0) {
    console.log('Failed calls:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  Call ${r.callNumber}: ${r.error}`);
    });
  }

  process.exit(successful === results.length ? 0 : 1);
}

runLoadTest().catch(err => {
  logger.error('Load test failed:', err);
  process.exit(1);
});

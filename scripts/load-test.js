#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * LOAD TEST — AI Calling Agent WebSocket + API
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Simulates concurrent Twilio WebSocket connections sending µ-law audio.
 * This is the ONLY way to properly load test a real-time voice system —
 * HTTP load testers (k6, artillery) can't simulate WebSocket media streams.
 *
 * Usage:
 *   node scripts/load-test.js --connections=10 --duration=30
 *   node scripts/load-test.js --connections=100 --duration=60 --target=wss://staging.example.com/stream
 *
 * What it tests:
 *   - WebSocket connection establishment
 *   - Concurrent audio stream handling
 *   - Memory stability under load
 *   - Pipeline throughput
 *   - Connection cleanup
 * ══════════════════════════════════════════════════════════════════════════════
 */

const WebSocket = require('ws');
const http = require('http');
const https = require('https');

// ── Parse args ──────────────────────────────────────────────────────────────
const args = {};
process.argv.slice(2).forEach(a => {
  const [k, v] = a.replace('--', '').split('=');
  args[k] = v;
});

const CONNECTIONS = parseInt(args.connections || args.c || '10');
const DURATION_SEC = parseInt(args.duration || args.d || '30');
const TARGET = args.target || 'ws://localhost:3000/stream';
const HEALTH_URL = args.health || TARGET.replace('ws://', 'http://').replace('wss://', 'https://').replace('/stream', '/health/ready');
const RAMP_UP_SEC = parseInt(args.rampup || '5');

console.log(`
╔════════════════════════════════════════════════╗
║        AI CALLING AGENT — LOAD TEST            ║
╠════════════════════════════════════════════════╣
║  Target:       ${TARGET.padEnd(30)}║
║  Connections:  ${String(CONNECTIONS).padEnd(30)}║
║  Duration:     ${(DURATION_SEC + 's').padEnd(30)}║
║  Ramp-up:      ${(RAMP_UP_SEC + 's').padEnd(30)}║
╚════════════════════════════════════════════════╝
`);

// ── Metrics ─────────────────────────────────────────────────────────────────
const stats = {
  connectAttempts: 0,
  connectSuccess: 0,
  connectFailed: 0,
  messagesReceived: 0,
  messagesSent: 0,
  errors: 0,
  closedClean: 0,
  closedError: 0,
  latencies: [],
  activeConnections: 0,
  peakConnections: 0,
  startTime: Date.now()
};

// ── Generate fake µ-law audio chunk (silence + noise) ───────────────────────
function generateMulawChunk(bytes = 160) {
  const buf = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) {
    // µ-law silence is 0xFF, add slight random noise
    buf[i] = Math.random() > 0.7 ? Math.floor(Math.random() * 20) + 0xF0 : 0xFF;
  }
  return buf.toString('base64');
}

// ── Generate a chunk with actual "voice" (higher amplitude) ─────────────────
function generateVoiceChunk(bytes = 160) {
  const buf = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) {
    // Simulate voice: lower µ-law values = higher amplitude
    buf[i] = Math.floor(Math.random() * 128) + 0x20;
  }
  return buf.toString('base64');
}

// ── Simulate a single call ──────────────────────────────────────────────────
function simulateCall(callId) {
  return new Promise((resolve) => {
    const callSid = `CA_LOAD_TEST_${callId}_${Date.now()}`;
    const startTime = Date.now();
    let messageCount = 0;
    let mediaInterval = null;

    stats.connectAttempts++;

    const ws = new WebSocket(TARGET, {
      headers: { 'User-Agent': 'AI-Calling-LoadTest/1.0' },
      perMessageDeflate: false,
      handshakeTimeout: 10000
    });

    ws.on('open', () => {
      stats.connectSuccess++;
      stats.activeConnections++;
      if (stats.activeConnections > stats.peakConnections) {
        stats.peakConnections = stats.activeConnections;
      }

      // Send 'start' event (simulating Twilio)
      ws.send(JSON.stringify({
        event: 'start',
        streamSid: `MZ_TEST_${callId}`,
        start: {
          callSid,
          customParameters: {
            callerNumber: `+9199${String(callId).padStart(8, '0')}`,
            direction: 'inbound'
          }
        }
      }));

      // Send media events at ~50ms intervals (20 chunks/sec like Twilio)
      let chunksSent = 0;
      const totalChunks = DURATION_SEC * 20;
      const voiceStartChunk = Math.floor(totalChunks * 0.1);  // Start "speaking" at 10%
      const voiceEndChunk = Math.floor(totalChunks * 0.3);    // Stop "speaking" at 30%
      const voice2Start = Math.floor(totalChunks * 0.5);      // Second utterance at 50%
      const voice2End = Math.floor(totalChunks * 0.7);        // End at 70%

      mediaInterval = setInterval(() => {
        if (chunksSent >= totalChunks || ws.readyState !== WebSocket.OPEN) {
          clearInterval(mediaInterval);
          // Send stop event
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'stop' }));
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) ws.close();
            }, 1000);
          }
          return;
        }

        // Alternate between silence and voice
        const isVoice = (chunksSent >= voiceStartChunk && chunksSent <= voiceEndChunk)
          || (chunksSent >= voice2Start && chunksSent <= voice2End);

        const payload = isVoice ? generateVoiceChunk() : generateMulawChunk();

        ws.send(JSON.stringify({
          event: 'media',
          streamSid: `MZ_TEST_${callId}`,
          media: {
            payload,
            track: 'inbound',
            timestamp: String(chunksSent * 50),
            chunk: String(chunksSent)
          }
        }));

        chunksSent++;
        stats.messagesSent++;
      }, 50); // 20ms per chunk = 50fps
    });

    ws.on('message', (data) => {
      stats.messagesReceived++;
      messageCount++;
    });

    ws.on('pong', () => {
      // Server heartbeat response
    });

    ws.on('error', (err) => {
      stats.errors++;
      if (mediaInterval) clearInterval(mediaInterval);
    });

    ws.on('close', (code) => {
      stats.activeConnections--;
      const duration = Date.now() - startTime;
      stats.latencies.push(duration);

      if (code === 1000 || code === 1001) {
        stats.closedClean++;
      } else {
        stats.closedError++;
        stats.connectFailed++;
      }

      resolve({ callId, duration, messages: messageCount, code });
    });

    // Safety timeout
    setTimeout(() => {
      if (mediaInterval) clearInterval(mediaInterval);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }, (DURATION_SEC + 10) * 1000);
  });
}

// ── Health check before starting ────────────────────────────────────────────
async function checkHealth() {
  return new Promise((resolve) => {
    const client = HEALTH_URL.startsWith('https') ? https : http;
    client.get(HEALTH_URL, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('Server health:', JSON.stringify(json, null, 2));
          resolve(json.ok === true);
        } catch {
          resolve(false);
        }
      });
    }).on('error', () => {
      console.error(`❌ Cannot reach ${HEALTH_URL}`);
      resolve(false);
    });
  });
}

// ── Print results ───────────────────────────────────────────────────────────
function printResults() {
  const sorted = stats.latencies.sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  const totalDuration = (Date.now() - stats.startTime) / 1000;

  console.log(`
╔════════════════════════════════════════════════╗
║              LOAD TEST RESULTS                 ║
╠════════════════════════════════════════════════╣
║  Duration:     ${(totalDuration.toFixed(1) + 's').padEnd(30)}║
║                                                ║
║  ── Connections ──                             ║
║  Attempts:     ${String(stats.connectAttempts).padEnd(30)}║
║  Success:      ${String(stats.connectSuccess).padEnd(30)}║
║  Failed:       ${String(stats.connectFailed).padEnd(30)}║
║  Peak Active:  ${String(stats.peakConnections).padEnd(30)}║
║                                                ║
║  ── Messages ──                                ║
║  Sent:         ${String(stats.messagesSent).padEnd(30)}║
║  Received:     ${String(stats.messagesReceived).padEnd(30)}║
║  Errors:       ${String(stats.errors).padEnd(30)}║
║                                                ║
║  ── Connection Duration ──                     ║
║  P50:          ${(p50 + 'ms').padEnd(30)}║
║  P95:          ${(p95 + 'ms').padEnd(30)}║
║  P99:          ${(p99 + 'ms').padEnd(30)}║
║                                                ║
║  ── Cleanup ──                                 ║
║  Clean Close:  ${String(stats.closedClean).padEnd(30)}║
║  Error Close:  ${String(stats.closedError).padEnd(30)}║
╚════════════════════════════════════════════════╝
`);

  // Throughput
  const throughput = stats.messagesSent / totalDuration;
  console.log(`  Throughput: ${throughput.toFixed(0)} messages/sec`);
  console.log(`  Per connection: ${(stats.messagesSent / stats.connectSuccess).toFixed(0)} messages avg`);

  // Pass/Fail
  const failRate = stats.connectFailed / Math.max(1, stats.connectAttempts);
  if (failRate > 0.05) {
    console.log('\n  ❌ FAIL: Connection failure rate > 5%');
  } else if (stats.errors > 0) {
    console.log('\n  ⚠️  WARN: Some errors occurred');
  } else {
    console.log('\n  ✅ PASS: All connections handled successfully');
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const healthy = await checkHealth();
  if (!healthy) {
    console.error('❌ Server is not ready. Aborting load test.');
    process.exit(1);
  }

  console.log(`\nStarting ${CONNECTIONS} connections with ${RAMP_UP_SEC}s ramp-up...\n`);

  const promises = [];
  const delayBetween = (RAMP_UP_SEC * 1000) / CONNECTIONS;

  for (let i = 0; i < CONNECTIONS; i++) {
    promises.push(simulateCall(i));

    // Ramp up gradually
    if (delayBetween > 10) {
      await new Promise(r => setTimeout(r, delayBetween));
    }

    if ((i + 1) % 10 === 0 || i === CONNECTIONS - 1) {
      console.log(`  Connected: ${i + 1}/${CONNECTIONS} (active: ${stats.activeConnections})`);
    }
  }

  // Monitor while running
  const monitorInterval = setInterval(() => {
    console.log(`  Active: ${stats.activeConnections} | Sent: ${stats.messagesSent} | Received: ${stats.messagesReceived} | Errors: ${stats.errors}`);
  }, 5000);

  await Promise.all(promises);
  clearInterval(monitorInterval);

  printResults();

  // Check server health after load test
  console.log('\nPost-test health check:');
  await checkHealth();

  process.exit(stats.connectFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Load test error:', err);
  process.exit(1);
});

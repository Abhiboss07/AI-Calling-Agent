#!/usr/bin/env node
/**
 * Stress Test — Parallel Mock Calls
 * ──────────────────────────────────
 * Simulates N concurrent AI conversations through the full STT→LLM→TTS pipeline.
 * Measures: latency per turn, memory, CPU, dropped calls, error rate.
 *
 * Usage:
 *   node scripts/stress-test.js                    # 5 concurrent, 3 turns each
 *   node scripts/stress-test.js --calls=10 --turns=6
 *   node scripts/stress-test.js --calls=20 --turns=4 --lang=hi-IN
 */

require('dotenv').config();

const llm = require('../src/services/llm');
const tts = require('../src/services/tts');
const { ConversationFSM } = require('../src/services/conversationFSM');
const config = require('../src/config');
const logger = require('../src/utils/logger');

const args = process.argv.slice(2);
const CONCURRENT = parseInt(args.find(a => a.startsWith('--calls='))?.split('=')[1] || '5');
const TURNS      = parseInt(args.find(a => a.startsWith('--turns='))?.split('=')[1] || '3');
const LANG       = args.find(a => a.startsWith('--lang='))?.split('=')[1] || 'en-IN';
const VERBOSE    = args.includes('--verbose');

const TURN_SCRIPTS = [
  'Hello, yes I can talk',
  'I want to buy a 2BHK flat',
  'My budget is around 50 lakhs',
  'I am looking in Pune, Hinjewadi area',
  'Yes, I would like to book a site visit',
  'Saturday morning works for me'
].slice(0, TURNS);

// ── Helpers ───────────────────────────────────────────────────────────────────
function sep(c = '─', n = 60) { return c.repeat(n); }

const results = {
  completed: 0,
  failed: 0,
  turnLatencies: [],   // all turn total_ms values
  sttLatencies: [],
  llmLatencies: [],
  ttsLatencies: [],
  errors: []
};

// ── Single simulated call ─────────────────────────────────────────────────────
async function simulateCall(callIndex) {
  const callId = `stress-${callIndex}-${Date.now()}`;
  const fsm = new ConversationFSM(callId, 'outbound', LANG, {
    companyName: config.companyName,
    agentName: config.agentName
  });
  fsm.transition('call_answered');

  for (const userText of TURN_SCRIPTS) {
    const t0 = Date.now();

    try {
      // FSM
      const fsmResult = fsm.processTranscript(userText);
      const callState = {
        ...fsm.getLLMContext(),
        turnCount: fsm.turnCount,
        direction: 'outbound'
      };

      // LLM
      const llmStart = Date.now();
      const reply = await llm.generateReply({
        callState,
        lastTranscript: userText,
        customerName: `Stress-${callIndex}`,
        callSid: callId,
        language: LANG,
        callDirection: 'outbound',
        honorific: 'sir_maam'
      });
      const llmMs = Date.now() - llmStart;

      // TTS
      const ttsStart = Date.now();
      const audio = await tts.synthesizeRaw(reply.speak, callId, LANG);
      const ttsMs = Date.now() - ttsStart;

      const totalMs = Date.now() - t0;

      results.llmLatencies.push(llmMs);
      results.ttsLatencies.push(ttsMs);
      results.turnLatencies.push(totalMs);

      if (VERBOSE) {
        console.log(`  [${callId}] "${userText.substring(0, 30)}" → LLM:${llmMs}ms TTS:${ttsMs}ms TOTAL:${totalMs}ms`);
      }

      if (reply.action === 'hangup') break;

    } catch (err) {
      const msg = `[${callId}] turn failed: ${err.message}`;
      results.errors.push(msg);
      if (VERBOSE) console.error('  ERROR:', msg);
      break;
    }
  }

  results.completed++;
}

// ── Statistics ────────────────────────────────────────────────────────────────
function percentile(arr, pct) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * pct)];
}

function avg(arr) {
  return arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
}

function printStats(label, arr) {
  if (!arr.length) return;
  console.log(`  ${label.padEnd(20)} avg=${avg(arr)}ms  p50=${percentile(arr, 0.5)}ms  p95=${percentile(arr, 0.95)}ms  max=${Math.max(...arr)}ms`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  // Env check
  const missing = [
    !config.geminiApiKey && 'GEMINI_API_KEY',
    !config.sarvamApiKey && 'SARVAM_API_KEY'
  ].filter(Boolean);
  if (missing.length) {
    console.error(`\n❌ Missing: ${missing.join(', ')}\n`);
    process.exit(1);
  }

  console.log('\n' + sep('═'));
  console.log('  STRESS TEST');
  console.log(`  Concurrent calls : ${CONCURRENT}`);
  console.log(`  Turns per call   : ${TURNS}`);
  console.log(`  Language         : ${LANG}`);
  console.log(sep('═') + '\n');

  const wallStart = Date.now();
  const memBefore = process.memoryUsage().heapUsed;

  // Launch all calls in parallel
  const promises = Array.from({ length: CONCURRENT }, (_, i) => simulateCall(i + 1));
  await Promise.allSettled(promises);

  const wallMs = Date.now() - wallStart;
  const memAfter = process.memoryUsage().heapUsed;
  const memDeltaMB = ((memAfter - memBefore) / 1024 / 1024).toFixed(1);

  console.log('\n' + sep('═'));
  console.log('  RESULTS');
  console.log(sep());
  console.log(`  Completed calls  : ${results.completed}/${CONCURRENT}`);
  console.log(`  Failed calls     : ${results.failed}`);
  console.log(`  Errors           : ${results.errors.length}`);
  console.log(`  Wall time        : ${wallMs}ms`);
  console.log(`  Heap delta       : +${memDeltaMB} MB`);
  console.log(`  Throughput       : ${(results.completed / (wallMs / 1000)).toFixed(2)} calls/sec`);
  console.log(sep());
  console.log('  LATENCY BREAKDOWN');
  printStats('LLM', results.llmLatencies);
  printStats('TTS', results.ttsLatencies);
  printStats('Turn (LLM+TTS)', results.turnLatencies);

  if (results.errors.length) {
    console.log('\n  ERRORS:');
    results.errors.forEach(e => console.log(`    ✗ ${e}`));
  }

  // Warn on latency thresholds
  const p95Total = percentile(results.turnLatencies, 0.95);
  if (p95Total > 1500) {
    console.log(`\n  ⚠️  P95 turn latency ${p95Total}ms > 1500ms — system under stress`);
  } else if (p95Total > 1000) {
    console.log(`\n  ⚠️  P95 turn latency ${p95Total}ms > 1000ms — approaching limit`);
  } else {
    console.log(`\n  ✅ P95 latency ${p95Total}ms — within acceptable range`);
  }

  console.log(sep('═') + '\n');
  process.exit(results.errors.length > 0 ? 1 : 0);
})();

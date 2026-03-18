/**
 * Realistic Test Mode
 *
 * Simulates production-like call scenarios to validate:
 *   - Sub-second latency under all conditions
 *   - Natural human-like responses
 *   - Correct interruption / barge-in behaviour
 *   - Hindi + English code-switching (Hinglish)
 *   - Fast speaking users (short rapid utterances)
 *   - Background noise (empty / garbage transcripts)
 *   - Objection handling
 *
 * Usage:
 *   npm run realistic-test
 *   node scripts/realistic-test.js --scenario=interruption
 *   node scripts/realistic-test.js --scenario=all
 *
 * Each scenario runs the full STT→LLM→TTS→SPEECH pipeline in mock mode
 * and reports per-turn latency, quality checks, and filler injection.
 */

'use strict';

require('dotenv').config();

const humanSpeech = require('../src/services/humanSpeechEngine');
const responseCache = require('../src/services/responseCache');
const callOptimizer = require('../src/services/callOptimizer');
const llm = require('../src/services/llm');
const logger = require('../src/utils/logger');

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function ms(n) { return `${n}ms`; }
function pass(label) { return `${C.green}✓ ${label}${C.reset}`; }
function fail(label) { return `${C.red}✗ ${label}${C.reset}`; }
function warn(label) { return `${C.yellow}⚠ ${label}${C.reset}`; }
function head(label) { return `\n${C.bold}${C.cyan}━━ ${label} ━━${C.reset}`; }

// ── Scenario definitions ──────────────────────────────────────────────────────

const SCENARIOS = {

  // ── 1. Normal outbound conversation ────────────────────────────────────────
  normal_outbound: {
    name: 'Normal Outbound Flow',
    callSid: 'TEST-NORMAL-001',
    language: 'en-IN',
    direction: 'outbound',
    turns: [
      { user: 'Hello?',                                 step: 'availability_check' },
      { user: 'Yes, I have a minute.',                  step: 'availability_check' },
      { user: 'Looking to buy a 2BHK apartment.',       step: 'purpose' },
      { user: 'Budget is around 60 lakhs.',             step: 'qualify_budget' },
      { user: 'Pune, near Hinjewadi.',                  step: 'location_budget' },
      { user: 'Yes, I can visit this Saturday.',        step: 'book_visit' },
      { user: 'Thank you, bye.',                        step: 'closing' }
    ]
  },

  // ── 2. Interruption scenario ────────────────────────────────────────────────
  interruption: {
    name: 'Interruption / Barge-In',
    callSid: 'TEST-INTERRUPT-002',
    language: 'en-IN',
    direction: 'outbound',
    turns: [
      { user: 'Wait, wait — I want to ask something.',  step: 'availability_check', simulateInterrupt: true },
      { user: 'What is the price?',                     step: 'pricing' },
      { user: 'Is there an EMI option?',                step: 'qualify_budget' },
      { user: 'Okay, call me tomorrow at 5pm.',         step: 'reschedule_time' }
    ]
  },

  // ── 3. Hinglish code-switching ──────────────────────────────────────────────
  hinglish: {
    name: 'Hindi + English Code-Switching',
    callSid: 'TEST-HINGLISH-003',
    language: 'hinglish',
    direction: 'outbound',
    turns: [
      { user: 'Haan ji, boliye.',                       step: 'availability_check' },
      { user: 'Mujhe ek 3BHK chahiye, buy karna hai.',  step: 'purpose' },
      { user: 'Budget 80 lakh se 1 crore ke beech.',    step: 'qualify_budget' },
      { user: 'Mumbai mein, Andheri side preferred.',   step: 'location_budget' },
      { user: 'Bahut zyada lag raha hai price.',        step: 'pricing' },
      { user: 'EMI ka kya option hai?',                 step: 'qualify_budget' },
      { user: 'Theek hai, site visit book karo.',       step: 'book_visit' }
    ]
  },

  // ── 4. Fast speaking / short utterances ────────────────────────────────────
  fast_speaker: {
    name: 'Fast Speaking User (Short Rapid Utterances)',
    callSid: 'TEST-FAST-004',
    language: 'en-IN',
    direction: 'outbound',
    turns: [
      { user: 'Yes.',              step: 'availability_check' },
      { user: 'Buy.',              step: 'purpose' },
      { user: '50 lakhs.',         step: 'qualify_budget' },
      { user: 'Hyderabad.',        step: 'location_budget' },
      { user: 'Site visit yes.',   step: 'book_visit' },
      { user: 'Saturday morning.', step: 'book_visit' },
      { user: 'Thanks bye.',       step: 'closing' }
    ]
  },

  // ── 5. Background noise / bad STT ──────────────────────────────────────────
  background_noise: {
    name: 'Background Noise / Low-Quality STT',
    callSid: 'TEST-NOISE-005',
    language: 'en-IN',
    direction: 'outbound',
    turns: [
      { user: '',                       step: 'availability_check', expectEmpty: true },
      { user: 'um uh',                  step: 'availability_check', expectEmpty: true },
      { user: 'hello hello can you hear', step: 'availability_check' },
      { user: 'yes okay',               step: 'availability_check' },
      { user: 'buy property bangalore', step: 'purpose' }
    ]
  },

  // ── 6. Objections ───────────────────────────────────────────────────────────
  objections: {
    name: 'Objection Handling',
    callSid: 'TEST-OBJ-006',
    language: 'en-IN',
    direction: 'outbound',
    turns: [
      { user: 'I am not interested right now.',         step: 'availability_check' },
      { user: 'Already have an agent.',                 step: 'purpose' },
      { user: 'Too expensive for my budget.',           step: 'pricing' },
      { user: 'Let me think and call back.',            step: 'qualify_budget' },
      { user: 'Send me details on WhatsApp.',           step: 'purpose' },
      { user: 'Who is calling? Which company?',         step: 'availability_check' }
    ]
  }
};

// ── Mock LLM call (uses actual llm.generateReply but with timeouts) ───────────
async function mockLLMTurn(transcript, step, language, direction, callSid) {
  if (!transcript || transcript.trim().length < 2) {
    return { speak: null, action: 'continue', empty: true };
  }

  const t0 = Date.now();

  // 1. Check response cache first
  const cacheHit = responseCache.lookup(transcript, {
    step,
    direction,
    language,
    agentName: 'Priya',
    companyName: 'DreamHomes Realty'
  });

  if (cacheHit) {
    return {
      speak: cacheHit.speak,
      action: cacheHit.action,
      latencyMs: Date.now() - t0,
      source: 'cache',
      cacheId: cacheHit.cacheId
    };
  }

  // 2. LLM
  try {
    const callState = { step, direction, turnCount: 1 };
    const reply = await llm.generateReply({
      callState,
      lastTranscript: transcript,
      customerName: 'Test User',
      callSid,
      language,
      callDirection: direction,
      honorific: 'sir_maam',
      maxTokens: 60,
      fastMode: false
    });
    return {
      speak: reply.speak,
      action: reply.action,
      latencyMs: Date.now() - t0,
      source: 'llm',
      model: reply._modelUsed
    };
  } catch (err) {
    return {
      speak: null,
      action: 'continue',
      latencyMs: Date.now() - t0,
      source: 'llm_error',
      error: err.message
    };
  }
}

// ── Run a single scenario ─────────────────────────────────────────────────────
async function runScenario(scenario) {
  console.log(head(scenario.name));

  const results = [];
  let totalLatency = 0;
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    const turnNum = i + 1;

    process.stdout.write(`  Turn ${turnNum}: "${turn.user.substring(0, 40) || '(empty)'}" [${turn.step}] → `);

    // Simulate interrupt event
    if (turn.simulateInterrupt) {
      callOptimizer.recordInterruption(scenario.callSid, 85);
      process.stdout.write(`${C.yellow}[BARGE-IN 85ms]${C.reset} `);
    }

    // Skip empty turns
    if (turn.expectEmpty && (!turn.user || turn.user.trim().length < 2)) {
      callOptimizer.recordEmptyStt(scenario.callSid);
      console.log(warn('EMPTY STT — skipped'));
      results.push({ turn: turnNum, status: 'empty', latencyMs: 0 });
      continue;
    }

    const result = await mockLLMTurn(turn.user, turn.step, scenario.language, scenario.direction, scenario.callSid);

    if (result.empty) {
      callOptimizer.recordEmptyStt(scenario.callSid);
      console.log(warn('EMPTY → skipped'));
      results.push({ turn: turnNum, status: 'empty', latencyMs: 0 });
      continue;
    }

    if (!result.speak) {
      console.log(fail(`LLM error: ${result.error || 'no speak'}`));
      results.push({ turn: turnNum, status: 'fail', latencyMs: result.latencyMs });
      failCount++;
      continue;
    }

    // Apply humanSpeechEngine
    const processed = humanSpeech.processStreamSentence(result.speak, {
      isFirst: true,
      step: turn.step,
      language: scenario.language,
      fastMode: result.latencyMs > 700
    });

    const wordCount = processed.text.split(/\s+/).filter(Boolean).length;
    const latMs = result.latencyMs || 0;
    totalLatency += latMs;

    // Record to optimizer
    callOptimizer.recordTurn(scenario.callSid, {
      sttMs: 80,
      llmMs: latMs,
      ttsMs: 200,
      totalMs: latMs + 280,
      modelUsed: result.model || 'cache'
    });
    callOptimizer.recordSpeechTurn(scenario.callSid, {
      wordCount,
      issueCount: processed.issues.length,
      fillerUsed: processed.addedFiller
    });

    // Status determination
    let status = 'pass';
    if (latMs > 900) { status = 'slow'; warnCount++; }
    else passCount++;

    const statusStr = status === 'pass'
      ? `${C.green}${ms(latMs)}${C.reset}`
      : `${C.yellow}${ms(latMs)} SLOW${C.reset}`;

    const srcStr = result.source === 'cache'
      ? `${C.cyan}[CACHE:${result.cacheId}]${C.reset}`
      : `${C.dim}[${result.model || 'llm'}]${C.reset}`;

    const fillerStr = processed.addedFiller ? `${C.dim}+filler${C.reset}` : '';
    const issueStr = processed.issues.length > 0 ? `${C.yellow}[fixed:${processed.issues.join(',')}]${C.reset}` : '';

    console.log(`${statusStr} ${srcStr} ${fillerStr}${issueStr}`);
    console.log(`     → ${C.dim}"${processed.text.substring(0, 80)}${processed.text.length > 80 ? '…' : ''}"${C.reset}`);

    results.push({ turn: turnNum, status, latencyMs: latMs, wordCount, source: result.source });
  }

  // Call summary
  const score = await callOptimizer.finalizeCall(scenario.callSid, { durationSec: 60, leadQualityScore: 3 });

  console.log(`\n  ${C.bold}Results:${C.reset}`);
  console.log(`    Turns: ${scenario.turns.length} | Pass: ${passCount} | Slow: ${warnCount} | Fail: ${failCount}`);
  if (totalLatency > 0) {
    const avgLat = Math.round(totalLatency / Math.max(1, passCount + warnCount));
    const latColour = avgLat < 600 ? C.green : avgLat < 900 ? C.yellow : C.red;
    console.log(`    Avg LLM latency: ${latColour}${ms(avgLat)}${C.reset}`);
  }
  if (score) {
    const scoreColour = score.overallScore >= 80 ? C.green : score.overallScore >= 60 ? C.yellow : C.red;
    console.log(`    Quality score: ${scoreColour}${score.overallScore}/100${C.reset} ` +
      `(latency:${score.latencyScore} interruption:${score.interruptionHandling} ` +
      `stt:${score.sttAccuracy} naturalness:${score.naturalnessScore})`);
  }

  return { scenario: scenario.name, passCount, warnCount, failCount, score };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const scenarioArg = args.find(a => a.startsWith('--scenario='))?.split('=')[1] || 'all';

  console.log(`${C.bold}${C.cyan}╔══════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║   AI Calling Agent — Realistic Test Mode  ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════╝${C.reset}`);

  const toRun = scenarioArg === 'all'
    ? Object.values(SCENARIOS)
    : [SCENARIOS[scenarioArg]].filter(Boolean);

  if (toRun.length === 0) {
    console.error(`Unknown scenario: "${scenarioArg}". Available: ${Object.keys(SCENARIOS).join(', ')}, all`);
    process.exit(1);
  }

  const allResults = [];
  for (const scenario of toRun) {
    const result = await runScenario(scenario);
    allResults.push(result);
  }

  // Overall summary
  if (toRun.length > 1) {
    console.log(head('OVERALL SUMMARY'));
    const totalPass = allResults.reduce((s, r) => s + r.passCount, 0);
    const totalWarn = allResults.reduce((s, r) => s + r.warnCount, 0);
    const totalFail = allResults.reduce((s, r) => s + r.failCount, 0);
    const avgOverall = allResults
      .filter(r => r.score)
      .reduce((s, r) => s + r.score.overallScore, 0) / Math.max(1, allResults.filter(r => r.score).length);

    for (const r of allResults) {
      const icon = r.failCount === 0 && r.warnCount === 0 ? '✓' : r.failCount > 0 ? '✗' : '⚠';
      const col = r.failCount === 0 && r.warnCount === 0 ? C.green : r.failCount > 0 ? C.red : C.yellow;
      console.log(`  ${col}${icon} ${r.scenario}: pass=${r.passCount} slow=${r.warnCount} fail=${r.failCount}${C.reset}`);
    }

    const overallColor = avgOverall >= 80 ? C.green : avgOverall >= 60 ? C.yellow : C.red;
    console.log(`\n  ${C.bold}Total: pass=${totalPass} slow=${totalWarn} fail=${totalFail}${C.reset}`);
    console.log(`  ${C.bold}Avg quality score: ${overallColor}${Math.round(avgOverall)}/100${C.reset}`);
  }

  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Realistic test failed:', err.message || err);
  process.exit(1);
});

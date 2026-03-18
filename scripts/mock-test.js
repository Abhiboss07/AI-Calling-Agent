#!/usr/bin/env node
/**
 * Mock Conversation Test
 * ─────────────────────
 * Simulates a real estate sales conversation without telephony.
 * Tests the full STT → LLM → TTS pipeline using text input.
 *
 * Usage:
 *   node scripts/mock-test.js
 *   node scripts/mock-test.js --lang hi-IN
 *   node scripts/mock-test.js --scenario objection
 *
 * Scenarios: default | objection | booking | hindi | tricky
 */

require('dotenv').config();

const llm    = require('../src/services/llm');
const tts    = require('../src/services/tts');
const { ConversationFSM, States } = require('../src/services/conversationFSM');
const config = require('../src/config');
const logger = require('../src/utils/logger');

const args = process.argv.slice(2);
const LANG      = args.find(a => a.startsWith('--lang='))?.split('=')[1]  || 'en-IN';
const SCENARIO  = args.find(a => a.startsWith('--scenario='))?.split('=')[1] || 'default';
const VERBOSE   = args.includes('--verbose');

// ── Conversation Scenarios ────────────────────────────────────────────────────
const SCENARIOS = {
  default: [
    { speaker: 'user', text: 'Hello, yes I can talk' },
    { speaker: 'user', text: 'I want to buy a 2BHK flat' },
    { speaker: 'user', text: 'My budget is around 50 lakhs' },
    { speaker: 'user', text: 'I am looking in Pune, Hinjewadi area' },
    { speaker: 'user', text: 'Yes, I would like to book a site visit' },
    { speaker: 'user', text: 'Saturday morning works for me' }
  ],
  objection: [
    { speaker: 'user', text: 'Yes I can talk' },
    { speaker: 'user', text: 'Looking to buy a property' },
    { speaker: 'user', text: 'What are the prices?' },
    { speaker: 'user', text: 'That is too expensive, I cannot afford it' },
    { speaker: 'user', text: 'I need to think about it, compare other options' },
    { speaker: 'user', text: 'Okay, maybe I can visit once, no obligation right?' }
  ],
  booking: [
    { speaker: 'user', text: 'Yes, this is a good time' },
    { speaker: 'user', text: 'I want to invest in real estate' },
    { speaker: 'user', text: 'Looking for long term appreciation, maybe 3-5 years' },
    { speaker: 'user', text: 'Budget is 1 crore, looking in Bangalore' },
    { speaker: 'user', text: 'Book a site visit for me please' },
    { speaker: 'user', text: 'Next Sunday at 11 AM' }
  ],
  hindi: [
    { speaker: 'user', text: 'हाँ, ठीक है बात कर सकते हैं' },
    { speaker: 'user', text: '2 BHK फ्लैट खरीदना है' },
    { speaker: 'user', text: 'बजट 60 लाख है' },
    { speaker: 'user', text: 'दिल्ली में देख रहे हैं, द्वारका के पास' },
    { speaker: 'user', text: 'हाँ, साइट विज़िट करना है' },
    { speaker: 'user', text: 'रविवार को सुबह ठीक रहेगा' }
  ],
  tricky: [
    { speaker: 'user', text: 'Who is this? Why are you calling me?' },
    { speaker: 'user', text: 'I already have a house, not interested' },
    { speaker: 'user', text: 'Can you send me details on WhatsApp instead?' },
    { speaker: 'user', text: 'How much commission do you charge?' },
    { speaker: 'user', text: 'Is this a scam? I have heard of fake builders' },
    { speaker: 'user', text: 'Okay fine, tell me more about the project' }
  ]
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function separator(char = '─', len = 60) { return char.repeat(len); }

function log(tag, msg, extra = '') {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${tag.padEnd(12)} ${msg}${extra ? '  ' + extra : ''}`);
}

async function runConversation(scenario, language) {
  const turns = SCENARIOS[scenario];
  if (!turns) {
    console.error(`Unknown scenario: ${scenario}. Available: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  console.log('\n' + separator('═'));
  console.log(`  MOCK CONVERSATION TEST`);
  console.log(`  Scenario : ${scenario}`);
  console.log(`  Language : ${language}`);
  console.log(`  Agent    : ${config.agentName} (${config.companyName})`);
  console.log(separator('═') + '\n');

  // Create FSM for state tracking
  const fsm = new ConversationFSM('mock-test', 'outbound', language, {
    companyName: config.companyName,
    agentName: config.agentName
  });
  fsm.transition('call_answered');

  let turnCount = 0;
  let passedTurns = 0;
  let errors = [];

  // ── Opening Greeting ────────────────────────────────────────
  log('AGENT', fsm.getIntroText());
  log('STATE', `${fsm.getState()} → ${fsm._mapStateToStep()}`);
  console.log(separator());

  for (const turn of turns) {
    turnCount++;
    console.log(`\n  Turn ${turnCount}`);
    log('USER', `"${turn.text}"`);

    const fsmResult = fsm.processTranscript(turn.text);
    log('FSM', `Intent: ${fsmResult.data?.intent || fsmResult.intent || 'n/a'} → State: ${fsm.getState()}`);

    const callState = fsm.getLLMContext();
    const t0 = Date.now();

    try {
      // LLM call
      const reply = await llm.generateReply({
        callState,
        lastTranscript: turn.text,
        customerName: 'Test Customer',
        callSid: 'mock-test',
        language,
        callDirection: 'outbound',
        honorific: 'sir_maam'
      });

      const llmMs = Date.now() - t0;
      log('LLM', `"${reply.speak}"`, `(${llmMs}ms, action=${reply.action}, step=${reply.nextStep})`);

      // TTS call
      const ttsT0 = Date.now();
      const audio = await tts.synthesizeRaw(reply.speak, 'mock-test', language);
      const ttsMs = Date.now() - ttsT0;

      if (audio?.mulawBuffer?.length > 0) {
        log('TTS', `${audio.mulawBuffer.length} bytes μ-law`, `(${ttsMs}ms)`);
        passedTurns++;
      } else {
        log('TTS', '⚠ Empty audio buffer');
        errors.push(`Turn ${turnCount}: TTS returned empty`);
      }

      log('TOTAL', `${Date.now() - t0}ms end-to-end`);

      // FSM state after agent reply
      if (reply.action === 'hangup') {
        log('STATE', `Hangup signal → END_CALL`);
        break;
      }

      if (VERBOSE && reply.reasoning) {
        log('REASON', reply.reasoning);
      }
    } catch (err) {
      const errMsg = `Turn ${turnCount}: ${err.message}`;
      log('ERROR', `❌ ${errMsg}`);
      errors.push(errMsg);
    }

    log('STATE', `${fsm.getState()} (${fsm._mapStateToStep()})`);
    console.log(separator());
  }

  // ── Results Summary ──────────────────────────────────────────
  console.log('\n' + separator('═'));
  console.log(`  TEST RESULTS`);
  console.log(`  Turns passed : ${passedTurns}/${turnCount}`);
  console.log(`  FSM state    : ${fsm.getState()}`);
  console.log(`  Lead data    : ${JSON.stringify(fsm.leadData, null, 2).replace(/\n/g, '\n             ')}`);

  if (errors.length > 0) {
    console.log(`\n  ERRORS (${errors.length}):`);
    errors.forEach(e => console.log(`    ✗ ${e}`));
    console.log(separator('═') + '\n');
    process.exit(1);
  } else {
    console.log(`\n  ✓ All turns passed`);
    console.log(separator('═') + '\n');
  }
}

// ── API Key Checks ────────────────────────────────────────────────────────────
function checkEnv() {
  const required = {
    GEMINI_API_KEY: config.geminiApiKey,
    SARVAM_API_KEY: config.sarvamApiKey
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`\n❌ Missing env vars: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your API keys.\n');
    process.exit(1);
  }
  log('CONFIG', `Provider: Gemini (LLM) + Sarvam (TTS) + Deepgram (STT)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  checkEnv();
  try {
    await runConversation(SCENARIO, LANG);
  } catch (err) {
    console.error('Fatal error:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
})();

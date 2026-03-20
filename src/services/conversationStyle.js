/**
 * Conversation Style Engine
 *
 * Per-call intelligence layer that makes the AI feel human:
 *   1. Speaker profiling — detects fast/slow speaking pattern
 *   2. Response variation — cycles through 3-5 variants per intent to avoid repetition
 *   3. Interruption recovery — natural "go ahead" phrases, varied per call
 *   4. Contextual acknowledgements — personalised with lead data (budget, location, intent)
 *   5. Micro humanisation — occasional "…" pauses / filler markers for natural rhythm
 *
 * All operations are O(1) / in-memory — zero latency impact on the pipeline.
 */

'use strict';

const logger = require('../utils/logger');

// ── Per-call state ────────────────────────────────────────────────────────────
const callStyles = new Map();

function getStyle(callSid) {
  if (!callStyles.has(callSid)) {
    callStyles.set(callSid, {
      wordCounts:        [],     // sliding window of last 5 utterance word counts
      turnCount:         0,
      isFastSpeaker:     false,
      variantCounters:   {},     // intentKey → cycling index
      interruptAckIdx:   -1,     // cycles through recovery phrases
      microFillerTurn:   0       // every N turns add a micro filler
    });
  }
  return callStyles.get(callSid);
}

// ── Speaker profiling ─────────────────────────────────────────────────────────
/**
 * Record an utterance's word count and update fast-speaker detection.
 * If avg word count over last 3+ turns < 3.5 → fast speaker mode.
 */
function recordUtterance(callSid, wordCount) {
  const s = getStyle(callSid);
  s.wordCounts.push(wordCount);
  if (s.wordCounts.length > 5) s.wordCounts.shift();
  s.turnCount++;

  if (s.wordCounts.length >= 3) {
    const avg = s.wordCounts.reduce((a, b) => a + b, 0) / s.wordCounts.length;
    const prev = s.isFastSpeaker;
    s.isFastSpeaker = avg < 3.5;
    if (s.isFastSpeaker !== prev) {
      logger.debug(`[STYLE] ${callSid?.slice(-6)}: speaker mode → ${s.isFastSpeaker ? 'FAST (<3.5w avg)' : 'NORMAL'}`);
    }
  }
}

function isFastSpeaker(callSid) {
  return callStyles.get(callSid)?.isFastSpeaker || false;
}

// ── Interruption recovery ─────────────────────────────────────────────────────
const INTERRUPT_RECOVERY = {
  'en-IN': [
    'My apologies, please go ahead.',
    'Understood, please continue.',
    'Sorry for the interruption — do go on.',
    'Of course, I\'m listening.',
    'Right, please proceed.'
  ],
  'hinglish': [
    'Sorry, please boliye.',
    'Haan, aap continue karein.',
    'Oh, sorry. Aap boliye please.',
    'Bilkul, main sun raha hoon. Boliye.',
    'Ji, aage boliye.'
  ],
  'hi-IN': [
    'क्षमा करें, आप बोलिए।',
    'जी, जारी रखिए।',
    'माफ़ कीजिए, मैं सुन रही हूँ।',
    'बिल्कुल, बोलिए।'
  ]
};

/**
 * Returns a varied interruption recovery phrase, cycling so it never repeats
 * consecutively.
 */
function getInterruptRecovery(callSid, language) {
  const s = getStyle(callSid);
  const lang = _lang(language);
  const phrases = INTERRUPT_RECOVERY[lang] || INTERRUPT_RECOVERY['en-IN'];
  s.interruptAckIdx = (s.interruptAckIdx + 1) % phrases.length;
  return phrases[s.interruptAckIdx];
}

// ── Response variations ───────────────────────────────────────────────────────
// 3-5 variants per key; cycling ensures no immediate repetition without randomness
const VARIANTS = {
  ack_yes: {
    'en-IN':    ['Excellent.', 'Perfect.', 'Wonderful.', 'That sounds great.', 'Fantastic.'],
    'hinglish': ['Bahut badhiya.', 'Perfect!', 'Shandaar!', 'Great hai.', 'Excellent.'],
    'hi-IN':    ['बहुत बढ़िया!', 'बेहतरीन!', 'शानदार!', 'उत्तम!']
  },
  ack_understood: {
    'en-IN':    ['Got it.', 'Understood.', 'I see, noted.', 'Right, I\'ve got that.', 'Makes sense.'],
    'hinglish': ['Samajh gaya.', 'Bilkul, noted.', 'Theek hai, clear hai.', 'Okay, got it.', 'Samajh gaya hoon.'],
    'hi-IN':    ['जी, समझ गया।', 'बिल्कुल।', 'ठीक है।', 'जी, स्पष्ट है।']
  },
  ack_interesting: {
    'en-IN':    ['That\'s interesting.', 'I see your point.', 'That makes sense.', 'I understand where you\'re coming from.', 'Fair enough.'],
    'hinglish': ['Hmm, interesting choice.', 'Makes sense.', 'Achha, I see.', 'Fair point.', 'Samajh sakta hoon.'],
    'hi-IN':    ['हाँ, दिलचस्प बात है।', 'आपकी बात सही है।', 'जी, समझ में आ रहा है।', 'अच्छा।']
  },
  ack_thinking: {
    'en-IN':    ['Let me quickly check…', 'Just a moment while I look into that…', 'Sure, let me verify…', 'One second, let me check our records…', 'Hmm, interesting, let me see…'],
    'hinglish': ['Ek minute, main check karta hoon…', 'Sure, let me see…', 'Hmm, dekhna padega…', 'Ruko zara, check karta hoon…', 'Ek second…'],
    'hi-IN':    ['एक क्षण, मैं देखता हूँ…', 'मैं अभी चेक करता हूँ…', 'ज़रा सोचिए…', 'जी, एक सेकंड…']
  },
  ack_empathy: {
    'en-IN':    ['I completely understand.', 'That makes total sense.', 'I hear you, and I agree.', 'Absolutely fair point.'],
    'hinglish': ['Bilkul samajh sakta hoon.', 'Sahi baat hai.', 'Main aapki baat se sehmat hoon.', 'Ji, bilkul fair point hai.'],
    'hi-IN':    ['मैं पूरी तरह से समझ सकता हूँ।', 'आपकी बात बिल्कुल सही है।', 'जी, मैं समझ रहा हूँ।']
  },
  hinglish_transition: {
    'hinglish': ['Toh', 'Aur batayein', 'Theek hai toh', 'Achha, toh phir', 'Sahi hai'],
    'en-IN':    ['So', 'Also', 'Moreover', 'Now'],
    'hi-IN':    ['तो', 'इसके अलावा', 'अच्छा', 'अब']
  }
};

/**
 * Get a cycling variant for a given key — guaranteed not to repeat until all are used.
 */
function getVariant(callSid, variantKey, language) {
  const s = getStyle(callSid);
  const lang = _lang(language);
  const pool = VARIANTS[variantKey]?.[lang] || VARIANTS[variantKey]?.['en-IN'];
  if (!pool?.length) return '';
  if (!s.variantCounters[variantKey]) s.variantCounters[variantKey] = 0;
  const text = pool[s.variantCounters[variantKey] % pool.length];
  s.variantCounters[variantKey]++;
  return text;
}

// ── Contextual follow-up hint ─────────────────────────────────────────────────
/**
 * Build a hint string injected into the LLM system prompt so it references
 * the user's known context naturally (budget, location, intent, name).
 */
function buildContextHint(leadData, language) {
  if (!leadData) return '';
  const lang = _lang(language);
  const parts = [];

  if (leadData.budget)       parts.push(`budget: ${leadData.budget}`);
  if (leadData.location)     parts.push(`preferred area: ${leadData.location}`);
  if (leadData.intent)       parts.push(`looking to ${leadData.intent}`);
  if (leadData.propertyType) parts.push(`property type: ${leadData.propertyType}`);
  if (leadData.name)         parts.push(`customer name: ${leadData.name}`);

  if (!parts.length) return '';

  const examples = {
    'en-IN':    `e.g. "For your budget of ${leadData.budget || 'X'} in ${leadData.location || 'that area'}…"`,
    'hinglish': `e.g. "Aapke ${leadData.budget || 'X'} budget mein ${leadData.location || 'us area'} mein…"`,
    'hi-IN':    `e.g. "आपके ${leadData.budget || 'X'} बजट में ${leadData.location || 'उस क्षेत्र'} में…"`
  };

  return `\n[CONTEXT: ${parts.join('; ')}. Weave this context naturally into your response — ${examples[lang] || examples['en-IN']}]`;
}

// ── Micro humanisation ────────────────────────────────────────────────────────
/**
 * Occasionally insert natural pause markers (…) or thinking sounds into text.
 * Only fires every 3 turns, never in fast mode, and only at natural punctuation.
 */
function microHumanize(text, callSid, language) {
  const s = getStyle(callSid);
  if (s.isFastSpeaker) return text;          // fast speaker → no micro fillers
  if (s.turnCount % 3 !== 0) return text;   // only every 3rd turn

  const lang = _lang(language);
  // Inject "…" after the first comma in a long sentence for a thinking pause
  const commaIdx = text.indexOf(',');
  if (commaIdx > 8 && commaIdx < text.length - 10 && text.length > 30) {
    return text.slice(0, commaIdx) + '…' + text.slice(commaIdx);
  }
  return text;
}

// ── Speaker-style system prompt injection ─────────────────────────────────────
/**
 * Returns additional system prompt lines based on detected speaker style.
 * Used in llm.js to adapt the LLM's response style.
 */
function getSpeakerStylePrompt(callSid, language) {
  const s = getStyle(callSid);
  const lang = _lang(language);

  if (s.isFastSpeaker) {
    const lines = {
      'en-IN':    'FAST SPEAKER DETECTED: User speaks in very short phrases. Respond in ≤6 words. No filler. No questions. Direct only.',
      'hinglish': 'FAST SPEAKER: User zyada short mein bolta hai. ≤6 words mein reply karo. Direct raho.',
      'hi-IN':    'FAST SPEAKER: उपयोगकर्ता संक्षिप्त बोलता है। ≤6 शब्दों में जवाब दें।'
    };
    return lines[lang] || lines['en-IN'];
  }

  // Hinglish consistency hint
  if (lang === 'hinglish') {
    return 'TONE: Maintain consistent informal Hinglish throughout. Mix Hindi and English naturally like a real person. Avoid switching to formal English mid-sentence. E.g., "Aapka budget kya hai? Hum best options dikhayenge." NOT "What is your esteemed budget requirement?"';
  }

  return '';
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
function cleanup(callSid) {
  callStyles.delete(callSid);
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function _lang(language) {
  if (!language) return 'en-IN';
  if (language === 'hi-IN') return 'hi-IN';
  if (language === 'hinglish' || (language.startsWith('hi') && language !== 'hi-IN')) return 'hinglish';
  return 'en-IN';
}

module.exports = {
  recordUtterance,
  isFastSpeaker,
  getInterruptRecovery,
  getVariant,
  buildContextHint,
  getSpeakerStylePrompt,
  microHumanize,
  cleanup
};

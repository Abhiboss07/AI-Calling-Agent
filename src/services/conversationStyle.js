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
    'Okay, go ahead.',
    'Sure, please continue.',
    'Sorry about that — please go on.',
    "Of course, I'm listening.",
    'Right, please continue.'
  ],
  'hinglish': [
    'Okay, boliye.',
    'Haan, please continue.',
    'Sorry, aap boliye.',
    'Zaroor, main sun raha hoon.',
    'Bilkul, bolte rahiye.'
  ],
  'hi-IN': [
    'हाँ, बोलिए।',
    'ज़रूर, जारी रखिए।',
    'माफ़ कीजिए, आप बोलिए।',
    'बिल्कुल, सुन रहा हूँ।'
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
    'en-IN':    ['Great!', 'Perfect.', 'Wonderful!', 'Excellent.', 'Fantastic!'],
    'hinglish': ['Bahut acha!', 'Perfect!', 'Shandaar!', 'Behtareen!', 'Excellent!'],
    'hi-IN':    ['बहुत अच्छा!', 'बढ़िया!', 'शानदार!', 'उत्तम!']
  },
  ack_understood: {
    'en-IN':    ['Got it.', 'Understood.', 'Okay, noted.', 'Right, noted.', 'Alright.'],
    'hinglish': ['Samajh gaya.', 'Bilkul, noted.', 'Theek hai.', 'Okay, clear hai.', 'Samjha.'],
    'hi-IN':    ['समझ गया।', 'बिल्कुल।', 'ठीक है।', 'जी, समझा।']
  },
  ack_interesting: {
    'en-IN':    ["Hmm, that's interesting.", 'Makes sense.', "That's good to know.", 'I see.', 'Fair enough.'],
    'hinglish': ['Hmm, interesting.', 'Makes sense.', 'Achha, theek hai.', 'Fair point.', 'Samjha.'],
    'hi-IN':    ['हाँ, समझा।', 'बात सही है।', 'ठीक है।', 'अच्छा।']
  },
  ack_thinking: {
    'en-IN':    ['Let me check…', 'Just a moment…', 'Sure, let me see…', 'One second…', 'Hmm, let me think…'],
    'hinglish': ['Dekhte hain…', 'Ek second…', 'Sure, check karta hoon…', 'Hmm…', 'Ruko zara…'],
    'hi-IN':    ['देखते हैं…', 'एक सेकंड…', 'सोच रहा हूँ…', 'हाँ…']
  },
  ack_empathy: {
    'en-IN':    ['I completely understand.', 'That makes total sense.', 'I hear you.', 'Totally fair.'],
    'hinglish': ['Bilkul samajh sakta hoon.', 'Main samajhta hoon.', 'Theek hai, fair point.'],
    'hi-IN':    ['मैं समझ सकता हूँ।', 'बिल्कुल ठीक है।', 'जी, समझा।']
  },
  // Hinglish-specific — used when mixing languages
  hinglish_transition: {
    'hinglish': ['Toh', 'Aur batao', 'Theek hai toh', 'Achha', 'Acha toh'],
    'en-IN':    ['So', 'Also', 'And', 'Now'],
    'hi-IN':    ['तो', 'और', 'अच्छा', 'अब']
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

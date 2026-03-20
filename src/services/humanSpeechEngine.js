/**
 * Human Speech Engine
 *
 * Makes AI responses sound like a natural human sales agent:
 *   - Injects contextual filler phrases (okay…, hmm…, let me check…)
 *   - Enforces short sentences (≤12 words per sentence in normal mode, ≤8 in fast mode)
 *   - Detects and repairs robotic/formal language patterns
 *   - Quality gate: too long → trim, robotic → rephrase
 *   - Tracks naturalness issues across a call for scoring
 *
 * Usage in streaming pipeline:
 *   const out = humanSpeech.processStreamSentence(text, { isFirst, step, language, fastMode });
 *   → out.text   (cleaned/naturalized sentence)
 *   → out.issues (array of issue strings, empty if clean)
 */

const logger = require('../utils/logger');

// ── Filler Phrase Bank ────────────────────────────────────────────────────────
// Categorised by call step context; deterministic pick based on step hash
// so the same step always produces the same filler (avoids randomness surprises).
const FILLERS = {
  'en-IN': {
    thinking:   ['Okay…', 'Hmm…', 'Let me check…', 'Sure…', 'Right…'],
    confirming: ['Got it.', 'Understood.', 'Okay, noted.', 'Perfect.'],
    pricing:    ['Let me check the pricing…', 'Sure, about pricing…'],
    location:   ['Sure…', 'Regarding location…'],
    objection:  ['I understand…', 'That is fair…', 'Sure, I hear you…'],
    booking:    ['Great!', 'Wonderful!', 'Excellent!'],
    default:    ['Okay…', 'Sure…', 'Right…', 'Hmm…']
  },
  'hinglish': {
    thinking:   ['Okay…', 'Hmm…', 'Dekhte hain…', 'Sure…', 'Theek hai…'],
    confirming: ['Samjha.', 'Bilkul.', 'Okay, noted.', 'Perfect.'],
    pricing:    ['Pricing check karta hoon…', 'Sure, rates ke baare mein…'],
    location:   ['Sure…', 'Location ke baare mein…'],
    objection:  ['Samajh sakta hoon…', 'Fair point hai…'],
    booking:    ['Bahut acha!', 'Wonderful!'],
    default:    ['Okay…', 'Sure…', 'Theek hai…', 'Hmm…']
  },
  'hi-IN': {
    thinking:   ['ठीक है…', 'हाँ…', 'देखते हैं…', 'समझा…'],
    confirming: ['समझ गया।', 'बिल्कुल।', 'ठीक है।', 'बहुत अच्छा।'],
    pricing:    ['कीमत देखते हैं…', 'दाम के बारे में…'],
    location:   ['ज़रूर…', 'स्थान के बारे में…'],
    objection:  ['समझ सकता हूँ…', 'बात सही है…'],
    booking:    ['बहुत अच्छा!', 'शानदार!'],
    default:    ['ठीक है…', 'हाँ…', 'समझा…']
  }
};

// ── Robotic Pattern Detection ─────────────────────────────────────────────────
const ROBOTIC_PATTERNS = [
  /\b(I am an AI|as an AI|as your AI assistant|I cannot|I apologize for|I understand that you)\b/i,
  /\b(As requested|Certainly,|Of course,|Please be informed|Please note that)\b/i,
  /\b(I would like to inform|Allow me to|Kindly note|I am here to assist)\b/i,
  /\b(How may I assist you|Is there anything else I can help|Thank you for reaching out)\b/i,
  /\b(I hope this (message|email|call) finds you|I wanted to follow up)\b/i
];

// ── Rephrase Map: robotic phrase → natural replacement ────────────────────────
const REPHRASE_MAP = [
  ['Certainly,',                       'Sure,'],
  ['Of course,',                       'Okay,'],
  ['I would like to inform you',       'So'],
  ['Please be informed that',          ''],
  ['Please note that',                 ''],
  ['Allow me to',                      'Let me'],
  ['Kindly',                           'Please'],
  ['I understand that you',            'I see,'],
  ['As requested',                     'Sure'],
  ['I am here to assist',              'I can help'],
  ['How may I assist you today',       'How can I help you'],
  ['Is there anything else I can help','Can I help with anything else'],
  ['Thank you for reaching out',       'Thanks for calling']
];

// ── Language normaliser ───────────────────────────────────────────────────────
function _lang(language) {
  if (!language) return 'en-IN';
  if (language === 'hi-IN') return 'hi-IN';
  if (language === 'hinglish' || language.startsWith('hi')) return 'hinglish';
  return 'en-IN';
}

// ── Step → filler category mapping ───────────────────────────────────────────
function _stepCategory(step) {
  if (['pricing', 'budget'].includes(step))                             return 'pricing';
  if (['qualify_budget', 'qualify_timeline'].includes(step))            return 'thinking';
  if (['location', 'location_budget'].includes(step))                   return 'location';
  if (['purpose', 'property_type', 'investment_timeline'].includes(step)) return 'thinking';
  if (['book_visit', 'closing'].includes(step))                         return 'booking';
  if (['handle_objection', 'HANDLING_OBJECTION'].includes(step))        return 'objection';
  if (['availability_check', 'reschedule_time'].includes(step))         return 'confirming';
  return 'default';
}

// Get a deterministic filler for a given step (no randomness)
function getFiller(step, language) {
  const lang = _lang(language);
  const fillers = FILLERS[lang] || FILLERS['en-IN'];
  const category = _stepCategory(step);
  const pool = fillers[category] || fillers.default;
  // Deterministic index from step string
  const idx = step ? (step.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % pool.length) : 0;
  return pool[idx];
}

// ── Robotic detection ─────────────────────────────────────────────────────────
function isRobotic(text) {
  return ROBOTIC_PATTERNS.some(p => p.test(String(text || '')));
}

// ── Rephrase robotic phrases ──────────────────────────────────────────────────
function rephrase(text) {
  let result = String(text || '');
  for (const [from, to] of REPHRASE_MAP) {
    result = result.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), to);
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

// ── Sentence word-cap ─────────────────────────────────────────────────────────
function capSentenceWords(sentence, maxWords) {
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return sentence;
  const partial = words.slice(0, maxWords).join(' ');
  // Try to cut at last punctuation within limit
  const lastPunct = Math.max(partial.lastIndexOf('.'), partial.lastIndexOf('?'), partial.lastIndexOf('!'));
  return lastPunct > 5 ? partial.slice(0, lastPunct + 1) : partial + '.';
}

// ── Quality gate ──────────────────────────────────────────────────────────────
/**
 * Check and fix a single LLM sentence.
 * @returns {{ text: string, issues: string[] }}
 */
function qualityCheck(text, { fastMode = false } = {}) {
  const issues = [];
  let result = String(text || '').trim();

  if (!result) return { text: result, issues: ['empty'] };

  const wordCount = result.split(/\s+/).filter(Boolean).length;
  const maxWords = fastMode ? 25 : 35;

  if (wordCount > maxWords) {
    issues.push(`too_long:${wordCount}`);
    result = capSentenceWords(result, maxWords);
  }

  if (isRobotic(result)) {
    issues.push('robotic');
    result = rephrase(result);
  }

  if (issues.length > 0) {
    logger.debug('[SPEECH] Quality issues fixed', { issues });
  }

  return { text: result, issues };
}

// ── Main entry: process one streaming sentence ────────────────────────────────
/**
 * Naturalize a single streamed sentence.
 * - First sentence of a turn: inject filler prefix (unless fastMode / already has one)
 * - All sentences: quality check (trim + de-robot)
 *
 * @param {string} text     Raw sentence from LLM
 * @param {object} ctx      { isFirst, step, language, fastMode }
 * @returns {{ text: string, issues: string[], addedFiller: boolean }}
 */
function processStreamSentence(text, { isFirst = false, step = '', language = 'en-IN', fastMode = false } = {}) {
  const qc = qualityCheck(text, { fastMode });
  let result = qc.text;
  let addedFiller = false;

  if (isFirst && !fastMode && step && result.length > 0) {
    const EXISTING_FILLER = /^(okay|sure|hmm|right|got it|understood|great|perfect|excellent|wonderful|theek|bilkul|samjha|haan|ठीक|हाँ|बिल्कुल|i completely|i understand|absolutely|no problem|thank you for)/i;
    if (!EXISTING_FILLER.test(result)) {
      const filler = getFiller(step, language);
      result = `${filler} ${result}`;
      addedFiller = true;
    }
  }

  return { text: result, issues: qc.issues, addedFiller };
}

// ── Naturalness score (0–100) ─────────────────────────────────────────────────
/**
 * Compute a naturalness score for a call based on turn-level data.
 * @param {{ issues: string[], wordCounts: number[], fillersUsed: number }} stats
 */
function computeNaturalnessScore({ issues = [], wordCounts = [], fillersUsed = 0 } = {}) {
  const totalTurns = Math.max(1, wordCounts.length);

  // Penalty per quality issue
  const issuePenalty = Math.min(50, (issues.length / totalTurns) * 25);

  // Avg sentence length — target 8-14 words for natural phone speech
  const avgWords = wordCounts.length ? wordCounts.reduce((s, v) => s + v, 0) / wordCounts.length : 10;
  const lengthScore = avgWords >= 5 && avgWords <= 14
    ? 100
    : Math.max(0, 100 - Math.abs(avgWords - 10) * 8);

  // Filler usage: 30–70% of turns with filler is natural
  const fillerRatio = fillersUsed / totalTurns;
  const fillerScore = fillerRatio >= 0.2 && fillerRatio <= 0.7 ? 100 : Math.max(0, 100 - Math.abs(fillerRatio - 0.4) * 150);

  const score = Math.round((lengthScore * 0.5 + fillerScore * 0.2 + (100 - issuePenalty) * 0.3));
  return Math.max(0, Math.min(100, score));
}

module.exports = {
  processStreamSentence,
  qualityCheck,
  computeNaturalnessScore,
  getFiller,
  isRobotic,
  rephrase
};

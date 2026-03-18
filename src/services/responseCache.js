/**
 * Response Cache — pattern-based fast path that bypasses LLM entirely.
 *
 * For common user inputs (yes/no/busy/pricing/not-interested), returns a
 * pre-defined response without making an LLM API call (0ms LLM latency).
 *
 * TTS for all cached responses is pre-warmed at startup so the full
 * STT→CACHE→TTS pipeline can complete in <200ms.
 *
 * Usage:
 *   const hit = responseCache.lookup(transcript, { step, language, direction, agentName, companyName });
 *   if (hit) { // skip LLM, use hit.speak + hit.action }
 */

const logger = require('../utils/logger');

// ── Pattern definitions ───────────────────────────────────────────────────────
// Each entry: { regex, steps?, direction?, speak: string|fn, action, nextStep }
//   steps: array of FSM steps where this pattern applies (omit = any step)
//   direction: 'outbound'|'inbound'|undefined (any)

const PATTERNS = [
  // ── Hard refusals → hangup immediately ──────────────────────────────────
  {
    id: 'not_interested',
    regex: /\b(not interested|no thanks|don't call|remove (me|my|number)|stop calling|unsubscribe)\b/i,
    speak: (ctx) => `I completely understand. I appreciate your time and won't disturb you again. Have a wonderful day!`,
    action: 'hangup',
    nextStep: 'close'
  },

  // ── Busy / reschedule ────────────────────────────────────────────────────
  {
    id: 'busy',
    regex: /\b(busy|in a meeting|not now|bad time|call (me )?(back|later)|later|abhi nahi|baad mein)\b/i,
    steps: ['availability_check'],
    speak: (ctx) => `No problem at all. What time would be convenient for me to call you back?`,
    action: 'collect',
    nextStep: 'reschedule_time'
  },

  // ── Short affirmations → move to purpose (outbound only) ────────────────
  {
    id: 'yes_outbound',
    regex: /^(yes|yeah|yep|sure|ok|okay|haan|haan ji|ji|theek hai|boliye|go ahead|fine|alright)[.!,\s]*$/i,
    steps: ['availability_check'],
    direction: 'outbound',
    speak: (ctx) => `Great, thank you for your time! I'm ${ctx.agentName} from ${ctx.companyName}. Are you looking to buy, rent, or invest in property?`,
    action: 'collect',
    nextStep: 'purpose'
  },

  // ── Pricing / cost queries ────────────────────────────────────────────────
  {
    id: 'pricing',
    regex: /\b(price|cost|rate|kitna|how much|budget|affordable|expensive|charge|fee)\b/i,
    speak: (ctx) => {
      if (ctx.budget) {
        return `For a budget around ${ctx.budget}, we have excellent options with great ROI. Shall I share specific projects that match?`;
      }
      return `We have options starting from 35 lakhs up to premium properties. What budget range are you considering?`;
    },
    action: 'collect',
    nextStep: 'qualify_budget'
  },

  // ── Location queries ─────────────────────────────────────────────────────
  {
    id: 'location',
    regex: /\b(where|location|area|city|kahan|which place|address|locality)\b/i,
    speak: (ctx) => {
      if (ctx.location) {
        return `Yes, we have great projects near ${ctx.location}. Would you like details on connectivity and amenities for that area?`;
      }
      return `We have projects across Mumbai, Pune, Bangalore, Hyderabad, and Delhi NCR. Which city are you interested in?`;
    },
    action: 'collect',
    nextStep: 'location_budget'
  },

  // ── Audio check / "can you hear me" ─────────────────────────────────────
  {
    id: 'audio_check',
    regex: /\b(can you hear|are you there|hello|testing|audio|sound|aawaz|sun pa rahe)\b/i,
    speak: () => `Yes, I can hear you clearly. Please go ahead.`,
    action: 'continue',
    nextStep: null
  },

  // ── "Who is this" / identity ─────────────────────────────────────────────
  {
    id: 'who_are_you',
    regex: /\b(who (are you|is (this|calling)|called)|kya aap|aap kaun|identity|introducing)\b/i,
    speak: (ctx) => `I'm ${ctx.agentName}, a property consultant from ${ctx.companyName}. I'm reaching out to share an exciting real estate opportunity that might interest you.`,
    action: 'continue',
    nextStep: null
  },

  // ── WhatsApp / send details ──────────────────────────────────────────────
  {
    id: 'whatsapp',
    regex: /\b(whatsapp|send (me |the )?(details|info|brochure)|message|text me|email)\b/i,
    speak: () => `Absolutely, I can share all the details. Could I also take just 2 minutes to explain the key highlights? It would help you decide if this suits your needs.`,
    action: 'continue',
    nextStep: null
  },

  // ── Site visit confirmation ──────────────────────────────────────────────
  {
    id: 'site_visit_yes',
    regex: /\b(yes.*(visit|come|see)|i('ll| will) (come|visit|be there)|book (a )?visit|site visit)\b/i,
    steps: ['book_visit', 'closing'],
    speak: () => `Excellent! I'll arrange a site visit for you. What date and time works best — weekday or weekend?`,
    action: 'collect',
    nextStep: 'book_visit'
  },

  // ── Goodbye / end call signals ────────────────────────────────────────────
  {
    id: 'goodbye',
    regex: /^(bye|goodbye|ok bye|thank you bye|take care|alvida|shukriya|dhanyavaad)[.!,\s]*$/i,
    speak: () => `Thank you for your time. Have a wonderful day. Goodbye!`,
    action: 'hangup',
    nextStep: 'close'
  },

  // ── Price objection — too expensive ──────────────────────────────────────
  {
    id: 'price_too_high',
    regex: /\b(too expensive|too costly|bahut zyada|zyada hai|out of (my )?budget|can't afford|not affordable)\b/i,
    speak: (ctx) => `I understand. We have flexible payment options and EMI plans starting from low down payments. What budget range would work for you?`,
    action: 'collect',
    nextStep: 'qualify_budget'
  },

  // ── EMI / loan / finance query ────────────────────────────────────────────
  {
    id: 'emi_query',
    regex: /\b(emi|loan|finance|home loan|bank loan|monthly installment|installment|kist)\b/i,
    speak: () => `Yes, we have tie-ups with major banks for easy home loans. EMI can start as low as 25,000 per month depending on the property. Shall I share the details?`,
    action: 'collect',
    nextStep: 'qualify_budget'
  },

  // ── Think about it / call me later ───────────────────────────────────────
  {
    id: 'think_about_it',
    regex: /\b(let me think|i('ll| will) think|think about it|maybe later|will decide|sochna hai|soch ke batata|baad mein batata)\b/i,
    speak: () => `Absolutely, no rush at all! I can also send you the brochure and pricing details on WhatsApp so you have everything in hand. Would that be helpful?`,
    action: 'collect',
    nextStep: 'close'
  },

  // ── Which project / tell me more ─────────────────────────────────────────
  {
    id: 'which_project',
    regex: /\b(which project|what project|tell me (more|about)|which property|kaunsa project|project kaun)\b/i,
    speak: (ctx) => `We have premium residential projects with excellent connectivity, world-class amenities, and strong appreciation potential. Would you like me to share specific details based on your location and budget?`,
    action: 'collect',
    nextStep: 'purpose'
  },

  // ── Callback time confirmation ────────────────────────────────────────────
  {
    id: 'callback_confirm',
    regex: /\b(call (me )?(at|after|around|on)|call (tomorrow|evening|morning|weekend)|(\d{1,2})\s*(am|pm|baje|o'?clock))\b/i,
    steps: ['reschedule_time'],
    speak: () => `Perfect, noted! I will call you back at that time. Thank you for your time. Have a great day!`,
    action: 'hangup',
    nextStep: 'close'
  },

  // ── Repeated hello / not hearing ─────────────────────────────────────────
  {
    id: 'hello_repeat',
    regex: /^(hello[?!.,\s]*){2,}$|^(hello|hallo|helo)\s*(hello|hallo|helo)[?!.,\s]*$/i,
    speak: () => `Yes, hello! I can hear you clearly. Please go ahead.`,
    action: 'continue',
    nextStep: null
  },

  // ── Ready to book / confirm visit ─────────────────────────────────────────
  {
    id: 'confirm_visit_date',
    regex: /\b((this )?(saturday|sunday|weekend|monday|tuesday|wednesday|thursday|friday)|tomorrow|next week|(morning|afternoon|evening) (visit|time))\b/i,
    steps: ['book_visit'],
    speak: () => `Wonderful! I have noted your preferred visit time. Our team will confirm the appointment and send you the address. See you then!`,
    action: 'collect',
    nextStep: 'closing'
  }
];

// ── Main lookup ───────────────────────────────────────────────────────────────
/**
 * Check if a user transcript matches a cached response pattern.
 * @param {string} transcript  User's speech text
 * @param {object} ctx         { step, direction, language, agentName, companyName }
 * @returns {{ speak, action, nextStep, cacheId } | null}
 */
function lookup(transcript, ctx = {}) {
  if (!transcript || transcript.trim().length < 2) return null;

  const text = transcript.trim();
  const { step = '', direction = 'outbound', agentName = 'Priya', companyName = 'our company',
    budget = null, location = null } = ctx;

  for (const pattern of PATTERNS) {
    // Check step filter
    if (pattern.steps && !pattern.steps.includes(step)) continue;
    // Check direction filter
    if (pattern.direction && pattern.direction !== direction) continue;
    // Check regex
    if (!pattern.regex.test(text)) continue;

    // Build the speak text
    const speak = typeof pattern.speak === 'function'
      ? pattern.speak({ agentName, companyName, step, language: ctx.language, budget, location })
      : pattern.speak;

    logger.debug(`[CACHE] Hit: ${pattern.id} → "${speak.substring(0, 60)}"`);

    return {
      speak,
      action: pattern.action,
      nextStep: pattern.nextStep,
      cacheId: pattern.id,
      reasoning: `response_cache_${pattern.id}`
    };
  }

  return null;
}

/**
 * Get all unique speak phrases for pre-warming TTS at startup.
 * Uses a neutral context to generate representative phrases.
 */
function getAllPhrases(ctx = {}) {
  const { agentName = 'Priya', companyName = 'our company' } = ctx;
  const seen = new Set();
  const phrases = [];

  for (const pattern of PATTERNS) {
    const speak = typeof pattern.speak === 'function'
      ? pattern.speak({ agentName, companyName, step: '', language: 'en-IN' })
      : pattern.speak;
    if (!seen.has(speak)) {
      seen.add(speak);
      phrases.push(speak);
    }
  }
  return phrases;
}

module.exports = { lookup, getAllPhrases, PATTERNS };

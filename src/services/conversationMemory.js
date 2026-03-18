/**
 * Conversation Memory Service
 *
 * Tracks extracted entities (budget, location, intent, propertyType, timeline, name)
 * per call so the LLM can:
 *   1. Skip questions already answered
 *   2. Reference known facts naturally ("For your 60L budget in Pune...")
 *   3. Generate smart contextual follow-ups
 *   4. Produce brief acknowledgements for newly provided info
 */

const logger = require('../utils/logger');

// ── In-memory store ────────────────────────────────────────────────────────
const _store = new Map();

// ── Entity extractors ──────────────────────────────────────────────────────

function extractBudget(text) {
  const t = String(text || '');
  const crore = t.match(/(\d+(?:\.\d+)?)\s*(?:crore|cr\.?)\b/i);
  if (crore) return `${crore[1]} crore`;
  const range = t.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*(?:lakh|lac|L)?\b/i);
  if (range) return `${range[1]}-${range[2]} lakh`;
  const lakh = t.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|L)\b/i);
  if (lakh) return `${lakh[1]} lakh`;
  return null;
}

const CITY_RE = /\b(mumbai|delhi|ncr|bangalore|bengaluru|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|noida|gurgaon|gurugram|thane|navi mumbai|andheri|bandra|powai|whitefield|koramangala|hsr layout|hinjewadi|kharadi|wakad|kondapur|gachibowli|hitech city|malad|borivali|goregaon|kandivali|mira road|banjara hills|jubilee hills|electronic city|btm layout|mg road|viman nagar|pimple saudagar|sector \d+)\b/i;

function extractLocation(text) {
  const cityMatch = String(text || '').match(CITY_RE);
  if (cityMatch) {
    const c = cityMatch[1].trim();
    return c.charAt(0).toUpperCase() + c.slice(1);
  }
  const nearMatch = text.match(/(?:in|near|at|around)\s+([A-Z][a-zA-Z\s]{2,25}?)(?:\s+(?:area|side|locality|sector|region))?(?:[.,]|$)/i);
  if (nearMatch) return nearMatch[1].trim();
  return null;
}

function extractPropertyType(text) {
  const t = String(text || '').toLowerCase();
  const bhk = t.match(/(\d)\s*bhk/i);
  if (bhk) return `${bhk[1]}BHK apartment`;
  if (/\b(villa|bungalow|independent house|row house)\b/i.test(t)) return 'villa';
  if (/\b(plot|land|site)\b/i.test(t)) return 'plot';
  if (/\b(apartment|flat|studio|penthouse)\b/i.test(t)) return 'apartment';
  if (/\b(commercial|office|shop)\b/i.test(t)) return 'commercial';
  return null;
}

function extractTimeline(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(immediately|asap|urgent|this month|right now)\b/i.test(t)) return 'immediate';
  if (/\b(3|three)\s*months?\b/i.test(t)) return '3 months';
  if (/\b(6|six)\s*months?\b/i.test(t)) return '6 months';
  if (/\b(1|one)\s*year\b/i.test(t)) return '1 year';
  if (/\b(2|two)\s*years?\b/i.test(t)) return '2 years';
  if (/\b(next year|next few months)\b/i.test(t)) return 'next year';
  return null;
}

function extractName(text) {
  const m = text.match(/(?:my name is|i am|this is|mera naam|naam hai)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  return m ? m[1].trim() : null;
}

// ── Acknowledgement variation pools ───────────────────────────────────────
const ACK_POOLS = {
  budget: (v) => [
    `${v} budget — perfect.`,
    `Got it, ${v}.`,
    `${v} range — noted.`,
    `Understood, ${v}.`,
    `${v} — I'll keep that in mind.`
  ],
  location: (v) => [
    `${v} — great area.`,
    `Noted, ${v}.`,
    `${v} — understood.`,
    `Got it, ${v} side.`,
    `${v} — excellent choice.`
  ],
  propertyType: (v) => [
    `A ${v} — noted.`,
    `${v} — perfect.`,
    `Got it, ${v}.`
  ],
  name: (v) => [
    `Nice to speak with you, ${v}.`,
    `Thanks, ${v}!`,
    `Good to know, ${v}.`
  ],
  timeline: (v) => [
    `${v} timeline — noted.`,
    `Got it, ${v}.`,
    `Understood — ${v}.`
  ]
};

// Rotating index per callSid+key to avoid repeating same variation
const _ackIndex = new Map();
function pickVariant(callSid, key, pool) {
  const mapKey = `${callSid}:${key}`;
  const idx = (_ackIndex.get(mapKey) || 0) % pool.length;
  _ackIndex.set(mapKey, idx + 1);
  return pool[idx];
}

// ── Core API ───────────────────────────────────────────────────────────────

function getMemory(callSid) {
  if (!_store.has(callSid)) {
    _store.set(callSid, {
      name: null,
      intent: null,
      propertyType: null,
      budget: null,
      location: null,
      timeline: null,
      preferences: [],
      lastExtracted: {}
    });
  }
  return _store.get(callSid);
}

/**
 * Update memory from a user transcript + FSM leadData.
 * Returns { newInfo: object, ack: string|null }
 */
function update(callSid, transcript, fsmLeadData = {}) {
  const mem = getMemory(callSid);
  const newInfo = {};

  const budget = extractBudget(transcript);
  if (budget && !mem.budget) { mem.budget = budget; newInfo.budget = budget; }

  const location = extractLocation(transcript);
  if (location && !mem.location) { mem.location = location; newInfo.location = location; }

  const propertyType = extractPropertyType(transcript);
  if (propertyType && !mem.propertyType) { mem.propertyType = propertyType; newInfo.propertyType = propertyType; }

  const timeline = extractTimeline(transcript);
  if (timeline && !mem.timeline) { mem.timeline = timeline; newInfo.timeline = timeline; }

  const name = extractName(transcript);
  if (name && !mem.name) { mem.name = name; newInfo.name = name; }

  // Absorb FSM intent (FSM classifies buy/rent/invest better than regex)
  if (fsmLeadData.intent && !mem.intent) { mem.intent = fsmLeadData.intent; newInfo.intent = fsmLeadData.intent; }
  // Also absorb if FSM has richer budget/location from prior turns
  if (fsmLeadData.budget && !mem.budget) mem.budget = fsmLeadData.budget;
  if (fsmLeadData.location && !mem.location) mem.location = fsmLeadData.location;

  mem.lastExtracted = newInfo;
  logger.debug('[MEM] Updated memory', { callSid, newInfo, mem: { budget: mem.budget, location: mem.location, intent: mem.intent } });

  // Generate acknowledgement for the most important new piece of info
  const ack = generateAck(callSid, newInfo);
  return { newInfo, ack };
}

function generateAck(callSid, newInfo) {
  // Priority order: budget > location > propertyType > name > timeline
  for (const key of ['budget', 'location', 'propertyType', 'name', 'timeline']) {
    if (newInfo[key] && ACK_POOLS[key]) {
      const pool = ACK_POOLS[key](newInfo[key]);
      return pickVariant(callSid, key, pool);
    }
  }
  return null;
}

/**
 * Build a concise known-facts block to inject into the LLM system prompt.
 * The LLM uses this to skip already-answered questions and reference context naturally.
 */
function buildContextSummary(callSid) {
  const mem = getMemory(callSid);
  const lines = [];

  if (mem.name) lines.push(`Customer name: ${mem.name}`);
  if (mem.intent) lines.push(`Intent: ${mem.intent} (already confirmed — do NOT ask purpose again)`);
  if (mem.propertyType) lines.push(`Property type: ${mem.propertyType} (already stated)`);
  if (mem.budget) lines.push(`Budget: ${mem.budget} (already stated — do NOT ask budget again)`);
  if (mem.location) lines.push(`Location: ${mem.location} (already stated — do NOT ask location again)`);
  if (mem.timeline) lines.push(`Timeline: ${mem.timeline}`);
  if (mem.preferences.length > 0) lines.push(`Preferences: ${mem.preferences.join(', ')}`);

  if (lines.length === 0) return '';

  return `CONVERSATION MEMORY (already known — skip these questions):\n${lines.map(l => `  • ${l}`).join('\n')}`;
}

/**
 * Generate a smart follow-up question based on what we know.
 * Returns null if no targeted follow-up is appropriate.
 */
function getSmartFollowUp(callSid) {
  const mem = getMemory(callSid);
  if (!mem.intent) return null;

  if (mem.intent === 'buy' || mem.intent === 'invest') {
    if (mem.budget && mem.location) {
      return `We have excellent options in ${mem.location} within ${mem.budget}. Would you like to schedule a site visit this week?`;
    }
    if (mem.budget && !mem.location) {
      return `With a ${mem.budget} budget — which city or area are you considering?`;
    }
    if (!mem.budget && mem.location) {
      return `For ${mem.location} — what budget range are you looking at?`;
    }
  }

  if (mem.intent === 'rent') {
    if (!mem.location) return 'Which area are you looking to rent in?';
    if (!mem.budget) return `For ${mem.location} — what monthly rental budget works for you?`;
    return `We have rental options in ${mem.location} within your budget. Shall I share details?`;
  }

  return null;
}

/**
 * Get a short "personalised context" line for acknowledgement injection into LLM prompt.
 * e.g. "User just mentioned budget: 60 lakh. Acknowledge it briefly before your response."
 */
function getAckInstruction(callSid) {
  const mem = getMemory(callSid);
  const latest = mem.lastExtracted || {};
  const items = Object.entries(latest).filter(([k]) => k !== 'intent');
  if (items.length === 0) return '';
  const desc = items.map(([k, v]) => `${k}: ${v}`).join(', ');
  return `USER JUST PROVIDED: ${desc}. Start your response with a brief natural acknowledgement (3-7 words, e.g. "60 lakh — perfect." or "Pune area — noted."), then proceed.`;
}

function clearMemory(callSid) {
  _store.delete(callSid);
  // Clean up ack index
  for (const key of _ackIndex.keys()) {
    if (key.startsWith(`${callSid}:`)) _ackIndex.delete(key);
  }
}

module.exports = { update, getMemory, buildContextSummary, getSmartFollowUp, getAckInstruction, clearMemory };

// LLM: Gemini primary → OpenAI fallback
const humanSpeech = require('./humanSpeechEngine');
const conversationStyle = require('./conversationStyle');
const geminiClient = require('./geminiClient');
const openaiClient = require('./openaiClient');
const logger = require('../utils/logger');
const costControl = require('./costControl');
const metrics = require('./metrics');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getLanguage, normalizeLanguageCode } = require('../config/languages');

let SYSTEM_PROMPT = '';
try {
  const promptPath = config.systemPromptFile;
  const abs = path.isAbsolute(promptPath) ? promptPath : path.join(process.cwd(), promptPath);
  const data = fs.readFileSync(abs, 'utf8');
  if (data && data.trim().length) {
    SYSTEM_PROMPT = data;
    logger.log('Loaded system prompt from', abs);
  }
} catch (e) {
  logger.warn('Could not load system prompt file, using inline fallback', e.message || e);
}

if (!SYSTEM_PROMPT) {
  SYSTEM_PROMPT = `You are a professional real estate AI phone agent for ${config.companyName}.
Your name is ${config.agentName}. Keep responses short, natural, and helpful.
Always respond in JSON: {"speak":"...","action":"continue|collect|hangup|escalate|book_visit","nextStep":"...","data":{},"qualityScore":0,"reasoning":"..."}`;
}

function buildSystemPrompt() {
  return SYSTEM_PROMPT
    .replace(/\{\{company_name\}\}/g, config.companyName)
    .replace(/\{\{agent_name\}\}/g, config.agentName);
}

const conversationHistory = new Map();
const MAX_HISTORY = config.llm?.maxHistory || 10;
const HISTORY_TTL_MS = config.llm?.historyTtlMs || (30 * 60 * 1000);

function getHistory(callSid) {
  if (!conversationHistory.has(callSid)) {
    conversationHistory.set(callSid, { messages: [], createdAt: Date.now() });
  }
  return conversationHistory.get(callSid);
}

function addToHistory(callSid, role, content) {
  const h = getHistory(callSid);
  h.messages.push({ role, content });
  if (h.messages.length > MAX_HISTORY) {
    h.messages = h.messages.slice(-MAX_HISTORY);
  }
}

function clearHistory(callSid) {
  conversationHistory.delete(callSid);
}

setInterval(() => {
  const now = Date.now();
  for (const [sid, h] of conversationHistory) {
    if (now - h.createdAt > HISTORY_TTL_MS) {
      conversationHistory.delete(sid);
    }
  }
}, 60000);

const FALLBACK_RESPONSE = {
  speak: 'I apologize, could you please repeat that?',
  action: 'continue',
  nextStep: 'handle',
  data: {},
  qualityScore: 0,
  reasoning: 'fallback'
};

function normalizeHeardText(text = '') {
  const out = String(text || '').trim().toLowerCase();
  if (out === 'news' || out === 'news.') return 'yes';
  return out
    .replace(/\b(yeahh|yea|yup|yupp)\b/g, 'yes')
    .replace(/\b(haanji|hanji)\b/g, 'haan ji')
    .replace(/\b(naah|nah)\b/g, 'no');
}

function extractJsonLikePayload(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  if (trimmed.startsWith('```')) {
    const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    if (unfenced.startsWith('{') && unfenced.endsWith('}')) return unfenced;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return null;
}

function parseAgentJson(text) {
  const jsonLike = extractJsonLikePayload(text);
  if (!jsonLike) throw new Error('No JSON payload found');
  try {
    return JSON.parse(jsonLike);
  } catch (_) {
    if (jsonLike.startsWith('{') && !jsonLike.endsWith('}')) {
      return JSON.parse(`${jsonLike}}`);
    }
    throw _;
  }
}

function parseAgentFieldsLoose(text) {
  const raw = String(text || '');
  const speak = (raw.match(/"speak"\s*:\s*"([^"]*)"/i)?.[1] || '').trim();
  const action = (raw.match(/"action"\s*:\s*"([^"]*)"/i)?.[1] || '').trim();
  const nextStep = (raw.match(/"nextStep"\s*:\s*"([^"]*)"/i)?.[1] || '').trim();
  if (!speak && !action && !nextStep) return null;
  return {
    ...FALLBACK_RESPONSE,
    ...(speak ? { speak } : {}),
    ...(action ? { action } : {}),
    ...(nextStep ? { nextStep } : {})
  };
}

function isConversationEndSignal(text = '') {
  return /(thank|thanks|dhanyavaad|धन्यवाद|bye|goodbye|not interested|that is all|bas itna|बस इतना|call me later)/i.test(String(text));
}

function isAudioCheck(text = '') {
  return /(can you hear me|are you there|hello|sun pa rahe|aawaz aa rahi|voice check)/i.test(String(text));
}

function isMeaningfulUtterance(text = '') {
  const cleaned = String(text).replace(/[^\w\s]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length >= 2;
}

function classifyPurposeIntent(text = '') {
  const t = normalizeHeardText(text);
  if (/\b(buy|purchase|looking to buy|own home|kharid|kharidna|खरीद)\b/i.test(t)) return 'buy';
  if (/\b(rent|rental|lease|kiraye|rent pe|किराए)\b/i.test(t)) return 'rent';
  if (/\b(invest|investment|investor|returns|निवेश)\b/i.test(t)) return 'invest';
  return '';
}

function classifyAvailability(text = '') {
  const t = normalizeHeardText(text);
  if (/\b(yes|haan|haan ji|sure|ok|okay|go ahead|boliye|bolo)\b/i.test(t)) return 'yes';
  if (/\b(no|not now|busy|later|call later|abhi nahi|नहीं|baad me)\b/i.test(t)) return 'no';
  return 'unknown';
}

// ── Response variation pools (3–5 per key) ────────────────────────────────
const PHRASE_POOLS = {
  'en-IN': {
    availabilityReask: ['Is this a good time to talk for one minute?', 'Do you have a quick minute to chat?', 'Can I take just 60 seconds of your time?', 'Is now a convenient time for a brief conversation?'],
    availabilityYes: ['Great, thank you. Are you looking to buy, rent, or invest in property?', 'Wonderful! Are you interested in buying, renting, or investing?', 'Perfect. Are you looking to buy, rent, or invest?', 'Excellent! Buying, renting, or investing — what brings you here?'],
    availabilityNo: ['No problem at all. What time works better for a quick callback?', 'Of course. When would be a good time to call you back?', 'Absolutely, no worries. What is a convenient callback time?', 'Sure! When can I reach you for a quick chat?'],
    rescheduleAsk: ['Sure. Please share a convenient time for the callback.', 'Of course. What time works best for you?', 'No problem — when would you like me to call back?', 'Absolutely. What is a good time for you?'],
    rescheduleThanks: ['Perfect, noted! I will call you at that time. Have a great day!', 'Wonderful — I have noted it. Speak to you then. Goodbye!', 'Great, I will call you back then. Thank you. Bye!', 'Noted! We will connect then. Take care. Goodbye!'],
    inboundAssist: ['Thank you for calling. How may I help you today?', 'Thanks for reaching out. How can I assist you?', 'Hello, thank you for calling. What can I help you with?', 'Hi there, thanks for calling. How may I be of help?'],
    audioCheck: ['Yes, I can hear you clearly. Please go ahead.', 'Absolutely, the line is clear. Do continue.', 'Yes, loud and clear! Please go on.', 'Yes, I can hear you well. Please proceed.'],
    close: ['Thank you for your time. Have a wonderful day. Goodbye!', 'It was a pleasure speaking with you. Take care. Goodbye!', 'Thank you! Hope to connect soon. Have a great day!', 'Thanks for your time. Wishing you a great day. Bye!']
  },
  'hinglish': {
    availabilityReask: ['Kya abhi 1 minute baat karna convenient hai?', 'Kya aap abhi ek minute de sakte hain?', 'Abhi thoda time hai baat karne ka?', 'Kya abhi baat karna theek rahega?'],
    availabilityYes: ['Great, thank you. Aap buy, rent, ya invest ke liye dekh rahe hain?', 'Wonderful! Kharidna, rent karna, ya invest karna — kya soch rahe hain?', 'Perfect! Buy, rent, ya invest — kya interest hai?', 'Excellent! Property mein kya plan hai — buy, rent, ya investment?'],
    availabilityNo: ['No problem. Callback ke liye kaunsa time better rahega?', 'Bilkul theek hai. Kab call karun aapko?', 'Koi baat nahi. Callback ke liye suitable time batayein.', 'Sure ji. Kab available rahenge?'],
    rescheduleAsk: ['Sure, callback ka suitable time bata dijiye.', 'Theek hai, kab call karun?', 'Ji, kaunsa waqt sahi rahega aapke liye?', 'No problem, convenient time batao please.'],
    rescheduleThanks: ['Perfect, note kar liya! Ussi time call karenge. Goodbye!', 'Great ji! Aapka time note kar liya. Tab baat karte hain.', 'Bilkul, hum ussi time connect karenge. Dhanyavaad!', 'Noted! Tab baat karte hain. Take care. Bye!'],
    inboundAssist: ['Thank you for calling. Aaj main aapki kaise help kar sakti hoon?', 'Hello ji, call karne ka shukriya. Kya madad kar sakti hoon?', 'Hi! Aapki kaise help kar sakti hoon?', 'Thanks for calling. Kya main aapki help kar sakti hoon?'],
    audioCheck: ['Ji, main aapko clear sun pa rahi hoon. Please boliye.', 'Haan ji, aawaz bilkul clear hai. Boliye.', 'Yes, main sun pa rahi hoon. Aage boliye.', 'Ji, sab clear hai. Please continue karein.'],
    close: ['Thank you ji. Goodbye!', 'Bahut shukriya aapka. Alvida!', 'Thank you for your time ji. Bye!', 'Dhanyavaad! Aapka din achha rahe. Goodbye!']
  },
  'hi-IN': {
    availabilityReask: ['क्या अभी एक मिनट बात करना ठीक रहेगा?', 'क्या आपके पास अभी एक मिनट का समय है?', 'क्या अभी बात करना सुविधाजनक है?', 'क्या मैं एक मिनट का समय ले सकती हूँ?'],
    availabilityYes: ['बहुत अच्छा। क्या आप खरीदना, किराए पर लेना, या निवेश करना चाहते हैं?', 'शानदार! खरीदना है, किराया चाहिए, या निवेश करना है?', 'बढ़िया! क्या प्लान है — खरीदना, किराया, या निवेश?', 'परफेक्ट! आपकी क्या जरूरत है — खरीदना, किराया, या निवेश?'],
    availabilityNo: ['कोई बात नहीं। कृपया बताइए, दोबारा कॉल का सही समय क्या रहेगा?', 'बिल्कुल ठीक है। कब कॉल करूँ आपको?', 'समझ गई। कब वापस कॉल करें?', 'ठीक है। कौन सा समय सही रहेगा?'],
    rescheduleAsk: ['ठीक है, कृपया कॉल बैक का सही समय बताइए।', 'जी, कब कॉल करूँ आपको?', 'कोई बात नहीं। आपके लिए सुविधाजनक समय बताइए।', 'बताइए, कब बात करना ठीक रहेगा?'],
    rescheduleThanks: ['बहुत धन्यवाद। हम उसी समय कॉल करेंगे। नमस्ते।', 'बढ़िया! नोट कर लिया। उसी समय बात करते हैं।', 'धन्यवाद! उस समय ज़रूर कॉल करेंगे। अलविदा!', 'परफेक्ट! उस वक्त कनेक्ट करते हैं। शुभ दिन!'],
    inboundAssist: ['धन्यवाद। मैं आपकी कैसे मदद कर सकती हूँ?', 'नमस्ते! कॉल करने का धन्यवाद। कैसे मदद करूँ?', 'हेलो! मैं आपकी क्या सहायता कर सकती हूँ?', 'जी नमस्ते। आज आपके लिए क्या कर सकती हूँ?'],
    audioCheck: ['जी, आपकी आवाज साफ आ रही है। बताइए।', 'हाँ, बिल्कुल सुन पा रही हूँ। बोलिए।', 'जी, सब ठीक है। आगे बताइए।', 'हाँ, आवाज़ क्लियर है। जारी रखिए।'],
    close: ['धन्यवाद। नमस्ते।', 'बहुत धन्यवाद। अलविदा!', 'आपका समय देने का शुक्रिया। शुभ दिन!', 'धन्यवाद जी! नमस्ते।']
  }
};

// Per-call rotating index to avoid repeating same phrase variant
const _phraseIndex = new Map();

function phrase(languageCode, key, callSid) {
  const lang = PHRASE_POOLS[languageCode] ? languageCode : 'en-IN';
  const pool = (PHRASE_POOLS[lang] || {})[key] || (PHRASE_POOLS['en-IN'] || {})[key] || [''];
  if (!callSid || pool.length <= 1) return pool[0] || '';
  const mapKey = `${callSid}:${lang}:${key}`;
  const idx = (_phraseIndex.get(mapKey) || 0) % pool.length;
  _phraseIndex.set(mapKey, idx + 1);
  return pool[idx];
}

function deterministicTurnReply(step, languageCode, transcript, callDirection, callSid) {
  const heard = normalizeHeardText(transcript);

  if (isAudioCheck(heard)) {
    return {
      ...FALLBACK_RESPONSE,
      speak: phrase(languageCode, 'audioCheck', callSid),
      action: 'collect',
      nextStep: step || 'handle',
      reasoning: 'deterministic_audio_check'
    };
  }

  if (callDirection === 'outbound' && step === 'availability_check') {
    const availability = classifyAvailability(heard);
    if (availability === 'yes') {
      return {
        ...FALLBACK_RESPONSE,
        speak: phrase(languageCode, 'availabilityYes', callSid),
        action: 'collect',
        nextStep: 'purpose',
        reasoning: 'deterministic_availability_yes'
      };
    }
    if (availability === 'no') {
      return {
        ...FALLBACK_RESPONSE,
        speak: phrase(languageCode, 'availabilityNo', callSid),
        action: 'collect',
        nextStep: 'reschedule_time',
        reasoning: 'deterministic_availability_no'
      };
    }
    return {
      ...FALLBACK_RESPONSE,
      speak: phrase(languageCode, 'availabilityReask', callSid),
      action: 'collect',
      nextStep: 'availability_check',
      reasoning: 'deterministic_availability_reask'
    };
  }

  if (callDirection === 'outbound' && step === 'reschedule_time') {
    if (isMeaningfulUtterance(heard)) {
      return {
        ...FALLBACK_RESPONSE,
        speak: phrase(languageCode, 'rescheduleThanks', callSid),
        action: 'hangup',
        nextStep: 'close',
        data: { callbackTime: transcript },
        reasoning: 'deterministic_reschedule_confirmed'
      };
    }
    return {
      ...FALLBACK_RESPONSE,
      speak: phrase(languageCode, 'rescheduleAsk', callSid),
      action: 'collect',
      nextStep: 'reschedule_time',
      reasoning: 'deterministic_reschedule_reask'
    };
  }

  if (step === 'purpose') {
    const intent = classifyPurposeIntent(heard);
    if (intent === 'buy') {
      return {
        ...FALLBACK_RESPONSE,
        speak: 'Great. What type of property are you considering: apartment, villa, or plot?',
        action: 'collect',
        nextStep: 'property_type',
        data: { intent: 'buy' },
        reasoning: 'deterministic_intent_buy'
      };
    }
    if (intent === 'rent') {
      return {
        ...FALLBACK_RESPONSE,
        speak: 'Understood. Which area and budget range are you considering for rent?',
        action: 'collect',
        nextStep: 'location_budget',
        data: { intent: 'rent' },
        reasoning: 'deterministic_intent_rent'
      };
    }
    if (intent === 'invest') {
      return {
        ...FALLBACK_RESPONSE,
        speak: 'Nice. Are you looking for short-term returns or long-term appreciation?',
        action: 'collect',
        nextStep: 'investment_timeline',
        data: { intent: 'invest' },
        reasoning: 'deterministic_intent_invest'
      };
    }
  }

  return null;
}

function enforceScriptFlow(parsed, context) {
  const safe = {
    ...FALLBACK_RESPONSE,
    ...parsed,
    data: parsed?.data && typeof parsed.data === 'object' ? parsed.data : {}
  };

  const step = context?.step || '';
  const languageCode = context?.languageCode || 'en-IN';
  const callDirection = context?.callDirection || 'inbound';

  if (context?.endSignal) {
    safe.speak = phrase(languageCode, 'close');
    safe.action = 'hangup';
    safe.nextStep = 'close';
    safe.reasoning = 'end_signal';
  }

  if (callDirection === 'outbound' && step === 'availability_check' && !safe.nextStep) {
    safe.nextStep = 'availability_check';
  }

  // Prevent jumping backward once qualification has started.
  const progressed = ['purpose', 'property_type', 'location_budget', 'investment_timeline', 'qualify_budget', 'qualify_timeline'];
  if (progressed.includes(step) && ['identify', 'greeting', 'availability_check'].includes(safe.nextStep)) {
    safe.nextStep = step;
    safe.reasoning = 'prevent_step_regression';
  }

  if (safe.speak && safe.speak.length > 160) {
    safe.speak = safe.speak.substring(0, 160);
  }

  return safe;
}

/**
 * Trim a response to max N words, cutting at the last sentence boundary.
 */
function trimToMaxWords(text, maxWords = 20) {
  if (!text) return text;
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  // Find last sentence boundary within limit
  const partial = words.slice(0, maxWords).join(' ');
  const lastPunct = Math.max(
    partial.lastIndexOf('.'), partial.lastIndexOf('?'), partial.lastIndexOf('!')
  );
  return lastPunct > 10 ? partial.substring(0, lastPunct + 1) : partial + '.';
}

// ── Hard LLM timeout (Priority 6) ────────────────────────────────────────────
const LLM_HARD_TIMEOUT_MS = 580; // Hard limit: reject if no response within 580ms

function withLlmTimeout(promise, callSid, label = 'LLM') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_TIMEOUT_${LLM_HARD_TIMEOUT_MS}ms`)), LLM_HARD_TIMEOUT_MS)
    )
  ]);
}

// ── Response Validation (Priority 2) ─────────────────────────────────────────
// Validates that the LLM response makes sense given the conversation context.
// Returns {valid, reason} — if invalid, caller should use FALLBACK_RESPONSE.
function validateResponse(reply, transcript, step) {
  if (!reply?.speak || reply.speak.trim().length < 3) {
    return { valid: false, reason: 'empty_speak' };
  }

  // Echo detection: agent must not repeat the user verbatim
  if (transcript && reply.speak.toLowerCase().trim() === transcript.toLowerCase().trim()) {
    return { valid: false, reason: 'echo_response' };
  }

  // Hangup guard: only allow hangup at close/reschedule steps
  const closeSteps = new Set(['close', 'reschedule_time', 'closing']);
  if (reply.action === 'hangup' && !closeSteps.has(step)) {
    const hasFarewell = /thank you|goodbye|bye|dhanyavaad|shukriya/i.test(reply.speak);
    if (!hasFarewell) {
      return { valid: false, reason: 'premature_hangup' };
    }
  }

  // Step regression guard: LLM must not jump back to intro steps once qualified
  const progressedSteps = ['purpose', 'property_type', 'location_budget', 'qualify_budget',
    'qualify_timeline', 'investment_timeline', 'book_visit', 'closing'];
  const regressSteps   = ['identify', 'greeting', 'availability_check'];
  if (progressedSteps.includes(step) && regressSteps.includes(reply.nextStep)) {
    return { valid: false, reason: 'step_regression' };
  }

  return { valid: true, reason: null };
}

async function generateReply({ callState, script, lastTranscript, customerName, callSid, language, knowledgeBase, callDirection, honorific, maxTokens, fastMode, modelPref, contextHint, speakerStylePrompt, contextSummary, ackInstruction }) {
  // Hoist step so catch block can reference it in timeout fallback
  const step = callState?.step || '';
  try {
    const languageCode = normalizeLanguageCode(language || config.language?.default || 'en-IN');
    const langConfig = getLanguage(languageCode);
    const direction = String(callDirection || callState?.direction || 'inbound').toLowerCase() === 'outbound' ? 'outbound' : 'inbound';
    const endSignal = isConversationEndSignal(lastTranscript || '');

    if (step === 'inbound_assist' && isAudioCheck(lastTranscript || '')) {
      return {
        ...FALLBACK_RESPONSE,
        speak: phrase(languageCode, 'inboundAssist'),
        action: 'collect',
        nextStep: 'purpose',
        reasoning: 'deterministic_inbound_assist'
      };
    }

    const fastReply = deterministicTurnReply(step, languageCode, lastTranscript, direction, callSid);
    if (fastReply) return fastReply;

    let systemContent = buildSystemPrompt();

    if (knowledgeBase) {
      try {
        let kbPrompt = (knowledgeBase.systemPrompt || '').toString();
        kbPrompt = kbPrompt.replace(/\{\{agent_name\}\}/g, knowledgeBase.agentName || config.agentName);
        kbPrompt = kbPrompt.replace(/\{\{company_name\}\}/g, knowledgeBase.companyName || config.companyName);
        kbPrompt = kbPrompt.replace(/\{\{knowledge_base\}\}/g, knowledgeBase.content || '');
        if (kbPrompt.trim()) {
          systemContent = `${kbPrompt}\n\n${systemContent}`;
        }
      } catch (e) {
        logger.warn('Failed to apply knowledge base prompt template', e.message || e);
      }
    }

    systemContent += `\n\nCALL MODE: ${direction.toUpperCase()}.`;
    if (direction === 'outbound') {
      systemContent += '\nOutbound flow requirement: if step is availability_check, ask if it is a good time. If no, ask callback time politely.';
    } else {
      systemContent += '\nInbound flow requirement: greet briefly and handle user request directly.';
    }
    systemContent += '\nStyle requirement: short conversational lines, one question at a time, no robotic repetition.';
    if (fastMode) {
      systemContent += '\nSPEED MODE ACTIVE: ONE sentence only. Max 12 words. Be direct.';
    }

    // Tone adaptation: adjust response style to match detected user emotion
    const userTone = callState?.userTone || 'neutral';
    if (userTone === 'angry') {
      systemContent += '\nTONE ALERT: Customer sounds frustrated. Respond with empathy and calm. Acknowledge their concern before proceeding. Do NOT be defensive.';
    } else if (userTone === 'confused') {
      systemContent += '\nTONE ALERT: Customer seems confused. Use simple, clear language. Guide step-by-step. Avoid jargon.';
    } else if (userTone === 'curious') {
      systemContent += '\nTONE ALERT: Customer is curious and engaged. Be informative and enthusiastic. Offer relevant details proactively.';
    }

    if (languageCode === 'hinglish') {
      systemContent += '\nIMPORTANT: Respond in consistent informal Hinglish (Roman script). Sound like a real person, not a bot. Mix Hindi+English naturally: "Aapka budget kitna hai? Main best options dikhata hoon." Do NOT use formal English phrases like "esteemed" or "kindly". Match the customer\'s casual tone exactly.';
    } else if (languageCode === 'hi-IN') {
      systemContent += '\nIMPORTANT: Respond in Hindi (Devanagari). Short, conversational sentences. Example: "आपका बजट कितना है? मैं सबसे अच्छे विकल्प दिखाता हूँ।"';
    } else if (languageCode && languageCode !== 'en-IN') {
      systemContent += `\nCustomer language: ${langConfig.name}. Respond in ${langConfig.name}.`;
    }

    // Speaker style adaptation (fast speaker, Hinglish tone consistency)
    if (speakerStylePrompt) systemContent += `\n${speakerStylePrompt}`;
    // Contextual hint — user's known budget/location/intent
    if (contextHint) systemContent += contextHint;
    // Conversation memory: known facts + acknowledgement instruction
    if (contextSummary) systemContent += `\n\n${contextSummary}`;
    if (ackInstruction) systemContent += `\n\n${ackInstruction}`;

    const userMsg = [
      `CUSTOMER NAME: ${customerName || 'unknown'}`,
      `CALL DIRECTION: ${direction}`,
      `HONORIFIC HINT: ${honorific || 'sir_maam'}`,
      `LATEST: "${lastTranscript || '(silence)'}"`,
      `CALL STATE: ${JSON.stringify(callState || {})}`,
      '',
      'Generate the next agent response in the required JSON format.'
    ].join('\n');

    const systemMsg = { role: 'system', content: systemContent };
    const history = callSid ? getHistory(callSid).messages : [];
    const messages = [
      systemMsg,
      ...history,
      { role: 'user', content: userMsg }
    ];

    if (!config.geminiApiKey && !config.openaiApiKey) {
      logger.warn('No LLM API key configured; using fallback response');
      metrics.incrementLlmRequest(false);
      return { ...FALLBACK_RESPONSE };
    }

    metrics.incrementLlmRequest(true);

    // Dynamic token count from optimizer
    const resolvedTokens = maxTokens || 100;
    const llmOpts = { temperature: 0.25, max_tokens: resolvedTokens, response_format: { type: 'json_object' } };

    // OpenAI primary → Gemini fallback (explicit 'gemini' modelPref = cost-save fallback only)
    let resp;
    let _modelUsed = 'openai';
    const useGemini = modelPref === 'gemini' && config.geminiApiKey && !config.openaiApiKey;

    if (!useGemini && config.openaiApiKey) {
      resp = await withLlmTimeout(
        openaiClient.chatCompletion(messages, config.llm.openaiModel, llmOpts),
        callSid, 'openai'
      );
    } else if (config.geminiApiKey) {
      try {
        _modelUsed = 'gemini';
        resp = await withLlmTimeout(
          geminiClient.chatCompletion(messages, config.llm.geminiModel, llmOpts),
          callSid, 'gemini'
        );
      } catch (geminiErr) {
        logger.warn('Gemini LLM failed, falling back to OpenAI:', geminiErr.message);
        if (!config.openaiApiKey) throw geminiErr;
        _modelUsed = 'openai';
        resp = await openaiClient.chatCompletion(messages, config.llm.openaiModel, llmOpts);
      }
    } else {
      resp = await withLlmTimeout(
        openaiClient.chatCompletion(messages, config.llm.openaiModel, llmOpts),
        callSid, 'openai'
      );
    }

    const assistant = resp.choices?.[0]?.message?.content || '';

    if (callSid && resp.usage) {
      costControl.addTokenUsage(callSid, resp.usage.prompt_tokens || 0, resp.usage.completion_tokens || 0);
    }

    if (callSid) {
      addToHistory(callSid, 'user', userMsg);
      addToHistory(callSid, 'assistant', assistant);
    }

    let parsed;
    try {
      parsed = parseAgentJson(assistant);
    } catch (e) {
      const loose = parseAgentFieldsLoose(assistant);
      if (loose) {
        logger.warn('LLM JSON parse failed, using loose field extraction');
        parsed = loose;
      } else {
        logger.warn('LLM returned non-JSON, using fallback', assistant.substring(0, 100));
        const speakText = assistant.replace(/[{}"]/g, '').trim();
        parsed = {
          ...FALLBACK_RESPONSE,
          speak: speakText.length > 5 ? speakText.substring(0, 150) : FALLBACK_RESPONSE.speak
        };
      }
    }

    const result = enforceScriptFlow(parsed, {
      step, languageCode, customerName, endSignal, lastTranscript, callDirection: direction
    });
    // Auto-trim in fast mode
    if (fastMode && result.speak) {
      result.speak = trimToMaxWords(result.speak, 12);
    }
    // Validate response before returning
    const validation = validateResponse(result, lastTranscript, step);
    if (!validation.valid) {
      logger.warn(`[VALIDATE] Invalid response (${validation.reason}) — using safe fallback`, { callSid });
      result.speak = phrase(languageCode, 'availabilityReask') || FALLBACK_RESPONSE.speak;
      result.action = 'collect';
      result.nextStep = step || 'handle';
      result.reasoning = `validation_fixed_${validation.reason}`;
    }
    result._modelUsed = _modelUsed;
    return result;
  } catch (err) {
    logger.error('LLM error', err.message || err);
    metrics.incrementLlmRequest(false);
    const languageCode = normalizeLanguageCode(language || config.language?.default || 'en-IN');
    // Timeout → use fast deterministic fallback, not hangup
    if (err.message?.includes('TIMEOUT')) {
      logger.warn(`[LLM] Hard timeout hit — returning safe continue response`, { callSid });
      return { ...FALLBACK_RESPONSE, speak: 'Could you please repeat that?', action: 'collect', nextStep: step || 'handle', _modelUsed: 'timeout' };
    }
    return {
      ...FALLBACK_RESPONSE,
      speak: (getLanguage(languageCode)?.farewell) || 'Thank you for your time. We will call you back. Goodbye.',
      action: 'hangup',
      nextStep: 'close'
    };
  }
}

// ── Streaming LLM Reply Generator ───────────────────────────────────────────

async function* generateReplyStream({ callState, script, lastTranscript, customerName, callSid, language, knowledgeBase, callDirection, honorific, maxTokens, fastMode, modelPref, contextHint, speakerStylePrompt, contextSummary, ackInstruction }) {
  const step = callState?.step || '';  // hoisted for catch block access
  try {
    const languageCode = normalizeLanguageCode(language || config.language?.default || 'en-IN');
    const langConfig = getLanguage(languageCode);
    const direction = String(callDirection || callState?.direction || 'inbound').toLowerCase() === 'outbound' ? 'outbound' : 'inbound';
    const endSignal = isConversationEndSignal(lastTranscript || '');

    if (step === 'inbound_assist' && isAudioCheck(lastTranscript || '')) {
      const resp = {
        ...FALLBACK_RESPONSE,
        speak: phrase(languageCode, 'inboundAssist'),
        action: 'collect',
        nextStep: 'purpose',
        reasoning: 'deterministic_inbound_assist'
      };
      yield { type: 'sentence', text: resp.speak };
      yield resp;
      return;
    }

    const fastReply = deterministicTurnReply(step, languageCode, lastTranscript, direction, callSid);
    if (fastReply) {
      const { text: cleanText } = humanSpeech.qualityCheck(fastReply.speak, { fastMode });
      yield { type: 'sentence', text: cleanText };
      yield { ...fastReply, speak: cleanText };
      return;
    }

    let systemContent = buildSystemPrompt();

    if (knowledgeBase) {
      try {
        let kbPrompt = (knowledgeBase.systemPrompt || '').toString();
        kbPrompt = kbPrompt.replace(/\{\{agent_name\}\}/g, knowledgeBase.agentName || config.agentName);
        kbPrompt = kbPrompt.replace(/\{\{company_name\}\}/g, knowledgeBase.companyName || config.companyName);
        kbPrompt = kbPrompt.replace(/\{\{knowledge_base\}\}/g, knowledgeBase.content || '');
        if (kbPrompt.trim()) {
          systemContent = `${kbPrompt}\n\n${systemContent}`;
        }
      } catch (e) {
        logger.warn('Failed to apply knowledge base prompt template', e.message || e);
      }
    }

    systemContent += `\n\nCALL MODE: ${direction.toUpperCase()}.`;
    if (direction === 'outbound') {
      systemContent += '\nOutbound flow requirement: if step is availability_check, ask if it is a good time. If no, ask callback time politely.';
    } else {
      systemContent += '\nInbound flow requirement: greet briefly and handle user request directly.';
    }
    systemContent += '\nStyle requirement: short conversational lines, one question at a time, no robotic repetition.';
    if (fastMode) {
      systemContent += '\nSPEED MODE ACTIVE: ONE sentence only. Max 12 words. Be direct.';
    }

    // Tone adaptation: adjust response style to match detected user emotion
    const userTone = callState?.userTone || 'neutral';
    if (userTone === 'angry') {
      systemContent += '\nTONE ALERT: Customer sounds frustrated. Respond with empathy and calm. Acknowledge their concern before proceeding. Do NOT be defensive.';
    } else if (userTone === 'confused') {
      systemContent += '\nTONE ALERT: Customer seems confused. Use simple, clear language. Guide step-by-step. Avoid jargon.';
    } else if (userTone === 'curious') {
      systemContent += '\nTONE ALERT: Customer is curious and engaged. Be informative and enthusiastic. Offer relevant details proactively.';
    }

    if (languageCode === 'hinglish') {
      systemContent += '\nIMPORTANT: Consistent informal Hinglish throughout. Sound like a real person: "Aapka budget kitna hai? Main best options dikhata hoon." Do NOT switch to formal English. Match the customer\'s casual tone exactly.';
    } else if (languageCode === 'hi-IN') {
      systemContent += '\nIMPORTANT: Respond in Hindi (Devanagari). Short, natural sentences. Example: "आपका बजट कितना है? मैं सबसे अच्छे विकल्प दिखाता हूँ।"';
    } else if (languageCode && languageCode !== 'en-IN') {
      systemContent += `\nCustomer language: ${langConfig.name}. Respond in ${langConfig.name}.`;
    }

    // Speaker style adaptation + contextual personalisation
    if (speakerStylePrompt) systemContent += `\n${speakerStylePrompt}`;
    if (contextHint) systemContent += contextHint;
    // Conversation memory: known facts + acknowledgement instruction
    if (contextSummary) systemContent += `\n\n${contextSummary}`;
    if (ackInstruction) systemContent += `\n\n${ackInstruction}`;

    const userMsg = [
      `CUSTOMER NAME: ${customerName || 'unknown'}`,
      `CALL DIRECTION: ${direction}`,
      `HONORIFIC HINT: ${honorific || 'sir_maam'}`,
      `LATEST: "${lastTranscript || '(silence)'}"`,
      `CALL STATE: ${JSON.stringify(callState || {})}`,
      '',
      'Generate the next agent response in the required JSON format.'
    ].join('\n');

    const systemMsg = { role: 'system', content: systemContent };
    const history = callSid ? getHistory(callSid).messages : [];
    const messages = [
      systemMsg,
      ...history,
      { role: 'user', content: userMsg }
    ];

    if (!config.geminiApiKey && !config.openaiApiKey) {
      yield { type: 'sentence', text: FALLBACK_RESPONSE.speak };
      yield { ...FALLBACK_RESPONSE };
      return;
    }

    metrics.incrementLlmRequest(true);

    const resolvedTokens = maxTokens || 100;
    const streamOpts = { temperature: 0.25, max_tokens: resolvedTokens, response_format: { type: 'json_object' } };
    let stream;
    let _modelUsed = 'openai';
    const useGeminiStream = modelPref === 'gemini' && config.geminiApiKey && !config.openaiApiKey;

    if (!useGeminiStream && config.openaiApiKey) {
      stream = await openaiClient.chatCompletionStream(messages, config.llm.openaiModel, streamOpts);
    } else if (config.geminiApiKey) {
      try {
        _modelUsed = 'gemini';
        stream = await geminiClient.chatCompletionStream(messages, config.llm.geminiModel, streamOpts);
      } catch (geminiErr) {
        logger.warn('Gemini stream failed, falling back to OpenAI:', geminiErr.message);
        if (!config.openaiApiKey) throw geminiErr;
        _modelUsed = 'openai';
        stream = await openaiClient.chatCompletionStream(messages, config.llm.openaiModel, streamOpts);
      }
    } else {
      stream = await openaiClient.chatCompletionStream(messages, config.llm.openaiModel, streamOpts);
    }

    let fullJson = '';
    let extractedSpeak = '';
    let isParsingSpeak = false;
    let sentenceBuffer = '';

    // The stream is Node.js incoming message object, process chunks
    for await (const chunk of stream) {
      // Chunk format for OpenAI stream is SSE: "data: {...}\n\n"
      const lines = chunk.toString().split('\n').filter(line => line.trim().length > 0);
      for (const line of lines) {
        if (line === 'data: [DONE]') break;
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.choices?.[0]?.delta?.content) {
              const str = parsed.choices[0].delta.content;
              fullJson += str;

              // We're looking for the "speak": "..." part of the JSON to extract tokens
              if (!isParsingSpeak) {
                const match = fullJson.match(/"speak"\s*:\s*"/i);
                if (match) {
                  isParsingSpeak = true;
                  const speakSoFar = fullJson.substring(match.index + match[0].length);
                  sentenceBuffer += speakSoFar;
                  extractedSpeak += speakSoFar;
                }
              } else {
                // Determine if we've hit the end of the "speak" value
                // In JSON, values are delimited by a trailing quote not preceded by an escape.
                const unescapedQuoteMatch = str.match(/(?<!\\)"/);
                if (unescapedQuoteMatch) {
                  isParsingSpeak = false;
                  const textContent = str.substring(0, unescapedQuoteMatch.index);
                  sentenceBuffer += textContent;
                  extractedSpeak += textContent;

                  const trimmed = sentenceBuffer.trim();
                  if (trimmed.length > 0) {
                    const { text: cleanSentence } = humanSpeech.qualityCheck(trimmed, { fastMode });
                    yield { type: 'sentence', text: cleanSentence };
                    sentenceBuffer = '';
                  }
                } else {
                  sentenceBuffer += str;
                  extractedSpeak += str;

                  // Yield sentence immediately upon punctuation or pause markers
                  if (/[.,?!:-]\s*$/.test(sentenceBuffer)) {
                    const { text: cleanSentence } = humanSpeech.qualityCheck(sentenceBuffer.trim(), { fastMode });
                    yield { type: 'sentence', text: cleanSentence };
                    sentenceBuffer = '';
                  }
                }
              }
            }
          } catch (e) { /* ignore parse error on partial chunks */ }
        }
      }
    }

    // Flush remaining buffer
    if (sentenceBuffer.trim().length > 0) {
      const { text: cleanFinal } = humanSpeech.qualityCheck(sentenceBuffer.trim(), { fastMode });
      yield { type: 'sentence', text: cleanFinal };
    }

    if (callSid) {
      addToHistory(callSid, 'user', userMsg);
      addToHistory(callSid, 'assistant', fullJson);
    }

    let parsed;
    try {
      if (fullJson.endsWith('}')) {
        parsed = parseAgentJson(fullJson);
      } else {
        parsed = parseAgentJson(fullJson + '}');
      }
    } catch (e) {
      const loose = parseAgentFieldsLoose(fullJson);
      if (loose) {
        parsed = loose;
      } else {
        const speakText = extractedSpeak.trim() || fullJson.replace(/[{}"]/g, '').trim();
        parsed = {
          ...FALLBACK_RESPONSE,
          speak: speakText.length > 5 ? speakText.substring(0, 150) : FALLBACK_RESPONSE.speak
        };
      }
    }

    const finalResponse = enforceScriptFlow(parsed, {
      step, languageCode, customerName, endSignal, lastTranscript, callDirection: direction
    });
    // Auto-trim in fast mode
    if (fastMode && finalResponse.speak) {
      finalResponse.speak = trimToMaxWords(finalResponse.speak, 12);
    }
    // Validate final response
    const streamValidation = validateResponse(finalResponse, lastTranscript, step);
    if (!streamValidation.valid) {
      logger.warn(`[VALIDATE] Stream response invalid (${streamValidation.reason}) — correcting`, { callSid });
      finalResponse.action = streamValidation.reason === 'premature_hangup' ? 'collect' : finalResponse.action;
      if (streamValidation.reason === 'step_regression') finalResponse.nextStep = step;
      finalResponse.reasoning = `${finalResponse.reasoning}_validated`;
    }
    finalResponse._modelUsed = _modelUsed;
    yield finalResponse;
    return;
  } catch (err) {
    logger.error('LLM stream error', err.message || err);
    metrics.incrementLlmRequest(false);
    const languageCode = normalizeLanguageCode(language || config.language?.default || 'en-IN');
    const farewell = (getLanguage(languageCode)?.farewell) || 'Thank you for your time. We will call you back. Goodbye.';
    yield { type: 'sentence', text: farewell };
    const errorResp = {
      ...FALLBACK_RESPONSE,
      speak: farewell,
      action: 'hangup',
      nextStep: 'close'
    };
    yield errorResp;
    return;
  }
}

module.exports = { generateReply, generateReplyStream, clearHistory, getHistory, phrase, deterministicTurnReply };

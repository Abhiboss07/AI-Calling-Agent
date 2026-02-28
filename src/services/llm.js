const openai = require('./openaiClient');
const logger = require('../utils/logger');
const costControl = require('./costControl');
const metrics = require('./metrics');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getLanguage } = require('../config/languages');

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

function normalizeLanguageCode(language) {
  if (!language) return config.language?.default || 'en-IN';
  const raw = String(language).trim().toLowerCase();
  if (raw === 'hinglish' || raw === 'hi-en' || raw === 'en-hi' || raw === 'hindi-english') {
    return 'hinglish';
  }
  return language;
}

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

function phrase(languageCode, key) {
  const map = {
    'en-IN': {
      availabilityReask: 'Is this a good time to talk for one minute?',
      availabilityYes: 'Great, thank you. Are you looking to buy, rent, or invest?',
      availabilityNo: 'No problem. What is a better time for a quick callback?',
      rescheduleAsk: 'Sure. Please share a suitable time for callback.',
      rescheduleThanks: 'Perfect, thank you. We will call you at that time. Goodbye.',
      inboundAssist: 'Thank you for calling. How may I help you today?',
      audioCheck: 'Yes, I can hear you clearly. Please go ahead.',
      close: 'Thank you for your time. Goodbye.'
    },
    'hinglish': {
      availabilityReask: 'Kya abhi 1 minute baat karna convenient hai?',
      availabilityYes: 'Great, thank you. Aap buy, rent, ya invest ke liye dekh rahe hain?',
      availabilityNo: 'No problem. Callback ke liye kaunsa time better rahega?',
      rescheduleAsk: 'Sure, callback ka suitable time bata dijiye.',
      rescheduleThanks: 'Perfect, thank you. Hum ussi time call karenge. Goodbye.',
      inboundAssist: 'Thank you for calling. Aaj main aapki kaise help kar sakti hoon?',
      audioCheck: 'Ji, main aapko clear sun pa rahi hoon. Please boliye.',
      close: 'Thank you ji. Goodbye.'
    },
    'hi-IN': {
      availabilityReask: 'क्या अभी एक मिनट बात करना ठीक रहेगा?',
      availabilityYes: 'बहुत अच्छा। क्या आप खरीदना, किराए पर लेना, या निवेश करना चाहते हैं?',
      availabilityNo: 'कोई बात नहीं। कृपया बताइए, दोबारा कॉल का सही समय क्या रहेगा?',
      rescheduleAsk: 'ठीक है, कृपया कॉल बैक का सही समय बताइए।',
      rescheduleThanks: 'बहुत धन्यवाद। हम उसी समय कॉल करेंगे। नमस्ते।',
      inboundAssist: 'धन्यवाद। मैं आपकी कैसे मदद कर सकती हूँ?',
      audioCheck: 'जी, आपकी आवाज साफ आ रही है। बताइए।',
      close: 'धन्यवाद। नमस्ते।'
    }
  };

  const lang = map[languageCode] ? languageCode : 'en-IN';
  return map[lang][key] || map['en-IN'][key];
}

function deterministicTurnReply(step, languageCode, transcript, callDirection) {
  const heard = normalizeHeardText(transcript);

  if (isAudioCheck(heard)) {
    return {
      ...FALLBACK_RESPONSE,
      speak: phrase(languageCode, 'audioCheck'),
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
        speak: phrase(languageCode, 'availabilityYes'),
        action: 'collect',
        nextStep: 'purpose',
        reasoning: 'deterministic_availability_yes'
      };
    }
    if (availability === 'no') {
      return {
        ...FALLBACK_RESPONSE,
        speak: phrase(languageCode, 'availabilityNo'),
        action: 'collect',
        nextStep: 'reschedule_time',
        reasoning: 'deterministic_availability_no'
      };
    }
    return {
      ...FALLBACK_RESPONSE,
      speak: phrase(languageCode, 'availabilityReask'),
      action: 'collect',
      nextStep: 'availability_check',
      reasoning: 'deterministic_availability_reask'
    };
  }

  if (callDirection === 'outbound' && step === 'reschedule_time') {
    if (isMeaningfulUtterance(heard)) {
      return {
        ...FALLBACK_RESPONSE,
        speak: phrase(languageCode, 'rescheduleThanks'),
        action: 'hangup',
        nextStep: 'close',
        data: { callbackTime: transcript },
        reasoning: 'deterministic_reschedule_confirmed'
      };
    }
    return {
      ...FALLBACK_RESPONSE,
      speak: phrase(languageCode, 'rescheduleAsk'),
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

async function generateReply({ callState, script, lastTranscript, customerName, callSid, language, knowledgeBase, callDirection, honorific }) {
  try {
    const languageCode = normalizeLanguageCode(language || config.language?.default || 'en-IN');
    const langConfig = getLanguage(languageCode);
    const step = callState?.step || '';
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

    const fastReply = deterministicTurnReply(step, languageCode, lastTranscript, direction);
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

    if (languageCode === 'hinglish') {
      systemContent += '\nRespond in natural Hinglish (Roman script).';
    } else if (languageCode && languageCode !== 'en-IN') {
      systemContent += `\nCustomer language: ${langConfig.name}. Respond in ${langConfig.name}.`;
    }

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

    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key missing; using fallback response');
      metrics.incrementLlmRequest(false);
      return { ...FALLBACK_RESPONSE };
    }

    metrics.incrementLlmRequest(true);

    const resp = await openai.chatCompletion(messages, 'gpt-4o-mini', {
      temperature: 0.25,
      max_tokens: 140,
      response_format: { type: 'json_object' }
    });

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

    return enforceScriptFlow(parsed, {
      step,
      languageCode,
      customerName,
      endSignal,
      lastTranscript,
      callDirection: direction
    });
  } catch (err) {
    logger.error('LLM error', err.message || err);
    metrics.incrementLlmRequest(false);
    const languageCode = normalizeLanguageCode(language || config.language?.default || 'en-IN');
    return {
      ...FALLBACK_RESPONSE,
      speak: (getLanguage(languageCode)?.farewell) || 'Thank you for your time. We will call you back. Goodbye.',
      action: 'hangup',
      nextStep: 'close'
    };
  }
}

module.exports = { generateReply, clearHistory, getHistory };

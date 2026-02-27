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
Your name is ${config.agentName}. Keep responses under 25 words. Be natural and human-like.
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

function templateByStep(step, languageCode, customerName) {
  const name = customerName || 'there';
  const agent = config.agentName || 'Agent';
  const company = config.companyName || 'our company';

  if (step === 'greeting' || step === 'identify') {
    if (languageCode === 'hi-IN') {
      return `नमस्ते! मैं ${agent} ${company} से बोल रही हूँ। क्या मैं ${name} से बात कर रही हूँ?`;
    }
    if (languageCode === 'hinglish') {
      return `Hi! Main ${agent} ${company} se bol rahi hoon. Kya main ${name} se baat kar rahi hoon?`;
    }
    return `Hi! This is ${agent} from ${company}. Am I speaking with ${name}?`;
  }

  if (step === 'warm-up') {
    if (languageCode === 'hi-IN') return `बहुत अच्छा लगा ${name} से बात करके! आप खरीदना चाहते हैं, किराए पर लेना चाहते हैं, या निवेश करना चाहते हैं?`;
    if (languageCode === 'hinglish') return `Great to speak with you, ${name}! Aap buy, rent, ya investment ke liye dekh rahe hain?`;
    return `Great to speak with you, ${name}! Are you looking to buy, rent, or invest?`;
  }

  if (step === 'close' || step === 'summary') {
    if (languageCode === 'hi-IN') {
      return `धन्यवाद ${name}! आपसे बात करके अच्छा लगा। हमारी टीम जल्दी आपसे संपर्क करेगी।`;
    }
    if (languageCode === 'hinglish') {
      return `Thank you ${name}! Aapse baat karke accha laga. Hamari team jaldi aapse contact karegi.`;
    }
    return `Thank you ${name}! It was great speaking with you. Our team will contact you shortly.`;
  }

  return '';
}

function isConversationEndSignal(text = '') {
  return /(thank|thanks|dhanyavaad|धन्यवाद|bye|goodbye|not interested|that is all|bas itna|बस इतना|call me later)/i.test(String(text));
}

function isAffirmativeIdentity(text = '') {
  return /^(yes|yeah|yep|haan|han|ji|speaking|this is me|i am|myself)\b/i.test(String(text).trim());
}

function isNegativeIdentity(text = '') {
  return /\b(no|wrong number|not .*speaking|nahi|nahin|galat number)\b/i.test(String(text));
}

function isWhoAreYou(text = '') {
  return /\b(who are you|kaun ho|kon ho|koun hai|who is this|aap kaun)\b/i.test(String(text));
}

function enforceScriptFlow(parsed, context) {
  const safe = {
    ...FALLBACK_RESPONSE,
    ...parsed,
    data: parsed?.data && typeof parsed.data === 'object' ? parsed.data : {}
  };

  const step = context?.step || '';
  const languageCode = context?.languageCode || 'en-IN';
  const scripted = templateByStep(step, languageCode, context?.customerName);
  const transcript = String(context?.lastTranscript || '').trim();

  if (step === 'greeting') {
    safe.speak = scripted || safe.speak;
    safe.action = 'collect';
    safe.nextStep = 'identify';
    safe.reasoning = 'scripted_greeting';
  }

  if (step === 'identify') {
    if (isAffirmativeIdentity(transcript)) {
      safe.speak = templateByStep('warm-up', languageCode, context?.customerName) || safe.speak;
      safe.action = 'collect';
      safe.nextStep = 'purpose';
      safe.reasoning = 'identity_confirmed';
    } else if (isNegativeIdentity(transcript)) {
      safe.speak = 'Thanks for letting me know. Sorry for the disturbance. Goodbye.';
      safe.action = 'hangup';
      safe.nextStep = 'close';
      safe.reasoning = 'wrong_number';
    } else if (isWhoAreYou(transcript)) {
      safe.speak = templateByStep('greeting', languageCode, context?.customerName) || safe.speak;
      safe.action = 'collect';
      safe.nextStep = 'identify';
      safe.reasoning = 'identity_clarification';
    } else {
      safe.speak = templateByStep('greeting', languageCode, context?.customerName) || safe.speak;
      safe.action = 'collect';
      safe.nextStep = 'identify';
      safe.reasoning = 'identity_reask';
    }
  }

  if (step === 'warm-up') {
    safe.speak = scripted || safe.speak;
    safe.action = 'collect';
    safe.nextStep = 'purpose';
    safe.reasoning = 'scripted_intro';
  }

  if (step === 'close' || step === 'summary' || context?.endSignal) {
    safe.speak = scripted || safe.speak;
    safe.action = 'hangup';
    safe.nextStep = 'close';
    safe.reasoning = 'scripted_close';
  }

  if (safe.speak && safe.speak.length > 150) {
    safe.speak = safe.speak.substring(0, 150);
  }

  return safe;
}

async function generateReply({ callState, script, lastTranscript, customerName, callSid, language, knowledgeBase }) {
  try {
    const languageCode = normalizeLanguageCode(language || config.language?.default || 'en-IN');
    const langConfig = getLanguage(languageCode);
    const step = callState?.step || '';
    const endSignal = isConversationEndSignal(lastTranscript || '');

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

    if (languageCode === 'hinglish') {
      systemContent += '\n\nIMPORTANT LANGUAGE INSTRUCTION: Respond in natural Hinglish (Hindi-English mix) in Roman script. Keep JSON response format.';
    } else if (languageCode && languageCode !== 'en-IN') {
      systemContent += `\n\nIMPORTANT LANGUAGE INSTRUCTION: The customer is speaking in ${langConfig.name}. You MUST respond in ${langConfig.name}. Keep JSON response format.`;
    }

    const userMsg = [
      `CUSTOMER NAME: ${customerName || 'unknown'}`,
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
      temperature: 0.3,
      max_tokens: 150
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
      const jsonLike = extractJsonLikePayload(assistant);
      if (!jsonLike) throw new Error('No JSON payload found');
      parsed = JSON.parse(jsonLike);
    } catch (e) {
      logger.warn('LLM returned non-JSON, using fallback', assistant.substring(0, 100));
      const speakText = assistant.replace(/[{}"]/g, '').trim();
      parsed = { ...FALLBACK_RESPONSE, speak: speakText.length > 5 ? speakText.substring(0, 150) : FALLBACK_RESPONSE.speak };
    }

    return enforceScriptFlow(parsed, { step, languageCode, customerName, endSignal, lastTranscript });
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

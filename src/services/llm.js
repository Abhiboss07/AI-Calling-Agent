const openai = require('./openaiClient');
const logger = require('../utils/logger');
const costControl = require('./costControl');
const metrics = require('./metrics');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getLanguage } = require('../config/languages');

// ── Load system prompt ──────────────────────────────────────────────────────
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

// ── Inject dynamic variables into prompt ────────────────────────────────────
function buildSystemPrompt() {
  return SYSTEM_PROMPT
    .replace(/\{\{company_name\}\}/g, config.companyName)
    .replace(/\{\{agent_name\}\}/g, config.agentName);
}

// ── Conversation history per call (in-memory, bounded) ──────────────────────
const conversationHistory = new Map(); // callSid → [{role, content}]
const MAX_HISTORY = config.llm?.maxHistory || 10; // Optimized: 10 turns is enough context
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
  // Trim to last MAX_HISTORY messages
  if (h.messages.length > MAX_HISTORY) {
    h.messages = h.messages.slice(-MAX_HISTORY);
  }
}

function clearHistory(callSid) {
  conversationHistory.delete(callSid);
}

// Periodic cleanup of stale conversations
setInterval(() => {
  const now = Date.now();
  for (const [sid, h] of conversationHistory) {
    if (now - h.createdAt > HISTORY_TTL_MS) {
      conversationHistory.delete(sid);
    }
  }
}, 60000);

// ── Default fallback response ───────────────────────────────────────────────
const FALLBACK_RESPONSE = {
  speak: 'I apologize, could you please repeat that?',
  action: 'continue',
  nextStep: 'handle',
  data: {},
  qualityScore: 0,
  reasoning: 'fallback'
};

// ── Main generate function ──────────────────────────────────────────────────
async function generateReply({ callState, script, lastTranscript, customerName, callSid, language }) {
  try {
    const langConfig = getLanguage(language || config.language?.default || 'en-IN');

    // Build language-aware system prompt
    let systemContent = buildSystemPrompt();
    if (language && language !== 'en-IN') {
      systemContent += `\n\nIMPORTANT LANGUAGE INSTRUCTION: The customer is speaking in ${langConfig.name}. You MUST respond in ${langConfig.name}. Use natural, conversational ${langConfig.name}. Keep the same JSON format but the "speak" field must be in ${langConfig.name}.`;
    }

    // Build user message with context
    const userMsg = [
      `CUSTOMER NAME: ${customerName || 'unknown'}`,
      `LATEST: "${lastTranscript || '(silence)'}"`,
      `CALL STATE: ${JSON.stringify(callState || {})}`,
      '',
      'Generate the next agent response in the required JSON format.'
    ].join('\n');

    // Build full message array with history
    const systemMsg = { role: 'system', content: systemContent };
    const history = callSid ? getHistory(callSid).messages : [];
    const messages = [
      systemMsg,
      ...history,
      { role: 'user', content: userMsg }
    ];

    metrics.incrementLlmRequest(true);

    const resp = await openai.chatCompletion(messages, 'gpt-4o-mini', {
      temperature: 0.3,
      max_tokens: 150
    });

    const assistant = resp.choices?.[0]?.message?.content || '';

    // Track cost — separate input/output for accurate pricing
    if (callSid && resp.usage) {
      costControl.addTokenUsage(callSid, resp.usage.prompt_tokens || 0, resp.usage.completion_tokens || 0);
    }

    // Store in conversation history
    if (callSid) {
      addToHistory(callSid, 'user', userMsg);
      addToHistory(callSid, 'assistant', assistant);
    }

    // Parse JSON — handle markdown-wrapped JSON (```json ... ```)
    let parsed;
    try {
      let jsonStr = assistant.trim();
      // Strip markdown code fences if present
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
      }
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      logger.warn('LLM returned non-JSON, using fallback', assistant.substring(0, 100));
      // Try to extract speak text from non-JSON response
      const speakText = assistant.replace(/[{}"]/g, '').trim();
      parsed = { ...FALLBACK_RESPONSE, speak: speakText.length > 5 ? speakText.substring(0, 150) : FALLBACK_RESPONSE.speak };
    }

    // Enforce max response length for TTS (shorter = cheaper + faster)
    if (parsed.speak && parsed.speak.length > 150) {
      parsed.speak = parsed.speak.substring(0, 150);
    }

    return parsed;
  } catch (err) {
    logger.error('LLM error', err.message || err);
    metrics.incrementLlmRequest(false);
    return { ...FALLBACK_RESPONSE, speak: (getLanguage(language)?.farewell) || 'Thank you for your time. We will call you back. Goodbye.', action: 'hangup', nextStep: 'close' };
  }
}

module.exports = { generateReply, clearHistory, getHistory };

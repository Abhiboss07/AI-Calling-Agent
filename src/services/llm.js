const openai = require('./openaiClient');
const logger = require('../utils/logger');
const costControl = require('./costControl');
const metrics = require('./metrics');

// Strict voice agent system prompt enforcing professional, human-like conversational behavior
const VOICE_AGENT_SYSTEM_PROMPT = `You are a professional, human-sounding AI phone call agent for a business. You are calling users to complete ONE specific task from the campaign.

CRITICAL RULES (NON-NEGOTIABLE):
- Speak like a calm, polite human. NEVER sound robotic or salesy.
- Keep responses SHORT (1–2 sentences max, under 30 words).
- NEVER interrupt the user. ALWAYS wait for the user to finish speaking.
- NEVER hallucinate facts. NEVER go off-script.
- If confused, repeat or rephrase the script only.
- If the user asks something unrelated, politely redirect to the call purpose.
- If the user is silent for 5 seconds, gently prompt once.
- If silence continues, end the call politely.
- End the call immediately if the user asks to stop.

TONE: Friendly, Respectful, Neutral (not emotional, not robotic)

LANGUAGE: Simple, natural English. Avoid complex words and filler sounds ("umm", "ahh").

CALL FLOW (STRICT): 1. Greeting 2. Identity confirmation 3. Purpose of call 4. Handle response 5. Complete objective 6. Polite closure

RESPONSE SCHEMA: Always return JSON: {"speak":"short human-like phrase (1-2 sentences max)","action":"continue|collect|hangup|escalate","nextStep":"greeting|confirm|purpose|handle|objective|close","reasoning":"brief explanation"}

ENDING CONDITIONS: Objective completed, user asks to stop, 2 failed attempts, call exceeds time limit.

FAILURE HANDLING: user busy=offer callback once then end; user angry=apologize once then end; wrong number=apologize then end; unclear audio=ask repeat once.`;

async function generateReply({ callState, script, lastTranscript, customerName, callSid }){
  try{
    const user = `CUSTOMER: ${customerName||'unknown'}\nTRANSCRIPT: ${lastTranscript||'(silence)'}\nSTATE: ${JSON.stringify(callState)}\nSCRIPT: ${JSON.stringify(script)}\n\nGenerate NEXT agent response.`;
    const messages = [
      { role: 'system', content: VOICE_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: user }
    ];
    metrics.incrementLlmRequest(true);
    const resp = await openai.chatCompletion(messages, 'gpt-4o-mini', { temperature: 0.3, max_tokens: 120 });
    const assistant = resp.choices?.[0]?.message?.content || '';
    if(callSid && resp.usage) costControl.addTokenUsage(callSid, resp.usage.total_tokens);
    let parsed;
    try{ parsed = JSON.parse(assistant); }
    catch(e){
      logger.error('LLM non-JSON, fallback', assistant);
      parsed = { speak: script.fallback||'I apologize, could you please repeat that?', action: 'continue', nextStep: 'handle', reasoning: 'fallback' };
    }
    if(parsed.speak && parsed.speak.length>200) parsed.speak = parsed.speak.substring(0,200);
    return parsed;
  }catch(err){
    logger.error('LLM error', err.message||err);
    metrics.incrementLlmRequest(false);
    return { speak: script.fallback||'Thank you. Goodbye.', action: 'hangup', nextStep: 'close' };
  }
}

module.exports = { generateReply };

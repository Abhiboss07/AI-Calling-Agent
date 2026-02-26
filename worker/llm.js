import { chatCompletion } from './openai.js';

const FALLBACK_RESPONSE = {
    speak: 'I apologize, could you please repeat that?',
    action: 'continue',
    nextStep: 'handle',
    data: {},
    qualityScore: 0,
    reasoning: 'fallback'
};

export function buildSystemPrompt(env) {
    const base = env.SYSTEM_PROMPT || `You are Shubhi, a professional real estate AI agent for ${env.COMPANY_NAME || 'Real Estate'}. You help customers with property inquiries, scheduling viewings, and providing real estate information. Always be helpful, professional, and knowledgeable about real estate. Keep responses under 25 words. Always respond in JSON format with 'speak' field containing what you would say to the customer.`;
    return base.replace(/\{\{company_name\}\}/g, env.COMPANY_NAME || 'Real Estate')
        .replace(/\{\{agent_name\}\}/g, env.AGENT_NAME || 'AI Agent');
}

export async function generateReply(env, { callState, lastTranscript, customerName, callSid, language, history = [] }) {
    try {
        let systemContent = buildSystemPrompt(env);
        if (language && language !== 'en-IN') {
            systemContent += `\n\nRespond in ${language}. Use natural, conversational tone.`;
        }

        const userMsg = [
            `CUSTOMER NAME: ${customerName || 'unknown'}`,
            `LATEST: "${lastTranscript || '(silence)'}"`,
            `CALL STATE: ${JSON.stringify(callState || {})}`,
            '',
            'Generate the next agent response in the required JSON format.'
        ].join('\n');

        const messages = [
            { role: 'system', content: systemContent },
            ...history,
            { role: 'user', content: userMsg }
        ];

        const resp = await chatCompletion(env, messages);
        const assistant = resp.choices?.[0]?.message?.content || '';

        let parsed;
        try {
            let jsonStr = assistant.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
            }
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            const speakText = assistant.replace(/[{}"]/g, '').trim();
            parsed = { ...FALLBACK_RESPONSE, speak: speakText.substring(0, 150) };
        }

        if (parsed.speak && parsed.speak.length > 150) {
            parsed.speak = parsed.speak.substring(0, 150);
        }

        return { parsed, assistant };
    } catch (err) {
        console.error('LLM Error:', err.message);
        return { parsed: FALLBACK_RESPONSE, assistant: JSON.stringify(FALLBACK_RESPONSE) };
    }
}

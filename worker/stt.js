import { transcribeAudio } from './openai.js';

export async function transcribe(env, arrayBuffer, language = 'en') {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return { text: '', confidence: 0, empty: true };
    }

    // Min size guard (44 bytes header + some data)
    if (arrayBuffer.byteLength < 500) {
        return { text: '', confidence: 0, empty: true };
    }

    try {
        const whisperLang = language ? language.split('-')[0] : 'en';
        const resp = await transcribeAudio(env, arrayBuffer, whisperLang);
        const text = (resp.text || '').trim();

        const NOISE_PATTERNS = /^[.\s…]+$|^(thank you\.?|thanks\.?|bye\.?|hmm\.?|uh+\.?|um+\.?)$/i;
        if (!text || text.length < 2 || NOISE_PATTERNS.test(text)) {
            return { text: '', confidence: 0, empty: true };
        }

        return {
            text,
            confidence: resp?.segments?.[0]?.avg_logprob
                ? Math.exp(resp.segments[0].avg_logprob)
                : 0.8,
            empty: false
        };
    } catch (err) {
        console.error('STT Error:', err.message);
        return { text: '', confidence: 0, empty: true, error: err.message };
    }
}

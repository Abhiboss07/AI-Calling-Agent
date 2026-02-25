import { ttsSynthesize } from './openai.js';

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

function pcm16ToMulaw(sample) {
    if (sample > MULAW_CLIP) sample = MULAW_CLIP;
    if (sample < -MULAW_CLIP) sample = -MULAW_CLIP;
    const sign = (sample < 0) ? 0x80 : 0;
    if (sign) sample = -sample;
    sample = sample + MULAW_BIAS;
    let exponent = 7;
    const expMask = 0x4000;
    for (; exponent > 0; exponent--) {
        if (sample & expMask) break;
        sample <<= 1;
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

export function pcmBufferToMulaw(pcmArrayBuffer) {
    const view = new DataView(pcmArrayBuffer);
    const numSamples = Math.floor(pcmArrayBuffer.byteLength / 2);
    const mulaw = new Uint8Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        mulaw[i] = pcm16ToMulaw(view.getInt16(i * 2, true));
    }
    return mulaw;
}

export function resample24kTo8k(pcm24kArrayBuffer) {
    const view = new DataView(pcm24kArrayBuffer);
    const numSamples24 = Math.floor(pcm24kArrayBuffer.byteLength / 2);
    const numSamples8 = Math.floor(numSamples24 / 3);
    const result = new ArrayBuffer(numSamples8 * 2);
    const resultView = new DataView(result);

    for (let i = 0; i < numSamples8; i++) {
        const idx = i * 3;
        let sum = 0;
        let count = 0;
        for (let j = 0; j < 3 && (idx + j) < numSamples24; j++) {
            sum += view.getInt16((idx + j) * 2, true);
            count++;
        }
        const sample = Math.round(sum / count);
        resultView.setInt16(i * 2, Math.max(-32768, Math.min(32767, sample)), true);
    }

    return result;
}

export async function synthesizeRaw(env, text, voice = 'alloy') {
    if (!text || text.trim().length === 0) return null;

    const rawPcm24k = await ttsSynthesize(env, text, voice, 'pcm');
    const pcm8k = resample24kTo8k(rawPcm24k);
    const mulaw = pcmBufferToMulaw(pcm8k);

    return {
        mulaw,
        pcm8k
    };
}

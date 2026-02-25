const MULAW_DECODE = new Int16Array(256);
(function buildTable() {
    for (let i = 0; i < 256; i++) {
        let mu = ~i & 0xFF;
        let sign = mu & 0x80;
        let exponent = (mu >> 4) & 0x07;
        let mantissa = mu & 0x0F;
        let sample = ((mantissa << 3) + 0x84) << exponent;
        sample -= 0x84;
        MULAW_DECODE[i] = sign ? -sample : sample;
    }
})();

export function mulawToPcm16(mulawUint8Array) {
    const pcm = new Int16Array(mulawUint8Array.length);
    for (let i = 0; i < mulawUint8Array.length; i++) {
        pcm[i] = MULAW_DECODE[mulawUint8Array[i]];
    }
    return pcm;
}

export function computeRms(pcmInt16Array) {
    if (pcmInt16Array.length === 0) return 0;
    let sumSq = 0;
    for (let i = 0; i < pcmInt16Array.length; i++) {
        const sample = pcmInt16Array[i] / 32768.0;
        sumSq += sample * sample;
    }
    return Math.sqrt(sumSq / pcmInt16Array.length);
}

export function buildWavHeader(pcmByteLength, sampleRate = 8000) {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF identifier
    view.setUint8(0, 'R'.charCodeAt(0));
    view.setUint8(1, 'I'.charCodeAt(0));
    view.setUint8(2, 'F'.charCodeAt(0));
    view.setUint8(3, 'F'.charCodeAt(0));
    // File length
    view.setUint32(4, 36 + pcmByteLength, true);
    // WAVE identifier
    view.setUint8(8, 'W'.charCodeAt(0));
    view.setUint8(9, 'A'.charCodeAt(0));
    view.setUint8(10, 'V'.charCodeAt(0));
    view.setUint8(11, 'E'.charCodeAt(0));
    // Fmt identifier
    view.setUint8(12, 'f'.charCodeAt(0));
    view.setUint8(13, 'm'.charCodeAt(0));
    view.setUint8(14, 't'.charCodeAt(0));
    view.setUint8(15, ' '.charCodeAt(0));
    // Chunk length
    view.setUint32(16, 16, true);
    // Sample format (PCM)
    view.setUint16(20, 1, true);
    // Channels (Mono)
    view.setUint16(22, 1, true);
    // Sample rate
    view.setUint32(24, sampleRate, true);
    // Byte rate (SampleRate * Channels * BitsPerSample / 8)
    view.setUint32(28, sampleRate * 1 * 16 / 8, true);
    // Block align (Channels * BitsPerSample / 8)
    view.setUint16(32, 1 * 16 / 8, true);
    // Bits per sample
    view.setUint16(34, 16, true);
    // Data identifier
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));
    // Data length
    view.setUint32(40, pcmByteLength, true);

    return header;
}

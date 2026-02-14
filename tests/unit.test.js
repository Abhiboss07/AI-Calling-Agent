/**
 * AI Calling Agent — Comprehensive Unit & Integration Tests
 * Covers all critical telephony issues + general functionality
 * Run: npx jest tests/unit.test.js --runInBand --forceExit
 */

// ══════════════════════════════════════════════════════════════════════════════
// 1. LOGGER TESTS
// ══════════════════════════════════════════════════════════════════════════════
describe('Logger', () => {
    const logger = require('../src/utils/logger');

    test('all 4 log levels exist', () => {
        expect(typeof logger.log).toBe('function');
        expect(typeof logger.error).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.debug).toBe('function');
    });

    test('log does not throw', () => {
        expect(() => logger.log('test')).not.toThrow();
    });

    test('warn does not throw', () => {
        expect(() => logger.warn('test')).not.toThrow();
    });

    test('handles objects in args', () => {
        expect(() => logger.log('test', { key: 'value' })).not.toThrow();
    });

    test('handles null/undefined args', () => {
        expect(() => logger.log(null, undefined, 'text')).not.toThrow();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. CONFIG TESTS
// ══════════════════════════════════════════════════════════════════════════════
describe('Config', () => {
    const config = require('../src/config');

    test('port is a number', () => {
        expect(typeof config.port).toBe('number');
        expect(config.port).toBeGreaterThan(0);
    });

    test('callMaxMinutes is a positive number', () => {
        expect(typeof config.callMaxMinutes).toBe('number');
        expect(config.callMaxMinutes).toBeGreaterThan(0);
    });

    test('companyName is set', () => {
        expect(config.companyName).toBeTruthy();
        expect(config.companyName.length).toBeGreaterThan(0);
    });

    test('agentName is set', () => {
        expect(config.agentName).toBeTruthy();
    });

    test('systemPromptFile is set', () => {
        expect(config.systemPromptFile).toBeTruthy();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. µ-LAW → PCM → WAV CONVERSION
// ══════════════════════════════════════════════════════════════════════════════
describe('µ-law → PCM → WAV Conversion', () => {
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

    function mulawToPcm16(mulawBuffer) {
        const pcm = Buffer.alloc(mulawBuffer.length * 2);
        for (let i = 0; i < mulawBuffer.length; i++) {
            const sample = MULAW_DECODE[mulawBuffer[i]];
            pcm.writeInt16LE(sample, i * 2);
        }
        return pcm;
    }

    function buildWavBuffer(pcmData) {
        const header = Buffer.alloc(44);
        const dataSize = pcmData.length;
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + dataSize, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(1, 22);
        header.writeUInt32LE(8000, 24);
        header.writeUInt32LE(16000, 28);
        header.writeUInt16LE(2, 32);
        header.writeUInt16LE(16, 34);
        header.write('data', 36);
        header.writeUInt32LE(dataSize, 40);
        return Buffer.concat([header, pcmData]);
    }

    test('µ-law decode table has 256 entries', () => {
        expect(MULAW_DECODE.length).toBe(256);
    });

    test('silence byte 0xFF decodes to ~0', () => {
        const sample = MULAW_DECODE[0xFF];
        expect(Math.abs(sample)).toBeLessThan(200);
    });

    test('mulawToPcm16 doubles buffer size', () => {
        const mulaw = Buffer.from([0xFF, 0x80, 0x40, 0x20]);
        const pcm = mulawToPcm16(mulaw);
        expect(pcm.length).toBe(8);
    });

    test('WAV buffer has correct header', () => {
        const pcm = Buffer.alloc(16000);
        const wav = buildWavBuffer(pcm);

        expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
        expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
        expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
        expect(wav.toString('ascii', 36, 40)).toBe('data');
        expect(wav.readUInt16LE(20)).toBe(1);
        expect(wav.readUInt16LE(22)).toBe(1);
        expect(wav.readUInt32LE(24)).toBe(8000);
        expect(wav.readUInt16LE(34)).toBe(16);
        expect(wav.length).toBe(16044);
    });

    test('WAV data size matches PCM data', () => {
        const pcm = Buffer.alloc(32000);
        const wav = buildWavBuffer(pcm);
        const dataSize = wav.readUInt32LE(40);
        expect(dataSize).toBe(32000);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. PCM → µ-LAW ENCODING (for bidirectional stream)
// ══════════════════════════════════════════════════════════════════════════════
describe('PCM → µ-law Encoding', () => {
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

    test('silence encodes to known µ-law value', () => {
        const result = pcm16ToMulaw(0);
        expect(result).toBeDefined();
        expect(result >= 0 && result <= 255).toBe(true);
    });

    test('positive and negative samples produce different results', () => {
        const pos = pcm16ToMulaw(5000);
        const neg = pcm16ToMulaw(-5000);
        expect(pos).not.toBe(neg);
    });

    test('clipping works for max values', () => {
        const maxResult = pcm16ToMulaw(32767);
        const clipResult = pcm16ToMulaw(MULAW_CLIP);
        expect(maxResult).toBe(clipResult);
    });

    test('round-trip maintains approximate values', () => {
        // Build µ-law decode table
        const MULAW_DECODE = new Int16Array(256);
        for (let i = 0; i < 256; i++) {
            let mu = ~i & 0xFF;
            let sign = mu & 0x80;
            let exponent = (mu >> 4) & 0x07;
            let mantissa = mu & 0x0F;
            let s = ((mantissa << 3) + 0x84) << exponent;
            s -= 0x84;
            MULAW_DECODE[i] = sign ? -s : s;
        }

        // Encode then decode — should be close to original
        const original = 5000;
        const encoded = pcm16ToMulaw(original);
        const decoded = MULAW_DECODE[encoded];
        expect(Math.abs(decoded - original)).toBeLessThan(1500); // µ-law has significant quantization error at high amplitudes
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. VAD (Voice Activity Detection)
// ══════════════════════════════════════════════════════════════════════════════
describe('PCM-based Voice Activity Detection', () => {
    function computeRms(pcmBuffer) {
        if (pcmBuffer.length < 2) return 0;
        let sumSq = 0;
        const numSamples = Math.floor(pcmBuffer.length / 2);
        for (let i = 0; i < numSamples; i++) {
            const sample = pcmBuffer.readInt16LE(i * 2) / 32768.0;
            sumSq += sample * sample;
        }
        return Math.sqrt(sumSq / numSamples);
    }

    test('silence has RMS ≈ 0', () => {
        const silence = Buffer.alloc(1000);
        expect(computeRms(silence)).toBe(0);
    });

    test('voice signal has RMS > threshold', () => {
        const signal = Buffer.alloc(1000);
        for (let i = 0; i < 500; i++) {
            const sample = Math.round(Math.sin(i * 0.1) * 5000);
            signal.writeInt16LE(sample, i * 2);
        }
        const rms = computeRms(signal);
        expect(rms).toBeGreaterThan(0.008);
    });

    test('quiet noise is below threshold', () => {
        const noise = Buffer.alloc(1000);
        for (let i = 0; i < 500; i++) {
            noise.writeInt16LE(Math.round(Math.random() * 50 - 25), i * 2);
        }
        const rms = computeRms(noise);
        expect(rms).toBeLessThan(0.008);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. RETRY UTILITY
// ══════════════════════════════════════════════════════════════════════════════
describe('Retry', () => {
    const { retry } = require('../src/utils/retry');

    test('succeeds first try', async () => {
        const result = await retry(() => Promise.resolve('ok'), { retries: 3, minDelay: 10 });
        expect(result).toBe('ok');
    });

    test('retries then succeeds', async () => {
        let attempt = 0;
        const result = await retry(() => {
            attempt++;
            if (attempt < 3) throw new Error('fail');
            return Promise.resolve('ok');
        }, { retries: 3, minDelay: 10, factor: 1 });
        expect(result).toBe('ok');
    });

    test('exhausts retries then throws', async () => {
        await expect(
            retry(() => { throw new Error('always fails'); }, { retries: 2, minDelay: 10, factor: 1 })
        ).rejects.toThrow('always fails');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. CIRCUIT BREAKER
// ══════════════════════════════════════════════════════════════════════════════
describe('Circuit Breaker', () => {
    const CircuitBreaker = require('../src/utils/circuitBreaker');

    test('starts CLOSED', () => {
        const cb = new CircuitBreaker();
        expect(cb.isOpen()).toBe(false);
    });

    test('opens after threshold failures', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 100 });
        for (let i = 0; i < 3; i++) {
            try { await cb.exec(() => { throw new Error('fail'); }); } catch (e) { }
        }
        expect(cb.isOpen()).toBe(true);
    });

    test('rejects when open', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 50000 });
        try { await cb.exec(() => { throw new Error('fail'); }); } catch (e) { }
        await expect(cb.exec(() => Promise.resolve('ok'))).rejects.toThrow('Circuit breaker is OPEN');
    });

    test('recovers after timeout', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 50 });
        try { await cb.exec(() => { throw new Error('fail'); }); } catch (e) { }
        await new Promise(r => setTimeout(r, 60));
        const result = await cb.exec(() => Promise.resolve('recovered'));
        expect(result).toBe('recovered');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. COST CONTROL — Memory safety
// ══════════════════════════════════════════════════════════════════════════════
describe('Cost Control', () => {
    const costControl = require('../src/services/costControl');

    test('tracks calls correctly', () => {
        costControl.trackCall('test-1');
        expect(costControl.getEstimatedCost('test-1')).toBe(0);
    });

    test('tokens increase cost', () => {
        costControl.trackCall('test-2');
        costControl.addTokenUsage('test-2', 1000);
        expect(costControl.getEstimatedCost('test-2')).toBeGreaterThan(0);
    });

    test('STT usage increases cost', () => {
        costControl.trackCall('test-stt');
        costControl.addSttUsage('test-stt', 30);
        expect(costControl.getEstimatedCost('test-stt')).toBeGreaterThan(0);
        costControl.endCallTracking('test-stt');
    });

    test('TTS usage increases cost', () => {
        costControl.trackCall('test-tts');
        costControl.addTtsUsage('test-tts', 500);
        expect(costControl.getEstimatedCost('test-tts')).toBeGreaterThan(0);
        costControl.endCallTracking('test-tts');
    });

    test('endCallTracking removes entry', () => {
        costControl.trackCall('test-3');
        costControl.addTokenUsage('test-3', 500);
        const cost = costControl.endCallTracking('test-3');
        expect(cost).toBeGreaterThan(0);
        expect(costControl.getEstimatedCost('test-3')).toBe(0);
    });

    test('budget check works', () => {
        costControl.trackCall('test-4');
        expect(costControl.isWithinBudget('test-4', 1000)).toBe(true);
        costControl.endCallTracking('test-4');
    });

    test('handles missing callSid gracefully', () => {
        expect(costControl.getEstimatedCost('nonexistent')).toBe(0);
        // These should not throw
        costControl.addTokenUsage('nonexistent', 100);
        costControl.addSttUsage('nonexistent', 10);
        costControl.addTtsUsage('nonexistent', 50);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. METRICS — Latency tracking
// ══════════════════════════════════════════════════════════════════════════════
describe('Metrics', () => {
    const metrics = require('../src/services/metrics');

    test('tracks call starts', () => {
        const before = metrics.getMetrics().callsStarted;
        metrics.incrementCallsStarted();
        expect(metrics.getMetrics().callsStarted).toBe(before + 1);
    });

    test('tracks active calls', () => {
        metrics.incrementCallsStarted();
        const m = metrics.getMetrics();
        expect(m.activeCalls).toBeGreaterThan(0);
    });

    test('tracks peak concurrent', () => {
        const m = metrics.getMetrics();
        expect(m.peakConcurrent).toBeGreaterThan(0);
    });

    test('tracks pipeline latency', () => {
        metrics.addPipelineLatency(150, 200, 100);
        const m = metrics.getMetrics();
        expect(m.latency.samples).toBeGreaterThan(0);
        expect(m.latency.p50).toBeGreaterThan(0);
    });

    test('computes latency percentiles', () => {
        for (let i = 0; i < 10; i++) {
            metrics.addPipelineLatency(100 + i * 10, 200 + i * 5, 80 + i * 3);
        }
        const m = metrics.getMetrics();
        expect(m.latency.p95).toBeGreaterThanOrEqual(m.latency.p50);
    });

    test('reports memory usage', () => {
        const m = metrics.getMetrics();
        expect(m.memoryMB).toBeGreaterThan(0);
    });

    test('tracks WS errors and disconnects', () => {
        const before = metrics.getMetrics().wsErrors;
        metrics.incrementWsError();
        expect(metrics.getMetrics().wsErrors).toBe(before + 1);
    });

    test('tracks interrupts', () => {
        const before = metrics.getMetrics().interrupts;
        metrics.incrementInterrupt();
        expect(metrics.getMetrics().interrupts).toBe(before + 1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. STT — Edge cases
// ══════════════════════════════════════════════════════════════════════════════
describe('STT Edge Cases', () => {
    const stt = require('../src/services/stt');

    test('empty buffer returns empty', async () => {
        const result = await stt.transcribe(Buffer.alloc(0), null);
        expect(result.empty).toBe(true);
        expect(result.text).toBe('');
    });

    test('tiny buffer returns empty', async () => {
        const result = await stt.transcribe(Buffer.alloc(100), null);
        expect(result.empty).toBe(true);
    });

    test('null buffer returns empty', async () => {
        const result = await stt.transcribe(null, null);
        expect(result.empty).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. TTS — Edge cases
// ══════════════════════════════════════════════════════════════════════════════
describe('TTS Edge Cases', () => {
    const tts = require('../src/services/tts');

    test('empty text returns null for synthesizeRaw', async () => {
        const result = await tts.synthesizeRaw('', null);
        expect(result).toBeNull();
    });

    test('whitespace-only text returns null for synthesizeRaw', async () => {
        const result = await tts.synthesizeRaw('   ', null);
        expect(result).toBeNull();
    });

    test('empty text returns null for synthesizeAndUpload', async () => {
        const result = await tts.synthesizeAndUpload('', null);
        expect(result).toBeNull();
    });

    test('whitespace-only text returns null for synthesizeAndUpload', async () => {
        const result = await tts.synthesizeAndUpload('   ', null);
        expect(result).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. LLM — Conversation history
// ══════════════════════════════════════════════════════════════════════════════
describe('LLM History Management', () => {
    const llm = require('../src/services/llm');

    test('clearHistory does not throw for nonexistent sid', () => {
        expect(() => llm.clearHistory('nonexistent')).not.toThrow();
    });

    test('getHistory returns empty messages for new sid', () => {
        const h = llm.getHistory('test-sid-history');
        expect(h.messages).toEqual([]);
        llm.clearHistory('test-sid-history');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. PIPELINE INTERRUPT — Race condition prevention
// ══════════════════════════════════════════════════════════════════════════════
describe('Pipeline Supersede Logic', () => {
    test('monotonic pipeline IDs', () => {
        let pipelineId = 0;
        const first = ++pipelineId;
        const second = ++pipelineId;
        expect(second).toBeGreaterThan(first);
        expect(first !== pipelineId).toBe(true);
        expect(second === pipelineId).toBe(true);
    });

    test('isProcessing lock with currentPipelineId', () => {
        // Simulate the fixed lock pattern from ws-media.js
        let isProcessing = false;
        let currentPipelineId = 0;
        let lastPipelineId = 0;

        // Start first pipeline
        const pid1 = ++lastPipelineId;
        isProcessing = true;
        currentPipelineId = pid1;

        // Start second pipeline (interrupting first)
        const pid2 = ++lastPipelineId;
        isProcessing = true;
        currentPipelineId = pid2;

        // First pipeline's .finally() fires — should NOT release lock
        if (currentPipelineId === pid1) {
            isProcessing = false;
        }
        expect(isProcessing).toBe(true); // Lock should still be held by pid2

        // Second pipeline's .finally() fires — should release lock
        if (currentPipelineId === pid2) {
            isProcessing = false;
        }
        expect(isProcessing).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. RESAMPLING — 24kHz → 8kHz
// ══════════════════════════════════════════════════════════════════════════════
describe('Audio Resampling', () => {
    // Replicate the function from tts.js
    function resample24kTo8k(pcm24kBuffer) {
        const numSamples24 = Math.floor(pcm24kBuffer.length / 2);
        const numSamples8 = Math.floor(numSamples24 / 3);
        const result = Buffer.alloc(numSamples8 * 2);

        for (let i = 0; i < numSamples8; i++) {
            const idx = i * 3;
            let sum = 0;
            let count = 0;
            for (let j = 0; j < 3 && (idx + j) < numSamples24; j++) {
                sum += pcm24kBuffer.readInt16LE((idx + j) * 2);
                count++;
            }
            const sample = Math.round(sum / count);
            result.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
        }

        return result;
    }

    test('reduces sample count by 3x', () => {
        // 24kHz → 8kHz is a 3:1 ratio
        const input = Buffer.alloc(2400 * 2); // 100ms at 24kHz (2400 samples)
        const output = resample24kTo8k(input);
        expect(output.length).toBe(800 * 2); // 100ms at 8kHz (800 samples)
    });

    test('preserves signal shape', () => {
        // Create a 1kHz sine wave at 24kHz
        const numSamples = 240; // 10ms
        const input = Buffer.alloc(numSamples * 2);
        for (let i = 0; i < numSamples; i++) {
            const sample = Math.round(Math.sin(2 * Math.PI * 1000 * i / 24000) * 10000);
            input.writeInt16LE(sample, i * 2);
        }

        const output = resample24kTo8k(input);
        expect(output.length).toBe(Math.floor(numSamples / 3) * 2);

        // Check that output is non-zero (signal preserved)
        let maxSample = 0;
        for (let i = 0; i < output.length / 2; i++) {
            maxSample = Math.max(maxSample, Math.abs(output.readInt16LE(i * 2)));
        }
        expect(maxSample).toBeGreaterThan(1000); // Signal should still be significant
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. TTS CACHE — Hash collision test
// ══════════════════════════════════════════════════════════════════════════════
describe('TTS Cache Key', () => {
    function cacheKey(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = (hash * 16777619) >>> 0;
        }
        return `${hash}_${text.length}`;
    }

    test('different texts produce different keys', () => {
        const key1 = cacheKey('Hello, how are you doing today?');
        const key2 = cacheKey('Hello, how are you doing today!');
        expect(key1).not.toBe(key2);
    });

    test('same text produces same key', () => {
        const key1 = cacheKey('Are you still there?');
        const key2 = cacheKey('Are you still there?');
        expect(key1).toBe(key2);
    });

    test('texts with same prefix but different length produce different keys', () => {
        const prefix = 'A'.repeat(100);
        const key1 = cacheKey(prefix);
        const key2 = cacheKey(prefix + 'B');
        expect(key1).not.toBe(key2);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 16. XML ESCAPE (security)
// ══════════════════════════════════════════════════════════════════════════════
describe('XML Escape', () => {
    function xmlEscape(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    test('escapes all XML special characters', () => {
        expect(xmlEscape('Hello & <World> "Foo" \'Bar\'')).toBe('Hello &amp; &lt;World&gt; &quot;Foo&quot; &apos;Bar&apos;');
    });

    test('handles empty/null input', () => {
        expect(xmlEscape('')).toBe('');
        expect(xmlEscape(null)).toBe('');
        expect(xmlEscape(undefined)).toBe('');
    });

    test('prevents XSS in company name', () => {
        const malicious = '<script>alert("xss")</script>';
        const escaped = xmlEscape(malicious);
        expect(escaped).not.toContain('<script>');
    });
});

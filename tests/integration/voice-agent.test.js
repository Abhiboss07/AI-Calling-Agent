const Call = require('../../src/models/call.model');
const Transcript = require('../../src/models/transcript.model');
const llm = require('../../src/services/llm');
const stt = require('../../src/services/stt');

describe('LLM voice agent', () => {
  test('generates short human-sounding reply', async () => {
    const script = {
      defaultReply: "Hello, this is a test call.",
      fallback: "I'll call back later."
    };
    const reply = await llm.generateReply({
      callState: { step: 'greeting' },
      script,
      lastTranscript: 'Hello?',
      customerName: 'John'
    });

    expect(reply).toHaveProperty('speak');
    expect(reply).toHaveProperty('action');
    expect(reply.speak.length).toBeLessThan(200);
  });

  test('returns valid action enum', async () => {
    const reply = await llm.generateReply({
      callState: { step: 'greeting' },
      script: { fallback: 'Goodbye.' },
      lastTranscript: 'stop call',
      customerName: 'Jane'
    });

    expect(['continue', 'collect', 'hangup', 'escalate']).toContain(reply.action);
  });

  test('fallback to script on API error', async () => {
    const reply = await llm.generateReply({
      callState: {},
      script: { fallback: 'Custom fallback message.' },
      lastTranscript: 'hello',
      customerName: 'Test'
    });

    expect(reply.action).toBeDefined();
    expect(reply.speak).toBeDefined();
  });
});

// skip STT integration in CI or when no OpenAI key (Cloudflare Pages build, GitHub Actions, etc.)
const shouldRunStt = !!process.env.OPENAI_API_KEY && !process.env.CI;

// choose suite name dynamically, but always call describe normally
const suiteName = shouldRunStt ? 'STT transcription' : 'STT transcription (skipped in CI)';
describe(suiteName, () => {
  const testFn = shouldRunStt ? test : test.skip;

  testFn('returns transcript with confidence', async () => {
    const audioBuffer = Buffer.alloc(8000); // minimal audio
    const result = await stt.transcribe(audioBuffer);

    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('confidence');
  });

  testFn('handles transcription errors gracefully', async () => {
    const result = await stt.transcribe(null);
    expect(result.text).toBeDefined();
    expect(result.confidence >= 0).toBe(true);
  });
});

describe('Call models', () => {
  test('creates call record with status', async () => {
    const callData = {
      campaignId: '507f1f77bcf86cd799439011',
      phoneNumber: '+919876543210',
      callSid: 'CA123',
      status: 'in-progress'
    };
    const call = new Call(callData);
    expect(call.phoneNumber).toBe('+919876543210');
    expect(call.status).toBe('in-progress');
  });

  test('creates transcript with entries', async () => {
    const transcriptData = {
      callId: '507f1f77bcf86cd799439011',
      entries: [
        { startMs: 0, endMs: 1000, speaker: 'customer', text: 'Hello', confidence: 0.95 },
        { startMs: 1000, endMs: 2500, speaker: 'agent', text: 'Hi there!', confidence: 1.0 }
      ],
      fullText: 'Hello. Hi there!'
    };
    const transcript = new Transcript(transcriptData);
    expect(transcript.entries.length).toBe(2);
    expect(transcript.entries[0].speaker).toBe('customer');
  });
});

const llm = require('../../src/services/llm');
const costControl = require('../../src/services/costControl');

// small smoke test; skip when running on CI unless an API key is present
const shouldRunLlm = !!process.env.OPENAI_API_KEY && !process.env.CI;
const testFn = shouldRunLlm ? test : test.skip;

testFn('generateReply falls back without API key', async () => {
  const resp = await llm.generateReply({ callState: {}, script: { defaultReply: 'OK', fallback: 'later' }, lastTranscript: 'hello' });
  expect(resp).toHaveProperty('speak');
  expect(typeof resp.speak).toBe('string');
});

test('outbound availability check handles yes quickly', async () => {
  const resp = await llm.generateReply({
    callState: { step: 'availability_check', direction: 'outbound' },
    lastTranscript: 'yes this is fine',
    language: 'en-IN',
    callDirection: 'outbound'
  });

  expect(resp.action).toBe('collect');
  expect(resp.nextStep).toBe('purpose');
  expect(resp.speak.toLowerCase()).toContain('buy');
});

test('outbound availability check handles no with callback ask', async () => {
  const resp = await llm.generateReply({
    callState: { step: 'availability_check', direction: 'outbound' },
    lastTranscript: 'no, call later',
    language: 'en-IN',
    callDirection: 'outbound'
  });

  expect(resp.action).toBe('collect');
  expect(resp.nextStep).toBe('reschedule_time');
});

test('cost tracker exposes per-minute burn rate', () => {
  const sid = `test-cost-${Date.now()}`;
  costControl.trackCall(sid);
  costControl.addTtsUsage(sid, 1500);
  const burnRate = costControl.getEstimatedBurnRatePerMin(sid);
  expect(burnRate).toBeGreaterThan(0);
  costControl.endCallTracking(sid);
});

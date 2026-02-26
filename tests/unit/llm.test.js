const llm = require('../../src/services/llm');

// small smoke test; skip when running on CI unless an API key is present
const shouldRunLlm = !!process.env.OPENAI_API_KEY && !process.env.CI;
const testFn = shouldRunLlm ? test : test.skip;

testFn('generateReply falls back without API key', async () => {
  const resp = await llm.generateReply({ callState: {}, script: { defaultReply: 'OK', fallback: 'later' }, lastTranscript: 'hello' });
  expect(resp).toHaveProperty('speak');
  expect(typeof resp.speak).toBe('string');
});

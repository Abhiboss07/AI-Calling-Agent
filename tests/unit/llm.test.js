const llm = require('../../src/services/llm');

test('generateReply falls back without API key', async () => {
  const resp = await llm.generateReply({ callState: {}, script: { defaultReply: 'OK', fallback: 'later' }, lastTranscript: 'hello' });
  expect(resp).toHaveProperty('speak');
  expect(typeof resp.speak).toBe('string');
});

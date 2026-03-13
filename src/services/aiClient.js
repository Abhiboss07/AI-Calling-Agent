/**
 * AI Provider selector.
 * Set AI_PROVIDER=gemini in .env to use Gemini API.
 * Default: openai
 *
 * Both clients expose identical interfaces:
 *   transcribeAudio, chatCompletion, chatCompletionStream,
 *   ttsSynthesize, ttsSynthesizeStream, validateApiKey
 */
const config = require('../config');

if (config.aiProvider === 'gemini') {
  module.exports = require('./geminiClient');
} else {
  module.exports = require('./openaiClient');
}

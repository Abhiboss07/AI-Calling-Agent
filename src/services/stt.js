const openai = require('./openaiClient');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

async function transcribe(buffer, mime='audio/wav'){
  try{
    const resp = await openai.transcribeAudio(buffer, mime);
    // resp expected to have .text
    return { text: resp.text || '', confidence: resp?.segments ? resp.segments[0]?.confidence || 0 : 0 };
  }catch(err){
    logger.error('STT error', err.message || err);
    // fallback
    return { text: '(transcription failed)', confidence: 0 };
  }
}

module.exports = { transcribe };

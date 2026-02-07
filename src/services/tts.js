const openai = require('./openaiClient');
const storage = require('./storage');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

async function synthesizeAndUpload(text){
  try{
    const audioBuffer = await openai.ttsSynthesize(text, 'alloy');
    const key = `tts/${Date.now()}-${uuidv4()}.mp3`;
    const url = await storage.uploadBuffer(Buffer.from(audioBuffer), key, 'audio/mpeg');
    return url;
  }catch(err){
    logger.error('TTS error', err.message||err);
    // Fallback to a simple Twilio-friendly short phrase hosted placeholder
    return `https://example.com/tts/fallback.mp3`;
  }
}

module.exports = { synthesizeAndUpload };

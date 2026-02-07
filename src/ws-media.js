const expressWs = require('express-ws');
const logger = require('./utils/logger');
const stt = require('./services/stt');
const llm = require('./services/llm');
const tts = require('./services/tts');
const twilioClient = require('./services/twilioClient');
const Call = require('./models/call.model');
const Transcript = require('./models/transcript.model');
const { isSpeech } = require('./utils/vad');

// This module exports a function that sets up a WebSocket route on the provided express app
module.exports = function setupWs(app) {
  // express-ws must be already initialized in server.js
  app.ws('/stream', async function (ws, req) {
    logger.log('WS: media stream connected');

    let callSid = null;
    let buffer = [];

    ws.on('message', async (msgStr) => {
      try {
        const msg = JSON.parse(msgStr);
        if (msg.event === 'start') {
          callSid = msg.start?.callSid || null;
          logger.log('Stream start for', callSid);
        } else if (msg.event === 'media') {
          const payload = msg.media?.payload; // base64 audio
          // Decode and lightweight VAD
          const audioBytes = Buffer.from(payload, 'base64');
          // For now: push raw bytes; production: decode PCM frames
          buffer.push(audioBytes);
          // Simple heuristic: when buffer > threshold, send to STT
          if (buffer.length >= 6) {
            const utterance = Buffer.concat(buffer);
            buffer = [];
            // call STT
            const sttResult = await stt.transcribe(utterance);
            logger.log('STT result', sttResult.text);
            // persist transcript fragment
            if (callSid) {
              const call = await Call.findOne({ callSid });
              if (call) {
                await Transcript.create({ callId: call._id, entries: [{ startMs: 0, endMs: 0, speaker: 'customer', text: sttResult.text, confidence: sttResult.confidence }], fullText: sttResult.text });
              }
            }
            // LLM generate reply using configured script stub
            const reply = await llm.generateReply({ callState: {}, script: { defaultReply: 'Thanks, goodbye.', fallback: 'I will call back later.' }, lastTranscript: sttResult.text });
            const audioUrl = await tts.synthesizeAndUpload(reply.speak);
            // Instruct Twilio to play
            if (callSid && audioUrl) {
              await twilioClient.playAudio(callSid, audioUrl).catch(err => logger.error('playAudio error', err));
            }
          }
        } else if (msg.event === 'stop') {
          logger.log('Stream stop', msg);
          ws.close();
        }
      } catch (err) {
        logger.error('WS message handler error', err);
      }
    });

    ws.on('close', () => {
      logger.log('WS closed for', callSid);
    });
  });
};

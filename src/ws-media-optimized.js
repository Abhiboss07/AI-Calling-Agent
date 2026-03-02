/**
 * Optimized WebSocket Media Handler (Strict FSM Edition)
 * Fixed for exact specification:
 * - 8000Hz PCM 16-bit
 * - 1.2s silence = end of user sentence
 * - 15s silence = reprompt
 * - 30s silence = hangup
 * - Strict FSM state tracking and non-closing WS handling
 */

const logger = require('./utils/logger');
const stt = require('./services/stt');
const llm = require('./services/llm');
const tts = require('./services/tts');
const vobizClient = require('./services/vobizClient');
const Call = require('./models/call.model');
const Lead = require('./models/lead.model');
const Transcript = require('./models/transcript.model');
const metrics = require('./services/metrics');
const costControl = require('./services/costControlOptimized');
const { ConversationFSM } = require('./services/conversationFSM');
const config = require('./config');
const { getLanguage } = require('./config/languages');

// Constants
const VAD_THRESHOLD = 0.08; // Base silence detection threshold
const AUDIO_SAMPLE_RATE = 8000;
const BYTES_PER_MS = AUDIO_SAMPLE_RATE * 2 / 1000; // 16 bytes per ms for 16-bit PCM

const TIMING_CONSTANTS = {
  USER_SPEECH_END_MS: 1200, // 1.2s silence ends user sentence
  SILENCE_REPROMPT_MS: 15000, // 15s
  SILENCE_HANGUP_MS: 30000, // 30s
  MAX_CALL_DURATION_MS: config.callMaxMinutes * 60 * 1000
};

// MULAW Decoder
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
  const fileSize = 36 + dataSize;

  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
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

const sessions = new Map();

class StrictCallSession {
  constructor(callUuid, callerNumber, streamSid, language, direction) {
    this.callSid = callUuid;
    this.callerNumber = callerNumber;
    this.streamSid = streamSid;
    this.language = language || 'en-IN';
    this.direction = direction || 'inbound';

    // Exact strict object required by spec
    this.callState = {
      stage: "intro", // intro, listen, process, speak, end
      silenceCount: 0,
      isUserSpeaking: false,
      speechBuffer: [] // Array of PCM chunks
    };

    this.fsm = new ConversationFSM(this.callSid, this.direction, this.language, {
      companyName: config.companyName,
      agentName: config.agentName
    });

    this.transcriptEntries = [];
    this.startTime = Date.now();
    this.lastVoiceDetectedAt = Date.now();
    this.lastSilencePromptAt = Date.now();

    this.audioOutputQueue = []; // Queued playback TTS buffers
    this.isOutputStreaming = false;
    this.activePipelines = 0;

    this.wsRef = null;
    this.timers = {
      utteranceTimeout: null,
      repromptTimeout: null,
      hangupTimeout: null,
      maxCallTimeout: null
    };
  }

  // Complete reset of input speech buffers
  resetInputBuffer() {
    this.callState.speechBuffer = [];
    this.callState.isUserSpeaking = false;
  }
}

async function sendRawAudioToWS(session, ws, mulawBuffer) {
  if (!session || ws.readyState !== 1) return;

  session.audioOutputQueue.push(mulawBuffer);

  if (!session.isOutputStreaming) {
    session.isOutputStreaming = true;

    // We do NOT allow barge-in during the agent's stage==="intro" phase according to spec.

    while (session.audioOutputQueue.length > 0 && ws.readyState === 1 && !session.abortedOutput) {
      const chunk = session.audioOutputQueue.shift();
      const msg = JSON.stringify({
        event: 'playAudio',
        streamSid: session.streamSid,
        contentType: 'audio/x-mulaw',
        sampleRate: 8000,
        media: {
          streamSid: session.streamSid,
          contentType: 'audio/x-mulaw',
          sampleRate: 8000,
          payload: chunk.toString('base64')
        }
      });

      try {
        ws.send(msg);
      } catch (err) { break; }

      // Calculate how long this audio takes to play, and wait
      const durationMs = (chunk.length / 8000) * 1000;
      await new Promise(r => setTimeout(r, Math.max(0, durationMs - 10)));
    }

    session.isOutputStreaming = false;
    session.abortedOutput = false;

    // If we just finished speaking (and it wasn't aborted midway), go back to listening mode
    if (session.callState.stage === 'speak' || session.callState.stage === 'intro') {
      session.callState.stage = 'listen';
      resetSilenceTimers(session, ws);
    }
  }
}

function processIncomingAudio(session, ws, mulawBytes, pcmChunk) {
  // If we are currently speaking, do we allow barge-in?
  // Spec: "Ensure greeting plays fully before STT starts" (no barge-in during intro).
  // If we are actively speaking other lines, we handle standard barge-in.
  const isSpeaking = session.callState.stage === 'speak' || session.callState.stage === 'intro';
  const rms = computeRms(pcmChunk);
  const userHasVoice = rms > VAD_THRESHOLD;

  if (isSpeaking) {
    if (session.callState.stage === 'intro') {
      return; // Completely ignore all incoming audio until intro finished
    }

    // Barge-in check during standard conversation playback
    if (userHasVoice && rms > (VAD_THRESHOLD + 0.12)) {
      session.abortedOutput = true;
      session.audioOutputQueue = [];
      try { ws.send(JSON.stringify({ event: 'clearAudio' })); } catch (e) { }
      session.callState.stage = 'listen';
      session.activePipelines++; // invalidates ongoing TTS streams
    } else {
      return; // Wait for current utterance to finish
    }
  }

  // Not speaking (stage is 'listen' or 'process')
  if (userHasVoice) {
    session.callState.isUserSpeaking = true;
    session.lastVoiceDetectedAt = Date.now();
    session.callState.speechBuffer.push(pcmChunk);

    // Reset silence reprompt and hangup timers since user is actively talking
    resetSilenceTimers(session, ws);

    // Setup the 1.2s timeout for utterance completion
    clearTimeout(session.timers.utteranceTimeout);
    session.timers.utteranceTimeout = setTimeout(() => {
      if (session.callState.speechBuffer.length > 0) {
        triggerSTTPipeline(session, ws);
      }
    }, TIMING_CONSTANTS.USER_SPEECH_END_MS);
  } else if (session.callState.isUserSpeaking) {
    // Collecting trailing silence into buffer just to pad STT softly
    session.callState.speechBuffer.push(pcmChunk);
  }
}

async function triggerSTTPipeline(session, ws) {
  if (session.callState.speechBuffer.length === 0) return;
  if (session.callState.stage === 'process') {
    logger.debug('Ignoring speech snippet: pipeline busy');
    session.resetInputBuffer();
    return; // Busy 
  }

  session.callState.stage = 'process';

  const fullPcm = Buffer.concat(session.callState.speechBuffer);
  session.resetInputBuffer(); // Memory leak safety explicitly declared in spec
  clearTimeout(session.timers.utteranceTimeout);

  const audioDurationSec = Math.max(0, fullPcm.length) / 16000;

  // If audio is way too short, likely noise, go back to listen mode
  if (audioDurationSec < 0.4) {
    session.callState.stage = 'listen';
    return;
  }

  const wavBuffer = buildWavBuffer(fullPcm);
  const pipelineId = ++session.activePipelines;

  try {
    const sttResult = await stt.transcribe(wavBuffer, session.callSid, 'audio/wav', session.language);

    // If we got interrupted or a new pipeline started during STT
    if (pipelineId !== session.activePipelines || !sttResult?.text) {
      session.callState.stage = 'listen';
      return;
    }

    logger.log(`[STT] "${sttResult.text}"`);
    session.transcriptEntries.push({
      startMs: session.lastVoiceDetectedAt - session.startTime,
      endMs: Date.now() - session.startTime,
      speaker: 'customer',
      text: sttResult.text,
      confidence: sttResult.confidence || 1.0
    });

    // Pass STT result to FSM & LLM
    const fsmContext = session.fsm.processTranscript(sttResult.text);
    logger.debug(`[Context] State updated to ${session.fsm.getState()}`);

    session.callState.stage = 'speak';
    session.callState.silenceCount = 0; // successfully heard something

    // Fire LLM Generator Stream
    const replyStream = llm.generateReplyStream({
      callState: session.fsm.getLLMContext(),
      script: { companyName: config.companyName },
      lastTranscript: sttResult.text,
      customerName: session.fsm.leadData.name || session.callerNumber || 'there',
      callSid: session.callSid,
      language: session.language,
      callDirection: session.direction,
      honorific: session.fsm.leadData.honorific || 'sir_maam'
    });

    let fullSentence = '';
    let finalAction = null;
    let isFirstSentence = true;

    for await (const chunk of replyStream) {
      if (pipelineId !== session.activePipelines) break; // Interrupted

      if (chunk.type === 'sentence') {
        fullSentence += chunk.text + ' ';
        const ttsStream = tts.synthesizeStream(chunk.text, session.callSid, session.language);

        // Send each chunk produced directly to websocket output queue
        (async () => {
          for await (const mulawChunk of ttsStream) {
            if (pipelineId === session.activePipelines) {
              await sendRawAudioToWS(session, ws, mulawChunk);
            }
          }
        })();
        isFirstSentence = false;
      } else {
        finalAction = chunk.action;
      }
    }

    session.transcriptEntries.push({
      startMs: Date.now() - session.startTime,
      endMs: Date.now() - session.startTime + 100,
      speaker: 'agent',
      text: fullSentence.trim(),
      confidence: 1.0
    });

    if (finalAction === 'hangup' || finalAction === 'escalate') {
      await endCall(session, ws, finalAction === 'escalate' ? "Please wait while I connect you." : null);
    }

  } catch (e) {
    logger.error('Pipeline error', e);
    session.callState.stage = 'listen';
  }
}

function resetSilenceTimers(session, ws) {
  clearTimeout(session.timers.repromptTimeout);
  clearTimeout(session.timers.hangupTimeout);

  if (session.callState.stage !== 'listen') return;

  session.timers.repromptTimeout = setTimeout(async () => {
    if (session.callState.stage !== 'listen') return; // State changed

    session.callState.silenceCount++;
    logger.log(`15s reprompt trigger (count=${session.callState.silenceCount})`);

    const promptMsg = getLanguage(session.language).silencePrompt || "Are you still there?";
    session.callState.stage = 'speak';

    try {
      const cached = await tts.synthesizeRaw(promptMsg, session.callSid, session.language);
      if (cached?.mulawBuffer) {
        await sendRawAudioToWS(session, ws, cached.mulawBuffer);
      } else {
        session.callState.stage = 'listen'; // failed TTS
        resetSilenceTimers(session, ws);
      }
    } catch (e) { session.callState.stage = 'listen'; }

  }, TIMING_CONSTANTS.SILENCE_REPROMPT_MS);

  session.timers.hangupTimeout = setTimeout(async () => {
    logger.warn('30s continuous silence detected. Hanging up.');
    await endCall(session, ws, getLanguage(session.language).farewell);
  }, TIMING_CONSTANTS.SILENCE_HANGUP_MS);
}

// Ensure the first intro gets triggered exactly ONCE properly formatted
async function deliverAgentIntro(session, ws) {
  if (session.callState.stage !== 'intro') return;

  // As explicitly requested: "Hello, this is [AI] calling from [COMPANY]. Is this a good time to talk?"
  const introText = session.fsm.getIntroText();
  logger.log(`[INTRO] Generated intro: ${introText}`);

  try {
    const ttsStream = tts.synthesizeStream(introText, session.callSid, session.language);
    for await (const mulawChunk of ttsStream) {
      if (ws.readyState === 1 && !session.abortedOutput) {
        await sendRawAudioToWS(session, ws, mulawChunk);
      }
    }
  } catch (e) {
    logger.error('Intro delivery failed', e);
    session.callState.stage = 'listen';
    resetSilenceTimers(session, ws);
  }
}

async function endCall(session, ws, optionalFarewellMsg = null) {
  if (session.callState.stage === 'end') return;
  session.callState.stage = 'end';

  // Clear all loops
  Object.values(session.timers).forEach(timer => clearTimeout(timer));

  if (optionalFarewellMsg && ws.readyState === 1) {
    try {
      const res = await tts.synthesizeRaw(optionalFarewellMsg, session.callSid, session.language);
      if (res?.mulawBuffer) {
        await sendRawAudioToWS(session, ws, res.mulawBuffer);
        await new Promise(r => setTimeout(r, 2000)); // allow trailing speech audio
      }
    } catch (e) { }
  }

  try {
    if (session.callSid) await vobizClient.endCall(session.callSid);
  } catch (e) { }

  // Finalize transcript
  try {
    if (session.transcriptEntries.length > 0) {
      const fullText = session.transcriptEntries.map(e => `${e.speaker}: ${e.text}`).join('\n');
      const call = await Call.findOne({ callSid: session.callSid });
      if (call) {
        call.status = 'completed';
        call.durationSec = Math.round((Date.now() - session.startTime) / 1000);
        await call.save();

        await Transcript.create({
          callId: call._id,
          entries: session.transcriptEntries,
          fullText,
          summary: fullText.substring(0, 500)
        });
      }
    }
  } catch (e) { logger.error('Finalize error', e); }

  sessions.delete(session.callSid);
  llm.clearHistory(session.callSid);
}

module.exports = function setupWs(app) {
  app.ws('/stream', function (ws, req) {
    let session = null;

    ws.on('message', async (msgStr) => {
      try {
        if (Buffer.isBuffer(msgStr)) {
          if (!session) return;
          const pcmChunk = mulawToPcm16(msgStr);
          processIncomingAudio(session, ws, msgStr, pcmChunk);
          return;
        }

        const msg = JSON.parse(msgStr);

        if (msg.event === 'start' || msg.event === 'streamStart') {
          const callUuid = msg.start?.callSid || msg.start?.callUuid || req.query?.callUuid;
          const callerNumber = req.query?.callerNumber;
          const streamSid = msg.streamSid || msg.start?.streamSid || msg.stream_id || `stream_${Date.now()}`;
          const lang = req.query?.language || 'en-IN';
          const dir = req.query?.direction || 'inbound';

          if (!sessions.has(callUuid)) {
            session = new StrictCallSession(callUuid, callerNumber, streamSid, lang, dir);
            sessions.set(callUuid, session);

            // Setup maximum call duration boundary
            session.timers.maxCallTimeout = setTimeout(() => {
              endCall(session, ws, getLanguage(lang).farewell);
            }, TIMING_CONSTANTS.MAX_CALL_DURATION_MS);

            // Immediate zero-delay execution of introduction
            deliverAgentIntro(session, ws).catch(e => logger.error('Intro fail', e));
          } else {
            session = sessions.get(callUuid);
            session.streamSid = streamSid;
            session.wsRef = ws;
          }
          return;
        }

        if (msg.event === 'media' || msg.event === 'audio') {
          if (!session) return;
          const payload = msg.media?.payload || msg.payload;
          if (!payload) return;
          const mulawBytes = Buffer.from(payload, 'base64');
          const pcmChunk = mulawToPcm16(mulawBytes);
          processIncomingAudio(session, ws, mulawBytes, pcmChunk);
          return;
        }

        if (msg.event === 'stop') {
          if (session) await endCall(session, ws);
          return;
        }

      } catch (e) { /* ignore JSON parse err on binary */ }
    });

    ws.on('close', async () => {
      if (session) await endCall(session, ws);
    });

    ws.on('error', () => {
      if (session) endCall(session, ws);
    });
  });
};

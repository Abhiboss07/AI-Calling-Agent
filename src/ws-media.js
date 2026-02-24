const logger = require('./utils/logger');
const stt = require('./services/stt');
const llm = require('./services/llm');
const tts = require('./services/tts');
const vobizClient = require('./services/vobizClient');
const Call = require('./models/call.model');
const Lead = require('./models/lead.model');
const Transcript = require('./models/transcript.model');
const config = require('./config');
const metrics = require('./services/metrics');
const costControl = require('./services/costControl');
const { retry } = require('./utils/retry');
const { getLanguage } = require('./config/languages');

// ══════════════════════════════════════════════════════════════════════════════
// MULAW ↔ PCM CONVERSION (Vobiz streams µ-law 8kHz, Whisper needs PCM/WAV)
// ══════════════════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════════════════
// PCM → µ-law ENCODING (for sending audio BACK through bidirectional stream)
// ══════════════════════════════════════════════════════════════════════════════
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
  const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xFF;
  return mulawByte;
}

function pcmBufferToMulaw(pcmBuffer) {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const mulaw = Buffer.alloc(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    mulaw[i] = pcm16ToMulaw(sample);
  }
  return mulaw;
}

// ══════════════════════════════════════════════════════════════════════════════
// RMS-based Voice Activity Detection on PCM samples
// ══════════════════════════════════════════════════════════════════════════════
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

const VAD_THRESHOLD = config.pipeline.vadThreshold;

// ══════════════════════════════════════════════════════════════════════════════
// PER-CALL SESSION STATE
// ══════════════════════════════════════════════════════════════════════════════
class CallSession {
  constructor(callUuid, callerNumber, language) {
    this.callSid = callUuid;     // Unified field name (used throughout DB and session)
    this.callUuid = callUuid;    // Vobiz-specific alias
    this.callerNumber = callerNumber;
    this.streamSid = null;       // Vobiz stream ID
    this.language = language || config.language?.default || 'en-IN';

    // Audio buffering
    this.audioChunks = [];
    this.pcmBuffer = [];
    this.totalPcmBytes = 0;

    // Pipeline state
    this.isProcessing = false;
    this.currentPipelineId = 0;
    this.lastPipelineId = 0;

    // Conversation state
    this.callState = { step: 'greeting', turnCount: 0, silenceCount: 0 };
    this.transcriptEntries = [];
    this.leadData = {};
    this.qualityScore = 0;

    // Timing
    this.startTime = Date.now();
    this.lastVoiceActivityAt = Date.now();
    this.silenceTimer = null;
    this.maxDurationTimer = null;

    // Audio state
    this.isSpeaking = false;
    this.speechStartedAt = 0;
    this.speechChunkCount = 0;
    this.silentChunkCount = 0;

    // Playback state
    this.isPlaying = false;

    // Guards
    this._finalized = false;
    this._ended = false;
    this._lastPong = Date.now();
  }
}

const sessions = new Map();

// ── Tuning Constants ──────────────────────────────────────────────────────────
const SPEECH_START_CHUNKS = config.pipeline.speechStartChunks;
const SPEECH_END_CHUNKS = config.pipeline.speechEndChunks;
const MIN_UTTERANCE_BYTES = config.pipeline.minUtteranceBytes;
const MAX_BUFFER_BYTES = config.pipeline.maxBufferBytes;
const SILENCE_PROMPT_MS = config.pipeline.silencePromptMs;
const MAX_CALL_MS = config.callMaxMinutes * 60 * 1000;
const WS_PING_INTERVAL = config.pipeline.wsPingIntervalMs;

// Chunk size for streaming audio back over WebSocket
// Vobiz expects 20ms chunks at 8kHz = 160 bytes of µ-law
const PLAYBACK_CHUNK_SIZE = config.pipeline.playbackChunkSize;
const PLAYBACK_CHUNK_INTERVAL_MS = config.pipeline.playbackChunkIntervalMs;

// ══════════════════════════════════════════════════════════════════════════════
// SEND AUDIO THROUGH BIDIRECTIONAL STREAM (VOBIZ FORMAT)
// ══════════════════════════════════════════════════════════════════════════════
// Vobiz bidirectional stream: We send audio back by writing JSON 'playAudio'
// events to the WebSocket. The format is:
// { "event": "playAudio", "media": { "contentType": "audio/x-mulaw;rate=8000", "payload": "<base64>" } }
//
async function sendAudioThroughStream(session, ws, mulawBuffer) {
  if (!session.streamSid || ws.readyState !== 1) return;

  session.isPlaying = true;
  // Use a separate playback counter so we don't invalidate pipeline checks
  session._playbackId = (session._playbackId || 0) + 1;
  const playbackId = session._playbackId;

  // Clear any previously queued audio first
  try {
    ws.send(JSON.stringify({ event: 'clearAudio' }));
  } catch (e) { /* ignore */ }

  // Send in 20ms chunks (160 bytes of µ-law at 8kHz)
  // Batch 10 chunks at a time (200ms of audio) then yield to event loop
  const totalChunks = Math.ceil(mulawBuffer.length / PLAYBACK_CHUNK_SIZE);
  const BATCH_SIZE = 10;

  for (let i = 0; i < totalChunks; i++) {
    if (ws.readyState !== 1 || !session.isPlaying || session._playbackId !== playbackId) {
      logger.debug('Playback interrupted at chunk', i, 'of', totalChunks);
      break;
    }

    const start = i * PLAYBACK_CHUNK_SIZE;
    const end = Math.min(start + PLAYBACK_CHUNK_SIZE, mulawBuffer.length);
    const chunk = mulawBuffer.slice(start, end);

    const msg = JSON.stringify({
      event: 'playAudio',
      media: {
        contentType: 'audio/x-mulaw;rate=8000',
        payload: chunk.toString('base64')
      }
    });

    try {
      ws.send(msg);
    } catch (err) {
      logger.warn('Stream send error', err.message);
      break;
    }

    if ((i + 1) % BATCH_SIZE === 0 && i + 1 < totalChunks) {
      await new Promise(r => setImmediate(r));
    }
  }

  // Send a checkpoint event so we know when Vobiz finishes playing the audio
  try {
    ws.send(JSON.stringify({
      event: 'checkpoint',
      name: `speech_${Date.now()}`
    }));
  } catch (e) { /* ignore */ }

  session.isPlaying = false;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN WEBSOCKET HANDLER
// ══════════════════════════════════════════════════════════════════════════════
module.exports = function setupWs(app) {
  app.ws('/stream', function (ws, req) {
    let session = null;
    let pingInterval = null;

    // Extract parameters from query string (passed from Vobiz XML <Stream>)
    const queryCallUuid = req.query?.callUuid;
    const queryCallerNumber = req.query?.callerNumber || '';
    const queryLanguage = req.query?.language || config.language?.default || 'en-IN';

    // ── WebSocket Heartbeat (detect stale connections) ─────────────────────
    pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        if (session && Date.now() - session._lastPong > WS_PING_INTERVAL * 3) {
          logger.warn('WebSocket pong timeout, closing stale connection', session.callSid);
          ws.close(1001, 'Pong timeout');
          clearInterval(pingInterval);
          return;
        }
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, WS_PING_INTERVAL);

    ws.on('pong', () => {
      if (session) session._lastPong = Date.now();
    });

    // ── Message handler ───────────────────────────────────────────────────
    ws.on('message', async (msgStr) => {
      try {
        // Vobiz sends binary audio data and text JSON control messages
        if (Buffer.isBuffer(msgStr)) {
          // Binary frame = raw µ-law audio from caller
          if (!session) return;

          const mulawBytes = msgStr;
          const pcmChunk = mulawToPcm16(mulawBytes);
          const rms = computeRms(pcmChunk);
          const hasVoice = rms > VAD_THRESHOLD;

          processAudioChunk(session, ws, mulawBytes, pcmChunk, hasVoice);
          return;
        }

        const msg = JSON.parse(msgStr);

        // ── CONNECTED event ─────────────────────────────────────────────
        if (msg.event === 'connected') {
          logger.log('WS: connected', msg.protocol);
          return;
        }

        // ── START event — initialize session ────────────────────────────
        if (msg.event === 'start') {
          const callUuid = msg.start?.callSid || msg.start?.callUuid || queryCallUuid;
          const callerNumber = msg.start?.customParameters?.callerNumber || queryCallerNumber;
          const streamSid = msg.streamSid || msg.start?.streamId || `stream_${Date.now()}`;
          const language = msg.start?.customParameters?.language || queryLanguage;

          if (!callUuid) {
            logger.error('WS start event missing required fields', { callUuid, streamSid });
            ws.close(1003, 'Missing required parameters');
            return;
          }

          session = new CallSession(callUuid, callerNumber, language);
          session.streamSid = streamSid;
          sessions.set(callUuid, session);
          costControl.trackCall(callUuid);

          logger.log('📞 Stream started', { callUuid, callerNumber, streamSid, language });

          // Max call duration safety
          session.maxDurationTimer = setTimeout(async () => {
            const langConfig = getLanguage(session.language);
            logger.warn('⏰ Max call duration reached', callUuid);
            await endCallGracefully(session, ws, langConfig.farewell);
          }, MAX_CALL_MS);

          // Deliver the initial greeting via the bidirectional stream
          deliverInitialGreeting(session, ws);

          return;
        }

        // ── MEDIA event — JSON-wrapped audio chunks ─────────────────────
        if (msg.event === 'media' && session) {
          const payload = msg.media?.payload;
          if (!payload) return;

          const mulawBytes = Buffer.from(payload, 'base64');
          const pcmChunk = mulawToPcm16(mulawBytes);
          const rms = computeRms(pcmChunk);
          const hasVoice = rms > VAD_THRESHOLD;

          processAudioChunk(session, ws, mulawBytes, pcmChunk, hasVoice);
          return;
        }

        // ── STOP event ──────────────────────────────────────────────────
        if (msg.event === 'stop') {
          logger.log('🛑 Stream stop received', session?.callSid);
          await cleanupSession(session, ws, pingInterval);
          return;
        }

        // ── CHECKPOINT / MARK event (audio playback completed) ──────────
        if (msg.event === 'checkpoint' || msg.event === 'mark' || msg.event === 'playedStream') {
          logger.debug('✅ Audio checkpoint reached', msg.name || msg.mark?.name);
          return;
        }

        // ── CLEARED AUDIO event ─────────────────────────────────────────
        if (msg.event === 'clearedAudio') {
          logger.debug('🔇 Audio cleared');
          return;
        }

      } catch (err) {
        logger.error('WS message handler error', err.message || err);
        metrics.incrementWsError();

        if (ws.readyState === ws.OPEN) {
          try {
            ws.send(JSON.stringify({ event: 'error', error: 'Internal processing error' }));
          } catch (e) { /* ignore send failure */ }
        }
      }
    });

    // ── WebSocket close ─────────────────────────────────────────────────
    ws.on('close', async (code, reason) => {
      const reasonStr = reason?.toString();
      logger.log('WS closed', { callSid: session?.callSid, code, reason: reasonStr });

      if (code === 1000) {
        metrics.incrementWsDisconnect('normal');
      } else if (code >= 1001 && code <= 1003) {
        metrics.incrementWsDisconnect('error');
        logger.warn('Abnormal WebSocket close', { callSid: session?.callSid, code, reason: reasonStr });
      } else {
        metrics.incrementWsDisconnect('unknown');
      }

      await cleanupSession(session, ws, pingInterval);
    });

    ws.on('error', (err) => {
      logger.error('WS error', session?.callSid, err.message);
      metrics.incrementWsError();
    });
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// PROCESS AUDIO CHUNK — Shared logic for both binary and JSON media
// ══════════════════════════════════════════════════════════════════════════════
function processAudioChunk(session, ws, mulawBytes, pcmChunk, hasVoice) {
  if (hasVoice) {
    session.speechChunkCount++;
    session.silentChunkCount = 0;
    session.lastVoiceActivityAt = Date.now();

    // If agent is currently playing audio and user starts speaking → interrupt
    if (session.isPlaying) {
      logger.log('🔇 User interrupted agent playback', session.callSid);
      try {
        ws.send(JSON.stringify({ event: 'clearAudio' }));
      } catch (e) { /* ignore */ }
      session.isPlaying = false;
      metrics.incrementInterrupt();
    }

    if (!session.isSpeaking && session.speechChunkCount >= SPEECH_START_CHUNKS) {
      session.isSpeaking = true;
      session.speechStartedAt = Date.now();
      session.callState.silenceCount = 0;
      logger.debug('🎤 Speech started', session.callSid);
      clearTimeout(session.silenceTimer);
    }

    if (session.isSpeaking) {
      session.audioChunks.push(mulawBytes);
      session.pcmBuffer.push(pcmChunk);
      session.totalPcmBytes += pcmChunk.length;

      if (session.totalPcmBytes > MAX_BUFFER_BYTES) {
        logger.warn('Buffer overflow, forcing processing', session.callSid);
        metrics.incrementBufferOverflow();
        triggerProcessing(session, ws);
      }
    }

  } else {
    session.silentChunkCount++;
    session.speechChunkCount = 0;

    if (session.isSpeaking && session.silentChunkCount >= SPEECH_END_CHUNKS) {
      session.isSpeaking = false;
      logger.debug('🔇 Speech ended', session.callSid, session.totalPcmBytes, 'bytes');

      if (session.totalPcmBytes >= MIN_UTTERANCE_BYTES) {
        triggerProcessing(session, ws);
      } else {
        clearBuffers(session);
      }

      startSilenceTimer(session, ws);
    }

    if (!session.isSpeaking && !session.silenceTimer) {
      startSilenceTimer(session, ws);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INITIAL GREETING (via bidirectional stream — sends µ-law audio directly)
// ══════════════════════════════════════════════════════════════════════════════
async function deliverInitialGreeting(session, ws) {
  try {
    const langConfig = getLanguage(session.language);
    const greetingText = `${langConfig.greeting.substring(0, 5)} ${config.agentName} from ${config.companyName}. ${langConfig.greeting}`;

    // Synthesize → get raw µ-law buffer for direct stream playback
    const ttsResult = await tts.synthesizeRaw(greetingText, session.callSid, session.language);

    if (ttsResult && ttsResult.mulawBuffer && ws.readyState === 1) {
      await sendAudioThroughStream(session, ws, ttsResult.mulawBuffer);
    } else {
      logger.warn('TTS greeting failed — no audio delivered', session.callSid);
    }

    session.transcriptEntries.push({
      startMs: 0,
      endMs: 2000,
      speaker: 'agent',
      text: greetingText,
      confidence: 1
    });

    startSilenceTimer(session, ws);

  } catch (err) {
    logger.error('Initial greeting error', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TRIGGER PROCESSING (speech → STT → LLM → TTS → play through stream)
// ══════════════════════════════════════════════════════════════════════════════
function triggerProcessing(session, ws) {
  const pcmChunks = session.pcmBuffer.slice();
  const pipelineId = ++session.lastPipelineId;
  clearBuffers(session);

  if (session.isProcessing) {
    logger.log('🔄 Superseding previous pipeline', session.callSid, { old: session.currentPipelineId, new: pipelineId });
    metrics.incrementInterrupt();
  }

  session.isProcessing = true;
  session.currentPipelineId = pipelineId;

  processUtterance(session, pcmChunks, ws, pipelineId)
    .catch(err => logger.error('Pipeline error', session.callSid, err.message))
    .finally(() => {
      if (session.currentPipelineId === pipelineId && session.isProcessing) {
        session.isProcessing = false;
      }
    });
}

function clearBuffers(session) {
  session.audioChunks = [];
  session.pcmBuffer = [];
  session.totalPcmBytes = 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE: STT → LLM → TTS → PLAY (through bidirectional stream)
// ══════════════════════════════════════════════════════════════════════════════
async function processUtterance(session, pcmChunks, ws, pipelineId) {
  const pipelineStart = Date.now();

  // ── 1. Convert PCM to WAV for Whisper ─────────────────────────────────
  const pcmData = Buffer.concat(pcmChunks);
  const wavBuffer = buildWavBuffer(pcmData);

  // ── 2. Speech-to-Text (with language) ─────────────────────────────────
  const sttStart = Date.now();
  const sttResult = await stt.transcribe(wavBuffer, session.callSid, 'audio/wav', session.language);
  const sttLatency = Date.now() - sttStart;

  if (pipelineId !== session.lastPipelineId) {
    logger.log('Pipeline superseded after STT, discarding', { pipelineId, current: session.lastPipelineId });
    return;
  }

  if (sttResult.empty || !sttResult.text) {
    logger.debug('STT returned empty, skipping LLM');
    return;
  }

  logger.log(`🎯 STT (${sttLatency}ms):`, sttResult.text);
  session.callState.turnCount++;

  session.transcriptEntries.push({
    startMs: Date.now() - session.startTime - sttLatency,
    endMs: Date.now() - session.startTime,
    speaker: 'customer',
    text: sttResult.text,
    confidence: sttResult.confidence
  });

  // ── 3. LLM — Generate reply (with language) ──────────────────────────
  const llmStart = Date.now();
  const reply = await llm.generateReply({
    callState: session.callState,
    script: { companyName: config.companyName },
    lastTranscript: sttResult.text,
    customerName: session.leadData.name || session.callerNumber,
    callSid: session.callSid,
    language: session.language
  });
  const llmLatency = Date.now() - llmStart;

  if (pipelineId !== session.lastPipelineId) {
    logger.log('Pipeline superseded after LLM, discarding');
    return;
  }

  logger.log(`💬 LLM (${llmLatency}ms): "${reply.speak}" | action: ${reply.action}`);

  if (reply.nextStep) session.callState.step = reply.nextStep;
  updateLeadData(session, reply);

  session.transcriptEntries.push({
    startMs: Date.now() - session.startTime,
    endMs: Date.now() - session.startTime + 500,
    speaker: 'agent',
    text: reply.speak || '(no response)',
    confidence: 1
  });

  // ── 4. TTS → Send through bidirectional stream ────────────────────────
  if (reply.speak && ws.readyState === 1) {
    const ttsStart = Date.now();

    if (pipelineId !== session.lastPipelineId) {
      logger.log('Pipeline superseded before TTS, discarding');
      return;
    }

    // Synthesize to µ-law for direct stream playback
    const ttsResult = await tts.synthesizeRaw(reply.speak, session.callSid, session.language);
    const ttsLatency = Date.now() - ttsStart;

    if (pipelineId !== session.lastPipelineId) {
      logger.log('Pipeline superseded after TTS, discarding');
      return;
    }

    // Send audio through the WebSocket — pure AI, no REST fallback
    if (ttsResult && ttsResult.mulawBuffer) {
      await sendAudioThroughStream(session, ws, ttsResult.mulawBuffer);
    } else {
      logger.warn('TTS synthesis failed, skipping audio', session.callSid);
    }

    const totalLatency = Date.now() - pipelineStart;
    logger.log(`⚡ Pipeline latency: ${totalLatency}ms (STT:${sttLatency} LLM:${llmLatency} TTS:${ttsLatency})`);
    metrics.addPipelineLatency(sttLatency, llmLatency, ttsLatency);
  }

  // ── 5. Handle actions ─────────────────────────────────────────────────
  const langConfig = getLanguage(session.language);

  if (reply.action === 'hangup') {
    await endCallGracefully(session, ws, null);
  } else if (reply.action === 'escalate') {
    logger.log('🔀 ESCALATION for', session.callSid);
    await endCallGracefully(session, ws, 'Let me connect you with our property expert right away. Please hold.');
  } else if (reply.action === 'book_visit') {
    logger.log('📅 SITE VISIT BOOKED', session.callerNumber, session.leadData);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LEAD DATA EXTRACTION
// ══════════════════════════════════════════════════════════════════════════════
function updateLeadData(session, reply) {
  if (!reply.data) return;
  const d = reply.data;
  if (d.name) session.leadData.name = d.name;
  if (d.intent) session.leadData.intent = d.intent;
  if (d.propertyType) session.leadData.propertyType = d.propertyType;
  if (d.bhk) session.leadData.bhk = d.bhk;
  if (d.location) session.leadData.location = d.location;
  if (d.budget) session.leadData.budget = d.budget;
  if (d.timeline) session.leadData.timeline = d.timeline;
  if (d.siteVisitDate) session.leadData.siteVisitDate = d.siteVisitDate;
  if (d.objection) {
    session.leadData.objections = session.leadData.objections || [];
    if (session.leadData.objections.length < 10) {
      session.leadData.objections.push(d.objection);
    }
  }
  if (reply.qualityScore) {
    session.qualityScore = Math.max(session.qualityScore, reply.qualityScore);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SILENCE DETECTION
// ══════════════════════════════════════════════════════════════════════════════
function startSilenceTimer(session, ws) {
  clearTimeout(session.silenceTimer);

  session.silenceTimer = setTimeout(async () => {
    session.callState.silenceCount++;
    const langConfig = getLanguage(session.language);

    if (session.callState.silenceCount >= 2) {
      logger.log('🔇 Second silence, ending call', session.callSid);
      await endCallGracefully(session, ws, langConfig.farewell);
    } else {
      logger.log('🔇 First silence, prompting', session.callSid);

      try {
        if (ws.readyState === 1) {
          const ttsResult = await tts.synthesizeRaw(langConfig.silencePrompt, session.callSid, session.language);
          if (ttsResult && ttsResult.mulawBuffer) {
            await sendAudioThroughStream(session, ws, ttsResult.mulawBuffer);
          } else {
            logger.warn('Silence prompt TTS failed', session.callSid);
          }
        }
      } catch (err) {
        logger.error('Silence prompt error', err.message);
      }

      startSilenceTimer(session, ws);
    }
  }, SILENCE_PROMPT_MS);
}

// ══════════════════════════════════════════════════════════════════════════════
// END CALL GRACEFULLY
// ══════════════════════════════════════════════════════════════════════════════
async function endCallGracefully(session, ws, farewellText) {
  if (session._ended) return;
  session._ended = true;

  clearTimeout(session.silenceTimer);
  clearTimeout(session.maxDurationTimer);

  try {
    if (farewellText && ws.readyState === 1) {
      try {
        const ttsResult = await tts.synthesizeRaw(farewellText, session.callSid, session.language);
        if (ttsResult && ttsResult.mulawBuffer) {
          await sendAudioThroughStream(session, ws, ttsResult.mulawBuffer);
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        logger.warn('Farewell play failed', err.message);
      }
    }

    if (session.callSid) {
      await vobizClient.endCall(session.callSid).catch(e => logger.warn('End call API error', e.message));
    }
  } catch (err) {
    logger.error('Graceful end error', err.message);
  }

  // FIX: Clean up session from map to prevent leaks
  sessions.delete(session.callSid);
  llm.clearHistory(session.callSid);
  costControl.endCallTracking(session.callSid);

  await finalizeCall(session);
}

// ══════════════════════════════════════════════════════════════════════════════
// SESSION CLEANUP
// ══════════════════════════════════════════════════════════════════════════════
async function cleanupSession(session, ws, pingInterval) {
  clearInterval(pingInterval);

  if (!session) return;

  clearTimeout(session.silenceTimer);
  clearTimeout(session.maxDurationTimer);

  await finalizeCall(session);

  sessions.delete(session.callSid);
  llm.clearHistory(session.callSid);
  costControl.endCallTracking(session.callSid);
}

// ══════════════════════════════════════════════════════════════════════════════
// FINALIZE — Save transcript + lead + summary to DB
// ══════════════════════════════════════════════════════════════════════════════
async function finalizeCall(session) {
  if (!session || session._finalized) return;
  session._finalized = true;

  const callDuration = Math.round((Date.now() - session.startTime) / 1000);
  logger.log('📋 Finalizing call', {
    callSid: session.callSid,
    duration: `${callDuration}s`,
    turns: session.callState.turnCount,
    score: session.qualityScore,
    language: session.language
  });

  try {
    const call = session.callSid ? await retry(
      () => Call.findOne({ callSid: session.callSid }),
      { retries: 3, minDelay: 500, factor: 2 }
    ) : null;

    if (call) {
      call.durationSec = callDuration;
      call.endAt = new Date();
      call.status = 'completed';
      await retry(() => call.save(), { retries: 3, minDelay: 500, factor: 2 });
    }

    if (call && session.transcriptEntries.length > 0) {
      const fullText = session.transcriptEntries.map(e => `${e.speaker}: ${e.text}`).join('\n');

      let summary = fullText.substring(0, 2000);
      try {
        const summaryPromise = generateCallSummary(fullText, session.leadData);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Summary timeout')), 5000)
        );
        summary = await Promise.race([summaryPromise, timeoutPromise]);
      } catch (e) {
        logger.warn('Summary generation failed, using raw text', e.message);
      }

      await Transcript.create({
        callId: call._id,
        entries: session.transcriptEntries,
        fullText,
        summary
      });
      logger.log('✅ Transcript saved', session.callSid, session.transcriptEntries.length, 'entries');
    }

    if (session.callerNumber && Object.keys(session.leadData).length > 0) {
      const leadStatus = session.leadData.siteVisitDate ? 'site-visit-booked'
        : session.qualityScore >= 50 ? 'qualified'
          : session.qualityScore > 0 ? 'follow-up'
            : 'new';

      // FIX: reuse fullText from above instead of recomputing

      await Lead.findOneAndUpdate(
        { phoneNumber: session.callerNumber, callId: call?._id },
        {
          callId: call?._id,
          phoneNumber: session.callerNumber,
          name: session.leadData.name || '',
          budget: session.leadData.budget || '',
          propertyType: session.leadData.propertyType || 'unknown',
          location: session.leadData.location || '',
          intent: session.leadData.intent || 'unknown',
          timeline: session.leadData.timeline || '',
          bhk: session.leadData.bhk || '',
          qualityScore: session.qualityScore,
          status: leadStatus,
          siteVisitDate: session.leadData.siteVisitDate ? new Date(session.leadData.siteVisitDate) : null,
          conversationSummary: (session.transcriptEntries.map(e => `${e.speaker}: ${e.text}`).join('\n')).substring(0, 2000),
          objections: session.leadData.objections || [],
          source: 'ai-call'
        },
        { upsert: true, new: true }
      );

      logger.log('✅ Lead saved', { phone: session.callerNumber, score: session.qualityScore, status: leadStatus });
    }
  } catch (err) {
    logger.error('Finalize error', err.message, err.stack?.split('\n')[1]);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CALL SUMMARY GENERATION (post-call LLM)
// ══════════════════════════════════════════════════════════════════════════════
async function generateCallSummary(fullText, leadData) {
  const openai = require('./services/openaiClient');

  const resp = await openai.chatCompletion([
    {
      role: 'system',
      content: 'You are a call summary assistant. Given a real estate call transcript, generate a 2-3 sentence summary including: caller interest, property preferences, budget, and next steps. Be concise.'
    },
    {
      role: 'user',
      content: `Transcript:\n${fullText.substring(0, 2000)}\n\nLead data: ${JSON.stringify(leadData)}`
    }
  ], 'gpt-4o-mini', { max_tokens: 100, temperature: 0.2 });

  return resp.choices?.[0]?.message?.content || fullText.substring(0, 500);
}

// ══════════════════════════════════════════════════════════════════════════════
// PERIODIC MEMORY & MAP SIZE MONITORING
// ══════════════════════════════════════════════════════════════════════════════
setInterval(() => {
  const mem = process.memoryUsage();
  const info = {
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    sessionsCount: sessions.size
  };

  if (sessions.size > 0 || info.heapUsedMB > 200) {
    logger.debug('Resource monitor', info);
  }

  if (sessions.size > 100) {
    logger.warn('Suspicious sessions count — possible leak', sessions.size);
  }
}, 60000);

/**
 * Optimized WebSocket Media Handler
 * Fixes:
 * 1. Instant intro (≤1 second) via aggressive prewarming
 * 2. Proper barge-in with LLM cancellation
 * 3. FSM-based conversation flow
 * 4. Cost optimization with aggressive caching
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
const { ConversationFSM, States } = require('./services/conversationFSM');
const config = require('./config');
const { getLanguage } = require('./config/languages');

// MULAW ↔ PCM conversion tables
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

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

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

function pcmBufferToMulaw(pcmBuffer) {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const mulaw = Buffer.alloc(numSamples);

  for (let i = 0; i < numSamples; i++) {
    let sample = pcmBuffer.readInt16LE(i * 2);
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
    mulaw[i] = ~(sign | (exponent << 4) | mantissa) & 0xFF;
  }

  return mulaw;
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

// Tuning constants
const VAD_THRESHOLD = config.pipeline.vadThreshold;
const SPEECH_START_CHUNKS = config.pipeline.speechStartChunks;
const SPEECH_END_CHUNKS = config.pipeline.speechEndChunks;
const BARGE_IN_MIN_PLAYBACK_MS = config.pipeline.bargeInMinPlaybackMs;
const BARGE_IN_REQUIRED_CHUNKS = config.pipeline.bargeInRequiredChunks;
const BARGE_IN_RMS_MULTIPLIER = config.pipeline.bargeInRmsMultiplier;
const MIN_UTTERANCE_BYTES = config.pipeline.minUtteranceBytes;
const MAX_BUFFER_BYTES = config.pipeline.maxBufferBytes;
const SILENCE_PROMPT_MS = config.pipeline.silencePromptMs;
const MAX_CALL_MS = config.callMaxMinutes * 60 * 1000;
const PLAYBACK_CHUNK_SIZE = config.pipeline.playbackChunkSize || 160;
const PLAYBACK_CHUNK_INTERVAL_MS = config.pipeline.playbackChunkIntervalMs || 20;
const TARGET_COST_PER_MIN_RS = config.budget?.targetPerMinuteRs || 2;
const ECHO_COOLDOWN_MS = 1500;  // Discard audio for 1500ms after playback ends (Vobiz has no AEC)
const MAX_SPEECH_DURATION_MS = 8000; // Force processing after 8s of continuous speech
const NOISE_CALIBRATION_CHUNKS = 25; // ~500ms of audio to calibrate noise floor after cool-down

// Session management
const sessions = new Map();
const activePipelines = new Map(); // Track active LLM calls for cancellation

// ═════════════════════════════════════════════════════════════════════════════
// AGGRESSIVE PREWARMING - Critical for ≤1 second intro
// ═════════════════════════════════════════════════════════════════════════════

const greetingCache = new Map();
let _prewarmInitialized = false;

async function prewarmCriticalGreetings() {
  if (_prewarmInitialized) return;
  _prewarmInitialized = true;

  const phrases = [
    { lang: 'en-IN', dir: 'outbound', text: `Hello, this is ${config.agentName} from ${config.companyName}. Is this a good time to talk?` },
    { lang: 'en-IN', dir: 'inbound', text: `Hello, thank you for calling ${config.companyName}. How may I assist you today?` },
    { lang: 'hinglish', dir: 'outbound', text: `Hello, main ${config.agentName} ${config.companyName} se bol rahi hoon. Kya abhi baat karne ka sahi time hai?` },
    { lang: 'hinglish', dir: 'inbound', text: `Hello, ${config.companyName} ko call karne ke liye thanks. Main aapki kaise help kar sakti hoon?` },
    { lang: 'hi-IN', dir: 'outbound', text: `नमस्ते, मैं ${config.companyName} से ${config.agentName} बोल रही हूँ। क्या अभी बात करने का सही समय है?` },
    { lang: 'hi-IN', dir: 'inbound', text: `नमस्ते, ${config.companyName} में कॉल करने के लिए धन्यवाद। मैं आपकी कैसे मदद कर सकती हूँ?` }
  ];

  // Pre-generate all greetings in parallel
  const promises = phrases.map(async ({ lang, dir, text }) => {
    try {
      const key = `${lang}:${dir}`;
      const result = await tts.synthesizeRaw(text, null, lang);
      if (result?.mulawBuffer) {
        greetingCache.set(key, {
          text,
          buffer: result.mulawBuffer,
          timestamp: Date.now()
        });
        logger.log('Prewarmed greeting', { lang, dir, size: result.mulawBuffer.length });
      }
    } catch (e) {
      logger.warn('Failed to prewarm greeting', { lang, dir, error: e.message });
    }
  });

  await Promise.allSettled(promises);
}

// Start prewarming immediately on module load
prewarmCriticalGreetings();

// ═════════════════════════════════════════════════════════════════════════════
// ENHANCED CALL SESSION WITH FSM
// ═════════════════════════════════════════════════════════════════════════════

class EnhancedCallSession {
  constructor(callUuid, callerNumber, language, direction = 'inbound') {
    this.callSid = callUuid;
    this.callUuid = callUuid;
    this.callerNumber = callerNumber;
    this.streamSid = null;
    this.language = this.normalizeLanguageCode(language);
    this.direction = direction;

    // Initialize FSM
    this.fsm = new ConversationFSM(callUuid, direction, this.language, {
      companyName: config.companyName,
      agentName: config.agentName
    });

    // Audio buffering
    this.audioChunks = [];
    this.pcmBuffer = [];
    this.totalPcmBytes = 0;
    this.preSpeechMulaw = [];
    this.preSpeechPcm = [];
    this.preSpeechBytes = 0;
    this.noiseFloorRms = VAD_THRESHOLD * 0.6;

    // Playback buffering
    this.playbackQueue = []; // Array of mu-law buffers
    this.playbackLoopRunning = false;
    this.audioResidue = Buffer.alloc(0);

    // State management
    this.isProcessing = false;
    this.isSpeaking = false;
    this.isPlaying = false;
    this.currentPipelineId = 0;
    this.lastPipelineId = 0;
    this.pendingPcmChunks = [];
    this.userSpeakingWhileProcessing = false;

    // Barge-in tracking
    this.playbackStartedAt = 0;
    this.interruptVoiceChunks = 0;
    this.speechChunkCount = 0;
    this.silentChunkCount = 0;
    this.speechStartedAt = 0;

    // Pipeline cancellation
    this.abortController = null;
    this.currentLLMPromise = null;
    this.currentTTSPromise = null;

    // Timing
    this.startTime = Date.now();
    this.lastVoiceActivityAt = Date.now();
    this.lastActivity = Date.now();

    // Flags
    this._greetingStarted = false;
    this._greetingPending = false;
    this._ended = false;
    this._finalized = false;
    this._lastPong = Date.now();

    // Echo cool-down: discard audio for a brief period after playback ends
    this._echoCooldownUntil = 0;
    // Noise calibration: after cool-down, sample audio to learn noise floor
    this._noiseCalibrationRemaining = 0;

    // Timers
    this.silenceTimer = null;
    this.maxDurationTimer = null;

    // Transcript
    this.transcriptEntries = [];
  }

  normalizeLanguageCode(language) {
    if (!language) return config.language?.default || 'en-IN';
    const raw = String(language).trim().toLowerCase();
    if (raw === 'hinglish' || raw === 'hi-en' || raw === 'en-hi') return 'hinglish';
    return language;
  }

  // Cancel any ongoing pipeline operations
  cancelOngoingOperations() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.currentPipelineId++; // Increment to invalidate pending results
    this.isProcessing = false;
    this.currentLLMPromise = null;
    this.currentTTSPromise = null;
  }

  // Check if pipeline result is still valid
  isPipelineValid(pipelineId) {
    return pipelineId === this.lastPipelineId && !this._ended;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// STREAMING AUDIO PLAYBACK WITH INTERRUPT
// ═════════════════════════════════════════════════════════════════════════════

async function sendAudioThroughStream(session, ws, mulawBuffer, options = {}) {
  enqueueAudio(session, ws, mulawBuffer);
  return true;
}

function enqueueAudio(session, ws, mulawBuffer) {
  if (!session || ws.readyState !== 1) return;
  session.playbackQueue.push(mulawBuffer);
  if (!session.playbackLoopRunning) {
    runPlaybackLoop(session, ws).catch(e => logger.error('Playback loop error', e.message));
  }
}

async function runPlaybackLoop(session, ws) {
  session.playbackLoopRunning = true;
  session.isPlaying = true;
  session.playbackStartedAt = Date.now();
  session.interruptVoiceChunks = 0;

  let chunksSent = 0;

  try {
    while ((session.playbackQueue.length > 0 || session.audioResidue.length > 0) && session.isPlaying && ws.readyState === 1) {
      if (session.audioResidue.length < PLAYBACK_CHUNK_SIZE && session.playbackQueue.length > 0) {
        session.audioResidue = Buffer.concat([session.audioResidue, session.playbackQueue.shift()]);
      }

      const chunkSize = Math.min(PLAYBACK_CHUNK_SIZE, session.audioResidue.length);
      if (chunkSize === 0) break;

      const chunk = session.audioResidue.subarray(0, chunkSize);
      session.audioResidue = session.audioResidue.subarray(chunkSize);

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
        chunksSent++;
      } catch (err) {
        logger.warn('Stream send error', err.message);
        break;
      }

      // Exact Pacing
      const expectedTime = session.playbackStartedAt + chunksSent * PLAYBACK_CHUNK_INTERVAL_MS;
      const delay = expectedTime - Date.now();
      if (delay > 0) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  } finally {
    session.playbackLoopRunning = false;
    // We only send a checkpoint if the queue is fully drained
    if (!session.isPlaying || (session.playbackQueue.length === 0 && session.audioResidue.length === 0)) {
      session.isPlaying = false;
      session.playbackStartedAt = 0;
      session.interruptVoiceChunks = 0;
      // Start echo cool-down: discard audio for ECHO_COOLDOWN_MS after playback ends
      session._echoCooldownUntil = Date.now() + ECHO_COOLDOWN_MS;
      logger.debug('Playback ended, echo cool-down started', { callSid: session.callSid, cooldownMs: ECHO_COOLDOWN_MS });
      try {
        ws.send(JSON.stringify({ event: 'checkpoint', name: `speech_${Date.now()}` }));
      } catch (e) { /* ignore */ }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// INSTANT GREETING - Uses prewarmed cache
// ═════════════════════════════════════════════════════════════════════════════

async function deliverInstantGreeting(session, ws) {
  if (!session || session._greetingStarted || session._ended) return;
  if (!session.streamSid || ws.readyState !== 1) {
    session._greetingPending = true;
    logger.debug('Greeting pending - waiting for stream', { callSid: session.callSid, hasStreamSid: !!session.streamSid, wsState: ws.readyState });
    return;
  }

  session._greetingStarted = true;
  session._greetingPending = false;

  const cacheKey = `${session.language}:${session.direction}`;
  const cached = greetingCache.get(cacheKey);

  let greetingText;
  let mulawBuffer;

  if (cached?.buffer) {
    // Use prewarmed greeting
    greetingText = cached.text;
    mulawBuffer = cached.buffer;
    logger.log('Using prewarmed greeting', {
      callSid: session.callSid,
      lang: session.language,
      size: mulawBuffer.length
    });
  } else {
    // Fallback: generate on-the-fly (should rarely happen)
    greetingText = session.fsm.getIntroText();
    logger.log('Generating greeting on-the-fly', {
      callSid: session.callSid,
      lang: session.language
    });

    try {
      const ttsResult = await tts.synthesizeRaw(greetingText, session.callSid, session.language);
      if (!ttsResult?.mulawBuffer) {
        logger.error('Greeting TTS failed', session.callSid);
        return;
      }
      mulawBuffer = ttsResult.mulawBuffer;
    } catch (e) {
      logger.error('Greeting generation error', e.message);
      return;
    }
  }

  // Transition FSM to INTRODUCING
  session.fsm.transition('call_answered');

  // Calculate duration
  const greetingDurationMs = Math.max(800, Math.round((mulawBuffer.length / 8000) * 1000));

  // Send audio immediately - use moderate pacing for clean playback
  const completed = await sendAudioThroughStream(session, ws, mulawBuffer, {
    fastStart: true
    // Let pacing happen naturally at 10ms per chunk for clean audio
  });

  // Record transcript
  session.transcriptEntries.push({
    startMs: 0,
    endMs: greetingDurationMs,
    speaker: 'agent',
    text: greetingText,
    confidence: 1.0
  });

  // Transition based on completion
  if (completed) {
    session.fsm.transition('intro_complete');
  }

  // Start silence timer
  startSilenceTimer(session, ws);

  logger.log('Greeting delivered', {
    callSid: session.callSid,
    duration: greetingDurationMs,
    completed
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN WEBSOCKET HANDLER
// ═════════════════════════════════════════════════════════════════════════════

module.exports = function setupWs(app) {
  app.ws('/stream', function (ws, req) {
    let session = null;
    let pingInterval = null;

    const queryCallUuid = req.query?.callUuid;
    const queryCallerNumber = req.query?.callerNumber || '';
    const queryLanguage = req.query?.language || config.language?.default || 'en-IN';
    const queryDirection = req.query?.direction === 'outbound' ? 'outbound' : 'inbound';

    // Initialize session
    const initializeSession = (fields = {}) => {
      const callUuid = fields.callUuid || queryCallUuid;
      const callerNumber = fields.callerNumber || queryCallerNumber;
      const streamSid = fields.streamSid || null;
      const language = fields.language || queryLanguage;
      const direction = fields.direction || queryDirection;

      if (!callUuid) return null;

      if (session) {
        // Update existing session
        if (streamSid && session.streamSid !== streamSid) {
          session.streamSid = streamSid;
        }
        if (callerNumber && !session.callerNumber) {
          session.callerNumber = callerNumber;
        }
        session.language = language || session.language;
        session.direction = direction || session.direction;

        // Try to deliver greeting if pending
        if (session._greetingPending && session.streamSid) {
          deliverInstantGreeting(session, ws).catch(e =>
            logger.warn('Greeting delivery failed', e.message)
          );
        }

        return session;
      }

      // Create new session
      session = new EnhancedCallSession(callUuid, callerNumber, language, direction);
      session.streamSid = streamSid;
      sessions.set(callUuid, session);
      costControl.trackCall(callUuid);

      logger.log('Call session started', {
        callUuid,
        callerNumber,
        streamSid: streamSid || '(pending)',
        language,
        direction
      });

      // Set max duration timer
      session.maxDurationTimer = setTimeout(async () => {
        logger.warn('Max call duration reached', callUuid);
        await endCallGracefully(session, ws, getLanguage(session.language).farewell);
      }, MAX_CALL_MS);

      // Attempt immediate greeting delivery
      deliverInstantGreeting(session, ws).catch(e =>
        logger.warn('Initial greeting failed', e.message)
      );

      return session;
    };

    // Pre-initialize if callUuid is in query
    if (queryCallUuid) {
      initializeSession({
        callUuid: queryCallUuid,
        callerNumber: queryCallerNumber,
        language: queryLanguage,
        direction: queryDirection
      });
    }

    // Heartbeat
    pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        if (session && Date.now() - session._lastPong > 45000) {
          logger.warn('WebSocket pong timeout', session.callSid);
          ws.close(1001, 'Pong timeout');
          clearInterval(pingInterval);
          return;
        }
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 15000);

    ws.on('pong', () => {
      if (session) session._lastPong = Date.now();
    });

    // Message handler
    ws.on('message', async (msgStr) => {
      try {
        // Binary audio data
        if (Buffer.isBuffer(msgStr)) {
          initializeSession({ mode: 'binary' });
          if (!session) return;

          const mulawBytes = msgStr;
          const pcmChunk = mulawToPcm16(mulawBytes);
          const rms = computeRms(pcmChunk);

          processAudioChunk(session, ws, mulawBytes, pcmChunk, rms);
          return;
        }

        const msg = JSON.parse(msgStr);

        // Connected event
        if (msg.event === 'connected') {
          logger.log('WS connected', msg.protocol);
          return;
        }

        // Start event
        if (msg.event === 'start' || msg.event === 'streamStart') {
          const callUuid = msg.start?.callSid || msg.start?.callUuid || queryCallUuid;
          const callerNumber = msg.start?.customParameters?.callerNumber ||
            msg.start?.customParameters?.from ||
            msg.start?.from || queryCallerNumber;
          const streamSid = msg.streamSid
            || msg.start?.streamSid
            || msg.start?.streamId
            || msg.stream_id
            || `stream_${Date.now()}`;
          const language = msg.start?.customParameters?.language || queryLanguage;
          const direction = msg.start?.customParameters?.direction || queryDirection;

          const sess = initializeSession({ callUuid, callerNumber, streamSid, language, direction });

          // Explicitly try to deliver greeting after stream is established
          if (sess && streamSid) {
            logger.log('Stream established, delivering greeting', { callSid: callUuid, streamSid });
            deliverInstantGreeting(sess, ws).catch(e =>
              logger.warn('Greeting delivery failed after stream start', e.message)
            );
          }
          return;
        }

        // Media event
        if (msg.event === 'media' || msg.event === 'audio') {
          const callUuid = msg.callSid || msg.callUuid || queryCallUuid;
          const payload = msg.media?.payload || msg.payload;
          if (!payload) return;

          initializeSession({ callUuid, mode: 'media' });
          if (!session) return;

          const mulawBytes = Buffer.from(payload, 'base64');
          const pcmChunk = mulawToPcm16(mulawBytes);
          const rms = computeRms(pcmChunk);

          processAudioChunk(session, ws, mulawBytes, pcmChunk, rms);
          return;
        }

        // Stop event
        if (msg.event === 'stop') {
          logger.log('Stream stop received', session?.callSid);
          await cleanupSession(session, ws, pingInterval);
          return;
        }

        // Checkpoint
        if (msg.event === 'checkpoint' || msg.event === 'mark') {
          logger.debug('Audio checkpoint reached', msg.name);
        }

      } catch (err) {
        logger.error('WS message handler error', err.message);
        metrics.incrementWsError();
      }
    });

    ws.on('close', async (code, reason) => {
      logger.log('WS closed', { callSid: session?.callSid, code, reason: reason?.toString() });
      await cleanupSession(session, ws, pingInterval);
    });

    ws.on('error', (err) => {
      logger.error('WS error', session?.callSid, err.message);
      metrics.incrementWsError();
    });
  });
};

// ═════════════════════════════════════════════════════════════════════════════
// AUDIO PROCESSING WITH ENHANCED VAD & BARGE-IN
// ═════════════════════════════════════════════════════════════════════════════

function processAudioChunk(session, ws, mulawBytes, pcmChunk, rms) {
  // Try to deliver pending greeting
  if (session._greetingPending && session.streamSid) {
    deliverInstantGreeting(session, ws).catch(e =>
      logger.warn('Greeting delivery failed', e.message)
    );
  }

  // ECHO COOL-DOWN: discard audio for a brief period after playback ends
  // This prevents residual echo from being classified as user speech
  if (session._echoCooldownUntil && Date.now() < session._echoCooldownUntil) {
    return; // Silently discard
  }
  if (session._echoCooldownUntil && Date.now() >= session._echoCooldownUntil) {
    session._echoCooldownUntil = 0; // Cool-down expired
    // Start noise calibration phase: sample audio to learn the real noise floor
    session._noiseCalibrationRemaining = NOISE_CALIBRATION_CHUNKS;
    session.noiseFloorRms = rms; // Seed with first chunk
    logger.debug('Echo cool-down ended, starting noise calibration', { callSid: session.callSid, initialRms: rms.toFixed(4) });
  }

  // NOISE CALIBRATION PHASE: learn ambient noise level before enabling speech detection
  // Without this, the first chunk after cool-down triggers false speech detection
  if (session._noiseCalibrationRemaining > 0) {
    session._noiseCalibrationRemaining--;
    // Aggressively track noise floor during calibration (fast convergence)
    session.noiseFloorRms = (session.noiseFloorRms * 0.8) + (rms * 0.2);
    if (session._noiseCalibrationRemaining === 0) {
      logger.debug('Noise calibration complete', {
        callSid: session.callSid,
        noiseFloor: session.noiseFloorRms.toFixed(4),
        dynamicThreshold: (session.noiseFloorRms * 2.5).toFixed(4)
      });
    }
    return; // Don't process audio during calibration
  }

  // Update noise floor (adaptive, uses wider window than before)
  const floor = session.noiseFloorRms || (VAD_THRESHOLD * 0.6);
  if (rms > 0 && rms < (VAD_THRESHOLD * 5)) {
    session.noiseFloorRms = (floor * 0.97) + (rms * 0.03);
  }

  // Dynamic threshold: must be significantly above noise floor to count as speech
  const dynamicThreshold = Math.max(VAD_THRESHOLD, (session.noiseFloorRms || floor) * 2.5);

  // STRICT HALF-DUPLEX ECHO SUPPRESSION:
  // Because Vobiz lacks Acoustic Echo Cancellation (AEC), the agent's playback 
  // bleeds back into the microphone at very high volume levels (RMS 0.25+). 
  // We completely deafen the microphone while the agent speaks by setting an impossible threshold.
  const currentThreshold = session.isPlaying ? 999.0 : dynamicThreshold;
  const hasVoice = rms >= currentThreshold;

  if (hasVoice) {
    session.speechChunkCount++;
    session.silentChunkCount = 0;
    session.lastVoiceActivityAt = Date.now();

    let bufferedInPreSpeech = false;
    if (!session.isSpeaking) {
      session.preSpeechMulaw.push(mulawBytes);
      session.preSpeechPcm.push(pcmChunk);
      session.preSpeechBytes += pcmChunk.length;

      // Trim pre-speech buffer
      if (session.preSpeechMulaw.length > 6) {
        session.preSpeechMulaw.shift();
        const old = session.preSpeechPcm.shift();
        session.preSpeechBytes -= old?.length || 0;
      }
      bufferedInPreSpeech = true;
    }

    // Track user speaking during processing
    if (session.isProcessing) {
      session.userSpeakingWhileProcessing = true;
    }

    // BARGE-IN DETECTION
    if (session.isPlaying) {
      const playbackMs = Date.now() - session.playbackStartedAt;

      // Require a significantly louder signal to interrupt playback (barge-in)
      const bargeInThreshold = Math.max(0.04, dynamicThreshold * 3.5);
      const strongSpeech = rms >= bargeInThreshold;

      if (playbackMs >= BARGE_IN_MIN_PLAYBACK_MS && strongSpeech) {
        session.interruptVoiceChunks++;
      } else {
        session.interruptVoiceChunks = 0;
      }

      // Immediate interrupt on strong speech (requires 12 continuous chunks ~ 240ms of loud noise)
      if (session.interruptVoiceChunks >= 12) {
        logger.log('BARGE-IN: Stopping playback', {
          callSid: session.callSid,
          playbackMs,
          rms,
          chunks: session.interruptVoiceChunks
        });

        // Stop playback
        try {
          ws.send(JSON.stringify({ event: 'clearAudio' }));
        } catch (e) { /* ignore */ }

        session.isPlaying = false;
        session.playbackStartedAt = 0;
        session.interruptVoiceChunks = 0;
        session.playbackQueue = [];
        session.audioResidue = Buffer.alloc(0);

        // Cancel ongoing pipeline
        session.cancelOngoingOperations();

        // Update FSM
        session.fsm.handleInterrupt();

        metrics.incrementInterrupt();
      }
    }

    // Speech start detection
    if (!session.isSpeaking && session.speechChunkCount >= SPEECH_START_CHUNKS) {
      session.isSpeaking = true;
      session.speechStartedAt = Date.now();
      session.fsm.transition('user_speaking');
      logger.debug('Speech started', session.callSid);

      clearTimeout(session.silenceTimer);

      // Flush pre-speech buffer
      if (session.preSpeechPcm.length > 0) {
        session.audioChunks.push(...session.preSpeechMulaw);
        session.pcmBuffer.push(...session.preSpeechPcm);
        session.totalPcmBytes += session.preSpeechBytes;
        session.preSpeechMulaw = [];
        session.preSpeechPcm = [];
        session.preSpeechBytes = 0;
      }
    }

    // Buffer speech audio
    if (session.isSpeaking && !bufferedInPreSpeech) {
      session.audioChunks.push(mulawBytes);
      session.pcmBuffer.push(pcmChunk);
      session.totalPcmBytes += pcmChunk.length;

      // Max speech duration: force processing after MAX_SPEECH_DURATION_MS
      // This prevents endless buffering when echo/noise keeps VAD active
      const speechDuration = Date.now() - session.speechStartedAt;
      if (speechDuration >= MAX_SPEECH_DURATION_MS) {
        logger.log('Max speech duration reached, forcing processing', {
          callSid: session.callSid,
          durationMs: speechDuration,
          bytes: session.totalPcmBytes
        });
        // CRITICAL: Reset speech state BEFORE calling triggerProcessing
        // Without this, every subsequent 20ms chunk re-triggers processing
        // (since speechStartedAt is still in the past) and cancels the running STT
        session.isSpeaking = false;
        session.speechStartedAt = 0;
        session.speechChunkCount = 0;
        triggerProcessing(session, ws);
        return;
      }

      // Buffer overflow protection
      if (session.totalPcmBytes > MAX_BUFFER_BYTES) {
        logger.warn('Buffer overflow, forcing processing', session.callSid);
        // Reset speech state to prevent re-triggering
        session.isSpeaking = false;
        session.speechStartedAt = 0;
        session.speechChunkCount = 0;
        triggerProcessing(session, ws);
      }
    }

    return;
  }

  // Silence detected
  session.silentChunkCount++;
  session.speechChunkCount = 0;
  session.interruptVoiceChunks = 0;

  // Clear pre-speech cache after short silence
  if (session.silentChunkCount >= 2) {
    session.preSpeechMulaw = [];
    session.preSpeechPcm = [];
    session.preSpeechBytes = 0;
  }

  // Speech end detection
  if (session.isSpeaking && session.silentChunkCount >= SPEECH_END_CHUNKS) {
    session.isSpeaking = false;
    logger.debug('Speech ended', session.callSid, session.totalPcmBytes, 'bytes');

    const effectiveMinBytes = Math.max(800, Math.floor(MIN_UTTERANCE_BYTES * 0.6));
    if (session.totalPcmBytes >= effectiveMinBytes) {
      triggerProcessing(session, ws);
    } else {
      clearBuffers(session);
    }

    startSilenceTimer(session, ws);
  }

  // Start silence timer if not speaking
  if (!session.isSpeaking && !session.silenceTimer) {
    startSilenceTimer(session, ws);
  }
}

function clearBuffers(session) {
  session.audioChunks = [];
  session.pcmBuffer = [];
  session.totalPcmBytes = 0;
  session.preSpeechMulaw = [];
  session.preSpeechPcm = [];
  session.preSpeechBytes = 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// PIPELINE PROCESSING WITH CANCELLATION SUPPORT
// ═════════════════════════════════════════════════════════════════════════════

function triggerProcessing(session, ws) {
  const pcmChunks = session.pcmBuffer.slice();
  clearBuffers(session);

  if (!pcmChunks.length) return;

  // Cancel any ongoing operations
  if (session.isProcessing) {
    session.cancelOngoingOperations();
    session.pendingPcmChunks.push(...pcmChunks);
    logger.debug('Queued utterance after cancellation', session.callSid);
    return;
  }

  // Cancel any playing audio
  if (session.isPlaying) {
    try {
      ws.send(JSON.stringify({ event: 'clear', streamSid: session.streamSid }));
    } catch (e) { /* ignore */ }
    session.isPlaying = false;
  }

  startPipeline(session, ws, pcmChunks);
}

function startPipeline(session, ws, pcmChunks) {
  const pipelineId = ++session.lastPipelineId;
  session.isProcessing = true;
  session.currentPipelineId = pipelineId;
  session.userSpeakingWhileProcessing = false;
  session.abortController = new AbortController();

  processUtterance(session, ws, pcmChunks, pipelineId, session.abortController.signal)
    .catch(err => logger.error('Pipeline error', session.callSid, err.message))
    .finally(() => {
      if (session.currentPipelineId === pipelineId) {
        session.isProcessing = false;
        session.abortController = null;
      }

      // Process any pending chunks
      if (!session.isProcessing && session.pendingPcmChunks.length > 0 && ws.readyState === 1) {
        const pending = session.pendingPcmChunks.slice();
        session.pendingPcmChunks = [];
        const pendingBytes = pending.reduce((sum, c) => sum + c.length, 0);
        if (pendingBytes >= MIN_UTTERANCE_BYTES) {
          startPipeline(session, ws, pending);
        }
      }
    });
}

async function processUtterance(session, ws, pcmChunks, pipelineId, abortSignal) {
  const pipelineStart = Date.now();

  // Check for cancellation
  if (abortSignal.aborted) {
    logger.debug('Pipeline cancelled before STT', session.callSid);
    return;
  }

  // 1. STT
  const pcmData = Buffer.concat(pcmChunks);
  const wavBuffer = buildWavBuffer(pcmData);
  const audioDurationSec = Math.max(0, pcmData.length - 44) / 16000;

  logger.debug('STT input', {
    callSid: session.callSid,
    pcmBytes: pcmData.length,
    audioDuration: `${audioDurationSec.toFixed(1)}s`,
    timeSinceCallStart: `${((Date.now() - session.startTime) / 1000).toFixed(1)}s`
  });

  const sttStart = Date.now();
  let sttResult = await stt.transcribe(wavBuffer, session.callSid, 'audio/wav', session.language);

  if (abortSignal.aborted || pipelineId !== session.lastPipelineId) {
    logger.debug('Pipeline cancelled after STT', session.callSid);
    return;
  }

  const sttLatency = Date.now() - sttStart;

  if (sttResult.empty || !sttResult.text) {
    logger.debug('STT returned empty, skipping', session.callSid);
    return;
  }

  // 2. FSM Intent Processing
  const fsmResult = session.fsm.processTranscript(sttResult.text);
  logger.log(`STT (${sttLatency}ms): "${sttResult.text}" | Intent: ${fsmResult.intent || fsmResult.data?.intent} | State: ${session.fsm.getState()}`);

  // Record transcript
  session.transcriptEntries.push({
    startMs: Date.now() - session.startTime - sttLatency,
    endMs: Date.now() - session.startTime,
    speaker: 'customer',
    text: sttResult.text,
    confidence: sttResult.confidence
  });

  // Check for cancellation before LLM
  if (abortSignal.aborted || pipelineId !== session.lastPipelineId) {
    logger.debug('Skipping LLM due to cancellation', session.callSid);
    return;
  }

  // 3. LLM with FSM context (Streaming)
  const llmStart = Date.now();

  const replyStream = llm.generateReplyStream({
    callState: session.fsm.getLLMContext(),
    script: { companyName: config.companyName },
    lastTranscript: sttResult.text,
    customerName: session.fsm.leadData.name || session.callerNumber,
    callSid: session.callSid,
    language: session.language,
    callDirection: session.direction,
    honorific: session.fsm.leadData.honorific || 'sir_maam'
  });

  if (abortSignal.aborted || pipelineId !== session.lastPipelineId) {
    logger.debug('Pipeline cancelled after STT', session.callSid);
    return;
  }

  const burnRate = costControl.getEstimatedBurnRatePerMin(session.callSid);
  const costGuardActive = burnRate > TARGET_COST_PER_MIN_RS;

  let firstChunkMs = 0;
  let fullSentence = '';
  let finalAction = null;
  let isFirstSentence = true;

  // Process LLM in streaming mode
  for await (const chunk of replyStream) {
    if (abortSignal.aborted || pipelineId !== session.lastPipelineId) return;

    if (chunk.type === 'sentence') {
      let sentence = chunk.text;

      if (firstChunkMs === 0) {
        firstChunkMs = Date.now() - llmStart;
        logger.debug(`Time to first sentence: ${firstChunkMs}ms`);
        // Transition FSM to speaking
        session.fsm.transition('intent_classified', { response: '(streaming)' });
      }

      if (costGuardActive && fullSentence.length > 120) continue; // Skip further sentences if guard is active

      fullSentence += sentence + ' ';

      // Fire and forget TTS synthesis stream
      const ttsStream = tts.synthesizeStream(sentence, session.callSid, session.language);

      // Start streaming audio to the websocket concurrently for THIS sentence
      (async () => {
        try {
          for await (const mulawChunk of ttsStream) {
            if (abortSignal.aborted || pipelineId !== session.lastPipelineId) return;
            await sendAudioThroughStream(session, ws, mulawChunk, { skipPacing: false, fastStart: isFirstSentence });
          }
        } catch (e) { logger.error('TTS streaming playback error', e.message); }
      })();

      isFirstSentence = false;
    } else {
      // Must be the final parsed JSON response returned from the stream 
      finalAction = chunk.action;
    }
  }

  const completeLatency = Date.now() - llmStart;
  logger.log(`LLM complete (${completeLatency}ms). First chunk at ${firstChunkMs}ms. | Action: ${finalAction}`);

  // Record agent transcript
  session.transcriptEntries.push({
    startMs: Date.now() - session.startTime,
    endMs: Date.now() - session.startTime + 500,
    speaker: 'agent',
    text: fullSentence.trim(),
    confidence: 1
  });

  session.fsm.transition('speech_complete');
  metrics.addPipelineLatency(sttLatency, completeLatency, 0); // TTS latency is interleaved now

  // Handle actions
  if (finalAction === 'hangup' || finalAction === 'escalate') {
    const farewell = finalAction === 'escalate'
      ? 'Let me connect you with our property expert right away. Please hold.'
      : null;
    await endCallGracefully(session, ws, farewell);
  } else if (!costControl.isWithinBudget(session.callSid)) {
    logger.warn('Budget exceeded, hanging up', session.callSid);
    await endCallGracefully(session, ws, 'Our call duration limit is reached. We will call you back. Goodbye.');
  } else if (session.fsm.getState() === 'call_ended') {
    await endCallGracefully(session, ws, null);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SILENCE HANDLING
// ═════════════════════════════════════════════════════════════════════════════

function startSilenceTimer(session, ws) {
  clearTimeout(session.silenceTimer);

  session.silenceTimer = setTimeout(async () => {
    if (ws.readyState !== 1 || session._ended) return;

    // Don't count silence while active, in cool-down, or calibrating noise floor
    if (session.isSpeaking || session.isProcessing || session.isPlaying ||
      (session._echoCooldownUntil && Date.now() < session._echoCooldownUntil) ||
      session._noiseCalibrationRemaining > 0) {
      startSilenceTimer(session, ws);
      return;
    }

    const fsmResult = session.fsm.handleSilence();
    const langConfig = getLanguage(session.language);

    if (fsmResult.silenceCount >= 2) {
      logger.log('Second silence, ending call', session.callSid);
      await endCallGracefully(session, ws, langConfig.farewell);
    } else {
      logger.log('First silence, prompting', session.callSid);

      try {
        const ttsResult = await tts.synthesizeRaw(langConfig.silencePrompt, session.callSid, session.language);
        if (ttsResult?.mulawBuffer) {
          await sendAudioThroughStream(session, ws, ttsResult.mulawBuffer);
        }
      } catch (err) {
        logger.error('Silence prompt error', err.message);
      }

      startSilenceTimer(session, ws);
    }
  }, SILENCE_PROMPT_MS);
}

// ═════════════════════════════════════════════════════════════════════════════
// CALL CLEANUP
// ═════════════════════════════════════════════════════════════════════════════

async function endCallGracefully(session, ws, farewellText) {
  if (session._ended) return;
  session._ended = true;

  clearTimeout(session.silenceTimer);
  clearTimeout(session.maxDurationTimer);

  // Cancel any ongoing operations
  session.cancelOngoingOperations();

  try {
    if (farewellText && ws.readyState === 1) {
      try {
        const ttsResult = await tts.synthesizeRaw(farewellText, session.callSid, session.language);
        if (ttsResult?.mulawBuffer) {
          await sendAudioThroughStream(session, ws, ttsResult.mulawBuffer);
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (err) {
        logger.warn('Farewell play failed', err.message);
      }
    }

    if (session.callSid) {
      await vobizClient.endCall(session.callSid).catch(e =>
        logger.warn('End call API error', e.message)
      );
    }
  } catch (err) {
    logger.error('Graceful end error', err.message);
  }

  // Cleanup
  sessions.delete(session.callSid);
  llm.clearHistory(session.callSid);
  costControl.endCallTracking(session.callSid);

  await finalizeCall(session);
}

async function cleanupSession(session, ws, pingInterval) {
  clearInterval(pingInterval);
  if (!session) return;

  session._ended = true;
  clearTimeout(session.silenceTimer);
  clearTimeout(session.maxDurationTimer);

  session.cancelOngoingOperations();

  await finalizeCall(session);

  sessions.delete(session.callSid);
  llm.clearHistory(session.callSid);
  costControl.endCallTracking(session.callSid);
}

async function finalizeCall(session) {
  if (!session || session._finalized) return;
  session._finalized = true;

  const duration = Math.round((Date.now() - session.startTime) / 1000);
  logger.log('Finalizing call', {
    callSid: session.callSid,
    duration: `${duration}s`,
    turns: session.fsm.turnCount,
    score: session.fsm.leadData.qualityScore || 0,
    language: session.language
  });

  try {
    const call = session.callSid
      ? await Call.findOne({ callSid: session.callSid })
      : null;

    if (call) {
      call.durationSec = duration;
      call.endAt = new Date();
      call.status = 'completed';
      await call.save();
    }

    if (call && session.transcriptEntries.length > 0) {
      const fullText = session.transcriptEntries.map(e => `${e.speaker}: ${e.text}`).join('\n');

      await Transcript.create({
        callId: call._id,
        entries: session.transcriptEntries,
        fullText,
        summary: fullText.substring(0, 500)
      });
    }

    if (session.callerNumber && Object.keys(session.fsm.leadData).length > 0) {
      const leadStatus = session.fsm.leadData.siteVisitDate ? 'site-visit-booked'
        : session.fsm.leadData.qualityScore >= 50 ? 'qualified'
          : session.fsm.leadData.qualityScore > 0 ? 'follow-up'
            : 'new';

      await Lead.findOneAndUpdate(
        { phoneNumber: session.callerNumber, callId: call?._id },
        {
          callId: call?._id,
          phoneNumber: session.callerNumber,
          ...session.fsm.leadData,
          status: leadStatus,
          conversationSummary: session.transcriptEntries.map(e => `${e.speaker}: ${e.text}`).join('\n').substring(0, 2000),
          source: 'ai-call'
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    logger.error('Finalize error', err.message);
  }
}

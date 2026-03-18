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
const { createLiveSession: createDeepgramSession } = require('./services/stt');
const llm = require('./services/llm');
const tts = require('./services/tts');
const vobizClient = require('./services/vobizClient');
const Call = require('./models/call.model');
const Lead = require('./models/lead.model');
const Transcript = require('./models/transcript.model');
const metrics = require('./services/metrics');
const costControl = require('./services/costControl');
const callDebugger = require('./services/callDebugger');
const callRecorder = require('./services/callRecorder');
const intentTracker = require('./services/intentTracker');
const { withRetry } = require('./utils/retry');
const { ConversationFSM, States } = require('./services/conversationFSM');
const config = require('./config');
const { getLanguage, normalizeLanguageCode: normalizeLanguageFromRegistry } = require('./config/languages');

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

// A-LAW decode table (ITU-T G.711 A-law — used by Indian/European PSTN)
const ALAW_DECODE = new Int16Array(256);
(function buildAlawTable() {
  for (let i = 0; i < 256; i++) {
    let val = i ^ 0x55;
    let sign = val & 0x80;
    let exponent = (val >> 4) & 0x07;
    let mantissa = val & 0x0F;
    let sample;
    if (exponent === 0) {
      sample = (mantissa << 4) + 8;
    } else {
      sample = ((mantissa << 4) + 0x108) << (exponent - 1);
    }
    ALAW_DECODE[i] = sign ? -sample : sample;
  }
})();

function alawToPcm16(alawBuffer) {
  const pcm = Buffer.alloc(alawBuffer.length * 2);
  for (let i = 0; i < alawBuffer.length; i++) {
    const sample = ALAW_DECODE[alawBuffer[i]];
    pcm.writeInt16LE(sample, i * 2);
  }
  return pcm;
}

function pcm16ToAlaw(sample) {
  const ALAW_MAX = 0x7fff;
  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  if (sample > ALAW_MAX) sample = ALAW_MAX;

  let compressed;
  if (sample >= 256) {
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) { }
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    compressed = (exponent << 4) | mantissa;
  } else {
    compressed = sample >> 4;
  }
  return (compressed ^ (sign ^ 0x55)) & 0xff;
}

function pcmBufferToAlaw(pcmBuffer) {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const alaw = Buffer.alloc(numSamples);
  for (let i = 0; i < numSamples; i++) {
    alaw[i] = pcm16ToAlaw(pcmBuffer.readInt16LE(i * 2));
  }
  return alaw;
}

function normalizeAudioEncoding(encoding) {
  const value = String(encoding || '').toLowerCase().trim();
  if (!value) return 'mulaw';
  if (value.includes('l16') || value.includes('linear16') || value.includes('pcm16')) return 'l16';
  if (value.includes('alaw') || value.includes('pcma')) return 'alaw';
  if (value.includes('mulaw') || value.includes('ulaw') || value.includes('pcmu')) return 'mulaw';
  return 'mulaw';
}

function inferL16EndiannessFromEncoding(encoding) {
  const value = String(encoding || '').toLowerCase();
  if (!value.includes('l16') && !value.includes('linear16')) return null;
  const tokens = value.split(/[^a-z0-9]+/).filter(Boolean);
  if (value.includes('little') || tokens.includes('le')) return 'le';
  if (value.includes('big') || tokens.includes('be')) return 'be';
  return 'unknown';
}

function swapPcm16Endian(buffer) {
  const usableLen = buffer.length - (buffer.length % 2);
  if (usableLen <= 0) return Buffer.alloc(0);
  const out = Buffer.alloc(usableLen);
  for (let i = 0; i < usableLen; i += 2) {
    out[i] = buffer[i + 1];
    out[i + 1] = buffer[i];
  }
  return out;
}

function scoreL16PcmQuality(pcmBuffer) {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  if (numSamples <= 0) {
    return { score: Number.POSITIVE_INFINITY, quantizedRatio: 1, clippedRatio: 0, meanAbs: 0 };
  }

  let quantized = 0;
  let clipped = 0;
  let absSum = 0;

  for (let i = 0; i < numSamples; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    const abs = Math.abs(sample);
    absSum += abs;

    // Byte-swapped PCM often produces values clustered near 0x??00 / 0x??FF.
    const lowByte = abs & 0xff;
    if (lowByte <= 1 || lowByte >= 0xfe) quantized++;
    if (abs >= 32000) clipped++;
  }

  const meanAbs = absSum / numSamples;
  const quantizedRatio = quantized / numSamples;
  const clippedRatio = clipped / numSamples;

  // Lower score => more speech-like / less endian-artifact.
  const score =
    (quantizedRatio * 8.0) +
    (clippedRatio * 3.0) +
    ((meanAbs / 32768) * 0.5);

  return { score, quantizedRatio, clippedRatio, meanAbs };
}

function decodeL16ToPcm16(audioBuffer, session) {
  const usableLen = audioBuffer.length - (audioBuffer.length % 2);
  if (usableLen <= 0) return Buffer.alloc(0);
  const source = usableLen === audioBuffer.length ? audioBuffer : audioBuffer.subarray(0, usableLen);

  // Respect an explicit or already-detected endian choice.
  if (session?._l16Endian === 'le') {
    return Buffer.from(source);
  }
  if (session?._l16Endian === 'be') {
    return swapPcm16Endian(source);
  }

  // Auto-detect when provider only says "audio/x-l16" without endianness.
  const pcmLe = Buffer.from(source);
  const pcmBe = swapPcm16Endian(source);
  const qualityLe = scoreL16PcmQuality(pcmLe);
  const qualityBe = scoreL16PcmQuality(pcmBe);
  const chooseLe = qualityLe.score <= qualityBe.score;
  const chosen = chooseLe ? 'le' : 'be';
  const chosenPcm = chooseLe ? pcmLe : pcmBe;

  if (session) {
    session._l16EndianVotes = session._l16EndianVotes || { le: 0, be: 0 };
    session._l16EndianVotes[chosen]++;
    session._l16ProbeCount = (session._l16ProbeCount || 0) + 1;

    if (session._l16EndianVotes.be >= 3) {
      session._l16Endian = 'be';
      logger.log('Detected L16 endian', {
        callSid: session.callSid,
        endian: 'be',
        qualityLe: Number(qualityLe.score.toFixed(3)),
        qualityBe: Number(qualityBe.score.toFixed(3))
      });
      return pcmBe;
    }
    if (session._l16EndianVotes.le >= 3) {
      session._l16Endian = 'le';
      logger.log('Detected L16 endian', {
        callSid: session.callSid,
        endian: 'le',
        qualityLe: Number(qualityLe.score.toFixed(3)),
        qualityBe: Number(qualityBe.score.toFixed(3))
      });
      return pcmLe;
    }
  }

  // While undecided, return the lower-artifact decode for this chunk.
  return chosenPcm;
}

function getNoiseFloorCap(session) {
  return session?._audioCodec === 'l16' ? 0.001 : 0.15;
}

function canStartGreeting(session) {
  if (!session) return false;
  if (session._audioCodec !== 'l16') return true;
  if (session._l16Endian && session._l16Endian !== 'unknown') return true;
  // Allow fallback after a few probe chunks even if still unresolved.
  return (session._l16ProbeCount || 0) >= 3;
}

// Generic decoder that picks the right codec
function decodeToPcm16(audioBuffer, session) {
  const codec = normalizeAudioEncoding(session?._audioEncoding);
  if (codec === 'l16') {
    return decodeL16ToPcm16(audioBuffer, session);
  }
  if (codec === 'alaw') {
    return alawToPcm16(audioBuffer);
  }
  return mulawToPcm16(audioBuffer); // default to mulaw
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
  const numSamples = Math.floor(pcmBuffer.length / 2);
  if (numSamples <= 0) return 0;

  // Remove DC component before RMS to avoid false VAD on biased L16 silence.
  let mean = 0;
  for (let i = 0; i < numSamples; i++) {
    mean += pcmBuffer.readInt16LE(i * 2);
  }
  mean /= numSamples;

  let sumSq = 0;
  for (let i = 0; i < numSamples; i++) {
    const sample = (pcmBuffer.readInt16LE(i * 2) - mean) / 32768.0;
    sumSq += sample * sample;
  }
  return Math.sqrt(sumSq / numSamples);
}

function removeDcOffset(pcmBuffer) {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  if (numSamples <= 0) return pcmBuffer;

  let mean = 0;
  for (let i = 0; i < numSamples; i++) {
    mean += pcmBuffer.readInt16LE(i * 2);
  }
  mean /= numSamples;

  // Skip copy when no meaningful offset is present.
  if (Math.abs(mean) < 8) return pcmBuffer;

  const centered = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    let sample = pcmBuffer.readInt16LE(i * 2) - mean;
    if (sample > 32767) sample = 32767;
    else if (sample < -32768) sample = -32768;
    centered.writeInt16LE(Math.round(sample), i * 2);
  }

  return centered;
}

// Tuning constants
const VAD_THRESHOLD = config.pipeline.vadThreshold;
const SPEECH_START_CHUNKS = config.pipeline.speechStartChunks;
const SPEECH_END_CHUNKS = config.pipeline.speechEndChunks;
const BARGE_IN_MIN_PLAYBACK_MS = config.pipeline.bargeInMinPlaybackMs;
const BARGE_IN_REQUIRED_CHUNKS = 5; // Increased to prevent false positives from line noise
const BARGE_IN_RMS_MULTIPLIER = config.pipeline.bargeInRmsMultiplier;
const MIN_UTTERANCE_BYTES = config.pipeline.minUtteranceBytes;
const MAX_BUFFER_BYTES = config.pipeline.maxBufferBytes;
const SILENCE_PROMPT_MS = config.pipeline.silencePromptMs;
const MAX_CALL_MS = config.callMaxMinutes * 60 * 1000;
const PLAYBACK_CHUNK_SIZE = config.pipeline.playbackChunkSize || 160;
const PLAYBACK_CHUNK_INTERVAL_MS = config.pipeline.playbackChunkIntervalMs || 20;
const TARGET_COST_PER_MIN_RS = config.budget?.targetPerMinuteRs || 2;
const STREAM_CLOSE_DRAIN_MS = 1500;
const ECHO_COOLDOWN_MS = 120;   // Discard audio for 120ms after playback ends (Vobiz L16 has minimal echo)
const MAX_SPEECH_DURATION_MS = 2000; // Force processing after 2s of continuous speech for fast responses
const NOISE_CALIBRATION_CHUNKS = 8;  // ~160ms of audio to calibrate noise floor after cool-down
const VOICE_MARGIN = 0.006; // Additive margin above noise floor for voice detection
const L16_MIN_THRESHOLD = 0.0002; // Very low threshold for quiet L16 PSTN audio
const L16_VOICE_MARGIN = 0.0004;  // Small margin — L16 PSTN RMS is typically 0.0003-0.001
const PRE_SPEECH_CHUNKS = config.pipeline.preSpeechChunks || 6;

// ═════════════════════════════════════════════════════════════════════════════
// FSM STATE → LLM SCRIPT STEP MAPPING
// The FSM tracks high-level conversation states (INTRODUCING, QUALIFYING_LEAD,
// etc.) but the LLM's deterministic turn logic expects script steps
// (availability_check, purpose, etc.). This bridge function maps between them.
// ═════════════════════════════════════════════════════════════════════════════
function mapFsmStateToStep(fsmState, direction) {
  const stateMap = {
    'INIT': direction === 'outbound' ? 'availability_check' : 'inbound_assist',
    'INTRODUCING': direction === 'outbound' ? 'availability_check' : 'inbound_assist',
    'WAITING_CONFIRMATION': direction === 'outbound' ? 'availability_check' : 'purpose',
    'QUALIFYING_LEAD': 'purpose',
    'HANDLING_OBJECTION': 'handle',
    'BOOKING_SITE_VISIT': 'book_visit',
    'CLOSING': 'close',
    'END_CALL': 'close',
    'LISTENING': direction === 'outbound' ? 'availability_check' : 'handle',
    'PROCESSING': 'handle',
    'SPEAKING': 'handle'
  };
  return stateMap[fsmState] || 'handle';
}

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

  const greetings = [
    { lang: 'en-IN', dir: 'outbound', text: `Hello, this is ${config.agentName} from ${config.companyName}. Is this a good time to talk?` },
    { lang: 'en-IN', dir: 'inbound', text: `Hello, thank you for calling ${config.companyName}. How may I assist you today?` },
    { lang: 'hinglish', dir: 'outbound', text: `Hello, main ${config.agentName} ${config.companyName} se bol rahi hoon. Kya abhi baat karne ka sahi time hai?` },
    { lang: 'hinglish', dir: 'inbound', text: `Hello, ${config.companyName} ko call karne ke liye thanks. Main aapki kaise help kar sakti hoon?` },
    { lang: 'hi-IN', dir: 'outbound', text: `नमस्ते, मैं ${config.companyName} से ${config.agentName} बोल रही हूँ। क्या अभी बात करने का सही समय है?` },
    { lang: 'hi-IN', dir: 'inbound', text: `नमस्ते, ${config.companyName} में कॉल करने के लिए धन्यवाद। मैं आपकी कैसे मदद कर सकती हूँ?` }
  ];

  // Pre-generate all greetings in parallel
  const greetingPromises = greetings.map(async ({ lang, dir, text }) => {
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

  await Promise.allSettled(greetingPromises);

  // Prewarm ALL deterministic reply phrases so they hit TTS cache instantly
  // These are the fixed phrases returned by deterministicTurnReply() in llm.js
  const replyPhrases = [
    // en-IN phrases
    { lang: 'en-IN', text: 'Is this a good time to talk for one minute?' },
    { lang: 'en-IN', text: 'Great, thank you. Are you looking to buy, rent, or invest?' },
    { lang: 'en-IN', text: 'No problem. What is a better time for a quick callback?' },
    { lang: 'en-IN', text: 'Sure. Please share a suitable time for callback.' },
    { lang: 'en-IN', text: 'Perfect, thank you. We will call you at that time. Goodbye.' },
    { lang: 'en-IN', text: 'Thank you for calling. How may I help you today?' },
    { lang: 'en-IN', text: 'Yes, I can hear you clearly. Please go ahead.' },
    { lang: 'en-IN', text: 'Thank you for your time. Goodbye.' },
    // Hardcoded purpose-step replies (English only)
    { lang: 'en-IN', text: 'Great. What type of property are you considering: apartment, villa, or plot?' },
    { lang: 'en-IN', text: 'Understood. Which area and budget range are you considering for rent?' },
    { lang: 'en-IN', text: 'Nice. Are you looking for short-term returns or long-term appreciation?' },
    // Hinglish phrases
    { lang: 'hinglish', text: 'Kya abhi 1 minute baat karna convenient hai?' },
    { lang: 'hinglish', text: 'Great, thank you. Aap buy, rent, ya invest ke liye dekh rahe hain?' },
    { lang: 'hinglish', text: 'No problem. Callback ke liye kaunsa time better rahega?' },
    { lang: 'hinglish', text: 'Sure, callback ka suitable time bata dijiye.' },
    { lang: 'hinglish', text: 'Perfect, thank you. Hum ussi time call karenge. Goodbye.' },
    { lang: 'hinglish', text: 'Thank you for calling. Aaj main aapki kaise help kar sakti hoon?' },
    { lang: 'hinglish', text: 'Ji, main aapko clear sun pa rahi hoon. Please boliye.' },
    { lang: 'hinglish', text: 'Thank you ji. Goodbye.' },
    // hi-IN phrases
    { lang: 'hi-IN', text: 'क्या अभी एक मिनट बात करना ठीक रहेगा?' },
    { lang: 'hi-IN', text: 'बहुत अच्छा। क्या आप खरीदना, किराए पर लेना, या निवेश करना चाहते हैं?' },
    { lang: 'hi-IN', text: 'कोई बात नहीं। कृपया बताइए, दोबारा कॉल का सही समय क्या रहेगा?' },
    { lang: 'hi-IN', text: 'ठीक है, कृपया कॉल बैक का सही समय बताइए।' },
    { lang: 'hi-IN', text: 'बहुत धन्यवाद। हम उसी समय कॉल करेंगे। नमस्ते।' },
    { lang: 'hi-IN', text: 'धन्यवाद। मैं आपकी कैसे मदद कर सकती हूँ?' },
    { lang: 'hi-IN', text: 'जी, आपकी आवाज साफ आ रही है। बताइए।' },
    { lang: 'hi-IN', text: 'धन्यवाद। नमस्ते।' },
    // Fallback response
    { lang: 'en-IN', text: 'I apologize, could you please repeat that?' }
  ];

  const phrasePromises = replyPhrases.map(async ({ lang, text }) => {
    try {
      await tts.synthesizeRaw(text, null, lang);
      logger.debug('Prewarmed reply phrase', { lang, text: text.substring(0, 40) });
    } catch (e) {
      logger.warn('Failed to prewarm reply phrase', { lang, error: e.message });
    }
  });

  await Promise.allSettled(phrasePromises);
  logger.log('Prewarming complete', { greetings: greetings.length, replyPhrases: replyPhrases.length });
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
    this.playbackQueue = []; // Array of outbound-encoded buffers
    this.playbackLoopRunning = false;
    this.audioResidue = Buffer.alloc(0);
    this._playbackContentType = 'audio/x-mulaw;rate=8000';
    this._playbackChunkBytes = PLAYBACK_CHUNK_SIZE;

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
    this.speechStartedAt = null;  // null (not 0!) so we can distinguish 'not speaking' from timestamp

    // Pipeline cancellation
    this.abortController = null;
    this.currentPipelinePromise = null;
    this.currentLLMPromise = null;
    this.currentTTSPromise = null;

    // Timing
    this.startTime = Date.now();
    this.lastVoiceActivityAt = Date.now();
    this.lastActivity = Date.now();

    // Flags
    this._greetingStarted = false;
    this._greetingPending = false;
    this._greetingPlayback = false; // True while greeting is actively playing — blocks barge-in
    this._ended = false;
    this._finalized = false;
    this._wsClosed = false;
    this._lastPong = Date.now();
    this._audioEncoding = 'audio/x-mulaw';
    this._audioCodec = 'mulaw';
    this._l16Endian = 'unknown';
    this._l16EndianVotes = { le: 0, be: 0 };

    // Echo cool-down: discard audio for a brief period after playback ends
    this._echoCooldownUntil = 0;

    // Proper noise calibration system
    this.vadCalibrated = false;
    this.calibrationChunks = 0;
    this._frozenNoiseFloor = null;
    this._needsPostGreetingCal = false;  // True after outbound greeting to recalibrate
    this._postGreetingCalChunks = 0;
    this.noiseFloorRms = 0;

    // RMS logging
    this._rmsLogCounter = 0;

    // Timers
    this.silenceTimer = null;
    this.maxDurationTimer = null;

    // Transcript
    this.transcriptEntries = [];

    // Speculative early response: played before STT returns on outbound availability_check
    this._speculativeResponseSent = false;

    // Deepgram live streaming — provides transcript before VAD timeout
    this.dgSession = null;
    this.dgFinalText = '';      // Set by Deepgram speech_final event
    this.dgInterimText = '';    // Set by Deepgram interim events

    // Per-turn counter for latency tracking
    this._turnNumber = 0;

    // Start debug session
    callDebugger.startSession(callUuid, {
      direction,
      language: this.language,
      callerNumber
    });

    // Start audio recorder
    callRecorder.start(callUuid);
  }

  // Open Deepgram live WebSocket for this call session
  openDeepgramStream() {
    if (this.dgSession || this._ended) return;
    this.dgSession = createDeepgramSession({
      language: this.language,
      onInterim: (text) => { this.dgInterimText = text; },
      onFinal: (text) => {
        this.dgFinalText = text;
        this.dgInterimText = '';
        logger.debug('Deepgram speech_final:', { callSid: this.callSid, text });
      },
      onError: (err) => {
        logger.warn('Deepgram live error:', err?.message || err);
        this.dgSession = null;
      }
    });
  }

  closeDeepgramStream() {
    if (this.dgSession) {
      try { this.dgSession.close(); } catch (e) { }
      this.dgSession = null;
    }
  }

  normalizeLanguageCode(language) {
    return normalizeLanguageFromRegistry(language, config.language?.default || 'en-IN');
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

function prepareOutboundAudioForStream(session, mulawBuffer) {
  const codec = normalizeAudioEncoding(session?._audioEncoding);

  if (codec === 'l16') {
    const pcmLe = mulawToPcm16(mulawBuffer);
    const endian = session?._l16Endian === 'be' ? 'be' : 'le';
    const l16Buffer = endian === 'le' ? pcmLe : swapPcm16Endian(pcmLe);
    return {
      payload: l16Buffer,
      contentType: 'audio/x-l16;rate=8000',
      chunkBytes: PLAYBACK_CHUNK_SIZE * 2,
      codec: 'l16'
    };
  }

  if (codec === 'alaw') {
    const pcmLe = mulawToPcm16(mulawBuffer);
    return {
      payload: pcmBufferToAlaw(pcmLe),
      contentType: 'audio/x-alaw;rate=8000',
      chunkBytes: PLAYBACK_CHUNK_SIZE,
      codec: 'alaw'
    };
  }

  return {
    payload: mulawBuffer,
    contentType: 'audio/x-mulaw;rate=8000',
    chunkBytes: PLAYBACK_CHUNK_SIZE,
    codec: 'mulaw'
  };
}

async function sendAudioThroughStream(session, ws, mulawBuffer, options = {}) {
  return new Promise((resolve) => {
    enqueueAudio(session, ws, mulawBuffer, resolve);
  });
}

function enqueueAudio(session, ws, mulawBuffer, onComplete) {
  if (!session || ws.readyState !== 1) {
    if (onComplete) onComplete(false);
    return;
  }

  const outbound = prepareOutboundAudioForStream(session, mulawBuffer);
  session.playbackQueue.push(outbound.payload);
  session._playbackContentType = outbound.contentType;
  session._playbackChunkBytes = outbound.chunkBytes;

  if (session._lastLoggedPlaybackCodec !== outbound.codec) {
    session._lastLoggedPlaybackCodec = outbound.codec;
    logger.log('Playback format selected', {
      callSid: session.callSid,
      codec: outbound.codec,
      contentType: outbound.contentType,
      chunkBytes: outbound.chunkBytes
    });
  }

  if (!session.playbackLoopRunning) {
    runPlaybackLoop(session, ws, onComplete).catch(e => {
      logger.error('Playback loop error', e.message);
      if (onComplete) onComplete(false);
    });
  } else if (onComplete) {
    // Loop already running, will complete when queue drains — store callback
    session._playbackCompleteCallback = onComplete;
  }
}

async function runPlaybackLoop(session, ws, onComplete) {
  session.playbackLoopRunning = true;
  session.isPlaying = true;
  session.playbackStartedAt = Date.now();
  session.interruptVoiceChunks = 0;

  let chunksSent = 0;

  try {
    while ((session.playbackQueue.length > 0 || session.audioResidue.length > 0) && session.isPlaying && ws.readyState === 1) {
      const chunkTarget = session._playbackChunkBytes || PLAYBACK_CHUNK_SIZE;

      if (session.audioResidue.length < chunkTarget && session.playbackQueue.length > 0) {
        session.audioResidue = Buffer.concat([session.audioResidue, session.playbackQueue.shift()]);
      }

      const chunkSize = Math.min(chunkTarget, session.audioResidue.length);
      if (chunkSize === 0) break;

      const chunk = session.audioResidue.subarray(0, chunkSize);
      session.audioResidue = session.audioResidue.subarray(chunkSize);

      const msg = JSON.stringify({
        event: 'playAudio',
        streamSid: session.streamSid,
        contentType: session._playbackContentType,
        sampleRate: 8000,
        media: {
          streamSid: session.streamSid,
          contentType: session._playbackContentType,
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
      if (onComplete) onComplete(true);
      if (session._playbackCompleteCallback) {
        session._playbackCompleteCallback(true);
        session._playbackCompleteCallback = null;
      }
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

  // CRITICAL: Clear any audio that accumulated before the greeting started
  // (media events may arrive before the 'start' event, causing noise to buffer)
  clearBuffers(session);
  session.isSpeaking = false;
  session.speechStartedAt = null;
  session.speechChunkCount = 0;
  session.silentChunkCount = 0;

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

  // Block barge-in during greeting — Indian PSTN line noise triggers false interrupts
  session._greetingPlayback = true;

  // Send and WAIT for complete playback
  const completed = await sendAudioThroughStream(session, ws, mulawBuffer, {
    fastStart: true
    // Let pacing happen naturally at 10ms per chunk for clean audio
  });

  // Greeting finished playing — re-enable barge-in for subsequent TTS
  session._greetingPlayback = false;

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

  // Start silence timer AFTER greeting finishes
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
    // Normalize language at parse time: 'en' → 'en-IN', 'hi' → 'hi-IN', etc.
    const queryLanguage = normalizeLanguageFromRegistry(
      req.query?.language || config.language?.default || 'en-IN',
      config.language?.default || 'en-IN'
    );
    const queryDirection = req.query?.direction === 'outbound' ? 'outbound' : 'inbound';

    // Initialize session
    const initializeSession = (fields = {}) => {
      const callUuid = fields.callUuid || queryCallUuid;
      const callerNumber = fields.callerNumber || queryCallerNumber;
      const streamSid = fields.streamSid || null;
      const language = fields.language || queryLanguage;
      const direction = fields.direction || queryDirection;
      const autoGreet = fields.autoGreet !== false;

      if (!callUuid) return null;

      if (session) {
        // Update existing session
        if (streamSid && session.streamSid !== streamSid) {
          session.streamSid = streamSid;
        }
        if (callerNumber && !session.callerNumber) {
          session.callerNumber = callerNumber;
        }
        // Don't overwrite normalized language with raw value
        session.direction = direction || session.direction;

        // Try to deliver greeting if pending (can be disabled by caller for ordered init)
        if (autoGreet && session._greetingPending && session.streamSid) {
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
      // Open Deepgram live stream immediately for low-latency transcription
      session.openDeepgramStream();

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
        await endCallGracefully(session, ws, getLanguage(session.language).farewell, 'max_duration');
      }, MAX_CALL_MS);

      // Greeting will be delivered automatically after VAD calibration inside processAudioChunk
      session._greetingPending = true;

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

          const rawBytes = msgStr;
          const pcmChunk = removeDcOffset(decodeToPcm16(rawBytes, session));
          const rms = computeRms(pcmChunk);

          processAudioChunk(session, ws, rawBytes, pcmChunk, rms);
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
          // Log full start event to capture encoding format
          logger.log('WS stream start', JSON.stringify(msg).substring(0, 500));

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

          // Detect audio encoding from start event
          const encoding = msg.start?.mediaFormat?.encoding
            || msg.start?.mediaFormat?.codec
            || msg.media_format?.encoding
            || msg.encoding
            || msg.start?.encoding
            || 'audio/x-mulaw'; // default

          // IMPORTANT: delay greeting until after codec/endianness is set from this start event.
          const sess = initializeSession({ callUuid, callerNumber, streamSid, language, direction, autoGreet: false });

          if (sess) {
            const codec = normalizeAudioEncoding(encoding);
            const inferredL16Endian = codec === 'l16' ? inferL16EndiannessFromEncoding(encoding) : null;
            sess._audioEncoding = encoding;
            sess._audioCodec = codec;
            if (inferredL16Endian) {
              sess._l16Endian = inferredL16Endian;
            }
            logger.log('Audio encoding detected', {
              callSid: sess.callSid,
              encoding,
              codec,
              l16Endian: sess._l16Endian
            });
            // Stream established. Greeting stays pending until 500ms VAD calibration finishes.
            if (streamSid) {
              sess._greetingPending = true;
            }
            if (sess._greetingPending && sess.streamSid && canStartGreeting(sess)) {
              deliverInstantGreeting(sess, ws).catch(e =>
                logger.warn('Greeting delivery failed', e.message)
              );
            }
          }
          return;
        }

        // Media event
        if (msg.event === 'media' || msg.event === 'audio') {
          // If bidirectional stream returns our own outbound audio, ignore it completely
          if (msg.media && msg.media.track && msg.media.track === 'outbound') return;

          const callUuid = msg.callSid || msg.callUuid || queryCallUuid;
          const payload = msg.media?.payload || msg.payload;
          if (!payload) return;

          initializeSession({ callUuid, mode: 'media' });
          if (!session) return;

          const rawBytes = Buffer.from(payload, 'base64');

          // Diagnostic: log first 5 media chunks to see raw data
          session._mediaLogCount = (session._mediaLogCount || 0) + 1;
          if (session._mediaLogCount <= 5) {
            logger.log('Media payload dump', {
              callSid: session.callSid,
              chunk: session._mediaLogCount,
              track: msg.media?.track || 'none',
              payloadLen: payload.length,
              rawLen: rawBytes.length,
              hexFirst20: rawBytes.slice(0, 20).toString('hex'),
              encoding: session._audioEncoding,
              msgKeys: Object.keys(msg.media || msg).join(',')
            });
          }

          const pcmChunk = removeDcOffset(decodeToPcm16(rawBytes, session));
          const rms = computeRms(pcmChunk);

          // Record inbound audio (user speech)
          callRecorder.addInbound(session.callSid, pcmChunk, Date.now() - session.startTime);

          processAudioChunk(session, ws, rawBytes, pcmChunk, rms);
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
  // ─────────────────────────────────────────────
  // 0. INITIAL NOISE CALIBRATION (1st 500ms)
  // ─────────────────────────────────────────────
  if (!session.vadCalibrated) {
    // For outbound calls, skip calibration — the first 500ms contains connection
    // beeps/tones (RMS ~0.76) that would poison the noise floor. Instead, use a
    // conservative default and recalibrate AFTER the greeting plays.
    if (session.direction === 'outbound') {
      session.vadCalibrated = true;
      session._frozenNoiseFloor = session._audioCodec === 'l16' ? 0.0003 : 0.01; // Conservative default for L16 quiet PSTN
      if (session._greetingPending && session.streamSid && canStartGreeting(session)) {
        session._needsPostGreetingCal = true; // Will recalibrate after greeting
        deliverInstantGreeting(session, ws).catch(() => { });
      }
      return;
    }

    // Inbound: measure 500ms of audio for noise floor
    session.calibrationChunks++;

    if (session.calibrationChunks === 1) {
      session.noiseFloorRms = rms;
    } else {
      session.noiseFloorRms = session.noiseFloorRms * 0.8 + rms * 0.2;
    }

    if (session.calibrationChunks >= NOISE_CALIBRATION_CHUNKS) { // 500ms of incoming audio
      session.vadCalibrated = true;
      if (session.noiseFloorRms < 0.001) {
        session.noiseFloorRms = session._audioCodec === 'l16' ? 0.0004 : VAD_THRESHOLD * 0.5;
      }
      session._frozenNoiseFloor = Math.min(session.noiseFloorRms, getNoiseFloorCap(session));

      logger.log('Initial calibration complete', {
        callSid: session.callSid,
        noiseFloor: session._frozenNoiseFloor.toFixed(4)
      });

      // Calibrated! Safe to deliver greeting now.
      if (session._greetingPending && session.streamSid) {
        deliverInstantGreeting(session, ws).catch(() => { });
      }
    }
    return; // Block all processing and barge-in during calibration phase
  }

  // ─────────────────────────────────────────────
  // 1. BARGE-IN DURING PLAYBACK
  // ─────────────────────────────────────────────
  // Wait for greeting to start before normal VAD processing.
  if (session._greetingPending && !session._greetingStarted) {
    if (session.streamSid && canStartGreeting(session)) {
      if (session.direction === 'outbound') {
        session._needsPostGreetingCal = true; // Will recalibrate after greeting
      }
      deliverInstantGreeting(session, ws).catch(() => { });
    }
    return;
  }

  if (session.isPlaying) {
    // NEVER allow barge-in during the initial greeting — line noise on Indian PSTN
    // causes false positives that cut the greeting after just "Hello"
    if (session._greetingPlayback) {
      return; // Completely block barge-in during greeting
    }

    const playbackMs = Date.now() - session.playbackStartedAt;
    // Dynamic barge-in threshold based on measured line noise
    const floor = session._frozenNoiseFloor || VAD_THRESHOLD * 0.6;
    const bargeThreshold = session._audioCodec === 'l16'
      ? Math.max(0.001, floor + (L16_VOICE_MARGIN * 3))
      : Math.max(0.15, floor + (VOICE_MARGIN * 1.5));

    if (playbackMs >= BARGE_IN_MIN_PLAYBACK_MS && rms >= bargeThreshold) {
      session.interruptVoiceChunks++;
    } else {
      session.interruptVoiceChunks = 0;
    }

    if (session.interruptVoiceChunks >= BARGE_IN_REQUIRED_CHUNKS) {
      try { ws.send(JSON.stringify({ event: 'clearAudio' })); } catch { }
      session.isPlaying = false;
      session.playbackQueue = [];
      session.audioResidue = Buffer.alloc(0);
      session.cancelOngoingOperations();
      session._echoCooldownUntil = Date.now() + ECHO_COOLDOWN_MS;
      metrics.incrementInterrupt();
      callDebugger.recordInterruption(session.callSid);
    }
    return;
  }

  // ─────────────────────────────────────────────
  // 2. ECHO COOLDOWN AFTER PLAYBACK
  // ─────────────────────────────────────────────
  if (session._echoCooldownUntil) {
    if (Date.now() < session._echoCooldownUntil) return; // Discard dying echo
    session._echoCooldownUntil = 0; // Cooldown expired
    // Fall through to post-greeting recal or normal processing
  }

  // ─────────────────────────────────────────────
  // 2b. POST-GREETING RECALIBRATION (AFTER echo dies)
  // ─────────────────────────────────────────────
  if (session._needsPostGreetingCal) {
    session._postGreetingCalChunks++;

    // Store first chunk for encoding auto-detection
    if (session._postGreetingCalChunks === 1) {
      session._calSampleRaw = mulawBytes; // save raw bytes for re-decode test
      session.noiseFloorRms = rms;
    } else {
      session.noiseFloorRms = session.noiseFloorRms * 0.8 + rms * 0.2;
    }

    if (session._postGreetingCalChunks >= NOISE_CALIBRATION_CHUNKS) { // 500ms of TRUE line noise
      session._needsPostGreetingCal = false;

      // AUTO-DETECT ENCODING: if noise floor is absurdly high, try alternate G.711 codec.
      // L16 auto-detection is handled separately via endian probing in decodeToPcm16.
      const currentCodec = normalizeAudioEncoding(session._audioEncoding);
      if (session.noiseFloorRms > 0.50 && session._calSampleRaw && (currentCodec === 'mulaw' || currentCodec === 'alaw')) {
        const currentEnc = session._audioEncoding || 'audio/x-mulaw';
        const isCurrentMulaw = currentCodec === 'mulaw';
        const altDecoder = isCurrentMulaw ? alawToPcm16 : mulawToPcm16;
        const altName = isCurrentMulaw ? 'audio/x-alaw' : 'audio/x-mulaw';
        const altPcm = altDecoder(session._calSampleRaw);
        const altRms = computeRms(altPcm);

        logger.log('Encoding auto-detect', {
          callSid: session.callSid,
          currentEncoding: currentEnc,
          currentRms: session.noiseFloorRms.toFixed(4),
          altEncoding: altName,
          altRms: altRms.toFixed(4)
        });

        if (altRms < session.noiseFloorRms * 0.5) {
          // Alternate encoding is significantly quieter => switch!
          session._audioEncoding = altName;
          session._audioCodec = normalizeAudioEncoding(altName);
          session.noiseFloorRms = altRms;
          logger.log('Switched audio encoding', { callSid: session.callSid, to: altName, newRms: altRms.toFixed(4) });
        }
      }
      delete session._calSampleRaw;

      if (session.noiseFloorRms < 0.001) {
        session.noiseFloorRms = session._audioCodec === 'l16' ? 0.0004 : VAD_THRESHOLD * 0.5;
      }
      session._frozenNoiseFloor = Math.min(session.noiseFloorRms, getNoiseFloorCap(session));
      logger.log('Post-greeting recalibration complete', {
        callSid: session.callSid,
        noiseFloor: session._frozenNoiseFloor.toFixed(4),
        encoding: session._audioEncoding
      });
    }
    return; // Block processing during recalibration
  }

  // ─────────────────────────────────────────────
  // 3. FROZEN NOISE FLOOR THRESHOLD
  // ─────────────────────────────────────────────
  // Smoothly track downward if measured noise is consistently lower than the frozen floor
  if (session._frozenNoiseFloor && !session.isSpeaking && rms < session._frozenNoiseFloor) {
    session._frozenNoiseFloor = (session._frozenNoiseFloor * 0.99) + (rms * 0.01);
  }

  // Additive margin applied to frozen network floor
  const floor = session._frozenNoiseFloor || VAD_THRESHOLD * 0.6;
  const minThreshold = session._audioCodec === 'l16' ? L16_MIN_THRESHOLD : VAD_THRESHOLD;
  const voiceMargin = session._audioCodec === 'l16' ? L16_VOICE_MARGIN : VOICE_MARGIN;
  const dynamicThreshold = Math.max(minThreshold, floor + voiceMargin);
  const hasVoice = rms >= dynamicThreshold;

  // Track peak RMS between log intervals for diagnostics
  session._peakRms = Math.max(session._peakRms || 0, rms);
  session._rmsLogCounter = (session._rmsLogCounter || 0) + 1;
  if (session._rmsLogCounter % 50 === 0) {
    logger.log('RMS check', {
      callSid: session.callSid,
      rms: rms.toFixed(4),
      peak: (session._peakRms || 0).toFixed(4),
      threshold: dynamicThreshold.toFixed(4),
      floor: floor.toFixed(4),
      hasVoice,
      isSpeaking: session.isSpeaking,
      chunks: session._rmsLogCounter
    });
    session._peakRms = 0; // Reset peak for next window
  }

  // ─────────────────────────────────────────────
  // 5. SPEECH DETECTION
  // ─────────────────────────────────────────────
  if (hasVoice) {
    session.speechChunkCount++;
    session.silentChunkCount = 0;
    session.lastVoiceActivityAt = Date.now();

    if (!session.isSpeaking) {
      session.preSpeechMulaw.push(mulawBytes);
      session.preSpeechPcm.push(pcmChunk);
      if (session.preSpeechMulaw.length > PRE_SPEECH_CHUNKS) {
        session.preSpeechMulaw.shift();
        session.preSpeechPcm.shift();
      }
    }

    if (!session.isSpeaking && session.speechChunkCount >= SPEECH_START_CHUNKS) {
      session.isSpeaking = true;
      session.speechStartedAt = Date.now();

      session.audioChunks.push(...session.preSpeechMulaw);
      session.pcmBuffer.push(...session.preSpeechPcm);
      // Fix missing totalPcmBytes accumulation
      session.totalPcmBytes += session.preSpeechPcm.reduce((acc, chunk) => acc + chunk.length, 0);

      session.preSpeechMulaw = [];
      session.preSpeechPcm = [];

      // The current chunk was already added via preSpeechPcm, so return early to avoid duplicating it
      return;
    }

    if (session.isSpeaking) {
      session.audioChunks.push(mulawBytes);
      session.pcmBuffer.push(pcmChunk);
      session.totalPcmBytes += pcmChunk.length;

      // Feed PCM chunk to Deepgram live stream for early transcript
      if (session.dgSession) {
        try { session.dgSession.send(pcmChunk); } catch (e) { /* ignore */ }
      }

      // Force processing if buffer is too large OR speech has lasted too long
      const speechDurationMs = session.speechStartedAt !== null
        ? Date.now() - session.speechStartedAt
        : 0;
      if (session.totalPcmBytes > MAX_BUFFER_BYTES || speechDurationMs > MAX_SPEECH_DURATION_MS) {
        if (speechDurationMs > MAX_SPEECH_DURATION_MS) {
          logger.debug('Max speech duration reached, forcing processing', {
            callSid: session.callSid,
            durationMs: speechDurationMs,
            pcmBytes: session.totalPcmBytes
          });
        }
        session.isSpeaking = false;
        session.speechStartedAt = null;
        triggerProcessing(session, ws);
      }
    }

    return;
  }

  // ─────────────────────────────────────────────
  // 6. SILENCE
  // ─────────────────────────────────────────────
  session.silentChunkCount++;
  session.speechChunkCount = 0;

  if (session.isSpeaking && session.silentChunkCount >= SPEECH_END_CHUNKS) {
    session.isSpeaking = false;
    session.speechStartedAt = null;

    const minProcessBytes = Math.max(MIN_UTTERANCE_BYTES, 3200); // ~0.2s @ 8kHz PCM16
    if (session.totalPcmBytes >= minProcessBytes) {
      triggerProcessing(session, ws);
    } else {
      clearBuffers(session);
    }

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

  // If already processing, DON'T cancel — queue the new audio instead
  if (session.isProcessing) {
    session.pendingPcmChunks.push(...pcmChunks);
    logger.debug('Queued utterance (pipeline busy)', session.callSid);
    return;
  }

  // Cancel any playing audio
  if (session.isPlaying) {
    try {
      ws.send(JSON.stringify({ event: 'clear', streamSid: session.streamSid }));
    } catch (e) { /* ignore */ }
    session.isPlaying = false;
  }

  // ── SPECULATIVE EARLY RESPONSE ──────────────────────────────────────────
  // On outbound calls at availability_check (the first turn after greeting),
  // immediately play the cached re-ask phrase BEFORE STT returns.
  // This eliminates ~2s of dead air (STT latency) from the caller's experience.
  // The STT pipeline still runs in the background for transcript/FSM purposes.
  if (session.direction === 'outbound' &&
    !session._speculativeResponseSent &&
    session.fsm.getState() === States.LISTENING &&
    ws.readyState === 1) {
    session._speculativeResponseSent = true;
    const speculativePhrase = llm.phrase(session.language, 'availabilityReask');
    const cached = tts.synthesizeRawCached?.(speculativePhrase, session.language);
    // Try synchronous cache lookup first, fall back to async
    const playCached = (buf) => {
      if (buf?.mulawBuffer && ws.readyState === 1) {
        logger.log('Speculative early response', {
          callSid: session.callSid,
          phrase: speculativePhrase.substring(0, 40)
        });
        sendAudioThroughStream(session, ws, buf.mulawBuffer).catch(() => { });
      }
    };
    if (cached) {
      playCached(cached);
    } else {
      // Async cache hit (synthesizeRaw returns from cache)
      tts.synthesizeRaw(speculativePhrase, null, session.language)
        .then(playCached)
        .catch(() => { });
    }
  }

  startPipeline(session, ws, pcmChunks);
}

function startPipeline(session, ws, pcmChunks) {
  const pipelineId = ++session.lastPipelineId;
  session.isProcessing = true;
  session.currentPipelineId = pipelineId;
  session.userSpeakingWhileProcessing = false;
  session.abortController = new AbortController();

  const pipelinePromise = processUtterance(session, ws, pcmChunks, pipelineId, session.abortController.signal)
    .catch(err => logger.error('Pipeline error', session.callSid, err.message))
    .finally(() => {
      if (session.currentPipelineId === pipelineId) {
        session.isProcessing = false;
        session.abortController = null;
      }
      if (session.currentPipelinePromise === pipelinePromise) {
        session.currentPipelinePromise = null;
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

  session.currentPipelinePromise = pipelinePromise;
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
  const audioDurationSec = pcmData.length / 16000;
  const utteranceRms = computeRms(pcmData);

  // Skip noise-only utterances: short + low energy, OR L16 first utterance with marginal RMS
  const isFirstUtterance = session.transcriptEntries.filter(e => e.speaker === 'customer').length === 0;
  const l16NoiseGuard = isFirstUtterance && session._audioCodec === 'l16' && utteranceRms < 0.002;
  if ((audioDurationSec <= 0.8 && utteranceRms < 0.001) || l16NoiseGuard) {
    logger.log('Skipping low-energy utterance before STT', {
      callSid: session.callSid,
      pcmBytes: pcmData.length,
      audioDuration: `${audioDurationSec.toFixed(1)}s`,
      rms: utteranceRms.toFixed(4)
    });
    return;
  }

  logger.log('STT input', {
    callSid: session.callSid,
    pcmBytes: pcmData.length,
    audioDuration: `${audioDurationSec.toFixed(1)}s`,
    timeSinceCallStart: `${((Date.now() - session.startTime) / 1000).toFixed(1)}s`
  });

  // Use Deepgram live transcript if already available (speech_final fired before VAD timeout)
  const sttStart = Date.now();
  let sttResult;
  if (session.dgFinalText) {
    sttResult = { text: session.dgFinalText, confidence: 0.92, empty: false, latencyMs: 0, audioDurationSec };
    session.dgFinalText = '';
    session.dgInterimText = '';
    logger.log('STT: using Deepgram live transcript (0ms)', { callSid: session.callSid, text: sttResult.text });
  } else {
    sttResult = await withRetry(
      () => stt.transcribe(wavBuffer, session.callSid, 'audio/wav', session.language),
      1, 0, 'STT'
    );
  }
  let sttLatency = Date.now() - sttStart;

  // Safety net for ambiguous L16 streams:
  // if primary STT is empty despite high-energy audio, retry once with swapped endianness.
  if ((!sttResult || sttResult.empty || !sttResult.text) &&
    session._audioCodec === 'l16' &&
    audioDurationSec >= 1.0 &&
    utteranceRms >= 0.01) {
    const altStart = Date.now();
    const altPcmData = removeDcOffset(swapPcm16Endian(pcmData));
    const altWavBuffer = buildWavBuffer(altPcmData);
    const altStt = await stt.transcribe(altWavBuffer, session.callSid, 'audio/wav', session.language);
    sttLatency += Date.now() - altStart;

    if (altStt && !altStt.empty && altStt.text) {
      const previousEndian = session._l16Endian || 'unknown';
      session._l16Endian = previousEndian === 'be' ? 'le' : 'be';
      session._l16EndianVotes = session._l16Endian === 'le' ? { le: 3, be: 0 } : { le: 0, be: 3 };
      logger.log('Recovered STT with alternate L16 endian', {
        callSid: session.callSid,
        previousEndian,
        selectedEndian: session._l16Endian,
        text: altStt.text
      });
      sttResult = altStt;
    } else {
      logger.log('Alternate endian STT also empty', {
        callSid: session.callSid,
        pcmBytes: pcmData.length,
        audioDuration: `${audioDurationSec.toFixed(1)}s`
      });
    }
  }

  if (abortSignal.aborted || pipelineId !== session.lastPipelineId) {
    logger.debug('Pipeline cancelled after STT', session.callSid);
    return;
  }

  if (sttResult.empty || !sttResult.text) {
    logger.log('STT returned empty — skipping pipeline', { callSid: session.callSid, pcmBytes: pcmData.length });
    return;
  }

  // 2. FSM Intent Processing
  const fsmResult = session.fsm.processTranscript(sttResult.text);
  const detectedIntent = fsmResult.intent || fsmResult.data?.intent || 'unknown';
  logger.log(`STT (${sttLatency}ms): "${sttResult.text}" | Intent: ${detectedIntent} | State: ${session.fsm.getState()}`);

  // Track intent accuracy (non-blocking)
  intentTracker.record({
    callSid: session.callSid,
    turnNumber: (session._turnNumber || 0) + 1,
    userText: sttResult.text,
    detectedIntent,
    fsmState: session.fsm.getState(),
    language: session.language,
    latencyMs: sttLatency
  }).catch(() => { });

  // Record transcript
  session.transcriptEntries.push({
    startMs: Date.now() - session.startTime - sttLatency,
    endMs: Date.now() - session.startTime,
    speaker: 'customer',
    text: sttResult.text,
    confidence: sttResult.confidence
  });

  const wsOpen = !session._wsClosed && ws.readyState === 1;
  if (!wsOpen) {
    logger.log('WS closed — will generate reply for transcript but skip audio', {
      callSid: session.callSid,
      pipelineId,
      transcript: sttResult.text
    });
  }

  // Check for cancellation before LLM
  if (abortSignal.aborted || pipelineId !== session.lastPipelineId) {
    logger.debug('Skipping LLM due to cancellation', session.callSid);
    return;
  }

  // 3. LLM with FSM context (Streaming)
  // Bridge FSM state → script step for deterministic turn logic in LLM
  const fsmContext = session.fsm.getLLMContext();
  const callState = {
    ...fsmContext,
    step: fsmContext.step || mapFsmStateToStep(session.fsm.getState(), session.direction),
    turnCount: session.fsm.turnCount,
    direction: session.direction
  };

  const llmStart = Date.now();
  logger.log('LLM pipeline starting', { callSid: session.callSid, step: callState.step, fsmState: session.fsm.getState(), direction: session.direction });

  const replyStream = llm.generateReplyStream({
    callState,
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
  let ttsLatencyTotal = 0;

  // Process LLM in streaming mode
  for await (const chunk of replyStream) {
    if (abortSignal.aborted || pipelineId !== session.lastPipelineId) return;

    if (chunk.type === 'sentence') {
      let sentence = String(chunk.text || '').trim();
      if (!sentence) continue;

      if (firstChunkMs === 0) {
        firstChunkMs = Date.now() - llmStart;
        logger.debug(`Time to first sentence: ${firstChunkMs}ms`);
        // Transition FSM to speaking
        session.fsm.transition('intent_classified', { response: '(streaming)' });
      }

      if (costGuardActive && fullSentence.length > 120) continue; // Skip further sentences if guard is active

      fullSentence += sentence + ' ';

      // If speculative response already played this exact phrase, skip TTS+playback
      if (session._speculativeResponseSent && session.isPlaying) {
        logger.debug('Skipping TTS — speculative response already playing', session.callSid);
        continue;
      }

      const ttsStart = Date.now();
      const ttsResult = await withRetry(
        () => tts.synthesizeRaw(sentence, session.callSid, session.language),
        1, 0, 'TTS'
      );
      ttsLatencyTotal += (Date.now() - ttsStart);

      if (abortSignal.aborted || pipelineId !== session.lastPipelineId) return;
      if (ttsResult?.mulawBuffer && wsOpen && ws.readyState === 1) {
        // Record outbound AI audio
        if (ttsResult.pcmBuffer) {
          callRecorder.addOutbound(session.callSid, ttsResult.pcmBuffer, Date.now() - session.startTime);
        }
        await sendAudioThroughStream(session, ws, ttsResult.mulawBuffer);
      } else {
        logger.warn('Reply TTS synthesis failed, skipping audio', {
          callSid: session.callSid,
          sentenceChars: sentence.length
        });
      }
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
  metrics.addPipelineLatency(sttLatency, completeLatency, ttsLatencyTotal);

  // Per-turn latency tracking
  session._turnNumber = (session._turnNumber || 0) + 1;
  const totalLatency = sttLatency + completeLatency;
  callDebugger.recordTurn(session.callSid, {
    turnNumber: session._turnNumber,
    transcript: sttResult.text,
    response: fullSentence.trim(),
    stt_time: sttLatency,
    llm_time: firstChunkMs,
    tts_time: ttsLatencyTotal,
    total_time: totalLatency,
    fsmState: session.fsm.getState(),
    fsmIntent: fsmResult.intent || fsmResult.data?.intent,
    action: finalAction,
    sttSource: session.dgFinalText === '' && sttResult.latencyMs === 0 ? 'deepgram_live' : 'batch',
    llmProvider: session._lastLlmProvider || 'gemini',
    ttsCached: ttsLatencyTotal < 20,
    audioDurationSec
  });

  // Handle actions
  if (finalAction === 'hangup' || finalAction === 'escalate') {
    const farewell = finalAction === 'escalate'
      ? 'Let me connect you with our property expert right away. Please hold.'
      : null;
    await endCallGracefully(session, ws, farewell);
  } else if (!costControl.isWithinBudget(session.callSid)) {
    logger.warn('Budget exceeded, hanging up', session.callSid);
    await endCallGracefully(session, ws, 'Our call duration limit is reached. We will call you back. Goodbye.', 'budget_exceeded');
  } else if (session.fsm.getState() === States.END_CALL) {
    await endCallGracefully(session, ws, null, 'fsm_end');
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
      callDebugger.recordSilence(session.callSid);
      await endCallGracefully(session, ws, langConfig.farewell, 'silence_timeout');
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

async function endCallGracefully(session, ws, farewellText, endReason = 'agent_hangup') {
  if (session._ended) return;
  session._ended = true;
  session._endReason = endReason;

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
  if (!session || session._finalized) return;

  session._wsClosed = true;
  session.cancelOngoingOperations(); // Signal abort immediately so in-flight TTS/LLM bail out fast
  session.closeDeepgramStream();     // Close Deepgram live WS
  clearTimeout(session.silenceTimer);
  clearTimeout(session.maxDurationTimer);

  if (session.isProcessing && session.currentPipelinePromise) {
    logger.log('Waiting for in-flight pipeline during cleanup', {
      callSid: session.callSid,
      pipelineId: session.currentPipelineId,
      drainMs: STREAM_CLOSE_DRAIN_MS
    });

    let timedOut = false;
    await Promise.race([
      session.currentPipelinePromise.catch(() => { }),
      new Promise((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, STREAM_CLOSE_DRAIN_MS);
      })
    ]);

    if (timedOut && session.isProcessing) {
      logger.warn('Pipeline drain timeout during cleanup', {
        callSid: session.callSid,
        pipelineId: session.currentPipelineId
      });
    }
  }

  session._ended = true;

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
      session._callDbId = call._id;  // Store for callRecorder.finalize
      call.durationSec = duration;
      call.endAt = new Date();
      call.status = 'completed';
      await call.save();
    }

    if (call && session.transcriptEntries.length > 0) {
      const fullText = session.transcriptEntries.map(e => `${e.speaker}: ${e.text}`).join('\n');

      // Compute avg latency from callDebugger turns (attached to transcript)
      const debugSession = session._debugTurns || [];
      const latencies = debugSession.map(t => t.total_time).filter(Boolean);
      const avgLatencyMs = latencies.length
        ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
        : 0;

      await Transcript.create({
        callId: call._id,
        callSid: session.callSid,
        entries: session.transcriptEntries,
        fullText,
        summary: fullText.substring(0, 500),
        avgLatencyMs
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

  // Generate and save call debug report
  callDebugger.finalizeSession(session.callSid, {
    endReason: session._endReason || 'ws_close',
    finalFsmState: session.fsm?.getState() || 'unknown'
  }).catch(err => logger.warn('Call debug finalize error:', err.message));

  // Save audio recording
  callRecorder.finalize(session.callSid, session._callDbId || null)
    .catch(err => logger.warn('Call recording finalize error:', err.message));
}

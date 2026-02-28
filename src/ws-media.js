const logger = require('./utils/logger');
const stt = require('./services/stt');
const llm = require('./services/llm');
const tts = require('./services/tts');
const vobizClient = require('./services/vobizClient');
const Call = require('./models/call.model');
const Lead = require('./models/lead.model');
const Transcript = require('./models/transcript.model');
const Recording = require('./models/recording.model');
const metrics = require('./services/metrics');
const costControl = require('./services/costControl');
const storage = require('./services/storage');
const { monitoringServer } = require('./services/monitoring');
const { getLanguage } = require('./config/languages');
const { retry } = require('./utils/retry');

function normalizeDirection(direction) {
  return String(direction || '').toLowerCase() === 'outbound' ? 'outbound' : 'inbound';
}

function normalizeLanguageCode(language) {
  const raw = String(language || '').trim().toLowerCase();
  if (!raw) return 'en-IN';
  if (raw === 'hinglish' || raw === 'hi-en' || raw === 'en-hi' || raw === 'hindi-english') return 'hinglish';
  return language;
}

function isHindiScript(text) {
  return /[\u0900-\u097F]/.test(String(text || ''));
}

function detectLanguageFromTranscript(text, currentLanguage = 'en-IN') {
  const input = String(text || '').trim();
  if (!input) return currentLanguage;

  if (isHindiScript(input)) return 'hi-IN';

  const lower = input.toLowerCase();
  const hindiRoman = /\b(haan|han|ha|nahi|nahin|aap|mera|mujhe|kaise|kya|ghar|chahiye|bol raha|bol rahi|theek|thik|ji)\b/i.test(lower);
  const english = /\b(yes|no|hello|buy|rent|invest|property|budget|location|time|talk|call)\b/i.test(lower);

  if (hindiRoman && english) return 'hinglish';
  if (hindiRoman) return currentLanguage === 'hi-IN' ? 'hi-IN' : 'hinglish';
  if (english) return 'en-IN';
  return currentLanguage;
}

function inferHonorificFromTranscript(text, current = 'sir_maam') {
  const lower = String(text || '').toLowerCase();
  if (!lower) return current;

  const maleHints = /\b(mr\.?|sir|main bol raha|bol raha hoon|speaking,? sir)\b|à¤¬à¥‹à¤² à¤°à¤¹à¤¾ à¤¹à¥‚à¤/i;
  const femaleHints = /\b(mrs\.?|ms\.?|ma'am|madam|main bol rahi|bol rahi hoon)\b|à¤¬à¥‹à¤² à¤°à¤¹à¥€ à¤¹à¥‚à¤/i;

  if (femaleHints.test(lower)) return 'maam';
  if (maleHints.test(lower)) return 'sir';
  return current;
}

function getInitialStepByDirection(direction) {
  return normalizeDirection(direction) === 'outbound' ? 'availability_check' : 'inbound_assist';
}

function buildInitialGreetingText(session) {
  const language = normalizeLanguageCode(session.language);
  const direction = normalizeDirection(session.direction);
  const agent = config.agentName;
  const company = config.companyName;

  if (direction === 'inbound') {
    if (language === 'hi-IN') {
      return `à¤¨à¤®à¤¸à¥à¤¤à¥‡, ${company} à¤®à¥‡à¤‚ à¤•à¥‰à¤² à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤§à¤¨à¥à¤¯à¤µà¤¾à¤¦à¥¤ à¤®à¥ˆà¤‚ ${agent} à¤¬à¥‹à¤² à¤°à¤¹à¥€ à¤¹à¥‚à¤à¥¤ à¤®à¥ˆà¤‚ à¤†à¤ªà¤•à¥€ à¤•à¥ˆà¤¸à¥‡ à¤®à¤¦à¤¦ à¤•à¤° à¤¸à¤•à¤¤à¥€ à¤¹à¥‚à¤, à¤¸à¤° à¤¯à¤¾ à¤®à¥ˆà¤¡à¤®?`;
    }
    if (language === 'hinglish') {
      return `Hello, ${company} ko call karne ke liye thanks. Main ${agent} bol rahi hoon. Aaj main aapki kaise help kar sakti hoon, Sir ya Ma'am?`;
    }
    return `Hello, thank you for calling ${company}. How may I help you today, Sir or Ma'am?`;
  }

  if (language === 'hi-IN') {
    return `à¤¨à¤®à¤¸à¥à¤¤à¥‡, à¤®à¥ˆà¤‚ ${company} à¤¸à¥‡ ${agent} à¤¬à¥‹à¤² à¤°à¤¹à¥€ à¤¹à¥‚à¤à¥¤ à¤•à¥à¤¯à¤¾ à¤…à¤­à¥€ à¤¬à¤¾à¤¤ à¤•à¤°à¤¨à¥‡ à¤•à¤¾ à¤¸à¤¹à¥€ à¤¸à¤®à¤¯ à¤¹à¥ˆ?`;
  }
  if (language === 'hinglish') {
    return `Hello, main ${agent} ${company} se bol rahi hoon. Kya abhi baat karne ka sahi time hai?`;
  }
  return `Hello, this is ${agent} from ${company}. Is this a good time to talk?`;
}

function compressForTelephony(text, maxChars = 120) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const sentenceCut = clean.indexOf('.', Math.max(50, Math.floor(maxChars * 0.6)));
  if (sentenceCut > 0 && sentenceCut <= maxChars) return clean.slice(0, sentenceCut + 1);
  return `${clean.slice(0, maxChars - 1).trimEnd()}...`;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MULAW â†” PCM CONVERSION (Vobiz streams Âµ-law 8kHz, Whisper needs PCM/WAV)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PCM â†’ Âµ-law ENCODING (for sending audio BACK through bidirectional stream)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RMS-based Voice Activity Detection on PCM samples
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

const VAD_THRESHOLD = require('./config').pipeline.vadThreshold;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PER-CALL SESSION STATE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class CallSession {
  constructor(callUuid, callerNumber, language, direction = 'inbound') {
    this.callSid = callUuid;     // Unified field name (used throughout DB and session)
    this.callUuid = callUuid;    // Vobiz-specific alias
    this.callerNumber = callerNumber;
    this.streamSid = null;       // Vobiz stream ID
    this.language = normalizeLanguageCode(language || require('./config').language?.default || 'en-IN');
    this.direction = normalizeDirection(direction);
    this.honorific = 'sir_maam';

    // Audio buffering
    this.audioChunks = [];
    this.pcmBuffer = [];
    this.totalPcmBytes = 0;
    this.preSpeechMulaw = [];
    this.preSpeechPcm = [];
    this.preSpeechBytes = 0;
    this.noiseFloorRms = VAD_THRESHOLD * 0.6;

    // Pipeline state
    this.isProcessing = false;
    this.currentPipelineId = 0;
    this.lastPipelineId = 0;
    this.pendingPcmChunks = [];
    this.userSpeakingWhileProcessing = false;

    // Conversation state
    this.callState = {
      step: getInitialStepByDirection(direction),
      turnCount: 0,
      silenceCount: 0,
      direction: this.direction
    };
    this.transcriptEntries = [];
    this.leadData = {};
    this.qualityScore = 0;
    this.languageLockTurn = 3;

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
    this.playbackStartedAt = 0;
    this.interruptVoiceChunks = 0;
    this._greetingStarted = false;
    this._greetingPending = false;

    // Guards
    this._finalized = false;
    this._ended = false;
    this._lastPong = Date.now();
  }
}

const sessions = new Map();

// â”€â”€ Tuning Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const config = require('./config');
const SPEECH_START_CHUNKS = config.pipeline.speechStartChunks;
const SPEECH_END_CHUNKS = config.pipeline.speechEndChunks;
const BARGE_IN_MIN_PLAYBACK_MS = config.pipeline.bargeInMinPlaybackMs;
const BARGE_IN_REQUIRED_CHUNKS = config.pipeline.bargeInRequiredChunks;
const BARGE_IN_RMS_MULTIPLIER = config.pipeline.bargeInRmsMultiplier;
const MIN_UTTERANCE_BYTES = config.pipeline.minUtteranceBytes;
const MAX_BUFFER_BYTES = config.pipeline.maxBufferBytes;
const SILENCE_PROMPT_MS = config.pipeline.silencePromptMs;
const MAX_CALL_MS = config.callMaxMinutes * 60 * 1000;
const WS_PING_INTERVAL = config.pipeline.wsPingIntervalMs;
const PRE_SPEECH_CHUNKS = config.pipeline.preSpeechChunks;
const TARGET_COST_PER_MIN_RS = config.budget?.targetPerMinuteRs || 2;

// Chunk size for streaming audio back over WebSocket
// Vobiz expects 20ms chunks at 8kHz = 160 bytes of Âµ-law
const PLAYBACK_CHUNK_SIZE = config.pipeline.playbackChunkSize;
const PLAYBACK_CHUNK_INTERVAL_MS = config.pipeline.playbackChunkIntervalMs;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SEND AUDIO THROUGH BIDIRECTIONAL STREAM (VOBIZ FORMAT)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Vobiz bidirectional stream: We send audio back by writing JSON 'playAudio'
// events to the WebSocket. The format is:
// { "event": "playAudio", "media": { "contentType": "audio/x-mulaw;rate=8000", "payload": "<base64>" } }
//
async function sendAudioThroughStream(session, ws, mulawBuffer) {
  if (!session.streamSid || ws.readyState !== 1) return;

  session.isPlaying = true;
  session.playbackStartedAt = Date.now();
  session.interruptVoiceChunks = 0;
  // Use a separate playback counter so we don't invalidate pipeline checks
  session._playbackId = (session._playbackId || 0) + 1;
  const playbackId = session._playbackId;

  // Do not clear by default. Clearing before every play can clip/delay prompts.

  // Send in real-time 20ms chunks (160 bytes of µ-law at 8kHz).
  // Vobiz playback is more stable when we pace media rather than burst-sending.
  const totalChunks = Math.ceil(mulawBuffer.length / PLAYBACK_CHUNK_SIZE);
  const playbackStartTime = Date.now();

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
    } catch (err) {
      logger.warn('Stream send error', err.message);
      break;
    }

    // Drift-compensated pacing to prevent buffer underrun/stuttering
    if (i + 1 < totalChunks) {
      const expectedTime = playbackStartTime + (i + 1) * PLAYBACK_CHUNK_INTERVAL_MS;
      const delay = expectedTime - Date.now();
      if (delay > 0) {
        await new Promise(r => setTimeout(r, Math.min(delay, PLAYBACK_CHUNK_INTERVAL_MS)));
      }
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
  session.playbackStartedAt = 0;
  session.interruptVoiceChunks = 0;
}

function clearPreSpeechCache(session) {
  session.preSpeechMulaw = [];
  session.preSpeechPcm = [];
  session.preSpeechBytes = 0;
}

function rememberPreSpeechChunk(session, mulawBytes, pcmChunk) {
  session.preSpeechMulaw.push(mulawBytes);
  session.preSpeechPcm.push(pcmChunk);
  session.preSpeechBytes += pcmChunk.length;

  if (session.preSpeechMulaw.length > PRE_SPEECH_CHUNKS) {
    session.preSpeechMulaw.shift();
    const old = session.preSpeechPcm.shift();
    session.preSpeechBytes = Math.max(0, session.preSpeechBytes - (old?.length || 0));
  }
}

function flushPreSpeechCache(session) {
  if (!session.preSpeechPcm.length) return;
  session.audioChunks.push(...session.preSpeechMulaw);
  session.pcmBuffer.push(...session.preSpeechPcm);
  session.totalPcmBytes += session.preSpeechBytes;
  clearPreSpeechCache(session);
}

async function maybeDeliverInitialGreeting(session, ws) {
  if (!session || session._greetingStarted || session._ended) return;
  if (!session.streamSid || ws.readyState !== 1) {
    session._greetingPending = true;
    return;
  }

  session._greetingStarted = true;
  session._greetingPending = false;
  await deliverInitialGreeting(session, ws);
}

let _greetingsPrewarmed = false;
function prewarmGreetingCache() {
  if (_greetingsPrewarmed) return;
  _greetingsPrewarmed = true;

  const defaultLanguage = normalizeLanguageCode(config.language?.default || 'en-IN');
  const phrases = [
    { language: defaultLanguage, direction: 'outbound' },
    { language: defaultLanguage, direction: 'inbound' },
    { language: 'hinglish', direction: 'outbound' },
    { language: 'hi-IN', direction: 'outbound' }
  ];

  Promise.allSettled(phrases.map(({ language, direction }) => {
    const text = buildInitialGreetingText({ language, direction });
    return tts.synthesizeRaw(text, null, language);
  })).catch(() => { /* ignore */ });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN WEBSOCKET HANDLER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
module.exports = function setupWs(app) {
  app.ws('/stream', function (ws, req) {
    let session = null;
    let pingInterval = null;

    // Extract parameters from query string (passed from Vobiz XML <Stream>)
    const queryCallUuid = req.query?.callUuid;
    const queryCallerNumber = req.query?.callerNumber || '';
    const queryLanguage = req.query?.language || config.language?.default || 'en-IN';
    const queryDirection = normalizeDirection(req.query?.direction || 'inbound');

    prewarmGreetingCache();

    const initializeSession = (fields = {}) => {
      const callUuid = fields.callUuid || queryCallUuid;
      const callerNumber = fields.callerNumber || queryCallerNumber;
      const streamSid = fields.streamSid || null;
      const language = normalizeLanguageCode(fields.language || queryLanguage);
      const direction = normalizeDirection(fields.direction || queryDirection);

      if (!callUuid) return null;
      if (session) {
        if (streamSid && session.streamSid !== streamSid) {
          session.streamSid = streamSid;
        }
        if (callerNumber && !session.callerNumber) {
          session.callerNumber = callerNumber;
        }
        session.language = language || session.language;
        session.direction = direction || session.direction;
        session.callState.direction = session.direction;
        if (!session._greetingStarted && session.callState.turnCount === 0) {
          session.callState.step = getInitialStepByDirection(session.direction);
        }
        if (session._greetingPending || !session._greetingStarted) {
          maybeDeliverInitialGreeting(session, ws).catch((e) => logger.warn('Greeting delivery failed', e.message));
        }
        return session;
      }

      session = new CallSession(callUuid, callerNumber, language, direction);
      session.streamSid = streamSid;
      sessions.set(callUuid, session);
      costControl.trackCall(callUuid);

      logger.log('Stream started', {
        callUuid,
        callerNumber,
        streamSid: streamSid || '(pending)',
        language,
        direction,
        mode: fields.mode || 'normal'
      });

      monitoringServer.notifyCallStarted({
        callUuid,
        phoneNumber: callerNumber,
        direction: session.direction,
        startTime: new Date()
      });

      session.maxDurationTimer = setTimeout(async () => {
        const langConfig = getLanguage(session.language);
        logger.warn('Max call duration reached', callUuid);
        await endCallGracefully(session, ws, langConfig.farewell);
      }, MAX_CALL_MS);

      maybeDeliverInitialGreeting(session, ws).catch((e) => logger.warn('Greeting delivery failed', e.message));
      return session;
    };

    // Initialize as soon as WS is established so greeting doesn't wait for first media frame.
    if (queryCallUuid) {
      initializeSession({
        callUuid: queryCallUuid,
        callerNumber: queryCallerNumber,
        language: queryLanguage,
        direction: queryDirection,
        mode: 'ws-open'
      });
    }

    // â”€â”€ WebSocket Heartbeat (detect stale connections) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Message handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ws.on('message', async (msgStr) => {
      try {
        // Vobiz sends binary audio data and text JSON control messages
        if (Buffer.isBuffer(msgStr)) {
          // Binary frame = raw Âµ-law audio from caller
          initializeSession({
            callUuid: queryCallUuid,
            callerNumber: queryCallerNumber,
            language: queryLanguage,
            direction: queryDirection,
            mode: 'binary-fallback'
          });
          if (!session) return;

          const mulawBytes = msgStr;
          const pcmChunk = mulawToPcm16(mulawBytes);
          const rms = computeRms(pcmChunk);
          processAudioChunk(session, ws, mulawBytes, pcmChunk, rms);
          return;
        }

        const msg = JSON.parse(msgStr);

        // â”€â”€ CONNECTED event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (msg.event === 'connected') {
          logger.log('WS: connected', msg.protocol);
          return;
        }

        // â”€â”€ START event â€” initialize session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const isStartEvent = msg.event === 'start' || msg.event === 'streamStart' || msg.event === 'startCall';
        if (isStartEvent) {
          const callUuid = msg.start?.callSid
            || msg.start?.callUuid
            || msg.start?.call_id
            || msg.start?.call_uuid
            || msg.callSid
            || msg.callUuid
            || msg.call_id
            || msg.call_uuid
            || queryCallUuid;
          let callerNumber = msg.start?.customParameters?.callerNumber
            || msg.start?.customParameters?.from
            || msg.start?.customParameters?.to
            || msg.start?.callerNumber
            || msg.start?.from
            || msg.start?.to
            || msg.from
            || queryCallerNumber;
          const streamSid = msg.streamSid
            || msg.start?.streamSid
            || msg.start?.streamId
            || msg.stream_id
            || `stream_${Date.now()}`;
          const language = msg.start?.customParameters?.language
            || msg.start?.language
            || msg.language
            || queryLanguage;
          const direction = msg.start?.customParameters?.direction
            || msg.start?.direction
            || msg.direction
            || queryDirection;

          if (normalizeDirection(direction) === 'outbound') {
            callerNumber = msg.start?.customParameters?.to || msg.start?.to || msg.to || callerNumber;
          }

          const created = initializeSession({ callUuid, callerNumber, streamSid, language, direction, mode: 'start-event' });
          if (!created) {
            logger.error('WS start event missing required fields', { callUuid, streamSid, event: msg.event });
            ws.close(1003, 'Missing required parameters');
          }
          return;
        }

        // â”€â”€ MEDIA event â€” JSON-wrapped audio chunks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const isMediaEvent = msg.event === 'media' || msg.event === 'audio' || msg.event === 'mediaEvent';
        if (isMediaEvent) {
          const mediaDirection = msg.direction || msg.media?.direction || queryDirection;
          const mediaCallerNumber = normalizeDirection(mediaDirection) === 'outbound'
            ? (msg.to || msg.media?.to || queryCallerNumber)
            : (msg.from || msg.media?.from || queryCallerNumber);
          initializeSession({
            callUuid: msg.callSid || msg.callUuid || msg.call_id || msg.call_uuid || queryCallUuid,
            callerNumber: mediaCallerNumber,
            streamSid: msg.streamSid || msg.stream_id || msg.media?.streamSid || session?.streamSid,
            language: msg.language || queryLanguage,
            direction: mediaDirection,
            mode: 'media-fallback'
          });
          if (!session) return;

          const payload = msg.media?.payload || msg.payload;
          if (!payload) return;

          const mulawBytes = Buffer.from(payload, 'base64');
          const pcmChunk = mulawToPcm16(mulawBytes);
          const rms = computeRms(pcmChunk);
          processAudioChunk(session, ws, mulawBytes, pcmChunk, rms);
          return;
        }

        // â”€â”€ STOP event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (msg.event === 'stop') {
          logger.log('ðŸ›‘ Stream stop received', session?.callSid);
          await cleanupSession(session, ws, pingInterval);
          return;
        }

        // â”€â”€ CHECKPOINT / MARK event (audio playback completed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (msg.event === 'checkpoint' || msg.event === 'mark' || msg.event === 'playedStream') {
          logger.debug('âœ… Audio checkpoint reached', msg.name || msg.mark?.name);
          return;
        }

        // â”€â”€ CLEARED AUDIO event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (msg.event === 'clearedAudio') {
          logger.debug('ðŸ”‡ Audio cleared');
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

    // â”€â”€ WebSocket close â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PROCESS AUDIO CHUNK â€” Shared logic for both binary and JSON media
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function processAudioChunk(session, ws, mulawBytes, pcmChunk, rms = 0) {
  if (session._greetingPending && session.streamSid) {
    maybeDeliverInitialGreeting(session, ws).catch((e) => logger.warn('Greeting delivery failed', e.message));
  }

  const floor = session.noiseFloorRms || (VAD_THRESHOLD * 0.6);
  if (rms > 0 && rms < (VAD_THRESHOLD * 1.2)) {
    session.noiseFloorRms = (floor * 0.95) + (rms * 0.05);
  }

  const dynamicThreshold = Math.max(VAD_THRESHOLD * 0.6, (session.noiseFloorRms || floor) * 2.2);
  const hasVoice = rms >= dynamicThreshold;

  if (hasVoice) {
    session.speechChunkCount++;
    session.silentChunkCount = 0;
    session.lastVoiceActivityAt = Date.now();

    let bufferedInPreSpeech = false;
    if (!session.isSpeaking) {
      rememberPreSpeechChunk(session, mulawBytes, pcmChunk);
      bufferedInPreSpeech = true;
    }

    if (session.isProcessing) {
      session.userSpeakingWhileProcessing = true;
    }

    // If agent is currently playing audio and user starts speaking -> interrupt fast.
    if (session.isPlaying) {
      const playbackMs = Date.now() - (session.playbackStartedAt || Date.now());
      const strongSpeech = rms >= (dynamicThreshold * BARGE_IN_RMS_MULTIPLIER);

      if (playbackMs >= BARGE_IN_MIN_PLAYBACK_MS && (strongSpeech || session.speechChunkCount >= (SPEECH_START_CHUNKS + 1))) {
        session.interruptVoiceChunks++;
      } else {
        session.interruptVoiceChunks = 0;
      }

      if (session.interruptVoiceChunks >= BARGE_IN_REQUIRED_CHUNKS) {
        logger.log('User interrupted agent playback', session.callSid, { playbackMs, rms, dynamicThreshold });
        try {
          ws.send(JSON.stringify({ event: 'clearAudio' }));
        } catch (e) { /* ignore */ }
        session.isPlaying = false;
        session.playbackStartedAt = 0;
        session.interruptVoiceChunks = 0;
        metrics.incrementInterrupt();
      }
    }

    if (!session.isSpeaking && session.speechChunkCount >= SPEECH_START_CHUNKS) {
      session.isSpeaking = true;
      session.speechStartedAt = Date.now();
      session.callState.silenceCount = 0;
      logger.debug('Speech started', session.callSid);
      clearTimeout(session.silenceTimer);
      flushPreSpeechCache(session);
      bufferedInPreSpeech = false;
    }

    if (session.isSpeaking && !bufferedInPreSpeech) {
      session.audioChunks.push(mulawBytes);
      session.pcmBuffer.push(pcmChunk);
      session.totalPcmBytes += pcmChunk.length;

      if (session.totalPcmBytes > MAX_BUFFER_BYTES) {
        logger.warn('Buffer overflow, forcing processing', session.callSid);
        metrics.incrementBufferOverflow();
        triggerProcessing(session, ws);
      }
    }
    return;
  }

  session.silentChunkCount++;
  session.speechChunkCount = 0;
  session.interruptVoiceChunks = 0;

  if (session.silentChunkCount >= 2) {
    clearPreSpeechCache(session);
  }

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

  if (!session.isSpeaking && !session.silenceTimer) {
    startSilenceTimer(session, ws);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INITIAL GREETING (via bidirectional stream â€” sends Âµ-law audio directly)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function deliverInitialGreeting(session, ws) {
  try {
    const greetingText = buildInitialGreetingText(session);

    // Synthesize and send raw mu-law directly through the media stream.
    const ttsResult = await tts.synthesizeRaw(greetingText, session.callSid, session.language);

    let greetingDurationMs = 1800;
    if (ttsResult && ttsResult.mulawBuffer && ws.readyState === 1) {
      greetingDurationMs = Math.max(800, Math.round((ttsResult.mulawBuffer.length / 8000) * 1000));
      await sendAudioThroughStream(session, ws, ttsResult.mulawBuffer);
    } else {
      logger.warn('TTS greeting failed â€” no audio delivered', session.callSid);
    }

    session.transcriptEntries.push({
      startMs: 0,
      endMs: greetingDurationMs,
      speaker: 'agent',
      text: greetingText,
      confidence: 1.0
    });

    // Notify monitoring clients of transcript
    monitoringServer.notifyTranscriptUpdate({
      callUuid: session.callSid,
      speaker: 'agent',
      text: greetingText,
      confidence: 1.0,
      timestamp: new Date()
    });

    session.callState.step = getInitialStepByDirection(session.direction);
    session.callState.silenceCount = 0;
    startSilenceTimer(session, ws);

  } catch (err) {
    logger.error('Initial greeting error', err.message);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TRIGGER PROCESSING (speech â†’ STT â†’ LLM â†’ TTS â†’ play through stream)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function startPipeline(session, ws, pcmChunks) {
  const pipelineId = ++session.lastPipelineId;
  session.isProcessing = true;
  session.currentPipelineId = pipelineId;
  session.userSpeakingWhileProcessing = false;

  processUtterance(session, pcmChunks, ws, pipelineId)
    .catch(err => logger.error('Pipeline error', session.callSid, err.message))
    .finally(() => {
      if (session.currentPipelineId === pipelineId && session.isProcessing) {
        session.isProcessing = false;
      }

      if (!session.isProcessing && session.pendingPcmChunks.length > 0 && ws.readyState === 1) {
        const pendingChunks = session.pendingPcmChunks.slice();
        session.pendingPcmChunks = [];
        const pendingBytes = pendingChunks.reduce((sum, c) => sum + c.length, 0);
        if (pendingBytes >= MIN_UTTERANCE_BYTES) {
          startPipeline(session, ws, pendingChunks);
        }
      }
    });
}

function triggerProcessing(session, ws) {
  const pcmChunks = session.pcmBuffer.slice();
  clearBuffers(session);

  if (!pcmChunks.length) return;

  if (session.isProcessing) {
    session.pendingPcmChunks.push(...pcmChunks);
    logger.debug('Queued utterance while processing', session.callSid, { chunks: session.pendingPcmChunks.length });
    return;
  }

  startPipeline(session, ws, pcmChunks);
}

function clearBuffers(session) {
  session.audioChunks = [];
  session.pcmBuffer = [];
  session.totalPcmBytes = 0;
  clearPreSpeechCache(session);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN PIPELINE: STT â†’ LLM â†’ TTS â†’ PLAY (through bidirectional stream)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function processUtterance(session, pcmChunks, ws, pipelineId) {
  const pipelineStart = Date.now();

  // 1) Convert PCM to WAV for Whisper
  const pcmData = Buffer.concat(pcmChunks);
  const wavBuffer = buildWavBuffer(pcmData);

  // 2) Speech-to-Text
  const sttStart = Date.now();
  let sttResult = await stt.transcribe(wavBuffer, session.callSid, 'audio/wav', session.language);

  // Retry once with auto-language if we received empty text on a meaningful segment.
  if ((sttResult.empty || !sttResult.text) && pcmData.length >= 9600) {
    const retryStt = await stt.transcribe(wavBuffer, session.callSid, 'audio/wav', 'auto');
    if (!retryStt.empty && retryStt.text) sttResult = retryStt;
  }
  const sttLatency = Date.now() - sttStart;

  if (pipelineId !== session.lastPipelineId) {
    logger.log('Pipeline superseded after STT, discarding', { pipelineId, current: session.lastPipelineId });
    return;
  }

  if (sttResult.empty || !sttResult.text) {
    logger.debug('STT returned empty, skipping LLM');
    return;
  }

  // Auto language adaptation for English/Hindi/Hinglish during early turns.
  const detectedLanguage = detectLanguageFromTranscript(sttResult.text, session.language);
  if (session.callState.turnCount <= session.languageLockTurn && detectedLanguage && detectedLanguage !== session.language) {
    logger.log('Language switched from transcript', { callSid: session.callSid, from: session.language, to: detectedLanguage });
    session.language = detectedLanguage;
  }
  session.honorific = inferHonorificFromTranscript(sttResult.text, session.honorific);

  logger.log(`STT (${sttLatency}ms):`, sttResult.text);
  session.callState.turnCount++;

  session.transcriptEntries.push({
    startMs: Date.now() - session.startTime - sttLatency,
    endMs: Date.now() - session.startTime,
    speaker: 'customer',
    text: sttResult.text,
    confidence: sttResult.confidence
  });

  // Notify monitoring clients of transcript
  monitoringServer.notifyTranscriptUpdate({
    callUuid: session.callSid,
    speaker: 'customer',
    text: sttResult.text,
    confidence: sttResult.confidence,
    timestamp: new Date()
  });

  // 3) LLM - Generate reply
  const llmStart = Date.now();
  const reply = await llm.generateReply({
    callState: session.callState,
    script: { companyName: config.companyName },
    lastTranscript: sttResult.text,
    customerName: session.leadData.name || session.callerNumber,
    callSid: session.callSid,
    language: session.language,
    callDirection: session.direction,
    honorific: session.honorific
  });
  const llmLatency = Date.now() - llmStart;

  if (pipelineId !== session.lastPipelineId) {
    logger.log('Pipeline superseded after LLM, discarding', { pipelineId, current: session.lastPipelineId });
    return;
  }

  let speakText = compressForTelephony(reply.speak || '', 140);
  const burnRate = costControl.getEstimatedBurnRatePerMin(session.callSid);
  if (burnRate > TARGET_COST_PER_MIN_RS && speakText) {
    const cap = burnRate > (TARGET_COST_PER_MIN_RS * 1.3) ? 85 : 110;
    speakText = compressForTelephony(speakText, cap);
    logger.warn('Cost guard active', { callSid: session.callSid, burnRate: Number(burnRate.toFixed(2)), cap });
  }

  logger.log(`LLM (${llmLatency}ms): "${speakText || '(empty)'}" | action: ${reply.action}`);

  if (reply.nextStep) session.callState.step = reply.nextStep;
  updateLeadData(session, reply);

  // Relax overlap detection. Only drop if we received a significant chunk
  // of NEW meaningful speech while processing, rather than just tiny noise chunks.
  const overlapDetected = session.userSpeakingWhileProcessing && session.pendingPcmChunks.length > MIN_UTTERANCE_BYTES * 0.5;
  if (overlapDetected) {
    logger.log('Skipping stale reply due to overlapping user speech', {
      callSid: session.callSid,
      isSpeaking: session.isSpeaking,
      pendingChunks: session.pendingPcmChunks.length
    });
    return;
  }

  // 4) TTS -> Send through bidirectional stream
  let deliveredAudio = false;
  let ttsLatency = 0;
  if (speakText && ws.readyState === 1) {
    const ttsStart = Date.now();

    if (pipelineId !== session.lastPipelineId) {
      logger.log('Pipeline superseded before TTS, discarding');
      return;
    }

    const ttsResult = await tts.synthesizeRaw(speakText, session.callSid, session.language);
    ttsLatency = Date.now() - ttsStart;

    if (pipelineId !== session.lastPipelineId) {
      logger.log('Pipeline superseded after TTS, discarding');
      return;
    }

    if (overlapDetected) {
      logger.log('Skipping playback after TTS because user started speaking', session.callSid);
      return;
    }

    if (ttsResult && ttsResult.mulawBuffer) {
      await sendAudioThroughStream(session, ws, ttsResult.mulawBuffer);
      deliveredAudio = true;
    } else {
      logger.warn('TTS synthesis failed, skipping audio', session.callSid);
    }

    const totalLatency = Date.now() - pipelineStart;
    logger.log(`Pipeline latency: ${totalLatency}ms (STT:${sttLatency} LLM:${llmLatency} TTS:${ttsLatency})`);
    metrics.addPipelineLatency(sttLatency, llmLatency, ttsLatency);
  }

  if (speakText && (deliveredAudio || ws.readyState !== 1)) {
    session.transcriptEntries.push({
      startMs: Date.now() - session.startTime,
      endMs: Date.now() - session.startTime + 500,
      speaker: 'agent',
      text: speakText,
      confidence: 1
    });

    monitoringServer.notifyTranscriptUpdate({
      callUuid: session.callSid,
      speaker: 'agent',
      text: speakText,
      confidence: 1,
      timestamp: new Date()
    });
  }

  // 5) Handle actions
  const langConfig = getLanguage(session.language);

  if (reply.action === 'hangup') {
    await endCallGracefully(session, ws, null);
  } else if (reply.action === 'escalate') {
    logger.log('Escalation for', session.callSid);
    await endCallGracefully(session, ws, 'Let me connect you with our property expert right away. Please hold.');
  } else if (reply.action === 'book_visit') {
    logger.log('Site visit booked', session.callerNumber, session.leadData);
  } else if (!costControl.isWithinBudget(session.callSid)) {
    logger.warn('Per-call budget exceeded, ending call', session.callSid);
    await endCallGracefully(session, ws, langConfig.farewell);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// LEAD DATA EXTRACTION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SILENCE DETECTION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function startSilenceTimer(session, ws) {
  clearTimeout(session.silenceTimer);

  session.silenceTimer = setTimeout(async () => {
    if (ws.readyState !== 1) return;

    // Don't count silence while pipeline work or playback is still active.
    if (session._ended || session.isSpeaking || session.isProcessing || session.isPlaying) {
      startSilenceTimer(session, ws);
      return;
    }

    session.callState.silenceCount++;
    const langConfig = getLanguage(session.language);

    if (session.callState.silenceCount >= 2) {
      logger.log('ðŸ”‡ Second silence, ending call', session.callSid);
      await endCallGracefully(session, ws, langConfig.farewell);
    } else {
      logger.log('ðŸ”‡ First silence, prompting', session.callSid);

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// END CALL GRACEFULLY
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    // Notify monitoring clients of call ended
    monitoringServer.notifyCallEnded({
      callUuid: session.callSid,
      endTime: new Date(),
      duration: Date.now() - session.startTime
    });
  } catch (err) {
    logger.error('Graceful end error', err.message);
  }

  // FIX: Clean up session from map to prevent leaks
  sessions.delete(session.callSid);
  llm.clearHistory(session.callSid);
  costControl.endCallTracking(session.callSid);

  await finalizeCall(session);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SESSION CLEANUP
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function cleanupSession(session, ws, pingInterval) {
  clearInterval(pingInterval);

  if (!session) return;
  session._ended = true;

  clearTimeout(session.silenceTimer);
  clearTimeout(session.maxDurationTimer);

  await finalizeCall(session);

  sessions.delete(session.callSid);
  llm.clearHistory(session.callSid);
  costControl.endCallTracking(session.callSid);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FINALIZE â€” Save transcript + lead + summary to DB
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function finalizeCall(session) {
  if (!session || session._finalized) return;
  session._finalized = true;

  const callDuration = Math.round((Date.now() - session.startTime) / 1000);
  logger.log('ðŸ“‹ Finalizing call', {
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
      logger.log('âœ… Transcript saved', session.callSid, session.transcriptEntries.length, 'entries');
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

      logger.log('âœ… Lead saved', { phone: session.callerNumber, score: session.qualityScore, status: leadStatus });
    }
  } catch (err) {
    logger.error('Finalize error', err.message, err.stack?.split('\n')[1]);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CALL SUMMARY GENERATION (post-call LLM)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PERIODIC MEMORY & MAP SIZE MONITORING
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
    logger.warn('Suspicious sessions count â€” possible leak', sessions.size);
  }
}, 60000);



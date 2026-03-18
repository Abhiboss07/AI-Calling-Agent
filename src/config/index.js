const dotenv = require('dotenv');
const path = require('path');

// CRITICAL FIX: override=true ensures .env file values ALWAYS take precedence
// over system/shell environment variables. Without this, a stale system-level
// OPENAI_API_KEY (e.g. sk-or-v1-...) silently overrides the .env value,
// causing all TTS/STT/LLM calls to fail with 401 Unauthorized.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

// Validation
const REQUIRED = ['VOBIZ_AUTH_ID', 'VOBIZ_AUTH_TOKEN', 'VOBIZ_CALLER_ID', 'DEEPGRAM_API_KEY', 'SARVAM_API_KEY', 'GEMINI_API_KEY'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  process.stderr.write(`[CONFIG] FATAL: Missing required env vars: ${missing.join(', ')}\n`);
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: envNumber('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',

  vobiz: {
    authId: process.env.VOBIZ_AUTH_ID,
    authToken: process.env.VOBIZ_AUTH_TOKEN,
    callerId: process.env.VOBIZ_CALLER_ID
  },

  // AI providers — Gemini is primary, OpenAI is fallback
  aiProvider: 'gemini',
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,    // fallback only

  // New providers
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  sarvamApiKey: process.env.SARVAM_API_KEY,

  // Email (Gmail SMTP with app password)
  gmail: {
    user: process.env.GMAIL_USER,
    appPassword: process.env.GMAIL_APP_PASSWORD
  },

  mongodbUri: process.env.MONGODB_URI,

  callMaxMinutes: envNumber('CALL_MAX_MINUTES', 10),
  campaignMonthlyBudget: envNumber('CAMPAIGN_MONTHLY_BUDGET', 10000),

  // Real Estate agent config
  companyName: process.env.COMPANY_NAME || 'Premier Realty Group',
  agentName: process.env.AGENT_NAME || 'Priya',
  systemPromptFile: process.env.SYSTEM_PROMPT_FILE || 'config/ai_calling_agent_system_prompt.txt',

  // Language config
  language: {
    default: process.env.DEFAULT_LANGUAGE || 'en-IN',
    supported: (process.env.SUPPORTED_LANGUAGES || 'en-IN,hi-IN,ta-IN,te-IN,bn-IN,mr-IN,kn-IN,gu-IN,ml-IN').split(',').map((s) => s.trim())
  },

  // Pipeline tuning constants (centralized, configurable via env)
  pipeline: {
    vadThreshold: clamp(envNumber('VAD_THRESHOLD', 0.005), 0.002, 0.05),
    speechStartChunks: clamp(envNumber('SPEECH_START_CHUNKS', 3), 1, 6),
    speechEndChunks: clamp(envNumber('SPEECH_END_CHUNKS', 6), 4, 8),
    bargeInMinPlaybackMs: clamp(envNumber('BARGE_IN_MIN_PLAYBACK_MS', 250), 0, 800),
    bargeInRequiredChunks: clamp(envNumber('BARGE_IN_REQUIRED_CHUNKS', 3), 1, 5),
    bargeInRmsMultiplier: clamp(envNumber('BARGE_IN_RMS_MULTIPLIER', 1.3), 1.05, 2.2),
    minUtteranceBytes: clamp(envNumber('MIN_UTTERANCE_BYTES', 1600), 800, 2400),
    maxBufferBytes: clamp(envNumber('MAX_BUFFER_BYTES', 320000), 64000, 640000),
    silencePromptMs: clamp(envNumber('SILENCE_PROMPT_MS', 7000), 3000, 12000),
    playbackChunkSize: clamp(envNumber('PLAYBACK_CHUNK_SIZE', 160), 80, 320),
    playbackChunkIntervalMs: clamp(envNumber('PLAYBACK_CHUNK_INTERVAL_MS', 20), 10, 40),
    wsPingIntervalMs: clamp(envNumber('WS_PING_INTERVAL_MS', 15000), 5000, 30000),
    preSpeechChunks: clamp(envNumber('PRE_SPEECH_CHUNKS', 6), 2, 12)
  },

  llm: {
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    // keep .model for backward-compat references
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    maxHistory: envNumber('LLM_MAX_HISTORY', 10),
    historyTtlMs: envNumber('LLM_HISTORY_TTL_MS', 30 * 60 * 1000)
  },

  tts: {
    cacheMaxEntries: envNumber('TTS_CACHE_MAX_ENTRIES', 100),
    cacheMaxBytes: envNumber('TTS_CACHE_MAX_BYTES', 3 * 1024 * 1024)
  },

  budget: {
    targetPerMinuteRs: envNumber('TARGET_COST_PER_MIN_RS', 2)
  },

  // Public URL for webhooks (important for production/ngrok)
  baseUrl: process.env.BASE_URL || `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`
};

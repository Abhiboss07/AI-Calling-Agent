const dotenv = require('dotenv');
const path = require('path');

// CRITICAL FIX: override=true ensures .env file values ALWAYS take precedence
// over system/shell environment variables. Without this, a stale system-level
// OPENAI_API_KEY (e.g. sk-or-v1-...) silently overrides the .env value,
// causing all TTS/STT/LLM calls to fail with 401 Unauthorized.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

// ── Validation ──────────────────────────────────────────────────────────────
const REQUIRED = ['VOBIZ_AUTH_ID', 'VOBIZ_AUTH_TOKEN', 'VOBIZ_CALLER_ID', 'OPENAI_API_KEY'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  // L5: use stderr directly here since logger depends on config (circular)
  process.stderr.write(`[CONFIG] FATAL: Missing required env vars: ${missing.join(', ')}\n`);
  // Don't exit in dev mode — allow dashboard to run
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'),

  vobiz: {
    authId: process.env.VOBIZ_AUTH_ID,
    authToken: process.env.VOBIZ_AUTH_TOKEN,
    callerId: process.env.VOBIZ_CALLER_ID
  },

  openaiApiKey: process.env.OPENAI_API_KEY,

  mongodbUri: process.env.MONGODB_URI, // Atlas URI required

  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION || 'auto',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    endpoint: process.env.S3_ENDPOINT
  },

  callMaxMinutes: Number(process.env.CALL_MAX_MINUTES || 10),
  campaignMonthlyBudget: Number(process.env.CAMPAIGN_MONTHLY_BUDGET || 10000),

  // Real Estate agent config
  companyName: process.env.COMPANY_NAME || 'Premier Realty Group',
  agentName: process.env.AGENT_NAME || 'Priya',
  systemPromptFile: process.env.SYSTEM_PROMPT_FILE || 'config/ai_calling_agent_system_prompt.txt',

  // ── Language config ───────────────────────────────────────────────────────
  language: {
    default: process.env.DEFAULT_LANGUAGE || 'en-IN',
    supported: (process.env.SUPPORTED_LANGUAGES || 'en-IN,hi-IN,ta-IN,te-IN,bn-IN,mr-IN,kn-IN,gu-IN,ml-IN').split(',').map(s => s.trim())
  },

  // ── Pipeline tuning constants (M2: centralized, configurable via env) ─────
  pipeline: {
    vadThreshold: Number(process.env.VAD_THRESHOLD) || 0.008,
    speechStartChunks: Number(process.env.SPEECH_START_CHUNKS) || 3,
    speechEndChunks: Number(process.env.SPEECH_END_CHUNKS) || 12,
    minUtteranceBytes: Number(process.env.MIN_UTTERANCE_BYTES) || 6400,
    maxBufferBytes: Number(process.env.MAX_BUFFER_BYTES) || 320000,
    silencePromptMs: Number(process.env.SILENCE_PROMPT_MS) || 10000,
    playbackChunkSize: Number(process.env.PLAYBACK_CHUNK_SIZE) || 160,
    playbackChunkIntervalMs: Number(process.env.PLAYBACK_CHUNK_INTERVAL_MS) || 20,
    wsPingIntervalMs: Number(process.env.WS_PING_INTERVAL_MS) || 15000
  },

  llm: {
    maxHistory: Number(process.env.LLM_MAX_HISTORY) || 10,
    historyTtlMs: Number(process.env.LLM_HISTORY_TTL_MS) || 30 * 60 * 1000
  },

  tts: {
    cacheMaxEntries: Number(process.env.TTS_CACHE_MAX_ENTRIES) || 100,
    cacheMaxBytes: Number(process.env.TTS_CACHE_MAX_BYTES) || 3 * 1024 * 1024 // 3MB
  },

  // Public URL for webhooks (important for production/ngrok)
  baseUrl: process.env.BASE_URL || `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`
};

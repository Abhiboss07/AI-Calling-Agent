const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ── Validation ──────────────────────────────────────────────────────────────
const REQUIRED = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_CALLER_ID', 'OPENAI_API_KEY'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[CONFIG] FATAL: Missing required env vars: ${missing.join(', ')}`);
  // Don't exit in dev mode — allow dashboard to run
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    callerId: process.env.TWILIO_CALLER_ID
  },

  openaiApiKey: process.env.OPENAI_API_KEY,

  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_outbound',

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
  systemPromptFile: process.env.SYSTEM_PROMPT_FILE || 'config/ai_calling_agent_system_prompt.txt'
};

const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

module.exports = {
  port: process.env.PORT || 3000,
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
    region: process.env.S3_REGION,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    endpoint: process.env.S3_ENDPOINT
  },
  callMaxMinutes: Number(process.env.CALL_MAX_MINUTES || 10)
};

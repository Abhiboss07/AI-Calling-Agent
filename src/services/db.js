const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../utils/logger');

let isConnected = false;

async function connect() {
  if (isConnected) return mongoose.connection;

  // Mongoose 7+ removed useNewUrlParser/useUnifiedTopology — they are no-ops and trigger warnings
  const opts = {
    serverSelectionTimeoutMS: 5000,
    heartbeatFrequencyMS: 10000,
    maxPoolSize: 20,
    minPoolSize: 2
  };

  mongoose.connection.on('connected', () => { isConnected = true; logger.log('MongoDB connected'); });
  mongoose.connection.on('disconnected', () => { isConnected = false; logger.warn('MongoDB disconnected'); });
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err.message));

  // Retry with backoff. The first attempt can fail if the event loop is briefly
  // starved during startup (e.g. TTS prewarm) even when the DB is healthy, so a
  // single-shot connect would leave the app stuck in a not-ready (503) state.
  const maxAttempts = 6;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(config.mongodbUri, opts);
      return mongoose.connection;
    } catch (err) {
      lastErr = err;
      logger.warn(`MongoDB connect attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, Math.min(1000 * attempt, 5000)));
      }
    }
  }
  logger.error('MongoDB initial connection failed after retries', lastErr.message);
  throw lastErr;
}

function isReady() {
  return isConnected && mongoose.connection.readyState === 1;
}

async function disconnect() {
  await mongoose.disconnect();
  isConnected = false;
}

module.exports = { connect, isReady, disconnect };

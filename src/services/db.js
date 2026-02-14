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

  try {
    await mongoose.connect(config.mongodbUri, opts);
    return mongoose.connection;
  } catch (err) {
    logger.error('MongoDB initial connection failed', err.message);
    throw err;
  }
}

function isReady() {
  return isConnected && mongoose.connection.readyState === 1;
}

async function disconnect() {
  await mongoose.disconnect();
  isConnected = false;
}

module.exports = { connect, isReady, disconnect };

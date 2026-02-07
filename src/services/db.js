const mongoose = require('mongoose');
const config = require('../config');

let isConnected = false;

async function connect() {
  if (isConnected) return mongoose.connection;
  const conn = await mongoose.connect(config.mongodbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  isConnected = true;
  return conn;
}

module.exports = { connect };

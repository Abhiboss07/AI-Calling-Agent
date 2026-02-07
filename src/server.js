const express = require('express');
const expressWs = require('express-ws');
const bodyParser = require('body-parser');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./services/db');
const twilioRoutes = require('./routes/twilio');
const apiRoutes = require('./routes/api');
const setupWs = require('./ws-media');

async function start() {
  await db.connect();
  const app = express();
  expressWs(app);
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({ ok: true, version: '0.1.0', uptime: process.uptime() });
  });

  app.use('/twilio', twilioRoutes);
  app.use('/api', apiRoutes);

  setupWs(app);

  app.listen(config.port, config.host, () => {
    logger.log(`Server listening on ${config.host}:${config.port}`);
  });
}

start().catch(err => {
  console.error('Failed to start server', err);
  process.exit(1);
});

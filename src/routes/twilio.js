const express = require('express');
const router = express.Router();
const { xml } = require('xmlbuilder2');
const config = require('../config');
const logger = require('../utils/logger');

// Twilio webhook to start media stream
router.post('/voice', (req, res) => {
  const streamUrl = `${req.protocol.replace('http','ws')}://${req.get('host')}/stream`;
  // Minimal TwiML: start Stream and confirm
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Start><Stream url="wss://${req.get('host')}/stream"/></Start><Say voice="alice">Connecting you now.</Say></Response>`;
  res.type('text/xml').send(twiml);
});

// Twilio status callback
router.post('/status', (req, res) => {
  logger.log('Twilio status callback', req.body);
  // Handle statuses: completed, busy, no-answer, failed
  res.sendStatus(200);
});

module.exports = router;

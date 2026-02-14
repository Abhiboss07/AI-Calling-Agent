const Twilio = require('twilio');
const config = require('../config');
const logger = require('../utils/logger');

let client = null;
if (config.twilio.accountSid && config.twilio.authToken) {
  try {
    client = new Twilio(config.twilio.accountSid, config.twilio.authToken);
  } catch (err) {
    logger.error('Twilio client init error', err.message || err);
    client = null;
  }
} else {
  logger.log('Twilio credentials missing - Twilio client will not be initialized.');
}

async function makeOutboundCall(to, from, webhookUrl) {
  if (!client) {
    const err = new Error('Twilio client not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in environment.');
    logger.error('Twilio: makeOutboundCall failed', err.message);
    throw err;
  }
  logger.log('Twilio: making call', to, 'from', from);
  return client.calls.create({
    to,
    from,
    url: webhookUrl,
    statusCallback: `${webhookUrl.replace('/voice','/status')}`,
    statusCallbackEvent: ['completed','busy','no-answer','failed']
  });
}

async function playAudio(callSid, audioUrl) {
  if (!client) {
    const err = new Error('Twilio client not configured. Cannot play audio.');
    logger.error('Twilio: playAudio failed', err.message);
    throw err;
  }
  const twiml = `<Response><Play>${audioUrl}</Play></Response>`;
  logger.log('Twilio: play audio', callSid, audioUrl);
  return client.calls(callSid).update({ twiml });
}

module.exports = { makeOutboundCall, playAudio };

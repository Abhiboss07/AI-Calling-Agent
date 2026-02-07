const Twilio = require('twilio');
const config = require('../config');
const logger = require('../utils/logger');

const client = new Twilio(config.twilio.accountSid, config.twilio.authToken);

async function makeOutboundCall(to, from, webhookUrl) {
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
  // Update live call TwiML to play audio
  const twiml = `<Response><Play>${audioUrl}</Play></Response>`;
  logger.log('Twilio: play audio', callSid, audioUrl);
  return client.calls(callSid).update({ twiml });
}

module.exports = { makeOutboundCall, playAudio };

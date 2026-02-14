const Twilio = require('twilio');
const config = require('../config');
const logger = require('../utils/logger');

let client = null;
if (config.twilio.accountSid && config.twilio.authToken) {
  try {
    client = new Twilio(config.twilio.accountSid, config.twilio.authToken);
    logger.log('Twilio client initialized');
  } catch (err) {
    logger.error('Twilio client init error', err.message || err);
    client = null;
  }
} else {
  logger.warn('Twilio credentials missing — telephony will not work');
}

function ensureClient() {
  if (!client) {
    throw new Error('Twilio client not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }
}

// Escape text for XML
function xmlEscape(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function makeOutboundCall(to, from, webhookUrl) {
  ensureClient();
  logger.log('Twilio: dialing', to, 'from', from || config.twilio.callerId);
  return client.calls.create({
    to,
    from: from || config.twilio.callerId,
    url: webhookUrl,
    statusCallback: webhookUrl.replace('/voice', '/status'),
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    machineDetection: 'Enable',  // Detect answering machines
    timeout: 30                   // Ring for 30 sec max
  });
}

async function playAudio(callSid, audioUrl) {
  ensureClient();
  const escapedUrl = xmlEscape(audioUrl);
  const twiml = `<Response><Play>${escapedUrl}</Play></Response>`;
  logger.debug('Twilio: play audio', callSid);
  return client.calls(callSid).update({ twiml });
}

// Fallback: use Twilio's Say verb when TTS upload fails
async function sayText(callSid, text) {
  ensureClient();
  const escaped = xmlEscape(text);
  const twiml = `<Response><Say voice="Polly.Aditi" language="en-IN">${escaped}</Say></Response>`;
  logger.debug('Twilio: say text', callSid);
  return client.calls(callSid).update({ twiml });
}

async function endCall(callSid) {
  ensureClient();
  logger.log('Twilio: ending call', callSid);
  return client.calls(callSid).update({ status: 'completed' });
}

module.exports = { makeOutboundCall, playAudio, sayText, endCall };

const plivo = require('plivo');
const config = require('../config');
const logger = require('../utils/logger');

let client = null;
if (config.plivo.authId && config.plivo.authToken) {
    try {
        client = new plivo.Client(config.plivo.authId, config.plivo.authToken);
        logger.log('Plivo client initialized');
    } catch (err) {
        logger.error('Plivo client init error', err.message || err);
        client = null;
    }
} else {
    logger.warn('Plivo credentials missing — telephony will not work');
}

function ensureClient() {
    if (!client) {
        throw new Error('Plivo client not configured. Set PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN.');
    }
}

// Escape text for XML
function xmlEscape(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Make an outbound call via Plivo REST API.
 * @param {string} to - Destination phone number (E.164)
 * @param {string|undefined} from - Caller ID override
 * @param {string} webhookUrl - Answer URL for Plivo XML
 * @returns {Promise<Object>} Plivo call object with requestUuid
 */
async function makeOutboundCall(to, from, webhookUrl) {
    ensureClient();
    const callerId = from || config.plivo.callerId;
    logger.log('Plivo: dialing', to, 'from', callerId);

    const response = await client.calls.create(
        callerId,        // from
        to,              // to
        webhookUrl,      // answer_url
        {
            answerMethod: 'POST',
            hangupUrl: webhookUrl.replace('/voice', '/status'),
            hangupMethod: 'POST',
            machineDetection: 'true',
            ringTimeout: 30
        }
    );

    // Plivo returns { message, requestUuid, apiId }
    // Map to a common shape so the rest of the codebase works
    return {
        sid: response.requestUuid,           // callSid equivalent
        call_uuid: response.requestUuid,
        status: 'queued'
    };
}

/**
 * Use Plivo Speak API to play TTS text on live call (fallback only).
 * @param {string} callUuid - Plivo Call UUID
 * @param {string} text - Text to speak
 */
async function sayText(callUuid, text) {
    ensureClient();
    logger.debug('Plivo: speak text on call', callUuid);
    try {
        await client.calls.speakText(callUuid, text, { voice: 'WOMAN', language: 'en-IN' });
    } catch (err) {
        logger.warn('Plivo speak failed (may be expected during stream)', err.message);
    }
}

/**
 * End a live call via Plivo REST API.
 * @param {string} callUuid - Plivo Call UUID
 */
async function endCall(callUuid) {
    ensureClient();
    logger.log('Plivo: ending call', callUuid);
    return client.calls.hangup(callUuid);
}

module.exports = { makeOutboundCall, sayText, endCall, xmlEscape };

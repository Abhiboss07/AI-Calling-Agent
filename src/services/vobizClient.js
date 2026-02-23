const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

// ══════════════════════════════════════════════════════════════════════════════
// VOBIZ REST API CLIENT
// ══════════════════════════════════════════════════════════════════════════════
// Vobiz API: https://api.vobiz.ai/api/v1/Account/{authId}/
// Auth: X-Auth-ID + X-Auth-Token headers

const BASE_URL = 'https://api.vobiz.ai/api/v1';

let isConfigured = false;
if (config.vobiz.authId && config.vobiz.authToken) {
    isConfigured = true;
    logger.log('Vobiz client initialized');
} else {
    logger.warn('Vobiz credentials missing — telephony will not work');
}

function getHeaders() {
    return {
        'X-Auth-ID': config.vobiz.authId,
        'X-Auth-Token': config.vobiz.authToken,
        'Content-Type': 'application/json'
    };
}

function getAccountUrl() {
    return `${BASE_URL}/Account/${config.vobiz.authId}`;
}

function ensureClient() {
    if (!isConfigured) {
        throw new Error('Vobiz client not configured. Set VOBIZ_AUTH_ID and VOBIZ_AUTH_TOKEN.');
    }
}

// Escape text for XML
function xmlEscape(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Make an outbound call via Vobiz REST API
 * @param {string} to - Destination phone number (E.164)
 * @param {string} from - Caller ID (E.164), defaults to config
 * @param {string} answerUrl - URL Vobiz requests when call is answered
 * @param {string} hangupUrl - URL Vobiz notifies when call ends
 * @returns {Object} - { callUuid, message, ... }
 */
async function makeOutboundCall(to, from, answerUrl, hangupUrl) {
    ensureClient();
    const callerNumber = from || config.vobiz.callerId;
    logger.log('Vobiz: dialing', to, 'from', callerNumber);

    const resp = await axios.post(`${getAccountUrl()}/Call/`, {
        to,
        from: callerNumber,
        answer_url: answerUrl,
        answer_method: 'POST',
        hangup_url: hangupUrl,
        hangup_method: 'POST',
        ring_timeout: 30,
        machine_detection: 'true'
    }, { headers: getHeaders() });

    const data = resp.data;
    // Vobiz returns { request_uuid, message, api_id } or similar
    return {
        callUuid: data.request_uuid || data.call_uuid || data.callUuid,
        sid: data.request_uuid || data.call_uuid || data.callUuid, // Compatibility alias
        message: data.message,
        raw: data
    };
}

/**
 * End an active call via Vobiz REST API
 * @param {string} callUuid - The call UUID to terminate
 */
async function endCall(callUuid) {
    ensureClient();
    logger.log('Vobiz: ending call', callUuid);
    try {
        await axios.delete(`${getAccountUrl()}/Call/${callUuid}/`, {
            headers: getHeaders()
        });
    } catch (err) {
        // If call already ended, Vobiz returns 404 — that's fine
        if (err.response?.status === 404) {
            logger.debug('Vobiz: call already ended', callUuid);
        } else {
            throw err;
        }
    }
}

/**
 * Speak text on an active call (fallback — uses Vobiz REST API)
 * CAUTION: This may interrupt the current call flow. Prefer WebSocket audio.
 * @param {string} callUuid - The call UUID
 * @param {string} text - Text to speak
 */
async function sayText(callUuid, text) {
    ensureClient();
    const escaped = xmlEscape(text);
    logger.debug('Vobiz: say text', callUuid);

    try {
        await axios.post(`${getAccountUrl()}/Call/${callUuid}/Speak/`, {
            text: escaped,
            voice: 'WOMAN',
            language: 'en-IN'
        }, { headers: getHeaders() });
    } catch (err) {
        logger.warn('Vobiz: say text failed', err.message);
        throw err;
    }
}

/**
 * Play audio on an active call (fallback — uses Vobiz REST API)
 * @param {string} callUuid - The call UUID
 * @param {string} audioUrl - URL of audio file to play
 */
async function playAudio(callUuid, audioUrl) {
    ensureClient();
    logger.debug('Vobiz: play audio', callUuid);

    try {
        await axios.post(`${getAccountUrl()}/Call/${callUuid}/Play/`, {
            urls: audioUrl
        }, { headers: getHeaders() });
    } catch (err) {
        logger.warn('Vobiz: play audio failed', err.message);
        throw err;
    }
}

module.exports = { makeOutboundCall, playAudio, sayText, endCall, ensureClient };

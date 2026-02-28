const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

// ══════════════════════════════════════════════════════════════════════════════
// VOBIZ REST API CLIENT — Call lifecycle only (no IVR)
// ══════════════════════════════════════════════════════════════════════════════

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

function parsePossibleNumber(...values) {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const cleaned = value.replace(/[^0-9.-]/g, '');
            const parsed = Number(cleaned);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return null;
}

function ensureClient() {
    if (!isConfigured) {
        throw new Error('Vobiz client not configured. Set VOBIZ_AUTH_ID and VOBIZ_AUTH_TOKEN.');
    }
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
        machine_detection: 'false'
    }, { headers: getHeaders() });

    const data = resp.data;
    return {
        callUuid: data.request_uuid || data.call_uuid || data.callUuid,
        sid: data.request_uuid || data.call_uuid || data.callUuid,
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
        if (err.response?.status === 404) {
            logger.debug('Vobiz: call already ended', callUuid);
        } else {
            throw err;
        }
    }
}

async function getWalletSummary() {
    ensureClient();
    const headers = getHeaders();

    const candidates = [
        `${getAccountUrl()}/`,
        `${getAccountUrl()}/Balance/`,
        `${getAccountUrl()}/Wallet/`
    ];

    let payload = null;
    for (const url of candidates) {
        try {
            const resp = await axios.get(url, { headers, timeout: 6000 });
            payload = resp.data;
            if (payload) break;
        } catch (err) {
            if (err.response?.status === 404) continue;
            throw err;
        }
    }

    if (!payload) {
        return { ok: false, available: null, currency: 'INR', raw: null };
    }

    const available = parsePossibleNumber(
        payload.balance,
        payload.available_balance,
        payload.wallet_balance,
        payload.credits_remaining,
        payload.credit,
        payload.amount
    );

    const spent = parsePossibleNumber(
        payload.spent,
        payload.total_spent,
        payload.debit_used
    );

    return {
        ok: true,
        available,
        spent,
        currency: payload.currency || 'INR',
        raw: payload
    };
}

module.exports = { makeOutboundCall, endCall, ensureClient, getWalletSummary };

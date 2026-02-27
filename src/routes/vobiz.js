const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const Call = require('../models/call.model');
const metrics = require('../services/metrics');
const costControl = require('../services/costControl');
const { getLanguage } = require('../config/languages');

// FIX H2: Rate limiting for webhook endpoints
const webhookLimitMap = new Map();
function webhookRateLimit(windowMs = 60000, max = 100) {
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        let entry = webhookLimitMap.get(key);
        if (!entry || now - entry.start > windowMs) {
            entry = { start: now, count: 0 };
            webhookLimitMap.set(key, entry);
        }
        entry.count++;
        if (entry.count > max) {
            logger.warn('Webhook rate limit exceeded', { ip: req.ip, path: req.path });
            return res.status(429).send('Too many requests');
        }
        next();
    };
}
// Cleanup stale webhook rate-limit entries every 2 min
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of webhookLimitMap) {
        if (now - entry.start > 120000) webhookLimitMap.delete(key);
    }
}, 120000);

// ══════════════════════════════════════════════════════════════════════════════
// VOBIZ WEBHOOK SIGNATURE VERIFICATION
// ══════════════════════════════════════════════════════════════════════════════
function validateVobizSignature(req, res, next) {
    if (config.nodeEnv !== 'production') return next();
    const enforceSignature = String(process.env.VOBIZ_ENFORCE_SIGNATURE || 'false').toLowerCase() === 'true';

    // Vobiz signs webhooks — verify if signature header is present
    const signature = req.headers['x-vobiz-signature'] || req.headers['x-vobiz-signature-v2'];
    if (!signature) {
        if (enforceSignature) {
            logger.warn('REJECTED: Missing Vobiz signature', req.originalUrl);
            return res.status(403).send('Forbidden');
        }
        logger.warn('Vobiz signature missing; accepting unsigned webhook', req.originalUrl);
        return next();
    }

    // HMAC-SHA256 verification using auth token
    try {
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const expectedSig = crypto
            .createHmac('sha256', config.vobiz.authToken)
            .update(url)
            .digest('base64');

        if (signature !== expectedSig) {
            if (enforceSignature) {
                logger.warn('REJECTED: Invalid Vobiz signature', req.originalUrl);
                return res.status(403).send('Forbidden');
            }
            logger.warn('Vobiz signature mismatch; accepting because VOBIZ_ENFORCE_SIGNATURE=false', req.originalUrl);
            return next();
        }
    } catch (err) {
        if (enforceSignature) {
            logger.warn('Signature verification error', err.message);
            return res.status(403).send('Forbidden');
        }
        logger.warn('Signature verification failed; accepting because VOBIZ_ENFORCE_SIGNATURE=false', err.message);
        return next();
    }

    next();
}

// ── Helper ──────────────────────────────────────────────────────────────────
function xmlEscape(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function getPublicBaseUrl(req) {
    const configured = (config.baseUrl || '').trim();
    const isConfiguredUsable = configured && !/localhost|127\.0\.0\.1/i.test(configured);
    if (isConfiguredUsable) return configured.replace(/\/$/, '');

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${proto}://${host}`.replace(/\/$/, '');
}

// ══════════════════════════════════════════════════════════════════════════════
// ANSWER URL WEBHOOK — THE CRITICAL ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════
//
// ARCHITECTURE DECISION:
// We use <Stream bidirectional="true" keepCallAlive="true"> for real-time
// bidirectional audio streaming — same concept as Twilio's <Connect><Stream>.
//
// Audio flows both ways over the same WebSocket. We receive caller audio AND
// can send audio back by writing playAudio events to the WebSocket.
//
router.post('/answer', webhookRateLimit(60000, 100), validateVobizSignature, async (req, res) => {
    const callUuid = req.body?.CallUUID || req.body?.call_uuid || 'unknown';
    const from = req.body?.From || req.body?.from || 'unknown';
    const to = req.body?.To || req.body?.to || 'unknown';
    const direction = req.body?.Direction || req.body?.direction || 'inbound';

    // Extract language from custom parameters or use default
    const language = req.body?.language || req.query?.language || config.language.default;
    const langConfig = getLanguage(language);

    logger.log('📞 Answer webhook', { callUuid, from, to, direction, language });

    // ── Create Call record for INBOUND calls (outbound already exist) ────────
    try {
        const existing = await Call.findOne({ callSid: callUuid });
        if (!existing) {
            await Call.create({
                phoneNumber: from,
                callSid: callUuid,
                status: 'ringing',
                direction: direction === 'outbound' ? 'outbound' : 'inbound',
                language,
                startAt: new Date(),
                metadata: { from, to }
            });
            metrics.incrementCallsStarted();
            costControl.trackCall(callUuid);
            logger.log('Created inbound call record', callUuid);
        }
    } catch (err) {
        // Don't fail the webhook — log and continue
        logger.error('Failed to create call record', err.message);
    }

    // ── Build Vobiz XML — respond within 10 seconds ──────────────────────────
    // ARCHITECTURE: <Stream bidirectional="true" keepCallAlive="true"> keeps the
    // call alive. Audio is sent back through the same WebSocket.
    const publicBaseUrl = getPublicBaseUrl(req);
    const statusUrl = `${publicBaseUrl}/vobiz/stream-status`;
    const streamUrl = `${publicBaseUrl.replace(/^http/i, 'ws')}/stream`;

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        // Bidirectional stream — call stays alive as long as WS is open
        // URL must be clean (no leading whitespace/newlines) for Vobiz to parse correctly
        `  <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" statusCallbackUrl="${xmlEscape(statusUrl)}" statusCallbackMethod="POST">${streamUrl}?callUuid=${callUuid}&amp;callerNumber=${xmlEscape(from)}&amp;direction=${xmlEscape(direction)}&amp;language=${xmlEscape(language)}</Stream>`,
        // If stream disconnects, say goodbye rather than dead air
        `  <Speak voice="WOMAN" language="${xmlEscape(language)}">${xmlEscape(langConfig.farewell)}</Speak>`,
        '</Response>'
    ].join('\n');

    res.type('text/xml').send(xml);
});

// ══════════════════════════════════════════════════════════════════════════════
// HANGUP URL WEBHOOK — Lifecycle tracking + DB updates
// ══════════════════════════════════════════════════════════════════════════════
router.post('/hangup', webhookRateLimit(60000, 200), validateVobizSignature, async (req, res) => {
    // Respond IMMEDIATELY to prevent timeout — process async
    res.sendStatus(200);

    const callUuid = req.body?.CallUUID || req.body?.call_uuid;
    const callStatus = req.body?.CallStatus || req.body?.call_status || 'completed';
    const duration = req.body?.Duration || req.body?.duration || req.body?.BillDuration || '0';
    const hangupCause = req.body?.HangupCause || req.body?.hangup_cause || '';

    if (!callUuid) return;

    logger.log('📊 Hangup callback', { callUuid, callStatus, duration, hangupCause });

    try {
        const update = {
            status: 'completed',
            endAt: new Date()
        };

        const durationSec = Number(duration) || 0;
        if (durationSec > 0) {
            update.durationSec = durationSec;
            metrics.addCallDuration(durationSec);
        }

        // Map Vobiz hangup causes to our status values
        if (hangupCause === 'NORMAL_CLEARING' || callStatus === 'completed') {
            metrics.incrementCallsCompleted();
        } else if (['BUSY', 'USER_BUSY'].includes(hangupCause)) {
            update.status = 'busy';
            metrics.incrementCallsFailed();
        } else if (['NO_ANSWER', 'NO_USER_RESPONSE', 'ORIGINATOR_CANCEL'].includes(hangupCause)) {
            update.status = 'no-answer';
            metrics.incrementCallsFailed();
        } else if (hangupCause) {
            update.status = 'failed';
            metrics.incrementCallsFailed();
        } else {
            metrics.incrementCallsCompleted();
        }

        update.metadata = { hangupCause };

        costControl.endCallTracking(callUuid);

        await Call.findOneAndUpdate(
            { callSid: callUuid },
            { $set: update },
            { upsert: true }
        );
    } catch (err) {
        logger.error('Hangup callback DB error', err.message);
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// STREAM STATUS CALLBACK
// ══════════════════════════════════════════════════════════════════════════════
router.post('/stream-status', webhookRateLimit(60000, 200), async (req, res) => {
    res.sendStatus(200);
    const event = req.body?.Event || req.body?.event || '';
    const callUuid = req.body?.CallUUID || req.body?.call_uuid || '';
    logger.debug('🔌 Stream status', { event, callUuid });
});

// ══════════════════════════════════════════════════════════════════════════════
// FALLBACK URL — Error handling
// ══════════════════════════════════════════════════════════════════════════════
router.post('/fallback', webhookRateLimit(60000, 100), async (req, res) => {
    logger.error('🚨 Vobiz fallback triggered', req.body);

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        '  <Speak voice="WOMAN" language="en-IN">We are experiencing technical difficulties. Please try again later. Goodbye.</Speak>',
        '  <Hangup/>',
        '</Response>'
    ].join('\n');

    res.type('text/xml').send(xml);
});

module.exports = router;

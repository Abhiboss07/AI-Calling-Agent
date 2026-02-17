const express = require('express');
const router = express.Router();
const config = require('../config');
const logger = require('../utils/logger');
const Call = require('../models/call.model');
const metrics = require('../services/metrics');
const costControl = require('../services/costControl');

// ── Rate limiting for webhook endpoints (H2) ────────────────────────────────
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
// Cleanup stale rate-limit entries every 2 min
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of webhookLimitMap) {
        if (now - entry.start > 120000) webhookLimitMap.delete(key);
    }
}, 120000);

// ══════════════════════════════════════════════════════════════════════════════
// PLIVO WEBHOOK SIGNATURE VERIFICATION
// ══════════════════════════════════════════════════════════════════════════════
function validatePlivoSignature(req, res, next) {
    if (config.nodeEnv !== 'production') return next();

    // Plivo sends X-Plivo-Signature-V2 and X-Plivo-Signature-V2-Nonce
    const signature = req.headers['x-plivo-signature-v2'];
    const nonce = req.headers['x-plivo-signature-v2-nonce'];
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    if (!signature || !nonce) {
        logger.warn('REJECTED: Missing Plivo signature headers', req.originalUrl);
        return res.status(403).send('Forbidden');
    }

    try {
        const plivo = require('plivo');
        const isValid = plivo.validateSignature(url, nonce, signature, config.plivo.authToken);
        if (!isValid) {
            logger.warn('REJECTED: Invalid Plivo signature', req.originalUrl);
            return res.status(403).send('Forbidden');
        }
    } catch (err) {
        logger.warn('Plivo signature validation error', err.message);
        return res.status(403).send('Forbidden');
    }
    next();
}

// ══════════════════════════════════════════════════════════════════════════════
// VOICE WEBHOOK — ANSWER URL (THE CRITICAL ENTRY POINT)
// ══════════════════════════════════════════════════════════════════════════════
//
// ARCHITECTURE:
// We use <Stream bidirectional="true"> inside <Connect> for bidirectional audio.
// Audio flows both ways over the same WebSocket connection — no REST API calls
// needed for playback. This enables true real-time conversational AI.
//
router.post('/voice', webhookRateLimit(60000, 100), validatePlivoSignature, async (req, res) => {
    const host = req.get('host');
    const callUuid = req.body?.CallUUID || 'unknown';
    const from = req.body?.From || 'unknown';
    const to = req.body?.To || 'unknown';
    const direction = req.body?.Direction || 'inbound';

    logger.log('📞 Voice webhook (Plivo)', { callUuid, from, to, direction });

    // ── Create Call record for INBOUND calls (outbound already exist) ────────
    try {
        const existing = await Call.findOne({ callSid: callUuid });
        if (!existing) {
            await Call.create({
                phoneNumber: from,
                callSid: callUuid,
                status: 'ringing',
                direction: direction === 'outbound' ? 'outbound' : 'inbound',
                startAt: new Date(),
                metadata: { from, to }
            });
            metrics.incrementCallsStarted();
            costControl.trackCall(callUuid);
            logger.log('Created inbound call record', callUuid);
        }
    } catch (err) {
        logger.error('Failed to create call record', err.message);
    }

    // ── Build Plivo XML Response ─────────────────────────────────────────────
    // <Stream bidirectional="true"> enables two-way audio over WebSocket.
    // We pass callUuid and callerNumber via query params on the WebSocket URL.
    const statusUrl = `${req.protocol}://${host}/plivo/status`;
    const wsUrl = `wss://${host}/stream?callUuid=${encodeURIComponent(callUuid)}&callerNumber=${encodeURIComponent(from)}&direction=${encodeURIComponent(direction)}`;

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        // Quick acknowledgment while WebSocket connects (~200ms)
        `  <Speak voice="Polly.Aditi" language="en-IN">Hi!</Speak>`,
        // Bidirectional audio stream — call stays alive as long as WS is open
        '  <Connect>',
        `    <Stream bidirectional="true" contentType="audio/x-mulaw;rate=8000" statusCallbackUrl="${statusUrl}" statusCallbackMethod="POST">`,
        `      ${wsUrl}`,
        '    </Stream>',
        '  </Connect>',
        // Fallback if stream disconnects
        `  <Speak voice="Polly.Aditi" language="en-IN">Thank you for calling. Goodbye.</Speak>`,
        '</Response>'
    ].join('\n');

    res.type('text/xml').send(xml);
});

// ══════════════════════════════════════════════════════════════════════════════
// STATUS / HANGUP CALLBACK — Lifecycle tracking + DB updates
// ══════════════════════════════════════════════════════════════════════════════
router.post('/status', webhookRateLimit(60000, 200), validatePlivoSignature, async (req, res) => {
    // Respond IMMEDIATELY to prevent timeout — process async
    res.sendStatus(200);

    // Plivo sends: CallUUID, CallStatus, Duration, etc.
    const callUuid = req.body?.CallUUID;
    const callStatus = req.body?.CallStatus;
    const duration = req.body?.Duration || req.body?.BillDuration;
    const hangupCause = req.body?.HangupCause;

    if (!callUuid || !callStatus) return;

    logger.log('📊 Status callback (Plivo)', { callUuid, callStatus, duration, hangupCause });

    try {
        // Map Plivo statuses to our internal statuses
        const statusMap = {
            'ringing': 'ringing',
            'in-progress': 'in-progress',
            'completed': 'completed',
            'busy': 'busy',
            'no-answer': 'no-answer',
            'cancel': 'canceled',
            'failed': 'failed',
            'timeout': 'no-answer',
            'machine': 'completed'    // Answered by machine
        };

        const mappedStatus = statusMap[callStatus] || callStatus;
        const update = { status: mappedStatus };

        if (callStatus === 'in-progress') {
            update.startAt = new Date();
        }

        if (['completed', 'failed', 'busy', 'no-answer', 'cancel', 'timeout'].includes(callStatus)) {
            update.endAt = new Date();
            if (duration) {
                update.durationSec = Number(duration);
                metrics.addCallDuration(Number(duration));
            }

            if (callStatus === 'completed') {
                metrics.incrementCallsCompleted();
            } else {
                metrics.incrementCallsFailed();
            }

            costControl.endCallTracking(callUuid);
        }

        // Hangup cause for debugging
        if (hangupCause) {
            update['metadata.hangupCause'] = hangupCause;
        }

        await Call.findOneAndUpdate(
            { callSid: callUuid },
            { $set: update },
            { upsert: true }
        );
    } catch (err) {
        logger.error('Status callback DB error', err.message);
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// RECORDING CALLBACK
// ══════════════════════════════════════════════════════════════════════════════
router.post('/recording', webhookRateLimit(60000, 100), validatePlivoSignature, async (req, res) => {
    res.sendStatus(200);

    // Plivo sends: CallUUID, RecordUrl, RecordingDuration, RecordingID
    const callUuid = req.body?.CallUUID;
    const recordUrl = req.body?.RecordUrl;
    const recordDuration = req.body?.RecordingDuration;
    const recordId = req.body?.RecordingID;

    logger.log('🎙️ Recording callback (Plivo)', { callUuid, recordId, recordDuration });

    try {
        if (callUuid && recordUrl) {
            const Recording = require('../models/recording.model');
            const call = await Call.findOne({ callSid: callUuid });
            if (call) {
                await Recording.create({
                    callId: call._id,
                    url: recordUrl,
                    durationSec: Number(recordDuration) || 0,
                    sizeBytes: 0
                });
            }
        }
    } catch (err) {
        logger.error('Recording callback error', err.message);
    }
});

// ── Helper ──────────────────────────────────────────────────────────────────
function xmlEscape(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = router;

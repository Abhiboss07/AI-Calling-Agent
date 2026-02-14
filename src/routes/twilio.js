const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const config = require('../config');
const logger = require('../utils/logger');
const Call = require('../models/call.model');
const metrics = require('../services/metrics');
const costControl = require('../services/costControl');

// ══════════════════════════════════════════════════════════════════════════════
// TWILIO WEBHOOK SIGNATURE VERIFICATION
// ══════════════════════════════════════════════════════════════════════════════
function validateTwilioSignature(req, res, next) {
  if (config.nodeEnv !== 'production') return next();

  const signature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  if (!twilio.validateRequest(config.twilio.authToken, signature, url, req.body || {})) {
    logger.warn('REJECTED: Invalid Twilio signature', req.originalUrl);
    return res.status(403).send('Forbidden');
  }
  next();
}

// ══════════════════════════════════════════════════════════════════════════════
// VOICE WEBHOOK — THE CRITICAL ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════
//
// ARCHITECTURE DECISION:
// We use <Connect><Stream> (bidirectional) instead of <Start><Stream> (listen-only).
//
// <Start><Stream> is UNIDIRECTIONAL — it only sends audio FROM the caller TO our
// server. To play audio back, we'd have to use the REST API to modify the call's
// TwiML (calls.update), which INTERRUPTS whatever verb is executing, kills the
// stream, and introduces ~500ms-1s of dead air. This is fundamentally broken for
// real-time conversation.
//
// <Connect><Stream> is BIDIRECTIONAL — audio flows both ways over the same WebSocket.
// We receive caller audio AND can send audio back by writing to the same WebSocket.
// The call stays connected as long as the <Connect> verb is active (no <Pause> hack).
//
// If <Connect><Stream> is not available on your Twilio account, we fall back to
// <Start><Stream> with REST-based audio playback.
//
router.post('/voice', validateTwilioSignature, async (req, res) => {
  const host = req.get('host');
  const callSid = req.body?.CallSid || 'unknown';
  const from = req.body?.From || 'unknown';
  const to = req.body?.To || 'unknown';
  const direction = req.body?.Direction || 'inbound';

  logger.log('📞 Voice webhook', { callSid, from, to, direction });

  // ── Create Call record for INBOUND calls (outbound already exist) ────────
  try {
    const existing = await Call.findOne({ callSid });
    if (!existing) {
      await Call.create({
        phoneNumber: from,
        callSid,
        status: 'ringing',
        direction: direction === 'outbound-api' ? 'outbound' : 'inbound',
        startAt: new Date(),
        metadata: { from, to }
      });
      metrics.incrementCallsStarted();
      costControl.trackCall(callSid);
      logger.log('Created inbound call record', callSid);
    }
  } catch (err) {
    // Don't fail the webhook — log and continue
    logger.error('Failed to create call record', err.message);
  }

  // ── Build TwiML — respond within 2 seconds (Twilio 15s timeout) ──────────
  // ARCHITECTURE: <Connect><Stream> (bidirectional) keeps the call alive.
  // Audio is sent back through the same WebSocket — NO REST API calls needed.
  // We use a very short <Say> to acknowledge the call while the WS connects (~200ms).
  const statusUrl = `${req.protocol}://${host}/twilio/status`;
  const twiml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    // Ultra-short acknowledgment while WebSocket connects (AI greets through stream)
    `  <Say voice="Polly.Aditi" language="en-IN">Hi!</Say>`,
    // Bidirectional stream — call stays alive as long as WS is open
    '  <Connect>',
    `    <Stream url="wss://${host}/stream" statusCallback="${statusUrl}">`,
    `      <Parameter name="callSid" value="${callSid}"/>`,
    `      <Parameter name="callerNumber" value="${xmlEscape(from)}"/>`,
    `      <Parameter name="direction" value="${direction}"/>`,
    '    </Stream>',
    '  </Connect>',
    // If stream disconnects, say goodbye rather than dead air
    `  <Say voice="Polly.Aditi" language="en-IN">Thank you for calling. Goodbye.</Say>`,
    '</Response>'
  ].join('\n');

  res.type('text/xml').send(twiml);
});

// ══════════════════════════════════════════════════════════════════════════════
// STATUS CALLBACK — Lifecycle tracking + DB updates
// ══════════════════════════════════════════════════════════════════════════════
router.post('/status', validateTwilioSignature, async (req, res) => {
  // Respond IMMEDIATELY to prevent Twilio timeout — process async
  res.sendStatus(200);

  const { CallSid, CallStatus, CallDuration, AnsweredBy } = req.body || {};
  if (!CallSid || !CallStatus) return;

  logger.log('📊 Status callback', { CallSid, CallStatus, CallDuration, AnsweredBy });

  try {
    const update = { status: CallStatus };

    if (CallStatus === 'in-progress') {
      update.startAt = new Date();
    }

    if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus)) {
      update.endAt = new Date();
      if (CallDuration) {
        update.durationSec = Number(CallDuration);
        metrics.addCallDuration(Number(CallDuration));
      }

      if (CallStatus === 'completed') {
        metrics.incrementCallsCompleted();
      } else {
        metrics.incrementCallsFailed();
      }

      costControl.endCallTracking(CallSid);
    }

    // Answering machine — log but don't interrupt
    if (AnsweredBy && AnsweredBy !== 'human') {
      logger.warn('Answering machine detected', { CallSid, AnsweredBy });
      update.metadata = { answeredBy: AnsweredBy };
    }

    await Call.findOneAndUpdate(
      { callSid: CallSid },
      { $set: update },
      { upsert: true }  // Create if not exists (edge case)
    );
  } catch (err) {
    logger.error('Status callback DB error', err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RECORDING CALLBACK
// ══════════════════════════════════════════════════════════════════════════════
router.post('/recording', validateTwilioSignature, async (req, res) => {
  res.sendStatus(200); // Respond immediately

  const { CallSid, RecordingUrl, RecordingDuration, RecordingSid } = req.body || {};
  logger.log('🎙️ Recording callback', { CallSid, RecordingSid, RecordingDuration });

  try {
    if (CallSid && RecordingUrl) {
      const Recording = require('../models/recording.model');
      const call = await Call.findOne({ callSid: CallSid });
      if (call) {
        await Recording.create({
          callId: call._id,
          url: RecordingUrl,
          durationSec: Number(RecordingDuration) || 0,
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

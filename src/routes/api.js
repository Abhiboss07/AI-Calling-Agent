const express = require('express');
const router = express.Router();
const twilioClient = require('../services/twilioClient');
const Call = require('../models/call.model');
const Transcript = require('../models/transcript.model');
const Recording = require('../models/recording.model');
const logger = require('../utils/logger');
const metrics = require('../services/metrics');
const costControl = require('../services/costControl');

// Start a call (enqueue + place outbound)
router.post('/v1/calls/start', async (req, res) => {
  try {
    const { campaignId, phoneNumber, fromNumber } = req.body;
    if (!campaignId || !phoneNumber) return res.status(400).json({ ok: false, error: 'campaignId and phoneNumber required' });

    const webhookUrl = `${req.protocol}://${req.get('host')}/twilio/voice`;
    const twCall = await twilioClient.makeOutboundCall(phoneNumber, fromNumber || undefined, webhookUrl);
    const call = await Call.create({ campaignId, phoneNumber, callSid: twCall.sid, status: 'ringing' });
    
    costControl.trackCall(twCall.sid);
    metrics.incrementCallsStarted();

    res.json({ ok: true, callId: call._id, callSid: twCall.sid });
  } catch (err) {
    logger.error('API start call error', err);
    metrics.incrementCallsFailed();
    res.status(500).json({ ok: false, error: err.message });
  }
});

// End call
router.post('/v1/calls/:id/end', async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ ok: false, error: 'not found' });
    
    const durationSec = call.endAt && call.startAt ? Math.round((call.endAt - call.startAt) / 1000) : 0;
    call.status = 'completed';
    call.durationSec = durationSec;
    await call.save();

    if (call.callSid) costControl.endCallTracking(call.callSid);
    metrics.addCallDuration(durationSec);
    metrics.incrementCallsCompleted();

    res.json({ ok: true, callId: call._id, durationSec });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Upload phone numbers (CSV: phone,name,email)
router.post('/v1/calls/upload-numbers', express.text({ type: 'text/csv', limit: '10mb' }), async (req, res) => {
  try {
    const { campaignId } = req.body;
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId required' });
    if (!req.body) return res.status(400).json({ ok: false, error: 'CSV data required' });

    const lines = req.body.split('\n').filter(l => l.trim());
    const results = { accepted: 0, rejected: 0, errors: [] };

    for (const line of lines) {
      try {
        const [phone, name, email] = line.split(',').map(f => f.trim());
        if (!phone) { results.rejected++; continue; }
        await Call.create({ campaignId, phoneNumber: phone, status: 'queued', metadata: { name, email } });
        results.accepted++;
      } catch (e) {
        results.rejected++;
        results.errors.push(e.message);
      }
    }

    res.json({ ok: true, results });
  } catch (err) {
    logger.error('CSV upload error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Fetch calls (paginated, filterable)
router.get('/v1/calls', async (req, res) => {
  try {
    const { campaignId, status, page = 1, perPage = 50 } = req.query;
    const query = {};
    if (campaignId) query.campaignId = campaignId;
    if (status) query.status = status;

    const calls = await Call.find(query)
      .skip((page - 1) * perPage)
      .limit(Number(perPage))
      .sort({ createdAt: -1 });

    const total = await Call.countDocuments(query);
    res.json({ ok: true, data: calls, total, page, perPage });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get call details
router.get('/v1/calls/:id', async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, data: call });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get full transcript
router.get('/v1/calls/:id/transcript', async (req, res) => {
  try {
    const transcript = await Transcript.findOne({ callId: req.params.id });
    if (!transcript) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, data: transcript });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get recordings
router.get('/v1/calls/:id/recordings', async (req, res) => {
  try {
    const recordings = await Recording.find({ callId: req.params.id });
    res.json({ ok: true, data: recordings });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get system metrics
router.get('/v1/metrics', (req, res) => {
  res.json({ ok: true, data: metrics.getMetrics() });
});

module.exports = router;

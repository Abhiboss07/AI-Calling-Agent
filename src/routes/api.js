const express = require('express');
const router = express.Router();
const twilioClient = require('../services/twilioClient');
const Call = require('../models/call.model');
const Lead = require('../models/lead.model');
const Transcript = require('../models/transcript.model');
const Recording = require('../models/recording.model');
const logger = require('../utils/logger');
const metrics = require('../services/metrics');
const costControl = require('../services/costControl');
const storage = require('../services/storage');
const UploadLog = require('../models/uploadLog.model');

// ──────────────────────────────────────────────────────────────────────────
// CALLS
// ──────────────────────────────────────────────────────────────────────────

// Start a call
router.post('/v1/calls/start', async (req, res) => {
  try {
    const { campaignId, phoneNumber, fromNumber } = req.body;
    if (!campaignId || !phoneNumber) return res.status(400).json({ ok: false, error: 'campaignId and phoneNumber required' });

    // Validate phone number format
    const cleanPhone = phoneNumber.replace(/[^+\d]/g, '');
    if (cleanPhone.length < 10) return res.status(400).json({ ok: false, error: 'Invalid phone number' });

    const webhookUrl = `${req.protocol}://${req.get('host')}/twilio/voice`;
    const twCall = await twilioClient.makeOutboundCall(cleanPhone, fromNumber || undefined, webhookUrl);
    const call = await Call.create({ campaignId, phoneNumber: cleanPhone, callSid: twCall.sid, status: 'ringing' });

    costControl.trackCall(twCall.sid);
    metrics.incrementCallsStarted();

    res.json({ ok: true, callId: call._id, callSid: twCall.sid });
  } catch (err) {
    logger.error('API start call error', err.message);
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
    call.endAt = new Date();
    await call.save();

    if (call.callSid) costControl.endCallTracking(call.callSid);
    metrics.addCallDuration(durationSec);
    metrics.incrementCallsCompleted();

    res.json({ ok: true, callId: call._id, durationSec });
  } catch (err) {
    logger.error('End call error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Upload phone numbers (CSV: phone,name,email)
router.post('/v1/calls/upload-numbers', express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }), async (req, res) => {
  try {
    const { campaignId, mode = 'append' } = req.query;
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId required' });
    if (!req.body || typeof req.body !== 'string') return res.status(400).json({ ok: false, error: 'CSV data required' });

    if (mode === 'replace') {
      await Call.deleteMany({ campaignId, status: 'queued' });
    }

    const lines = req.body.split('\n').filter(l => l.trim());
    const results = { accepted: 0, rejected: 0, errors: [] };

    // Batch insert for performance
    const docs = [];
    for (const line of lines) {
      try {
        const [phone, name, email] = line.split(',').map(f => f.trim());
        const cleanPhone = (phone || '').replace(/[^+\d]/g, '');
        if (!cleanPhone || cleanPhone.length < 10) { results.rejected++; continue; }
        docs.push({ campaignId, phoneNumber: cleanPhone, status: 'queued', metadata: { name, email } });
        results.accepted++;
      } catch (e) {
        results.rejected++;
        results.errors.push(e.message);
      }
    }

    // Bulk insert for performance
    if (docs.length > 0) {
      await Call.insertMany(docs, { ordered: false }).catch(err => {
        logger.warn('Bulk insert partial failure', err.message);
      });
    }

    await UploadLog.create({
      campaignId,
      recordsAccepted: results.accepted,
      recordsRejected: results.rejected,
      errors: results.errors.slice(0, 10) // Cap error messages
    });

    res.json({ ok: true, results });
  } catch (err) {
    logger.error('CSV upload error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Fetch calls (paginated, filterable)
router.get('/v1/calls', async (req, res) => {
  try {
    const { campaignId, status, phoneNumber, page = 1, perPage = 50 } = req.query;
    const query = {};
    if (campaignId) query.campaignId = campaignId;
    if (status) query.status = status;
    if (phoneNumber) query.phoneNumber = phoneNumber;

    const pg = Math.max(1, Number(page));
    const pp = Math.min(100, Math.max(1, Number(perPage)));

    const [calls, total] = await Promise.all([
      Call.find(query).skip((pg - 1) * pp).limit(pp).sort({ createdAt: -1 }).lean(),
      Call.countDocuments(query)
    ]);

    res.json({ ok: true, data: calls, total, page: pg, perPage: pp });
  } catch (err) {
    logger.error('Fetch calls error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get call details
router.get('/v1/calls/:id', async (req, res) => {
  try {
    const call = await Call.findById(req.params.id).lean();
    if (!call) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, data: call });
  } catch (err) {
    logger.error('Fetch call error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// METRICS
// ──────────────────────────────────────────────────────────────────────────

router.get('/v1/metrics', async (req, res) => {
  try {
    const data = metrics.getMetrics();
    const [uniqueClients, durResult] = await Promise.all([
      Call.distinct('phoneNumber'),
      Call.aggregate([{ $group: { _id: null, total: { $sum: '$durationSec' } } }])
    ]);
    data.totalClients = uniqueClients.length;
    data.totalDurationDb = durResult[0]?.total || 0;
    res.json({ ok: true, data });
  } catch (err) {
    logger.error('Metrics error', err.message);
    res.json({ ok: true, data: metrics.getMetrics() });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// UPLOADS
// ──────────────────────────────────────────────────────────────────────────

router.get('/v1/uploads', async (req, res) => {
  try {
    const logs = await UploadLog.find().sort({ createdAt: -1 }).limit(20).lean();
    res.json({ ok: true, data: logs });
  } catch (err) {
    logger.error('Fetch uploads error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// CLIENTS (aggregated from calls)
// ──────────────────────────────────────────────────────────────────────────

router.get('/v1/clients', async (req, res) => {
  try {
    const { page = 1, perPage = 50 } = req.query;
    const pg = Math.max(1, Number(page));
    const pp = Math.min(100, Math.max(1, Number(perPage)));
    const skip = (pg - 1) * pp;

    const clients = await Call.aggregate([
      { $group: { _id: '$phoneNumber', totalCalls: { $sum: 1 }, totalDuration: { $sum: '$durationSec' }, lastCall: { $max: '$createdAt' } } },
      { $project: { phoneNumber: '$_id', totalCalls: 1, totalDuration: 1, lastCall: 1, _id: 0 } },
      { $sort: { lastCall: -1 } },
      { $skip: skip },
      { $limit: pp }
    ]);

    res.json({ ok: true, data: clients, page: pg, perPage: pp });
  } catch (err) {
    logger.error('Client list error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// LEADS (Real Estate)
// ──────────────────────────────────────────────────────────────────────────

// Get all leads
router.get('/v1/leads', async (req, res) => {
  try {
    const { status, minScore, page = 1, perPage = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (minScore) query.qualityScore = { $gte: Number(minScore) };

    const pg = Math.max(1, Number(page));
    const pp = Math.min(100, Math.max(1, Number(perPage)));

    const [leads, total] = await Promise.all([
      Lead.find(query).sort({ createdAt: -1 }).skip((pg - 1) * pp).limit(pp).lean(),
      Lead.countDocuments(query)
    ]);

    res.json({ ok: true, data: leads, total, page: pg, perPage: pp });
  } catch (err) {
    logger.error('Fetch leads error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// IMPORTANT: Lead stats MUST be registered BEFORE /v1/leads/:id
// Otherwise Express matches 'stats' as a MongoDB ObjectId and returns 404
router.get('/v1/leads/stats/summary', async (req, res) => {
  try {
    const [total, qualified, siteVisits, notInterested, avgScore] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ status: 'qualified' }),
      Lead.countDocuments({ status: 'site-visit-booked' }),
      Lead.countDocuments({ status: 'not-interested' }),
      Lead.aggregate([{ $group: { _id: null, avg: { $avg: '$qualityScore' } } }])
    ]);

    res.json({
      ok: true,
      data: {
        total,
        qualified,
        siteVisits,
        notInterested,
        avgQualityScore: Math.round(avgScore[0]?.avg || 0)
      }
    });
  } catch (err) {
    logger.error('Lead stats error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get lead by ID (MUST be after /stats/summary to avoid route shadowing)
router.get('/v1/leads/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id).lean();
    if (!lead) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, data: lead });
  } catch (err) {
    logger.error('Fetch lead error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update lead (for human follow-up)
router.put('/v1/leads/:id', express.json(), async (req, res) => {
  try {
    const allowedFields = ['status', 'assignedAgent', 'notes', 'followUpAt', 'siteVisitDate'];
    const update = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) update[field] = req.body[field];
    }

    const lead = await Lead.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!lead) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, data: lead });
  } catch (err) {
    logger.error('Update lead error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// TRANSCRIPTS & RECORDINGS
// ──────────────────────────────────────────────────────────────────────────

router.get('/v1/calls/:id/transcript', async (req, res) => {
  try {
    const transcript = await Transcript.findOne({ callId: req.params.id }).lean();
    if (!transcript) return res.status(404).json({ ok: false, error: 'not found' });

    if (transcript.s3Key) {
      const url = await storage.getSignedDownloadUrl(transcript.s3Key, 3600);
      return res.json({ ok: true, parsed: transcript, signedUrl: url });
    }

    res.json({ ok: true, parsed: transcript });
  } catch (err) {
    logger.error('Transcript error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/v1/calls/:id/recordings', async (req, res) => {
  try {
    const recordings = await Recording.find({ callId: req.params.id }).lean();
    res.json({ ok: true, data: recordings });
  } catch (err) {
    logger.error('Recordings error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

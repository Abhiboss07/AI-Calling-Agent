const express = require('express');
const router = express.Router();
const vobizClient = require('../services/vobizClient');
const config = require('../config');
const Call = require('../models/call.model');
const Lead = require('../models/lead.model');
const Transcript = require('../models/transcript.model');
const Recording = require('../models/recording.model');
const logger = require('../utils/logger');
const metrics = require('../services/metrics');
const costControl = require('../services/costControl');
const storage = require('../services/storage');
const UploadLog = require('../models/uploadLog.model');

function getPublicBaseUrl(req) {
  const configured = (config.baseUrl || '').trim();
  const isConfiguredUsable = configured && !/localhost|127\.0\.0\.1/i.test(configured);
  if (isConfiguredUsable) return configured.replace(/\/$/, '');

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`.replace(/\/$/, '');
}

// ──────────────────────────────────────────────────────────────────────────
// CALLS
// ──────────────────────────────────────────────────────────────────────────

// Start a call (public test endpoint)
router.post('/v1/calls/test-start', async (req, res) => {
  try {
    const { campaignId, phoneNumber, fromNumber, language, agentName, testMode } = req.body;
    
    if (!campaignId || !phoneNumber) return res.status(400).json({ ok: false, error: 'campaignId and phoneNumber required' });

    // For testing, skip phone validation
    const cleanPhone = phoneNumber.replace(/[^+\d]/g, '');
    
    console.log(' Test call initiated', { campaignId, phoneNumber, fromNumber, language, agentName, testMode });
    
    // Create call record directly (no Vobiz integration for test)
    const call = await Call.create({
      phoneNumber: cleanPhone,
      callSid: `test-${Date.now()}`,
      status: 'test-initiated',
      direction: 'test',
      language: language || 'en-IN',
      startAt: new Date(),
      metadata: { 
        testMode: true,
        agentName: agentName || 'Shubhi',
        fromNumber: fromNumber || '+911234567890',
        campaignId
      }
    });
    
    metrics.incrementCallsStarted();
    
    // Notify monitoring clients
    const { monitoringServer } = require('../services/monitoring');
    monitoringServer.notifyCallStarted({
      callUuid: call.callSid,
      phoneNumber: cleanPhone,
      direction: 'test',
      startTime: new Date()
    });
    
    res.json({
      ok: true,
      callId: call._id,
      callSid: call.callSid,
      status: 'test-initiated',
      message: 'Test call initiated successfully'
    });
    
  } catch (error) {
    logger.error('Test call initiation failed', error.message);
    res.status(500).json({ ok: false, error: 'Failed to initiate test call' });
  }
});

// Start a call
router.post('/v1/calls/start', async (req, res) => {
  try {
    const { campaignId, phoneNumber, fromNumber, language, force } = req.body;
    if (!campaignId || !phoneNumber) return res.status(400).json({ ok: false, error: 'campaignId and phoneNumber required' });

    // FIX H1: Proper E.164 phone number validation
    const cleanPhone = phoneNumber.replace(/[^+\d]/g, '');
    if (!cleanPhone.startsWith('+')) {
      return res.status(400).json({ ok: false, error: 'Phone number must include country code (e.g., +91XXXXXXXXXX)' });
    }
    if (cleanPhone.length < 11 || cleanPhone.length > 16) {
      return res.status(400).json({ ok: false, error: 'Invalid phone number length' });
    }
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      return res.status(400).json({ ok: false, error: 'Phone number must be in E.164 format' });
    }

    // FIX M6: Prevent duplicate simultaneous calls to the same number
    if (!force) {
      const existingCall = await Call.findOne({
        campaignId,
        phoneNumber: cleanPhone,
        status: { $in: ['queued', 'ringing', 'in-progress'] }
      });
      if (existingCall) {
        return res.status(409).json({
          ok: false,
          error: 'Call already in progress for this number',
          existingCallId: existingCall._id
        });
      }
    } else {
      // If forcing, automatically fail any stuck previous calls to this number
      await Call.updateMany({
        campaignId,
        phoneNumber: cleanPhone,
        status: { $in: ['queued', 'ringing', 'in-progress'] }
      }, { $set: { status: 'failed' } });
    }

    const callLanguage = language || config.language?.default || 'en-IN';
    const publicBaseUrl = getPublicBaseUrl(req);
    const answerUrl = `${publicBaseUrl}/vobiz/answer?language=${encodeURIComponent(callLanguage)}`;
    const hangupUrl = `${publicBaseUrl}/vobiz/hangup`;
    const vbCall = await vobizClient.makeOutboundCall(cleanPhone, fromNumber || undefined, answerUrl, hangupUrl);
    const call = await Call.create({
      campaignId,
      phoneNumber: cleanPhone,
      callSid: vbCall.callUuid,
      status: 'ringing',
      language: callLanguage
    });

    costControl.trackCall(vbCall.callUuid);
    metrics.incrementCallsStarted();

    res.json({ ok: true, callId: call._id, callSid: vbCall.callUuid });
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
// FIX M9: Validate content-type before parsing
router.post('/v1/calls/upload-numbers', (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('text/csv') && !contentType.includes('text/plain')) {
    return res.status(415).json({ ok: false, error: 'Unsupported media type. Expected text/csv or text/plain' });
  }
  next();
}, express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }), async (req, res) => {
  try {
    const { campaignId, mode = 'append' } = req.query;
    if (!campaignId || typeof campaignId !== 'string') {
      return res.status(400).json({ ok: false, error: 'campaignId required' });
    }
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
        // FIX M5: Skip comment lines and sanitize fields
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const fields = line.split(',').map(f =>
          f.trim().replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
        );

        const [phone, name, email] = fields;
        const cleanPhone = (phone || '').replace(/[^+\d]/g, '');
        if (!cleanPhone || cleanPhone.length < 10) {
          results.rejected++;
          if (results.errors.length < 10) results.errors.push(`Invalid phone: ${phone}`);
          continue;
        }

        // Validate email format if present
        const cleanEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.substring(0, 100) : '';

        docs.push({
          campaignId,
          phoneNumber: cleanPhone,
          status: 'queued',
          metadata: {
            name: name?.substring(0, 100) || '',  // Cap length
            email: cleanEmail
          }
        });
        results.accepted++;
      } catch (e) {
        results.rejected++;
        if (results.errors.length < 10) results.errors.push(e.message);
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

    // FIX H4: Sanitize query params to prevent NoSQL injection
    if (campaignId && typeof campaignId === 'string') query.campaignId = campaignId;
    if (status && typeof status === 'string') {
      const validStatuses = ['queued', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer'];
      if (validStatuses.includes(status)) {
        query.status = status;
      } else {
        return res.status(400).json({ ok: false, error: 'Invalid status value' });
      }
    }
    if (phoneNumber && typeof phoneNumber === 'string') {
      query.phoneNumber = phoneNumber.replace(/[^+\d]/g, '');
    }

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

// FIX L6: Basic API key auth on metrics endpoint
router.get('/v1/metrics', async (req, res) => {
  try {
    // If METRICS_API_KEY is set, require it
    const metricsKey = process.env.METRICS_API_KEY;
    if (metricsKey) {
      const provided = req.headers['x-api-key'] || req.query.apiKey;
      if (provided !== metricsKey) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    }

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

router.get('/v1/stats', async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayCalls, todayCompletedCalls, avgDurationAgg] = await Promise.all([
      Call.countDocuments({ createdAt: { $gte: startOfDay } }),
      Call.countDocuments({ createdAt: { $gte: startOfDay }, status: 'completed' }),
      Call.aggregate([
        { $match: { durationSec: { $gt: 0 } } },
        { $group: { _id: null, avgDuration: { $avg: '$durationSec' } } }
      ])
    ]);

    const conversionRate = todayCalls > 0
      ? Math.round((todayCompletedCalls / Math.max(1, todayCalls)) * 100)
      : 0;

    res.json({
      todayCalls,
      avgDuration: Math.round(avgDurationAgg[0]?.avgDuration || 0),
      conversionRate
    });
  } catch (err) {
    logger.error('Stats error', err.message);
    res.status(500).json({ ok: false, error: 'Failed to load stats' });
  }
});

router.get('/v1/finance', async (req, res) => {
  try {
    const [wallet, costSnapshot, callAgg] = await Promise.all([
      vobizClient.getWalletSummary().catch((err) => {
        logger.warn('Vobiz wallet fetch failed', err.message);
        return { ok: false, available: null, currency: 'INR', raw: null };
      }),
      Promise.resolve(costControl.getSnapshot()),
      Call.aggregate([
        {
          $group: {
            _id: null,
            totalEstimatedCost: { $sum: { $ifNull: ['$estimatedCost', 0] } },
            totalVobizCost: { $sum: { $ifNull: ['$costBreakdown.vobiz', 0] } },
            totalOpenAICost: {
              $sum: {
                $add: [
                  { $ifNull: ['$costBreakdown.whisper', 0] },
                  { $ifNull: ['$costBreakdown.gpt', 0] },
                  { $ifNull: ['$costBreakdown.tts', 0] }
                ]
              }
            }
          }
        }
      ])
    ]);

    const agg = callAgg[0] || {};
    const walletAvailable = Number.isFinite(wallet.available) ? wallet.available : null;
    const walletAfterActive = walletAvailable === null ? null : Math.max(0, walletAvailable - costSnapshot.activeEstimatedCost);

    res.json({
      ok: true,
      vobiz: {
        walletAvailable,
        walletAfterActive,
        currency: wallet.currency || 'INR',
        totalTelephonyCost: Number(agg.totalVobizCost || 0)
      },
      openai: {
        totalEstimatedCost: Number(agg.totalOpenAICost || 0),
        activeEstimatedCost: Number(costSnapshot.activeEstimatedCost || 0),
        burnRatePerMin: Number(costSnapshot.burnRatePerMin || 0),
        usage: costSnapshot.usage
      },
      totals: {
        allTimeEstimatedCost: Number(agg.totalEstimatedCost || 0),
        activeCallsCount: costSnapshot.activeCallsCount || 0
      },
      activeCalls: costSnapshot.activeCalls
    });
  } catch (err) {
    logger.error('Finance endpoint error', err.message);
    res.status(500).json({ ok: false, error: 'Failed to load finance data' });
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
    if (status && typeof status === 'string') {
      const validLeadStatuses = ['new', 'follow-up', 'qualified', 'site-visit-booked', 'not-interested', 'converted'];
      if (validLeadStatuses.includes(status)) {
        query.status = status;
      } else {
        return res.status(400).json({ ok: false, error: 'Invalid lead status' });
      }
    }
    if (minScore && typeof minScore === 'string' && !isNaN(Number(minScore))) {
      query.qualityScore = { $gte: Number(minScore) };
    }

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

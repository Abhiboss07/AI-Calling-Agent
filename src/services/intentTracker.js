/**
 * Intent Accuracy Tracker
 *
 * Records per-turn intent classifications to MongoDB for accuracy analysis.
 * Confidence < 0.6 triggers a fallback flag for the caller to handle.
 *
 * Usage:
 *   const intentTracker = require('./intentTracker');
 *   intentTracker.record({ callId, callSid, turnNumber, userText, detectedIntent, fsmState, language });
 *   const stats = await intentTracker.getStats(callId);
 */

const logger = require('../utils/logger');

const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Map FSM intent labels to confidence scores.
 * The FSM is deterministic (regex-based), so high confidence for known intents.
 * Unknown/ambiguous intents default to lower confidence.
 */
const INTENT_CONFIDENCE_MAP = {
  availability_confirm: 0.95,
  availability_decline: 0.90,
  purpose_buy:          0.88,
  purpose_rent:         0.85,
  objection:            0.80,
  book_visit:           0.95,
  reschedule:           0.85,
  end_call:             0.98,
  unknown:              0.45,
  noise:                0.20
};

function getConfidence(intent) {
  return INTENT_CONFIDENCE_MAP[intent] ?? 0.55;
}

/**
 * Record an intent classification to MongoDB.
 * Non-blocking — errors are logged but not thrown.
 */
async function record({
  callId,
  callSid,
  turnNumber,
  userText,
  detectedIntent,
  fsmState,
  language = 'en-IN',
  latencyMs = 0,
  expectedIntent = null   // test mode only
}) {
  const confidence = getConfidence(detectedIntent);
  const isLowConfidence = confidence < LOW_CONFIDENCE_THRESHOLD;

  if (isLowConfidence) {
    logger.warn(`[intent] Low confidence (${confidence}) for intent "${detectedIntent}" — text: "${userText?.substring(0, 60)}"`, { callSid, turnNumber });
  }

  const entry = {
    callSid,
    turnNumber,
    userText: userText?.substring(0, 500),
    detectedIntent,
    fsmState,
    confidence,
    language,
    latencyMs,
    ...(expectedIntent ? {
      expectedIntent,
      correct: detectedIntent === expectedIntent
    } : {})
  };

  if (callId) entry.callId = callId;

  try {
    const IntentLog = require('../models/intentLog.model');
    await IntentLog.create(entry);
  } catch (err) {
    logger.warn('[intent] Failed to save intent log:', err.message);
  }

  return { confidence, lowConfidence: isLowConfidence };
}

/**
 * Get intent accuracy stats for a call or all calls.
 * @param {string} callId  ObjectId string (optional — omit for global stats)
 */
async function getStats(callId = null) {
  try {
    const IntentLog = require('../models/intentLog.model');
    const filter = callId ? { callId } : {};

    const [total, breakdown] = await Promise.all([
      IntentLog.countDocuments(filter),
      IntentLog.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$detectedIntent',
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' },
            avgLatencyMs: { $avg: '$latencyMs' }
          }
        },
        { $sort: { count: -1 } }
      ])
    ]);

    const lowConfidenceCount = breakdown
      .filter(b => b.avgConfidence < LOW_CONFIDENCE_THRESHOLD)
      .reduce((s, b) => s + b.count, 0);

    return {
      total,
      lowConfidenceCount,
      lowConfidencePct: total > 0 ? ((lowConfidenceCount / total) * 100).toFixed(1) + '%' : '0%',
      breakdown: breakdown.map(b => ({
        intent: b._id,
        count: b.count,
        avgConfidence: +b.avgConfidence.toFixed(3),
        avgLatencyMs: Math.round(b.avgLatencyMs || 0)
      }))
    };
  } catch (err) {
    logger.warn('[intent] getStats failed:', err.message);
    return { total: 0, breakdown: [] };
  }
}

module.exports = { record, getStats, LOW_CONFIDENCE_THRESHOLD, getConfidence };

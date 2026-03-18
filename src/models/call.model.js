const mongoose = require('mongoose');

const QualityScoreSchema = new mongoose.Schema({
  latencyScore:         { type: Number, default: 0 },
  interruptionHandling: { type: Number, default: 0 },
  sttAccuracy:          { type: Number, default: 0 },
  responseQuality:      { type: Number, default: 0 },
  overallScore:         { type: Number, default: 0 },
  avgLatencyMs:         { type: Number, default: 0 },
  avgLlmMs:             { type: Number, default: 0 },
  fastModeUsed:         { type: Boolean, default: false },
  interventions:        { type: Number, default: 0 }
}, { _id: false });

const CallSchema = new mongoose.Schema({
  campaignId: { type: String, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  phoneNumber: { type: String, required: true, index: true },
  callSid: { type: String, index: true, unique: true, sparse: true },
  status: { type: String, enum: ['queued', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer'], default: 'queued' },
  direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
  language: { type: String, default: 'en-IN' },
  startAt: Date,
  endAt: Date,
  durationSec: { type: Number, default: 0 },
  metadata: { type: Object, default: {} },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  // Quality & performance
  qualityScore:  { type: QualityScoreSchema, default: null },
  avgLatencyMs:  { type: Number, default: 0 },
  estimatedCost: { type: Number, default: 0 },
  costBreakdown: { type: Object, default: {} }
}, { timestamps: true });

CallSchema.index({ campaignId: 1, createdAt: -1 });
CallSchema.index({ phoneNumber: 1, createdAt: -1 });
CallSchema.index({ status: 1 });

module.exports = mongoose.model('Call', CallSchema);

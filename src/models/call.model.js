const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema({
  campaignId: { type: String, index: true },  // String — works with both ObjectId refs and CSV string IDs
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  phoneNumber: { type: String, required: true, index: true },
  callSid: { type: String, index: true, unique: true, sparse: true },
  status: { type: String, enum: ['queued', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer'], default: 'queued' },
  direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
  startAt: Date,
  endAt: Date,
  durationSec: { type: Number, default: 0 },
  metadata: { type: Object, default: {} },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }
}, { timestamps: true });

CallSchema.index({ campaignId: 1, createdAt: -1 });
CallSchema.index({ phoneNumber: 1, createdAt: -1 });
CallSchema.index({ status: 1 });

module.exports = mongoose.model('Call', CallSchema);

const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  phoneNumber: String,
  callSid: { type: String, index: true, unique: true, sparse: true },
  status: { type: String, enum: ['queued','ringing','in-progress','completed','failed','busy','no-answer'], default: 'queued' },
  startAt: Date,
  endAt: Date,
  durationSec: Number,
  metadata: { type: Object, default: {} }
}, { timestamps: true });

CallSchema.index({ campaignId: 1, createdAt: -1 });

module.exports = mongoose.model('Call', CallSchema);

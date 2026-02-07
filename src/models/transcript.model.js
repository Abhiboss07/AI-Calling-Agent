const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  startMs: Number,
  endMs: Number,
  speaker: { type: String, enum: ['agent','customer'] },
  text: String,
  confidence: Number
}, { _id: false });

const TranscriptSchema = new mongoose.Schema({
  callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', index: true },
  entries: { type: [EntrySchema], default: [] },
  fullText: String
}, { timestamps: true });

module.exports = mongoose.model('Transcript', TranscriptSchema);

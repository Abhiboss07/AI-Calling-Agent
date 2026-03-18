const mongoose = require('mongoose');

const RecordingSchema = new mongoose.Schema({
  callId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Call', index: true },
  callSid:     { type: String, index: true },
  fileId:      { type: String },               // GridFS file ID (string form of ObjectId)
  url:         { type: String },               // /api/v1/files/<fileId>
  durationSec: { type: Number, default: 0 },
  sizeBytes:   { type: Number, default: 0 },
  contentType: { type: String, default: 'audio/wav' },
  sampleRate:  { type: Number, default: 8000 }
}, { timestamps: true });

RecordingSchema.index({ callId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Recording', RecordingSchema);

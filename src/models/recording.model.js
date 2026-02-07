const mongoose = require('mongoose');

const RecordingSchema = new mongoose.Schema({
  callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', index: true },
  url: String,
  durationSec: Number,
  sizeBytes: Number
}, { timestamps: true });

module.exports = mongoose.model('Recording', RecordingSchema);

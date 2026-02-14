const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  startMs: Number,
  endMs: Number,
  speaker: { type: String, enum: ['agent', 'customer'] },
  text: String,
  confidence: Number
}, { _id: false });

const TranscriptSchema = new mongoose.Schema({
  callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', required: true, index: true },
  entries: { type: [EntrySchema], default: [] },
  fullText: String,
  summary: { type: String, default: '' },   // AI-generated call summary
  s3Key: String,
  wordCount: { type: Number, default: 0 },  // For analytics
  durationMs: { type: Number, default: 0 }  // Conversation span
}, { timestamps: true });

// Index for fetching transcripts by call
TranscriptSchema.index({ callId: 1 }, { unique: true });

// Pre-save: compute word count and duration
TranscriptSchema.pre('save', function (next) {
  if (this.fullText) {
    this.wordCount = this.fullText.split(/\s+/).filter(Boolean).length;
  }
  if (this.entries && this.entries.length > 1) {
    const firstMs = this.entries[0].startMs || 0;
    const lastMs = this.entries[this.entries.length - 1].endMs || 0;
    this.durationMs = lastMs - firstMs;
  }
  next();
});

module.exports = mongoose.model('Transcript', TranscriptSchema);

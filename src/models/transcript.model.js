const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  startMs:   { type: Number, default: 0 },
  endMs:     { type: Number, default: 0 },
  speaker:   { type: String, enum: ['agent', 'customer'] },
  text:      String,
  confidence:{ type: Number, default: 1 },
  latencyMs: { type: Number, default: 0 },    // pipeline latency for this turn
  intent:    { type: String },                // detected FSM intent
  action:    { type: String }                 // LLM action: continue|hangup|book_visit etc
}, { _id: false });

const EventSchema = new mongoose.Schema({
  type:       { type: String },   // 'interrupt' | 'silence' | 'barge_in' | 'state_change'
  timeMs:     { type: Number },   // ms from call start
  detail:     { type: Object }
}, { _id: false });

const TranscriptSchema = new mongoose.Schema({
  callId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Call', required: true, index: true },
  callSid:   { type: String, index: true },
  entries:   { type: [EntrySchema], default: [] },
  events:    { type: [EventSchema], default: [] },   // interrupts, silences, state changes
  fullText:  String,
  summary:   { type: String, default: '' },
  wordCount: { type: Number, default: 0 },
  durationMs:{ type: Number, default: 0 },
  avgLatencyMs: { type: Number, default: 0 }          // average pipeline latency across turns
}, { timestamps: true });

// Index for fetching transcripts by call
TranscriptSchema.index({ callId: 1 }, { unique: true });

// Pre-save: compute word count, duration, avg latency
TranscriptSchema.pre('save', function (next) {
  if (this.fullText) {
    this.wordCount = this.fullText.split(/\s+/).filter(Boolean).length;
  }
  if (this.entries && this.entries.length > 1) {
    const firstMs = this.entries[0].startMs || 0;
    const lastMs = this.entries[this.entries.length - 1].endMs || 0;
    this.durationMs = lastMs - firstMs;
  }
  const latencies = this.entries.map(e => e.latencyMs).filter(v => v > 0);
  if (latencies.length) {
    this.avgLatencyMs = Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);
  }
  next();
});

module.exports = mongoose.model('Transcript', TranscriptSchema);

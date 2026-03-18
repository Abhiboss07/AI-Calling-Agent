const mongoose = require('mongoose');

const IntentLogSchema = new mongoose.Schema({
  callId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Call', index: true },
  callSid:         { type: String, index: true },
  turnNumber:      { type: Number, default: 0 },
  userText:        { type: String, required: true },
  detectedIntent:  { type: String },           // e.g. 'availability_confirm', 'objection', 'book_visit'
  fsmState:        { type: String },           // FSM state at time of intent
  confidence:      { type: Number, default: 1.0 },
  correct:         { type: Boolean },          // set by test mode when expectedIntent provided
  expectedIntent:  { type: String },           // optional: for automated accuracy checks
  language:        { type: String, default: 'en-IN' },
  latencyMs:       { type: Number, default: 0 } // time to detect intent (FSM + LLM)
}, { timestamps: true });

IntentLogSchema.index({ callId: 1, turnNumber: 1 });
IntentLogSchema.index({ detectedIntent: 1, createdAt: -1 });

module.exports = mongoose.model('IntentLog', IntentLogSchema);

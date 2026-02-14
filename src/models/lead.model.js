const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
    callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', index: true },
    phoneNumber: { type: String, required: true, index: true },

    // Real Estate fields
    name: { type: String, default: '' },
    budget: { type: String, default: '' },          // e.g. "50-80 Lakhs", "1-2 Cr"
    propertyType: { type: String, enum: ['flat', 'villa', 'plot', 'commercial', 'penthouse', 'unknown'], default: 'unknown' },
    location: { type: String, default: '' },          // preferred area/city
    intent: { type: String, enum: ['buy', 'rent', 'invest', 'unknown'], default: 'unknown' },
    timeline: { type: String, default: '' },          // "immediately", "3 months", "6 months"
    bhk: { type: String, default: '' },          // "2BHK", "3BHK"

    // Lead qualification
    qualityScore: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: ['new', 'qualified', 'site-visit-booked', 'follow-up', 'not-interested', 'escalated'], default: 'new' },
    siteVisitDate: { type: Date },
    assignedAgent: { type: String, default: '' },

    // Conversation summary
    conversationSummary: { type: String, default: '' },
    objections: [String],

    // Metadata
    source: { type: String, default: 'ai-call' },
    followUpAt: { type: Date },
    notes: { type: String, default: '' }
}, { timestamps: true });

LeadSchema.index({ status: 1, qualityScore: -1 });
LeadSchema.index({ phoneNumber: 1, createdAt: -1 });

module.exports = mongoose.model('Lead', LeadSchema);

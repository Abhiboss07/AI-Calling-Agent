const mongoose = require('mongoose');

const KnowledgeBaseSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // Optional for now if no user auth
    name: { type: String, required: true, trim: true },
    agentName: { type: String, default: 'Agent' },
    companyName: { type: String, default: 'Company' },
    systemPrompt: { type: String, default: '' }, // Custom system prompt override
    content: { type: String, default: '' }, // Knowledge base text (FAQ, etc.)
    voiceId: { type: String, default: 'alloy' }, // Future use
    // Meta
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

KnowledgeBaseSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('KnowledgeBase', KnowledgeBaseSchema);

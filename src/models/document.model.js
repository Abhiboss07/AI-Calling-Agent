const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    title: { type: String, required: true, trim: true },
    type: {
        type: String,
        enum: ['Listing', 'Website URL', 'Script', 'Finance', 'PDF Document'],
        required: true
    },
    status: {
        type: String,
        enum: ['Ready', 'Processing', 'Paused', 'Failed'],
        default: 'Processing'
    },
    url: { type: String }, // For Website URLs
    s3Key: { type: String }, // For uploaded files
    sizeBytes: { type: Number, default: 0 },
    pages: { type: Number, default: 1 },
    category: {
        type: String,
        enum: ['All Documents', 'Property Listings', 'Scripts & FAQs', 'Legal & Contracts'],
        default: 'All Documents'
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

DocumentSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Document', DocumentSchema);

const mongoose = require('mongoose');

const UploadLogSchema = new mongoose.Schema({
    campaignId: String,
    filename: String,
    recordsAccepted: Number,
    recordsRejected: Number,
    errors: [String]
}, { timestamps: true });

module.exports = mongoose.model('UploadLog', UploadLogSchema);

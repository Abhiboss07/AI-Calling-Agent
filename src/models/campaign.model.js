const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  name: { type: String, index: true },
  script: { type: Array, default: [] },
  dialSettings: { type: Object, default: {} },
  costBudgetPerMin: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Campaign', CampaignSchema);

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, index: true, unique: true, sparse: true },
  role: { type: String, default: 'owner' },
  apiKeyHash: { type: String, index: true, unique: true, sparse: true }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, index: true, unique: true, lowercase: true, trim: true },
  password: { type: String },  // null for Google OAuth users
  googleId: { type: String, index: true, sparse: true },
  avatar: { type: String },
  provider: { type: String, enum: ['local', 'google'], default: 'local' },
  role: { type: String, default: 'owner' },
  isVerified: { type: Boolean, default: false },
  verificationCode: { type: String },
  verificationExpiry: { type: Date },
  apiKeyHash: { type: String, index: true, unique: true, sparse: true },
  lastLogin: { type: Date }
}, { timestamps: true });

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Hide sensitive fields in JSON
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verificationCode;
  delete obj.verificationExpiry;
  delete obj.apiKeyHash;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);

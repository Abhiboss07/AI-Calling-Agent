const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const { generateToken, verifyToken } = require('../middleware/auth');
const { sendVerificationCode } = require('../services/mailer');
const logger = require('../utils/logger');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const storageService = require('../services/storage');

/**
 * Generate a 6-digit verification code
 */
function genCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ──────────────────────────────────────────────────────────────────
// POST /api/v1/auth/signup
// ──────────────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ ok: false, error: 'Name, email, and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
        }

        // Check if user exists
        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            if (existing.isVerified) {
                return res.status(409).json({ ok: false, error: 'Account already exists. Please login.' });
            }
            // Resend verification to unverified user
            const code = genCode();
            existing.verificationCode = code;
            existing.verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);
            existing.name = name;
            existing.password = password;
            await existing.save();
            await sendVerificationCode(email, code, name);
            return res.json({ ok: true, message: 'Verification code resent', email });
        }

        const code = genCode();
        const user = new User({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            provider: 'local',
            verificationCode: code,
            verificationExpiry: new Date(Date.now() + 10 * 60 * 1000)
        });
        await user.save();

        await sendVerificationCode(email, code, name);

        res.status(201).json({
            ok: true,
            message: 'Account created. Verification code sent to your email.',
            email
        });
    } catch (err) {
        logger.error('Signup error', err.message);
        res.status(500).json({ ok: false, error: err.message || 'Signup failed' });
    }
});

// ──────────────────────────────────────────────────────────────────
// POST /api/v1/auth/verify
// ──────────────────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ ok: false, error: 'Email and code are required' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ ok: false, error: 'Account not found' });
        }

        if (user.isVerified) {
            return res.json({ ok: true, message: 'Already verified', token: generateToken(user._id), user });
        }

        if (user.verificationCode !== code.toString().trim()) {
            return res.status(400).json({ ok: false, error: 'Invalid verification code' });
        }

        if (user.verificationExpiry && user.verificationExpiry < new Date()) {
            return res.status(400).json({ ok: false, error: 'Verification code expired. Please request a new one.' });
        }

        user.isVerified = true;
        user.verificationCode = undefined;
        user.verificationExpiry = undefined;
        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user._id);
        res.json({ ok: true, message: 'Email verified successfully', token, user });
    } catch (err) {
        logger.error('Verify error', err.message);
        res.status(500).json({ ok: false, error: 'Verification failed' });
    }
});

// ──────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// ──────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ ok: false, error: 'Email and password are required' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(401).json({ ok: false, error: 'Invalid email or password' });
        }

        if (user.provider === 'google' && !user.password) {
            return res.status(400).json({ ok: false, error: 'This account uses Google sign-in. Please use "Continue with Google".' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ ok: false, error: 'Invalid email or password' });
        }

        if (!user.isVerified) {
            // Resend verification
            const code = genCode();
            user.verificationCode = code;
            user.verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);
            await user.save();
            await sendVerificationCode(email, code, user.name);
            return res.status(403).json({
                ok: false,
                error: 'Email not verified. A new verification code has been sent.',
                needsVerification: true,
                email
            });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user._id);
        res.json({ ok: true, token, user });
    } catch (err) {
        logger.error('Login error', err.message);
        res.status(500).json({ ok: false, error: 'Login failed' });
    }
});

// ──────────────────────────────────────────────────────────────────
// POST /api/v1/auth/google
// ──────────────────────────────────────────────────────────────────
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ ok: false, error: 'Google credential is required' });
        }

        // Verify Google token
        const { OAuth2Client } = require('google-auth-library');
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();

        if (!payload || !payload.email) {
            return res.status(400).json({ ok: false, error: 'Invalid Google token' });
        }

        let user = await User.findOne({ email: payload.email.toLowerCase() });

        if (user) {
            // Link Google to existing account
            if (!user.googleId) {
                user.googleId = payload.sub;
                user.avatar = payload.picture;
                if (!user.isVerified) user.isVerified = true;
            }
            user.lastLogin = new Date();
            await user.save();
        } else {
            // Create new account
            user = new User({
                name: payload.name || payload.email.split('@')[0],
                email: payload.email.toLowerCase(),
                googleId: payload.sub,
                avatar: payload.picture,
                provider: 'google',
                isVerified: true,
                lastLogin: new Date()
            });
            await user.save();
        }

        const token = generateToken(user._id);
        res.json({ ok: true, token, user });
    } catch (err) {
        logger.error('Google auth error', err.message);
        res.status(500).json({ ok: false, error: 'Google authentication failed' });
    }
});

// ──────────────────────────────────────────────────────────────────
// GET /api/v1/auth/me
// ──────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ ok: false, error: 'No token provided' });
        }

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(404).json({ ok: false, error: 'User not found' });
        }

        res.json({ ok: true, user });
    } catch (err) {
        return res.status(401).json({ ok: false, error: 'Invalid token' });
    }
});

// ──────────────────────────────────────────────────────────────────
// POST /api/v1/auth/resend-code
// ──────────────────────────────────────────────────────────────────
router.post('/resend-code', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ ok: false, error: 'Email is required' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ ok: false, error: 'Account not found' });
        }

        if (user.isVerified) {
            return res.json({ ok: true, message: 'Already verified' });
        }

        const code = genCode();
        user.verificationCode = code;
        user.verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendVerificationCode(email, code, user.name);
        res.json({ ok: true, message: 'Verification code sent' });
    } catch (err) {
        logger.error('Resend code error', err.message);
        res.status(500).json({ ok: false, error: 'Failed to resend code' });
    }
});

// ──────────────────────────────────────────────────────────────────
// PUT /api/v1/auth/profile
// ──────────────────────────────────────────────────────────────────
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const { name, phone } = req.body;
        const user = req.user;

        if (name) user.name = name.trim();
        if (phone !== undefined) {
            const cleanPhone = phone.replace(/[^+\d]/g, '');
            if (user.phone !== cleanPhone) {
                user.phone = cleanPhone;
                user.phoneVerified = false; // Need to reverify if changed
            }
        }

        await user.save();
        res.json({ ok: true, user, message: 'Profile updated successfully' });
    } catch (err) {
        logger.error('Update profile error', err.message);
        res.status(500).json({ ok: false, error: 'Failed to update profile' });
    }
});

// ──────────────────────────────────────────────────────────────────
// PUT /api/v1/auth/password
// ──────────────────────────────────────────────────────────────────
router.put('/password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = req.user;

        if (user.provider === 'google' && !user.password) {
            return res.status(400).json({ ok: false, error: 'Cannot change password for Google-linked account without setting one first' });
        }

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ ok: false, error: 'Current and new passwords are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ ok: false, error: 'New password must be at least 8 characters long' });
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ ok: false, error: 'Incorrect current password' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ ok: true, message: 'Password changed successfully' });
    } catch (err) {
        logger.error('Change password error', err.message);
        res.status(500).json({ ok: false, error: 'Failed to change password' });
    }
});

// ──────────────────────────────────────────────────────────────────
// POST /api/v1/auth/avatar
// ──────────────────────────────────────────────────────────────────
router.post('/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'No image file provided' });
        }

        if (!storageService.isConfigured()) {
            return res.status(501).json({ ok: false, error: 'Storage service not configured on the server' });
        }

        const user = req.user;
        const fileExt = req.file.originalname.split('.').pop() || 'png';
        const key = `avatars/${user._id}-${Date.now()}.${fileExt}`;

        const url = await storageService.uploadBuffer(req.file.buffer, key, req.file.mimetype);

        user.avatar = url;
        await user.save();

        res.json({ ok: true, avatarUrl: url, message: 'Avatar updated successfully' });
    } catch (err) {
        logger.error('Avatar upload error', err.message);
        res.status(500).json({ ok: false, error: 'Failed to upload avatar' });
    }
});

// ──────────────────────────────────────────────────────────────────
// DELETE /api/v1/auth/account
// ──────────────────────────────────────────────────────────────────
router.delete('/account', verifyToken, async (req, res) => {
    try {
        const user = req.user;
        await User.findByIdAndDelete(user._id);
        res.json({ ok: true, message: 'Account deleted successfully' });
    } catch (err) {
        logger.error('Delete account error', err.message);
        res.status(500).json({ ok: false, error: 'Failed to delete account' });
    }
});

module.exports = router;

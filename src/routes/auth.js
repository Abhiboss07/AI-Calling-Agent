const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const { generateToken } = require('../middleware/auth');
const { sendVerificationCode } = require('../services/mailer');
const logger = require('../utils/logger');

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

module.exports = router;

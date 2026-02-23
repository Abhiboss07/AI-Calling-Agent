const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'estate-agent-dev-secret-change-in-production';

/**
 * Generate JWT token for a user
 */
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify JWT token and attach user to request
 */
async function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ ok: false, error: 'Authentication required' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password -verificationCode -verificationExpiry -apiKeyHash');

        if (!user) {
            return res.status(401).json({ ok: false, error: 'User not found' });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ ok: false, error: 'Token expired' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ ok: false, error: 'Invalid token' });
        }
        logger.error('Auth middleware error', err.message);
        return res.status(500).json({ ok: false, error: 'Authentication error' });
    }
}

module.exports = { generateToken, verifyToken, JWT_SECRET };

const express = require('express');
const router = express.Router();
const KnowledgeBase = require('../models/knowledgeBase.model');
const logger = require('../utils/logger');

// ── GET /api/v1/knowledge-bases ─────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const kbs = await KnowledgeBase.find().sort({ createdAt: -1 });
        res.json({ ok: true, data: kbs });
    } catch (err) {
        logger.error('List KBs error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── GET /api/v1/knowledge-bases/:id ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const kb = await KnowledgeBase.findById(req.params.id);
        if (!kb) return res.status(404).json({ ok: false, error: 'Not found' });
        res.json({ ok: true, data: kb });
    } catch (err) {
        logger.error('Get KB error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── POST /api/v1/knowledge-bases ────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { name, agentName, companyName, systemPrompt, content } = req.body;
        if (!name) return res.status(400).json({ ok: false, error: 'Name is required' });

        const kb = await KnowledgeBase.create({
            name,
            agentName,
            companyName,
            systemPrompt,
            content
        });
        res.json({ ok: true, data: kb });
    } catch (err) {
        logger.error('Create KB error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── PUT /api/v1/knowledge-bases/:id ─────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const update = {};
        const fields = ['name', 'agentName', 'companyName', 'systemPrompt', 'content', 'voiceId'];
        for (const f of fields) {
            if (req.body[f] !== undefined) update[f] = req.body[f];
        }

        const kb = await KnowledgeBase.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!kb) return res.status(404).json({ ok: false, error: 'Not found' });
        res.json({ ok: true, data: kb });
    } catch (err) {
        logger.error('Update KB error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── DELETE /api/v1/knowledge-bases/:id ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        await KnowledgeBase.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        logger.error('Delete KB error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;

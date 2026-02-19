const express = require('express');
const router = express.Router();
const Campaign = require('../models/campaign.model');
const logger = require('../utils/logger');

// ── GET /api/v1/campaigns ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const campaigns = await Campaign.find().sort({ createdAt: -1 }).populate('knowledgeBaseId');
        res.json({ ok: true, data: campaigns });
    } catch (err) {
        logger.error('List Campaigns error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── GET /api/v1/campaigns/:id ───────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) return res.status(404).json({ ok: false, error: 'Not found' });
        res.json({ ok: true, data: campaign });
    } catch (err) {
        logger.error('Get Campaign error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── POST /api/v1/campaigns ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { name, knowledgeBaseId, dialSettings, costBudgetPerMin } = req.body;
        if (!name) return res.status(400).json({ ok: false, error: 'Name is required' });

        const campaign = await Campaign.create({
            name,
            knowledgeBaseId: knowledgeBaseId || null,
            dialSettings: dialSettings || {},
            costBudgetPerMin: costBudgetPerMin || 0
        });
        res.json({ ok: true, data: campaign });
    } catch (err) {
        logger.error('Create Campaign error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── PUT /api/v1/campaigns/:id ───────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const update = {};
        const fields = ['name', 'knowledgeBaseId', 'dialSettings', 'costBudgetPerMin', 'script'];
        for (const f of fields) {
            if (req.body[f] !== undefined) update[f] = req.body[f];
        }

        const campaign = await Campaign.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!campaign) return res.status(404).json({ ok: false, error: 'Not found' });
        res.json({ ok: true, data: campaign });
    } catch (err) {
        logger.error('Update Campaign error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ── DELETE /api/v1/campaigns/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        await Campaign.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        logger.error('Delete Campaign error', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;

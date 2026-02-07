#!/usr/bin/env node

/**
 * Script to ingest campaign data from JSON
 * Usage: node scripts/ingestCampaign.js campaigns.json
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const Campaign = require('../src/models/campaign.model');
const logger = require('../src/utils/logger');

async function ingest(filePath) {
  try {
    await mongoose.connect(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });
    logger.log('Connected to MongoDB');

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const campaigns = Array.isArray(data) ? data : [data];

    for (const campaign of campaigns) {
      const existing = await Campaign.findOne({ name: campaign.name });
      if (existing) {
        logger.log(`Campaign "${campaign.name}" already exists, skipping`);
        continue;
      }

      const doc = await Campaign.create(campaign);
      logger.log(`Created campaign: ${doc._id} (${doc.name})`);
    }

    logger.log('Ingest complete');
    process.exit(0);
  } catch (err) {
    logger.error('Ingest error', err);
    process.exit(1);
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/ingestCampaign.js <campaignspath>');
  process.exit(1);
}

ingest(path.resolve(filePath));

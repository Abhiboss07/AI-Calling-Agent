const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../src/config');
const User = require('../src/models/user.model');
const Campaign = require('../src/models/campaign.model');
const Call = require('../src/models/call.model');

async function run() {
    try {
        await mongoose.connect(config.mongodbUri);
        console.log('Connected to DB');

        const phoneNumber = '+919580818926';

        // Clear stale calls for this number
        const clearResult = await Call.updateMany(
            { phoneNumber: phoneNumber, status: { $in: ['queued', 'ringing', 'in-progress'] } },
            { $set: { status: 'failed', error: 'Test reset' } }
        );
        console.log('Stale calls cleared:', clearResult.modifiedCount);

        const user = await User.findOne();
        if (!user) throw new Error('No user found');

        const JWT_SECRET = process.env.JWT_SECRET || 'estate-agent-dev-secret-change-in-production';
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });

        const campaign = await Campaign.findOne();
        if (!campaign) throw new Error('No campaign found');

        const url = 'http://localhost:3000/api/v1/calls/start';

        console.log(`Initiating call to ${phoneNumber} using campaign ${campaign._id}`);

        const response = await axios.post(url, {
            campaignId: campaign._id.toString(),
            phoneNumber: phoneNumber
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log('Call Response:', response.data);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
        process.exit(1);
    }
}

run();

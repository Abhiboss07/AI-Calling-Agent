const twilio = require('twilio');
const config = require('../src/config/index');
const logger = require('../src/utils/logger');

async function validateTwilio() {
    console.log('🔍 Validating Twilio Configuration...');
    console.log(`   Account SID: ${config.twilio.accountSid ? 'Correctly Configured from .env ' + config.twilio.accountSid.substring(0, 6) + '...' : '❌ MISSING'}`);
    console.log(`   Auth Token:  ${config.twilio.authToken ? 'Correctly Configured from .env' : '❌ MISSING'}`);
    console.log(`   Caller ID:   ${config.twilio.callerId ? config.twilio.callerId : '❌ MISSING'}`);
    console.log(`   Base URL:    ${config.baseUrl}`);

    if (!config.twilio.accountSid || !config.twilio.authToken) {
        console.error('\n❌ CRITICAL: Twilio credentials missing in .env');
        process.exit(1);
    }

    const client = twilio(config.twilio.accountSid, config.twilio.authToken);

    try {
        console.log('\n📡 Connecting to Twilio API...');
        const account = await client.api.accounts(config.twilio.accountSid).fetch();
        console.log(`✅ Authentication Successful!`);
        console.log(`   Account Name: ${account.friendlyName}`);
        console.log(`   Status:       ${account.status}`);
        console.log(`   Type:         ${account.type}`);

        console.log('\n📞 Fetching Incoming Phone Numbers...');
        const numbers = await client.incomingPhoneNumbers.list({ limit: 5 });
        if (numbers.length > 0) {
            console.log(`✅ Found ${numbers.length} number(s):`);
            numbers.forEach(n => console.log(`   - ${n.phoneNumber} (${n.friendlyName})`));
        } else {
            console.warn('⚠️  No incoming phone numbers found. You may need to buy one for inbound calls.');
        }

        // Check if Caller ID is verified or part of the account
        if (config.twilio.callerId) {
            const isOwned = numbers.some(n => n.phoneNumber === config.twilio.callerId);
            if (isOwned) {
                console.log(`\n✅ Caller ID ${config.twilio.callerId} is a valid incoming number on this account.`);
            } else {
                console.log(`\nℹ️  Caller ID ${config.twilio.callerId} not found in incoming numbers.`);
                console.log('   (This is fine if it is a verified caller ID, but ensure it is verified)');
            }
        }

        console.log('\n✅ Twilio Integration Verification PASSED');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ Twilio API Error:', err.message);
        if (err.code === 20003) {
            console.error('   -> Authentication failed. Check Account SID and Auth Token.');
        }
        process.exit(1);
    }
}

validateTwilio();

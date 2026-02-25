const axios = require('axios');

async function checkCORS() {
    const url = 'https://ai-calling-agent-bl3f.onrender.com/api/v1/auth/login';
    const origin = 'https://ai-calling-agent-udcaog7xo-abhishek-yadav-s-projects-2e9f191c.vercel.app';

    console.log(`Checking CORS for origin: ${origin}`);
    console.log(`Target URL: ${url}`);

    try {
        const response = await axios({
            method: 'options',
            url: url,
            headers: {
                'Origin': origin,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            }
        });

        console.log('\nResponse Status:', response.status);
        console.log('Response Headers:');
        console.log(JSON.stringify(response.headers, null, 2));

        if (response.headers['access-control-allow-origin'] === origin || response.headers['access-control-allow-origin'] === '*') {
            console.log('\n✅ CORS looks correctly configured for this origin.');
        } else {
            console.log('\n❌ CORS is NOT configured for this origin.');
        }
    } catch (error) {
        console.error('\n❌ Request failed:', error.message);
        if (error.response) {
            console.log('Response Headers:', JSON.stringify(error.response.headers, null, 2));
        }
    }
}

checkCORS();

const axios = require('axios');
const fs = require('fs');

async function checkCORS() {
    const url = 'https://ai-calling-agent-bl3f.onrender.com/api/v1/auth/login';
    const origin = 'https://ai-calling-agent-udcaog7xo-abhishek-yadav-s-projects-2e9f191c.vercel.app';

    let log = `Checking CORS for origin: ${origin}\n`;
    log += `Target URL: ${url}\n\n`;

    try {
        const response = await axios({
            method: 'options',
            url: url,
            headers: {
                'Origin': origin,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            },
            validateStatus: () => true
        });

        log += `Response Status: ${response.status}\n`;
        log += `Response Headers:\n`;
        for (const [key, value] of Object.entries(response.headers)) {
            log += `${key}: ${value}\n`;
        }
    } catch (error) {
        log += `\n❌ Request failed: ${error.message}\n`;
    }

    fs.writeFileSync('cors-results.txt', log);
    console.log('Results written to cors-results.txt');
}

checkCORS();

const config = require('../src/config/index');
const OpenAI = require('openai');

async function testOpenAI() {
    console.log('🔮 Testing OpenAI connection...');
    if (!config.openaiApiKey) {
        console.error('❌ OPENAI_API_KEY is missing in config');
        process.exit(1);
    }

    const openai = new OpenAI({ apiKey: config.openaiApiKey });

    try {
        const start = Date.now();
        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: 'Say "Ready"' }],
            model: 'gpt-4o-mini',
        });
        const duration = Date.now() - start;
        console.log(`✅ OpenAI Connected (${duration}ms)`);
        console.log(`   Response: "${completion.choices[0].message.content}"`);
    } catch (err) {
        console.error('❌ OpenAI Error:', err.message);
        if (err.message.includes('insufficient_quota')) {
            console.error('   -> Check your billing/credits.');
        }
        process.exit(1);
    }
}

testOpenAI();

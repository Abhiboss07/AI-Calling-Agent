const http = require('http');

const BASE = 'http://localhost:3000';

function request(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const opts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: { 'Content-Type': 'application/json', ...headers }
        };

        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch { parsed = data; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });

        req.on('error', reject);
        if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

async function run() {
    const results = [];

    function log(name, status, pass, detail = '') {
        const icon = pass ? '✅' : '❌';
        results.push({ name, status, pass });
        console.log(`${icon} ${name} — ${status} ${detail}`);
    }

    // ═══════════════════════════════════════════════════
    // 1. HEALTH ENDPOINTS
    // ═══════════════════════════════════════════════════
    console.log('\n══ HEALTH ENDPOINTS ══');

    try {
        const r = await request('GET', '/health');
        log('GET /health', r.status, r.status === 200 && r.body.ok === true);
    } catch (e) { log('GET /health', 'ERROR', false, e.message); }

    try {
        const r = await request('GET', '/');
        log('GET /', r.status, r.status === 200 && r.body.ok === true);
    } catch (e) { log('GET /', 'ERROR', false, e.message); }

    try {
        const r = await request('GET', '/health/ready');
        log('GET /health/ready', r.status, r.status === 200 || r.status === 503,
            `db=${r.body?.database} openai=${r.body?.openai}`);
    } catch (e) { log('GET /health/ready', 'ERROR', false, e.message); }

    // ═══════════════════════════════════════════════════
    // 2. AUTH ENDPOINTS (Signup → Verify → Login → Me)
    // ═══════════════════════════════════════════════════
    console.log('\n══ AUTH ENDPOINTS ══');

    const testEmail = `test${Date.now()}@example.com`;
    const testPass = 'TestPass123!';
    let authToken = null;

    // Signup
    try {
        const r = await request('POST', '/api/v1/auth/signup', {
            name: 'Test User',
            email: testEmail,
            password: testPass
        });
        log('POST /auth/signup', r.status, r.status === 201 || r.status === 200,
            JSON.stringify(r.body).substring(0, 100));
    } catch (e) { log('POST /auth/signup', 'ERROR', false, e.message); }

    // Login (should work or fail with unverified — both are valid responses)
    try {
        const r = await request('POST', '/api/v1/auth/login', {
            email: testEmail,
            password: testPass
        });
        log('POST /auth/login', r.status,
            r.status === 200 || r.status === 403 || r.status === 401,
            JSON.stringify(r.body).substring(0, 100));
        if (r.body?.token) authToken = r.body.token;
    } catch (e) { log('POST /auth/login', 'ERROR', false, e.message); }

    // Resend code
    try {
        const r = await request('POST', '/api/v1/auth/resend-code', {
            email: testEmail
        });
        log('POST /auth/resend-code', r.status,
            r.status === 200 || r.status === 400 || r.status === 404,
            JSON.stringify(r.body).substring(0, 100));
    } catch (e) { log('POST /auth/resend-code', 'ERROR', false, e.message); }

    // Verify with wrong code (should fail gracefully)
    try {
        const r = await request('POST', '/api/v1/auth/verify', {
            email: testEmail,
            code: '000000'
        });
        log('POST /auth/verify (wrong code)', r.status,
            r.status === 400 || r.status === 401,
            JSON.stringify(r.body).substring(0, 100));
    } catch (e) { log('POST /auth/verify', 'ERROR', false, e.message); }

    // GET /auth/me without token (should 401)
    try {
        const r = await request('GET', '/api/v1/auth/me');
        log('GET /auth/me (no token)', r.status, r.status === 401);
    } catch (e) { log('GET /auth/me', 'ERROR', false, e.message); }

    // ═══════════════════════════════════════════════════
    // 3. PROTECTED API ENDPOINTS (without auth token — should get 401)
    // ═══════════════════════════════════════════════════
    console.log('\n══ PROTECTED API ENDPOINTS (no auth) ══');

    const protectedRoutes = [
        ['GET', '/api/v1/calls'],
        ['GET', '/api/v1/metrics'],
        ['GET', '/api/v1/uploads'],
        ['GET', '/api/v1/clients'],
        ['GET', '/api/v1/leads'],
        ['GET', '/api/v1/leads/stats/summary'],
    ];

    for (const [method, path] of protectedRoutes) {
        try {
            const r = await request(method, path);
            log(`${method} ${path} (no auth)`, r.status, r.status === 401 || r.status === 403);
        } catch (e) { log(`${method} ${path}`, 'ERROR', false, e.message); }
    }

    // ═══════════════════════════════════════════════════
    // 4. VOBIZ WEBHOOK ENDPOINTS
    // ═══════════════════════════════════════════════════
    console.log('\n══ VOBIZ WEBHOOK ENDPOINTS ══');

    // Answer webhook (POST, should return XML)
    try {
        const r = await request('POST', '/vobiz/answer', {
            CallUUID: 'test-uuid-123',
            From: '+919580818926',
            To: '+911234567890',
            Direction: 'inbound'
        });
        log('POST /vobiz/answer', r.status, r.status === 200,
            typeof r.body === 'string' ? r.body.substring(0, 80) : '');
    } catch (e) { log('POST /vobiz/answer', 'ERROR', false, e.message); }

    // Hangup webhook
    try {
        const r = await request('POST', '/vobiz/hangup', {
            CallUUID: 'test-uuid-123',
            CallStatus: 'completed',
            Duration: '30'
        });
        log('POST /vobiz/hangup', r.status, r.status === 200);
    } catch (e) { log('POST /vobiz/hangup', 'ERROR', false, e.message); }

    // Fallback webhook
    try {
        const r = await request('POST', '/vobiz/fallback', { error: 'test' });
        log('POST /vobiz/fallback', r.status, r.status === 200);
    } catch (e) { log('POST /vobiz/fallback', 'ERROR', false, e.message); }

    // Stream status
    try {
        const r = await request('POST', '/vobiz/stream-status', {
            Event: 'stream-started',
            CallUUID: 'test-uuid-123'
        });
        log('POST /vobiz/stream-status', r.status, r.status === 200);
    } catch (e) { log('POST /vobiz/stream-status', 'ERROR', false, e.message); }

    // ═══════════════════════════════════════════════════
    // 5. INPUT VALIDATION
    // ═══════════════════════════════════════════════════
    console.log('\n══ INPUT VALIDATION ══');

    // Start call with missing fields
    try {
        const r = await request('POST', '/api/v1/calls/start', {});
        log('POST /calls/start (empty body, no auth)', r.status,
            r.status === 401 || r.status === 400);
    } catch (e) { log('POST /calls/start validation', 'ERROR', false, e.message); }

    // Start call with bad phone number (no auth)
    try {
        const r = await request('POST', '/api/v1/calls/start', {
            campaignId: 'test',
            phoneNumber: 'invalid'
        });
        log('POST /calls/start (bad phone, no auth)', r.status,
            r.status === 401 || r.status === 400);
    } catch (e) { log('POST /calls/start bad phone', 'ERROR', false, e.message); }

    // ═══════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════
    console.log('\n══ SUMMARY ══');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`Total: ${results.length} | Passed: ${passed} ✅ | Failed: ${failed} ❌`);

    if (failed > 0) {
        console.log('\nFailed tests:');
        results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name} — ${r.status}`));
    }
}

run().catch(e => console.error('Test runner error:', e));

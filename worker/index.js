import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { transcribe } from './stt.js';
import { generateReply } from './llm.js';
import { synthesizeRaw } from './tts.js';
import { endCall as vobizEndCall } from './vobiz.js';
import { mulawToPcm16, computeRms, buildWavHeader } from './audio.js';

const app = new Hono();

// Middleware
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 6400,
    credentials: true,
}));

// DB Helper
let cachedClient = null;
async function getDb(env) {
    if (!cachedClient) {
        cachedClient = new MongoClient(env.MONGODB_URI);
        await cachedClient.connect();
    }
    return cachedClient.db();
}

// ── WebSocket Handler ───────────────────────────────────────────────────────

async function handleCallSession(ws, env) {
    ws.accept();

    let session = {
        callSid: null,
        language: 'en-IN',
        audioChunks: [], // Raw mulaw chunks
        pcmBuffer: [],   // Buffers for STT
        isSpeaking: false,
        isProcessing: false,
        history: [],
        leadData: {},
        startTime: Date.now(),
        lastActivity: Date.now(),
        silenceCount: 0
    };

    const VAD_THRESHOLD = 0.015; // Adjusted for mulaw-to-pcm
    const SILENCE_CHUNKS = 15;   // ~300ms of silence to trigger processing

    ws.addEventListener('message', async ({ data }) => {
        try {
            if (data instanceof ArrayBuffer || typeof data !== 'string') {
                if (!session.callSid || session.isProcessing) return;

                const mulaw = new Uint8Array(data);
                const pcm = mulawToPcm16(mulaw);
                const rms = computeRms(pcm);

                if (rms > VAD_THRESHOLD) {
                    if (!session.isSpeaking) {
                        session.isSpeaking = true;
                        console.log('User started speaking...');
                    }
                    session.audioChunks.push(mulaw);
                    session.pcmBuffer.push(pcm);
                    session.silenceCount = 0;
                    session.lastActivity = Date.now();
                } else if (session.isSpeaking) {
                    session.silenceCount++;
                    if (session.silenceCount > SILENCE_CHUNKS) {
                        session.isSpeaking = false;
                        await triggerPipeline(session, ws, env);
                    }
                }
                return;
            }

            const msg = JSON.parse(data);
            if (msg.event === 'start') {
                session.callSid = msg.start?.callSid || msg.start?.callUuid;
                session.language = msg.start?.customParameters?.language || 'en-IN';
                console.log('Call session started:', session.callSid);

                // Send Greeting
                await playText(session, ws, env, "Hello! How can I help you today?");
            } else if (msg.event === 'stop') {
                await finalizeCall(session, env);
            }
        } catch (e) {
            console.error('WS Handler Error:', e.message);
        }
    });

    ws.addEventListener('close', () => {
        console.log('WS Connection closed:', session.callSid);
        finalizeCall(session, env);
    });
}

async function triggerPipeline(session, ws, env) {
    if (session.isProcessing || session.pcmBuffer.length === 0) return;
    session.isProcessing = true;

    try {
        // 1. Prepare WAV for STT
        const totalPcmLength = session.pcmBuffer.reduce((acc, b) => acc + b.length, 0);
        const pcmData = new Int16Array(totalPcmLength);
        let offset = 0;
        for (const b of session.pcmBuffer) {
            pcmData.set(b, offset);
            offset += b.length;
        }

        const wavHeader = buildWavHeader(pcmData.byteLength);
        const wavFull = new Uint8Array(wavHeader.byteLength + pcmData.byteLength);
        wavFull.set(new Uint8Array(wavHeader), 0);
        wavFull.set(new Uint8Array(pcmData.buffer), wavHeader.byteLength);

        session.pcmBuffer = []; // Clear buffer

        // 2. STT
        const sttResult = await transcribe(env, wavFull.buffer, session.language);
        if (!sttResult.text) {
            session.isProcessing = false;
            return;
        }
        console.log('STT:', sttResult.text);

        // 3. LLM
        const { parsed, assistant } = await generateReply(env, {
            callSid: session.callSid,
            lastTranscript: sttResult.text,
            history: session.history,
            language: session.language,
            callState: { turn: session.history.length / 2 }
        });

        session.history.push({ role: 'user', content: sttResult.text });
        session.history.push({ role: 'assistant', content: assistant });

        console.log('LLM:', parsed.speak);

        // 4. TTS & Play
        if (parsed.speak) {
            await playText(session, ws, env, parsed.speak);
        }

        if (parsed.action === 'hangup') {
            await vobizEndCall(env, session.callSid);
        }

    } catch (e) {
        console.error('Pipeline Error:', e.message);
    } finally {
        session.isProcessing = false;
    }
}

async function playText(session, ws, env, text) {
    try {
        const ttsResult = await synthesizeRaw(env, text);
        if (ttsResult && ttsResult.mulaw) {
            ws.send(JSON.stringify({
                event: 'playAudio',
                media: {
                    contentType: 'audio/x-mulaw;rate=8000',
                    payload: btoa(String.fromCharCode(...ttsResult.mulaw))
                }
            }));
        }
    } catch (e) {
        console.error('PlayText Error:', e.message);
    }
}

async function finalizeCall(session, env) {
    if (session._finalized) return;
    session._finalized = true;

    try {
        const db = await getDb(env);
        await db.collection('calls').updateOne(
            { callSid: session.callSid },
            {
                $set: {
                    status: 'completed',
                    endAt: new Date(),
                    durationSec: Math.round((Date.now() - session.startTime) / 1000)
                }
            }
        );

        if (session.history.length > 0) {
            await db.collection('transcripts').insertOne({
                callSid: session.callSid,
                history: session.history,
                createdAt: new Date()
            });
        }
    } catch (e) {
        console.error('Finalize Error:', e.message);
    }
}

// ── Health Check ──────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true, service: 'AI Calling Agent Worker' }));
app.get('/', (c) => c.json({ ok: true, version: '2.0.0-worker' }));

// ── WebSocket Stream ───────────────────────────────────────────────────────
app.get('/api/v1/stream', async (c) => {
    const upgradeHeader = c.req.header('Upgrade');
    if (upgradeHeader !== 'websocket') {
        return c.text('Expected Upgrade: websocket', 426);
    }
    const [client, server] = new WebSocketPair();
    await handleCallSession(server, c.env);
    return new Response(null, {
        status: 101,
        webSocket: client,
    });
});

// ── Auth Routes ────────────────────────────────────────────────────────────

// POST /api/v1/auth/signup
app.post('/api/v1/auth/signup', async (c) => {
    const env = c.env;
    const { name, email, password } = await c.req.json();
    const db = await getDb(env);
    const users = db.collection('users');

    if (!name || !email || !password) {
        return c.json({ ok: false, error: 'Name, email, and password are required' }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await users.findOne({ email: normalizedEmail });

    if (existing) {
        if (existing.isVerified) {
            return c.json({ ok: false, error: 'Account already exists. Please login.' }, 409);
        }
        // Resend verification logic would go here (requires mailer refactor)
        return c.json({ ok: true, message: 'Verification required', email: normalizedEmail });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const result = await users.insertOne({
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        provider: 'local',
        isVerified: false,
        verificationCode: code,
        verificationExpiry: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
    });

    // Note: sendVerificationCode requires a Cloudflare-compatible mailer (e.g. Resend or Mailchannels)
    console.log(`Verification code for ${email}: ${code}`);

    return c.json({
        ok: true,
        message: 'Account created. Verification required.',
        email: normalizedEmail
    }, 201);
});

// POST /api/v1/auth/login
app.post('/api/v1/auth/login', async (c) => {
    const env = c.env;
    const { email, password } = await c.req.json();
    const db = await getDb(env);
    const users = db.collection('users');

    const user = await users.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
        return c.json({ ok: false, error: 'Invalid email or password' }, 401);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return c.json({ ok: false, error: 'Invalid email or password' }, 401);
    }

    if (!user.isVerified) {
        return c.json({ ok: false, error: 'Email not verified', needsVerification: true, email: user.email }, 403);
    }

    const token = jwt.sign({ userId: user._id.toString() }, env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    // Clean user object for response
    const { password: _, verificationCode: __, ...safeUser } = user;

    return c.json({ ok: true, token, user: safeUser });
});

// GET /api/v1/auth/me
app.get('/api/v1/auth/me', async (c) => {
    const env = c.env;
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET || 'secret');
        const db = await getDb(env);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });

        if (!user) return c.json({ ok: false, error: 'User not found' }, 404);

        const { password: _, verificationCode: __, ...safeUser } = user;
        return c.json({ ok: true, user: safeUser });
    } catch (err) {
        return c.json({ ok: false, error: 'Invalid token' }, 401);
    }
});

// ── Metrics ───────────────────────────────────────────────────────────────
app.get('/api/v1/metrics', async (c) => {
    const db = await getDb(c.env);
    const [uniqueClients, durResult, counts] = await Promise.all([
        db.collection('calls').distinct('phoneNumber'),
        db.collection('calls').aggregate([{ $group: { _id: null, total: { $sum: '$durationSec' } } }]).toArray(),
        db.collection('calls').aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray()
    ]);

    const stats = {
        totalClients: uniqueClients.length,
        totalDurationDb: durResult[0]?.total || 0,
        statusCounts: counts.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {})
    };

    return c.json({ ok: true, data: stats });
});

// ── Calls ──────────────────────────────────────────────────────────────────
app.get('/api/v1/calls', async (c) => {
    const db = await getDb(c.env);
    const { campaignId, status, page = 1, perPage = 50 } = c.req.query();

    const query = {};
    if (campaignId) query.campaignId = campaignId;
    if (status) query.status = status;

    const pg = Math.max(1, Number(page));
    const pp = Math.min(100, Math.max(1, Number(perPage)));

    const [calls, total] = await Promise.all([
        db.collection('calls').find(query).sort({ createdAt: -1 }).skip((pg - 1) * pp).limit(pp).toArray(),
        db.collection('calls').countDocuments(query)
    ]);

    return c.json({ ok: true, data: calls, total, page: pg, perPage: pp });
});

app.get('/api/v1/calls/:id', async (c) => {
    const db = await getDb(c.env);
    try {
        const call = await db.collection('calls').findOne({ _id: new ObjectId(c.req.param('id')) });
        if (!call) return c.json({ ok: false, error: 'Not found' }, 404);
        return c.json({ ok: true, data: call });
    } catch (e) {
        return c.json({ ok: false, error: 'Invalid ID' }, 400);
    }
});

// ── Leads ──────────────────────────────────────────────────────────────────
app.get('/api/v1/leads', async (c) => {
    const db = await getDb(c.env);
    const { status, minScore, page = 1, perPage = 50 } = c.req.query();

    const query = {};
    if (status) query.status = status;
    if (minScore) query.qualityScore = { $gte: Number(minScore) };

    const pg = Math.max(1, Number(page));
    const pp = Math.min(100, Math.max(1, Number(perPage)));

    const [leads, total] = await Promise.all([
        db.collection('leads').find(query).sort({ createdAt: -1 }).skip((pg - 1) * pp).limit(pp).toArray(),
        db.collection('leads').countDocuments(query)
    ]);

    return c.json({ ok: true, data: leads, total, page: pg, perPage: pp });
});

app.get('/api/v1/leads/stats/summary', async (c) => {
    const db = await getDb(c.env);
    const [total, qualified, siteVisits, notInterested, avgScore] = await Promise.all([
        db.collection('leads').countDocuments(),
        db.collection('leads').countDocuments({ status: 'qualified' }),
        db.collection('leads').countDocuments({ status: 'site-visit-booked' }),
        db.collection('leads').countDocuments({ status: 'not-interested' }),
        db.collection('leads').aggregate([{ $group: { _id: null, avg: { $avg: '$qualityScore' } } }]).toArray()
    ]);

    return c.json({
        ok: true,
        data: {
            total,
            qualified,
            siteVisits,
            notInterested,
            avgQualityScore: Math.round(avgScore[0]?.avg || 0)
        }
    });
});

export default app;

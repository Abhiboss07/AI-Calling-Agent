// ── Startup diagnostics (must be before any require that can throw) ──────────
process.stdout.write(`[BOOT] Node ${process.version} starting — PID ${process.pid} — PORT=${process.env.PORT || 3000} HOST=${process.env.HOST || '0.0.0.0'} NODE_ENV=${process.env.NODE_ENV || 'unset'}\n`);

let express, expressWs, config, logger, db;
let vobizRoutes, authRoutes, apiRoutes, campaignRoutes, knowledgeBaseRoutes;
let verifyToken, setupWs, metrics, startMonitoring, monitoringRoutes;

try {
  express = require('express');
  expressWs = require('express-ws');
  config = require('./config');
  logger = require('./utils/logger');
  db = require('./services/db');
  vobizRoutes = require('./routes/vobiz');
  authRoutes = require('./routes/auth');
  apiRoutes = require('./routes/api');
  campaignRoutes = require('./routes/campaigns');
  knowledgeBaseRoutes = require('./routes/knowledgeBase');
  ({ verifyToken } = require('./middleware/auth'));
  setupWs = require('./ws-media-optimized');
  metrics = require('./services/metrics');
  ({ startMonitoring, router: monitoringRoutes } = require('./services/monitoring'));
  process.stdout.write('[BOOT] All modules loaded OK\n');
} catch (bootErr) {
  process.stderr.write(`[BOOT] FATAL module load error: ${bootErr.message}\n${bootErr.stack}\n`);
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER (in-memory)
// ══════════════════════════════════════════════════════════════════════════════
const rateLimitMap = new Map();
function rateLimit(windowMs = 60000, max = 200) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    let entry = rateLimitMap.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      rateLimitMap.set(key, entry);
    }
    entry.count++;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    if (entry.count > max) {
      return res.status(429).json({ ok: false, error: 'Too many requests' });
    }
    next();
  };
}

// Cleanup stale entries every 2 min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.start > 120000) rateLimitMap.delete(key);
  }
}, 120000);

// ══════════════════════════════════════════════════════════════════════════════
// PROCESS-LEVEL ERROR HANDLERS
// ══════════════════════════════════════════════════════════════════════════════
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('FATAL Uncaught Exception:', err.message, err.stack);
  setTimeout(() => process.exit(1), 1000);
});

// ══════════════════════════════════════════════════════════════════════════════
// API KEY VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

async function validateApiKeys() {
  const checks = [
    {
      name: 'Gemini (LLM primary)',
      key: config.geminiApiKey,
      envVar: 'GEMINI_API_KEY',
      required: true,
      validate: async () => {
        const axios = require('axios');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`;
        const res = await axios.get(url, { timeout: 5000 });
        return res.status === 200;
      }
    },
    {
      name: 'Deepgram (STT)',
      key: config.deepgramApiKey,
      envVar: 'DEEPGRAM_API_KEY',
      required: true,
      validate: async () => {
        const axios = require('axios');
        const res = await axios.get('https://api.deepgram.com/v1/auth/token', {
          headers: { Authorization: `Token ${config.deepgramApiKey}` },
          timeout: 5000
        });
        return res.status === 200;
      }
    },
    {
      name: 'Sarvam (TTS)',
      key: config.sarvamApiKey,
      envVar: 'SARVAM_API_KEY',
      required: true,
      validate: async () => {
        // Sarvam has no lightweight ping — just verify the key is non-empty and well-formed
        return typeof config.sarvamApiKey === 'string' && config.sarvamApiKey.length > 10;
      }
    },
    {
      name: 'OpenAI (LLM fallback)',
      key: config.llm?.openaiApiKey || process.env.OPENAI_API_KEY,
      envVar: 'OPENAI_API_KEY',
      required: false,   // fallback only
      validate: async () => {
        const key = config.llm?.openaiApiKey || process.env.OPENAI_API_KEY;
        return typeof key === 'string' && key.startsWith('sk-') && key.length > 20;
      }
    },
    {
      name: 'Gmail SMTP',
      key: config.gmail?.user,
      envVar: 'GMAIL_USER + GMAIL_APP_PASSWORD',
      required: false,   // email is optional
      validate: async () => {
        return config.gmail?.user && config.gmail?.appPassword;
      }
    }
  ];

  let allCriticalOk = true;

  for (const check of checks) {
    if (!check.key) {
      const level = check.required ? 'error' : 'warn';
      logger[level](`${check.required ? '❌' : '⚠️ '} ${check.name}: ${check.envVar} not set`);
      if (check.required) allCriticalOk = false;
      continue;
    }

    try {
      const ok = await check.validate();
      if (ok) {
        logger.log(`✅ ${check.name}: API key valid`);
      } else {
        const level = check.required ? 'error' : 'warn';
        logger[level](`${check.required ? '❌' : '⚠️ '} ${check.name}: key present but validation failed — check ${check.envVar}`);
        if (check.required) allCriticalOk = false;
      }
    } catch (err) {
      // Network failure during validation should not block startup
      logger.warn(`⚠️  ${check.name}: validation request failed (${err.message}) — key may still work`);
    }
  }

  if (!allCriticalOk) {
    logger.error('❌ One or more required API keys are missing or invalid. Calls WILL fail.');
    logger.error('   Copy .env.example to .env and fill in all required keys, then restart.');
  } else {
    logger.log('✅ All required API keys validated');
  }

  if (process.env.DEBUG_CALL === 'true') {
    logger.log('🔍 DEBUG_CALL=true — per-turn latency tracking and call reports enabled');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PIPELINE WARMUP — reduce first-call latency from ~1.5s → ~600ms
// ══════════════════════════════════════════════════════════════════════════════

async function warmupPipeline() {
  try {
    const ttsService = require('./services/tts');
    const llmService = require('./services/llm');

    // 1. TTS warmup — pre-synthesize common phrases (intro + response cache) so they're in TTS cache
    const responseCache = require('./services/responseCache');
    const cachePhrases = responseCache.getAllPhrases({ agentName: config.agentName, companyName: config.companyName });
    const introPhrases = [
      'Hello, this is a call from ' + config.agentName,
      'Hello, am I speaking with you?',
      'Hello, is this a good time to talk?',
      'Thank you for your time',
      'Have a great day!'
    ];
    const warmPhrases = [...new Set([...introPhrases, ...cachePhrases])];
    const { attempted, warmed } = await ttsService.prewarmPhrases(warmPhrases, config.defaultLanguage || 'en-IN');
    logger.log(`✅ TTS warmup: ${warmed}/${attempted} phrases cached`);

    // 2. LLM warmup — trigger a minimal call to prime the connection pool
    await llmService.generateReply({
      callState: { step: 'availability_check', turnCount: 0 },
      lastTranscript: 'hello',
      customerName: 'warmup',
      callSid: '_warmup_',
      language: 'en-IN',
      callDirection: 'outbound',
      honorific: 'sir_maam'
    });
    logger.log('✅ LLM warmup: Gemini connection primed');

  } catch (err) {
    logger.warn('Pipeline warmup error (non-fatal):', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ══════════════════════════════════════════════════════════════════════════════
let isShuttingDown = false;

async function start() {
  const app = express();
  expressWs(app, null, {
    wsOptions: {
      verifyClient: (info, cb) => {
        // Allow all WebSocket connections
        cb(true);
      }
    }
  });

  // Trust proxy (required behind ALB/nginx for correct req.ip, req.protocol)
  app.set('trust proxy', 1);

  // ── Security Headers ────────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0'); // Modern browsers: use CSP instead
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.removeHeader('X-Powered-By');
    next();
  });

  // ── CORS ───────────────────────────────────────────────────────────────
  const cors = require('cors');
  app.use(cors({
    origin: (origin, callback) => {
      // Allow all origins for debugging, or restrict as needed
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
  }));

  // ── Request tracking ────────────────────────────────────────────────────
  app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    req.startTime = Date.now();
    res.setHeader('X-Request-ID', req.requestId);

    // Log response time on finish
    res.on('finish', () => {
      const duration = Date.now() - req.startTime;
      if (duration > 1000 || res.statusCode >= 400) {
        logger.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      }
    });

    next();
  });

  // ── Body parsing ────────────────────────────────────────────────────────
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: '1mb' }));

  // ── Connection drain guard ──────────────────────────────────────────────
  // CRITICAL FIX: Don't block health checks during shutdown — K8s needs them
  // to know the pod is still draining. Also don't block WebSocket upgrades
  // for active calls that are still in progress.
  app.use((req, res, next) => {
    if (isShuttingDown && !req.path.startsWith('/health') && !req.headers.upgrade) {
      res.setHeader('Connection', 'close');
      return res.status(503).json({ ok: false, error: 'Server is shutting down' });
    }
    next();
  });

  // ── Rate limiting ───────────────────────────────────────────────────────
  app.use('/api', rateLimit(60000, 200));

  // ══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECKS
  // ══════════════════════════════════════════════════════════════════════════

  // Liveness probe — is the process alive?
  app.get('/health', (req, res) => {
    res.json({ ok: true, pid: process.pid });
  });

  // Readiness probe — can the service accept traffic?
  let lastAIProviderCheck = 0;
  let aiProviderHealthy = true;

  app.get('/health/ready', async (req, res) => {
    const dbReady = db.isReady();

    // Lightweight Gemini check (cached 60s)
    const now = Date.now();
    if (now - lastAIProviderCheck > 60000) {
      try {
        const axios = require('axios');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`;
        const r = await axios.get(url, { timeout: 4000 });
        aiProviderHealthy = r.status === 200;
        lastAIProviderCheck = now;
      } catch (err) {
        aiProviderHealthy = false;
        logger.warn('Gemini health check failed', err.message);
      }
    }

    const ready = dbReady && !isShuttingDown;

    const body = {
      ok: ready,
      version: '2.0.0',
      uptime: Math.round(process.uptime()),
      database: dbReady ? 'connected' : 'disconnected',
      aiProvider: `gemini:${aiProviderHealthy ? 'healthy' : 'unhealthy'}`,
      memory: {
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
      },
      calls: {
        active: metrics.getMetrics().activeCalls,
        peak: metrics.getMetrics().peakConcurrent
      }
    };

    res.status(ready ? 200 : 503).json(body);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ROUTES
  // ══════════════════════════════════════════════════════════════════════════

  // FIX: Add root route to confirm server is running
  app.get('/', (req, res) => {
    res.json({
      ok: true,
      service: 'AI Calling Agent',
      version: '2.0.0',
      docs: '/documentation' // Placeholder
    });
  });

  app.use('/vobiz', vobizRoutes);

  // ── Public auth routes — MUST be registered before any verifyToken middleware ──
  // Routes: /signup /register /login /verify /resend-code /google
  app.use('/api/v1/auth', authRoutes);

  // ── Public test-call endpoint (no auth) ──────────────────────────────────────
  app.post('/api/v1/calls/test-start', (req, res, next) => {
    req.url = '/v1/calls/test-start';
    apiRoutes(req, res, next);
  });

  // ── Protected routes — verifyToken applied explicitly, never touches /auth ───
  app.use('/api/v1/campaigns', verifyToken, campaignRoutes);
  app.use('/api/v1/knowledge-bases', verifyToken, knowledgeBaseRoutes);
  app.use('/api', verifyToken, apiRoutes);   // routes inside use /v1/* prefix already

  app.use('/monitor', monitoringRoutes);

  // WebSocket for Vobiz Media Streams
  setupWs(app);

  // Start monitoring WebSocket endpoint for real-time updates
  startMonitoring(app);

  // ── Global error handler ────────────────────────────────────────────────
  app.use((err, req, res, next) => {
    logger.error(`[${req.requestId}] Route error:`, err.message, err.stack?.split('\n')[1]);
    const status = err.status || 500;
    res.status(status).json({
      ok: false,
      error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
      requestId: req.requestId
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // START LISTENING
  // ══════════════════════════════════════════════════════════════════════════
  const server = app.listen(config.port, config.host, () => {
    logger.log(`🚀 AI Calling Agent v2.0.0 listening on ${config.host}:${config.port}`);
    logger.log(`   PID: ${process.pid} | Env: ${config.nodeEnv} | Agent: ${config.agentName}`);

    // ── Connect to MongoDB + validate API keys AFTER binding port ──────────
    // This ensures Railway/K8s health checks pass immediately while the DB
    // and API connections are established asynchronously in the background.
    db.connect()
      .then(() => validateApiKeys())
      .then(() => warmupPipeline())
      .catch(err => logger.error('Startup background init error:', err.message));
  });

  // WebSocket upgrade timeout
  server.headersTimeout = 65000;
  server.keepAliveTimeout = 60000;

  // ══════════════════════════════════════════════════════════════════════════
  // GRACEFUL SHUTDOWN (zero-downtime deploys)
  // ══════════════════════════════════════════════════════════════════════════
  // Sequence:
  //   1. SIGTERM received (from Docker/K8s/PM2)
  //   2. Stop accepting new connections (isShuttingDown = true)
  //   3. Wait for in-flight requests to complete (connection drain)
  //   4. Close database connection
  //   5. Exit cleanly
  //
  // K8s sends SIGTERM, then waits terminationGracePeriodSeconds (30s default),
  // then sends SIGKILL. We must finish within that window.

  let shutdownRequested = false;

  async function shutdown(signal) {
    if (shutdownRequested) return;
    shutdownRequested = true;

    logger.log(`${signal} received — starting graceful shutdown...`);
    isShuttingDown = true;

    // 1. Stop accepting new HTTP connections
    server.close(() => {
      logger.log('HTTP server closed — no new connections');
    });

    // 2. Wait for active calls to drain (max 15 seconds)
    const drainStart = Date.now();
    const DRAIN_TIMEOUT_MS = 15000;
    while (metrics.getMetrics().activeCalls > 0 && (Date.now() - drainStart) < DRAIN_TIMEOUT_MS) {
      logger.log(`Draining: ${metrics.getMetrics().activeCalls} active calls remaining...`);
      await new Promise(r => setTimeout(r, 2000));
    }

    if (metrics.getMetrics().activeCalls > 0) {
      logger.warn(`Force shutdown with ${metrics.getMetrics().activeCalls} active calls`);
    }

    // 3. Disconnect database
    await db.disconnect();
    logger.log('Database disconnected');

    // 4. Exit
    logger.log('Shutdown complete. Goodbye.');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => {
  logger.error('FATAL: Server failed to start', err?.message || err, err?.stack);
  process.exit(1);
});

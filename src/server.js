const express = require('express');
const expressWs = require('express-ws');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./services/db');
const vobizRoutes = require('./routes/vobiz');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { verifyToken } = require('./middleware/auth');
const setupWs = require('./ws-media');
const metrics = require('./services/metrics');

// ══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER (in-memory — production: Redis via RATE_LIMIT_REDIS_URL)
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
// SERVER STARTUP
// ══════════════════════════════════════════════════════════════════════════════
let isShuttingDown = false;

async function start() {
  await db.connect();

  // ── Validate OpenAI API key at startup ──────────────────────────────────
  try {
    const openai = require('./services/openaiClient');
    const keyCheck = await openai.validateApiKey();
    if (keyCheck.valid) {
      logger.log('✅ OpenAI API key validated — TTS/STT/LLM will work');
    } else {
      logger.error(`⚠️  OpenAI API key INVALID — ${keyCheck.error}`);
      logger.error('   TTS, STT, and LLM will ALL fail during calls!');
      logger.error('   Fix: Update OPENAI_API_KEY in your .env file with a valid key');
    }
  } catch (err) {
    logger.warn('OpenAI key validation skipped:', err.message);
  }

  const app = express();
  expressWs(app);

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
  let lastOpenAICheck = 0;
  let openAIHealthy = true;

  app.get('/health/ready', async (req, res) => {
    const dbReady = db.isReady();

    // FIX: Lightweight OpenAI check using free /v1/models endpoint (cached for 60s)
    const now = Date.now();
    if (now - lastOpenAICheck > 60000) {
      try {
        const axios = require('axios');
        await axios.get('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${config.openaiApiKey}` },
          timeout: 5000
        });
        openAIHealthy = true;
        lastOpenAICheck = now;
      } catch (err) {
        openAIHealthy = false;
        logger.warn('OpenAI health check failed', err.message);
      }
    }

    const ready = dbReady && !isShuttingDown;

    const body = {
      ok: ready,
      version: '2.0.0',
      uptime: Math.round(process.uptime()),
      database: dbReady ? 'connected' : 'disconnected',
      openai: openAIHealthy ? 'healthy' : 'unhealthy',
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
  app.use('/api/v1/auth', authRoutes);  // Public auth routes
  app.use('/api', verifyToken, apiRoutes);  // Protected API routes

  // WebSocket for Vobiz Media Streams
  setupWs(app);

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
  logger.error('FATAL: Server failed to start', err);
  process.exit(1);
});

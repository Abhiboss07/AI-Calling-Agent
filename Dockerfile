# ══════════════════════════════════════════════════════════════════════════════
# PRODUCTION DOCKERFILE — AI Calling Agent
# ══════════════════════════════════════════════════════════════════════════════
# Multi-stage build: 240MB → ~95MB final image
# Startup time: < 3 seconds
# Security: Non-root user, no dev dependencies, no .env bundled
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Install deps ────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install ONLY production dependencies (no devDeps, no package-lock churn)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: add non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install curl for healthcheck (tiny footprint on alpine)
RUN apk add --no-cache curl tini

WORKDIR /app

# Copy production deps from stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy application code (NO .env, NO tests, NO frontend)
COPY src ./src
COPY config ./config

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check — Docker/ECS/K8s will use this
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:3000/health || exit 1

# Use tini as PID 1 for proper signal handling (SIGTERM, SIGINT)
# Without tini, Node.js doesn't receive signals properly in containers
ENTRYPOINT ["tini", "--"]

# Start the application
CMD ["node", "src/server.js"]

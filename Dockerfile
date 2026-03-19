# ── Simple single-stage Dockerfile for Railway ───────────────────────────────
FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy application code
COPY src ./src
COPY config ./config

# Always bind to all interfaces (required for cloud platforms)
ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 3000

# Start the server
CMD ["node", "src/server.js"]

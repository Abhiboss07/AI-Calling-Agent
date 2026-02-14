# ══════════════════════════════════════════════════════════════════════════════
# AI Calling Agent — Production Deployment Architecture
# Senior DevOps Architect Audit Report
# Date: 2026-02-14 | Version 2.0.0
# ══════════════════════════════════════════════════════════════════════════════

---

## EXECUTIVE SUMMARY

This report covers the complete production deployment architecture for a
**real-time AI voice system** with Twilio integration. Real-time voice has
fundamentally different infrastructure requirements than typical web apps:

- **WebSocket connections last 1-10 minutes** (not milliseconds)
- **Audio streams at 20 packets/sec** (not request-response)
- **Latency budget is 3 seconds** (not best-effort)
- **A dropped connection = a dropped phone call** (user-facing failure)

The architecture below achieves:
- ✅ **Zero downtime deploys** (rolling update + connection draining)
- ✅ **Auto-scaling** (2-20 pods based on CPU, with voice-aware tuning)
- ✅ **Secure environment** (secrets management, TLS, non-root containers)
- ✅ **Low latency** (region co-location with Twilio, keep-alive pools)
- ✅ **High availability** (multi-AZ, PDB, anti-affinity, health probes)

---

## ═══════════════════════════════════════════════
## 1. INFRASTRUCTURE ARCHITECTURE
## ═══════════════════════════════════════════════

### 1.1 Production Infrastructure Diagram

```
                         ┌──────────────────────────────────────────┐
                         │           INTERNET / PSTN                │
                         └───────────────┬──────────────────────────┘
                                         │
                    ┌────────────────────┬┴───────────────────────┐
                    │                    │                         │
              ┌─────▼─────┐      ┌──────▼──────┐          ┌──────▼──────┐
              │  Twilio    │      │  Twilio     │          │  Frontend   │
              │  Voice     │      │  Media      │          │  Dashboard  │
              │  Webhooks  │      │  Streams    │          │  (Next.js)  │
              │  (HTTPS)   │      │  (WSS)      │          │  (Vercel)   │
              └─────┬──────┘      └──────┬──────┘          └──────┬──────┘
                    │                    │                         │
                    ▼                    ▼                         ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                    CLOUDFLARE / AWS ALB                       │
        │              (SSL Termination, DDoS Protection)              │
        │                                                               │
        │   ┌─────────────────────────────────────────────────────┐    │
        │   │  Nginx Ingress Controller / ALB Target Group         │    │
        │   │  - WebSocket upgrade for /stream (15 min timeout)   │    │
        │   │  - Rate limiting: API 10r/s, Webhooks 50r/s         │    │
        │   │  - Sticky sessions by callSid (WS routing)          │    │
        │   └──────────────────┬──────────────────────────────────┘    │
        └──────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                KUBERNETES CLUSTER (EKS / GKE)                │
        │                                                               │
        │   ┌─────────────────────────────────────────────────────┐    │
        │   │          ai-calling Namespace                         │    │
        │   │                                                       │    │
        │   │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │    │
        │   │  │  Pod #1   │  │  Pod #2   │  │  Pod #N   │  ←HPA   │    │
        │   │  │  Node.js  │  │  Node.js  │  │  Node.js  │  2-20   │    │
        │   │  │  256Mi    │  │  256Mi    │  │  256Mi    │          │    │
        │   │  │  0.25 CPU │  │  0.25 CPU │  │  0.25 CPU │          │    │
        │   │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘          │    │
        │   │        │              │              │                │    │
        │   │        └──────────────┼──────────────┘                │    │
        │   │                       │                                │    │
        │   └───────────────────────┼────────────────────────────────┘    │
        │                           │                                     │
        └───────────────────────────┼─────────────────────────────────────┘
                                    │
                   ┌────────────────┼──────────────────┐
                   │                │                    │
            ┌──────▼──────┐  ┌─────▼──────┐  ┌────────▼────────┐
            │  MongoDB    │  │  Redis      │  │  Cloudflare R2  │
            │  Atlas M10  │  │  (ElastiC.) │  │  (S3 compat.)   │
            │  Multi-AZ   │  │  Rate limit │  │  TTS audio      │
            │  Auto backup│  │  Session    │  │  Recordings     │
            └─────────────┘  └────────────┘  └─────────────────┘
                                                      │
                                               ┌──────▼──────┐
                                               │  Cloudflare  │
                                               │  CDN (audio) │
                                               └──────────────┘
```

### 1.2 Region Placement Strategy

**Goal:** Minimize latency between your server and Twilio's media servers.

| Component | Recommended Region | Rationale |
|-----------|-------------------|-----------|
| App servers | **Mumbai (ap-south-1)** or **US-East (us-east-1)** | Closest to your callers and Twilio's India/US media servers |
| MongoDB Atlas | **Same region** as app | < 5ms roundtrip for DB queries |
| Redis | **Same region** | < 1ms for rate limiting |
| Cloudflare R2 | **Auto (global)** | Edge-cached TTS audio |
| OpenAI API | **N/A (fixed)** | OpenAI is US-based; ~150ms from India |

> **CRITICAL:** Twilio Media Streams connect from Twilio's data center to YOUR
> WebSocket endpoint. If your server is in Mumbai and Twilio's media server is
> in Virginia, you add ~200ms of round-trip latency to EVERY audio packet.
>
> **Recommendation for Indian callers:** Use `ap-south-1` (Mumbai) — Twilio
> has a regional media server in Singapore/India.

### 1.3 Load Balancing for WebSocket

**The #1 mistake:** Generic HTTP load balancers break WebSocket connections.

| Requirement | Solution |
|-------------|----------|
| WebSocket upgrade | ALB/Nginx with `proxy_set_header Upgrade` |
| Long-lived connections | Idle timeout ≥ 900s (15 min) |
| Sticky routing | Hash by `callSid` query param |
| Health-aware routing | Readiness probe removes unhealthy pods |
| Connection draining | `terminationGracePeriodSeconds: 60` |

**Why sticky routing matters:**
A single call's audio stream MUST hit the SAME server for the entire duration.
The `CallSession` state (audio buffer, conversation history, lead data) is
in-memory. If the LB routes packets to a different server, the call breaks.

```nginx
# Nginx upstream hash for sticky WebSocket routing
upstream app_backend {
    hash $arg_callSid consistent;
    server pod1:3000;
    server pod2:3000;
}
```

---

## ═══════════════════════════════════════════════
## 2. CONTAINER OPTIMIZATION
## ═══════════════════════════════════════════════

### 2.1 Dockerfile Audit

| Issue Found | Severity | Fix Applied |
|------------|----------|-------------|
| Single-stage build (~240MB) | 🟠 HIGH | Multi-stage: deps stage + production stage (~95MB) |
| Running as root | 🔴 CRITICAL | `adduser -S appuser` + `USER appuser` |
| .env baked into image | 🔴 CRITICAL | Removed — secrets from orchestrator env vars |
| No init system (PID 1 issue) | 🟠 HIGH | Added `tini` as entrypoint |
| `npm install` (not `npm ci`) | 🟡 MEDIUM | Changed to `npm ci --omit=dev` |
| No .dockerignore | 🟡 MEDIUM | Created — excludes node_modules, .git, frontend |
| Health check uses Node.js | 🟡 MEDIUM | Changed to `curl` (faster, lower memory) |
| No resource limits | 🟠 HIGH | Added in docker-compose and K8s manifests |

### 2.2 Image Size Comparison

```
BEFORE (single stage, node:18):
  node:18           →  900MB base
  + npm install     →  240MB deps
  + source code     →   50MB
  TOTAL:            ~1190MB  ❌

AFTER (multi-stage, node:20-alpine):
  node:20-alpine    →   120MB base
  + npm ci --omit=dev → 65MB deps
  + source code     →    5MB
  + tini + curl     →    5MB
  TOTAL:            ~  95MB  ✅  (12x smaller)
```

### 2.3 Startup Time

```
BEFORE: ~8-12 seconds
  - npm install at runtime: 5-8s
  - MongoDB connection: 2-3s
  - Config loading: <1s

AFTER: ~3-5 seconds
  - Deps pre-installed in image: 0s
  - MongoDB connection: 2-3s
  - Config validation: <100ms
  - Twilio client init: <100ms
```

### 2.4 PID 1 Problem (CRITICAL for Docker)

Node.js doesn't handle signals correctly when running as PID 1 in a container.
`SIGTERM` from Docker/K8s is silently ignored, causing:
- 10-second forced kill (no graceful shutdown)
- Active calls dropped without saving transcripts
- Database connections not cleaned up

**Fix:** `tini` as init system:
```dockerfile
RUN apk add --no-cache tini
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/server.js"]
```

---

## ═══════════════════════════════════════════════
## 3. SECURITY HARDENING
## ═══════════════════════════════════════════════

### 3.1 Security Audit Results

| Layer | Check | Status | Notes |
|-------|-------|--------|-------|
| **Transport** | HTTPS enforcement | ✅ | HSTS header + HTTP→HTTPS redirect |
| **Transport** | TLS 1.2+ only | ✅ | Nginx config: `ssl_protocols TLSv1.2 TLSv1.3` |
| **Transport** | WebSocket over WSS | ✅ | SSL termination at LB/Nginx |
| **Auth** | Twilio webhook signature | ✅ | `twilio.validateRequest()` in production |
| **Auth** | API authentication | ⚠️ | Rate limiting only — add API keys for production |
| **Secrets** | No .env in image | ✅ | Secrets via env vars from orchestrator |
| **Secrets** | No secrets in logs | ✅ | Config keys not logged |
| **Secrets** | K8s Secrets | ✅ | Base64 encoded in Secret resource |
| **Container** | Non-root user | ✅ | `appuser:appgroup` |
| **Container** | Read-only FS | ⚠️ | Not yet — add `readOnlyRootFilesystem: true` |
| **Network** | Firewall rules | ✅ | ClusterIP service — not directly exposed |
| **Network** | DDoS protection | ✅ | Cloudflare + Nginx rate limiting |
| **Headers** | Security headers | ✅ | X-Content-Type-Options, X-Frame-Options, HSTS |

### 3.2 Secret Management Strategy

```
DEVELOPMENT:     .env file (gitignored)
STAGING/PROD:    External secrets manager

Recommended hierarchy:
┌──────────────────────────────────────────────────┐
│  AWS Secrets Manager / HashiCorp Vault           │
│                                                    │
│  ai-calling-agent/prod:                           │
│    TWILIO_ACCOUNT_SID: AC...                      │
│    TWILIO_AUTH_TOKEN: ...                          │
│    OPENAI_API_KEY: sk-...                         │
│    MONGODB_URI: mongodb+srv://...                 │
│    S3_ACCESS_KEY: ...                             │
│    S3_SECRET_KEY: ...                             │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│  Kubernetes External Secrets Operator            │
│  or                                               │
│  AWS ECS Task Definition secretsManager          │
│  or                                               │
│  Railway/Render environment variables             │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
              Container env vars
```

### 3.3 Firewall Rules

```
INBOUND:
  Port 443 (HTTPS)     ← Internet (via LB)
  Port 443 (WSS)       ← Twilio Media Servers
  Port 3000            ← LB → App pods (internal only)

OUTBOUND:
  api.openai.com:443   → OpenAI STT/LLM/TTS
  api.twilio.com:443   → Twilio REST API
  MongoDB Atlas:27017  → Database
  R2/S3 endpoint:443   → Object storage

BLOCKED:
  All other inbound    ← Security group / NetworkPolicy
  SSH (port 22)        ← Disabled in production containers
```

### 3.4 Rate Limiting Architecture

```
Layer 1: Cloudflare    → 1000 req/s per IP (DDoS protection)
Layer 2: Nginx         → API: 10 req/s, Webhooks: 50 req/s
Layer 3: Application   → 200 req/min per IP (in-memory)
Layer 4: OpenAI        → Circuit breaker (5 failures → open for 60s)
```

---

## ═══════════════════════════════════════════════
## 4. CI/CD PIPELINE
## ═══════════════════════════════════════════════

### 4.1 Pipeline Architecture

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐
│   Push    │───▶│   TEST   │───▶│  BUILD   │───▶│   STAGING    │
│  to main  │    │  10 min  │    │  15 min  │    │  auto-deploy │
└──────────┘    └──────────┘    └──────────┘    └──────┬───────┘
                                                        │
                                                        ▼
                                                 ┌──────────────┐
                                                 │  PRODUCTION  │
                                                 │ manual gate  │
                                                 └──────────────┘
```

### 4.2 Deployment Strategy Comparison

| Strategy | Downtime | Risk | Suitable for Voice? |
|----------|----------|------|---------------------|
| **Rolling Update** ✅ | None | Low | Yes — with connection draining |
| Blue-Green | None | Low | Yes — but 2x infrastructure cost |
| Canary | None | Very Low | Yes — best for gradual rollout |
| Recreate | 10-30s | High | ❌ No — drops active calls |

**Chosen: Rolling Update with Connection Draining**

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1        # Add 1 new pod
    maxUnavailable: 0  # Never remove a pod until new one is ready
```

### 4.3 Zero-Downtime Deploy Sequence

```
T+0s:   New pod created with updated image
T+5s:   New pod passes startup probe
T+10s:  New pod passes readiness probe → added to Service endpoints
T+10s:  Old pod marked for termination
T+10s:  preStop hook: sleep 5 (LB stops routing new traffic)
T+15s:  SIGTERM sent to old pod
T+15s:  App sets isShuttingDown=true, returns 503 to new requests
T+15s:  App drains active calls (up to 15s for in-flight calls)
T+30s:  Active calls complete → transcript/lead saved → DB disconnected
T+30s:  Process exit 0
T+60s:  (Safety) K8s sends SIGKILL if process still alive
```

**Key insight:** The `terminationGracePeriodSeconds: 60` gives active calls
up to 45 seconds to complete (60s - 5s preStop - 10s buffer). This covers
most call scenarios without dropping audio.

### 4.4 Rollback

```bash
# Automatic rollback on failed deploy (in CI/CD)
kubectl rollout undo deployment/ai-calling-agent -n ai-calling

# Manual rollback to specific revision
kubectl rollout undo deployment/ai-calling-agent --to-revision=3 -n ai-calling

# Check rollout history
kubectl rollout history deployment/ai-calling-agent -n ai-calling
```

---

## ═══════════════════════════════════════════════
## 5. PRODUCTION MONITORING
## ═══════════════════════════════════════════════

### 5.1 Health Check Endpoints

| Endpoint | Purpose | K8s Probe | Interval |
|----------|---------|-----------|----------|
| `GET /health` | Liveness — is process alive? | livenessProbe | 15s |
| `GET /health/ready` | Readiness — can accept traffic? | readinessProbe | 10s |
| `GET /api/v1/metrics` | Full metrics dashboard | Prometheus scrape | 30s |

### 5.2 Metrics Exported

```json
{
  "calls": {
    "started": 1500,
    "completed": 1420,
    "failed": 80,
    "active": 5,
    "peakConcurrent": 12,
    "avgDuration": "45.2s",
    "successRate": "94.7%"
  },
  "pipeline": {
    "p50": 1250,
    "p95": 2800,
    "p99": 4200,
    "avgStt": 450,
    "avgLlm": 380,
    "avgTts": 320
  },
  "errors": {
    "sttErrors": 3,
    "llmErrors": 1,
    "ttsErrors": 2,
    "wsDisconnects": 5,
    "bufferOverflows": 0
  },
  "system": {
    "memoryMB": 87,
    "uptimeSec": 86400
  }
}
```

### 5.3 Alert Rules

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| **High Pipeline Latency** | P95 > 3000ms for 5 min | 🔴 CRITICAL | Check OpenAI status, scale pods |
| **High Error Rate** | Call failure > 10% for 5 min | 🔴 CRITICAL | Check logs, rollback if post-deploy |
| **Memory Pressure** | RSS > 400MB for 10 min | 🟠 WARNING | Check for memory leaks, restart pod |
| **Active Calls Spike** | > 15 concurrent calls | 🟡 INFO | HPA should handle, verify scaling |
| **STT Failures** | > 5% error rate | 🟠 WARNING | Check Whisper API, audio format |
| **WebSocket Drops** | > 10 disconnects/hour | 🟠 WARNING | Check network, LB settings |
| **DB Disconnect** | Health ready = false | 🔴 CRITICAL | Check MongoDB Atlas, connection pool |
| **Cost Spike** | Daily cost > ₹1000 | 🟠 WARNING | Check call volume, budget limits |
| **Pod OOMKill** | Container restart reason: OOM | 🔴 CRITICAL | Increase memory limits, investigate leak |
| **Deploy Failed** | Rollout stuck > 5 min | 🔴 CRITICAL | Auto-rollback triggered |

### 5.4 Logging Architecture

```
Application (structured JSON logs)
    │
    ├── stdout → Container runtime
    │               │
    │               ▼
    │           Fluentd / Fluent Bit (DaemonSet)
    │               │
    │               ▼
    │           ┌──────────────────────────────┐
    │           │  Log Aggregation              │
    │           │  - AWS CloudWatch Logs        │
    │           │  - Datadog Log Management     │
    │           │  - ELK Stack (self-hosted)    │
    │           └──────────────────────────────┘
    │
    ├── Per-call tracing:
    │   callSid attached to every log line
    │   Filter: callSid=CA1234... shows full call lifecycle
    │
    └── Retention:
        - Hot: 7 days (searchable)
        - Warm: 30 days (compressed)
        - Archive: 90 days (S3 lifecycle)
```

---

## ═══════════════════════════════════════════════
## 6. SCALING STRATEGY
## ═══════════════════════════════════════════════

### 6.1 Capacity Planning

Each pod can handle ~5-10 concurrent calls (CPU-bound during STT+LLM+TTS).

| Tier | Concurrent Calls | Pods | CPU Total | Memory Total | Monthly Cost (est.) |
|------|-------------------|------|-----------|--------------|---------------------|
| **Small** | 10 | 2 | 2 vCPU | 1 GB | ~$50 infra |
| **Medium** | 100 | 12-15 | 15 vCPU | 8 GB | ~$300 infra |
| **Large** | 1000 | 120-150 | 150 vCPU | 80 GB | ~$2500 infra |

> **Note:** Infrastructure cost is tiny compared to API costs.
> At 1000 concurrent calls, OpenAI API alone costs ~$500-1000/day.

### 6.2 Scaling per Tier

#### Tier 1: 10 Concurrent Calls (current)

```
Infrastructure:
  - 2 pods (m5.large or t3.medium)
  - MongoDB Atlas M10 (shared RAM)
  - Redis: not required
  - Single AZ acceptable (cost savings)

Bottleneck:    OpenAI API rate limits
Upgrade path:  Increase pod count → HPA handles
Monthly infra: ~₹4,000 ($50)
Monthly API:   ~₹8,000-20,000 ($100-250)
```

#### Tier 2: 100 Concurrent Calls

```
Infrastructure:
  - 12-15 pods with HPA (min:4, max:20)
  - MongoDB Atlas M30 (dedicated, 8GB RAM)
  - Redis ElastiCache (rate limiting, session sticky)
  - Multi-AZ required
  - Nginx with upstream hash for WebSocket stickiness

Bottleneck:    OpenAI API throughput, DB connection pool
Upgrades:
  ✅ Redis for distributed rate limiting (replace in-memory Map)
  ✅ MongoDB connection pool increase (20 → 50)
  ✅ OpenAI Tier 3+ API access (higher rate limits)
  ✅ CDN for TTS audio (Cloudflare cache)
  ✅ Horizontal pod autoscaling: CPU 60% target

Monthly infra: ~₹24,000 ($300)
Monthly API:   ~₹80,000-200,000 ($1000-2500)
```

#### Tier 3: 1000 Concurrent Calls

```
Infrastructure:
  - 120-150 pods with HPA (min:20, max:200)
  - MongoDB Atlas M50+ (dedicated cluster, 32GB RAM, auto-scaling storage)
  - Redis Cluster (6 nodes, for distributed locking + pub/sub)
  - Multi-region deployment
  - Call queue system (Redis + BullMQ)

Architecture Changes Required:
  ✅ Call queue: Don't start all 1000 calls simultaneously
     → Queue system with max concurrency per instance
  ✅ Redis Pub/Sub: Cross-pod communication for call events
  ✅ Distributed state: Move CallSession to Redis (not in-memory)
  ✅ OpenAI Enterprise: Dedicated API capacity
  ✅ Twilio Enterprise: Volume pricing, dedicated interconnects
  ✅ Multiple Twilio numbers: Spread across 10-20 phone numbers
  ✅ Regional deployment: India + US for latency optimization
  ✅ Database sharding: Separate DBs for calls, leads, transcripts

Monthly infra: ~₹200,000 ($2500)
Monthly API:   ~₹800,000-2,000,000 ($10,000-25,000)
```

### 6.3 Auto-Scaling Configuration

```yaml
# HPA scales based on CPU (voice processing is CPU-intensive)
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60    # Lower than typical 80% — latency-sensitive

behavior:
  scaleUp:
    stabilizationWindowSeconds: 60  # React within 1 minute
    policies:
      - type: Pods
        value: 2
        periodSeconds: 60  # Add 2 pods per minute max

  scaleDown:
    stabilizationWindowSeconds: 300  # Wait 5 min before removing pods
    policies:
      - type: Pods
        value: 1
        periodSeconds: 120  # Remove 1 pod every 2 min
```

**Why 60% CPU target (not 80%)?**
Voice is latency-sensitive. At 80% CPU, the STT+LLM+TTS pipeline competes
for CPU time with audio processing, causing 500ms+ additional latency.
60% leaves headroom for burst processing during concurrent pipelines.

**Why slow scale-down?**
Active calls hold WebSocket connections to specific pods. Removing a pod
drops those calls. The 5-minute stabilization window and 1-pod-per-2-min
policy minimizes disruption.

### 6.4 Queue Strategy (at 100+ calls)

```
                   ┌─────────────────────────────┐
                   │       API: Start Campaign    │
                   └──────────────┬──────────────┘
                                  │
                                  ▼
                   ┌─────────────────────────────┐
                   │      Redis Queue (BullMQ)    │
                   │  - Priority queue            │
                   │  - Max concurrency: 50       │
                   │  - Retry with backoff        │
                   │  - Dead letter queue         │
                   └──────────────┬──────────────┘
                                  │
                   ┌──────────────┼──────────────┐
                   │              │              │
              ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
              │ Worker 1│   │ Worker 2│   │ Worker N│
              │ 10 calls│   │ 10 calls│   │ 10 calls│
              └─────────┘   └─────────┘   └─────────┘

Benefits:
  - Backpressure control (don't overwhelm Twilio/OpenAI)
  - Retry failed calls automatically
  - Priority scheduling (hot leads first)
  - Campaign pause/resume
  - Rate limiting per campaign
```

---

## ═══════════════════════════════════════════════
## 7. COST OPTIMIZATION
## ═══════════════════════════════════════════════

### 7.1 Cost Breakdown (per call)

| Component | Cost per Minute | Cost per 5-min Call |
|-----------|----------------|---------------------|
| Twilio Voice | ₹1.5 ($0.018) | ₹7.5 |
| Twilio + India mobile | ₹3.0 ($0.036) | ₹15.0 |
| OpenAI Whisper (STT) | ₹0.5 ($0.006) | ₹2.5 |
| OpenAI GPT-4o-mini | ₹0.4 ($0.005) | ₹2.0 |
| OpenAI TTS | ₹1.2 ($0.015) | ₹6.0 |
| S3/R2 Storage | ₹0.01 | ₹0.05 |
| Infrastructure | ₹0.1 | ₹0.5 |
| **TOTAL** | **₹6.7/min** | **₹33.5/call** |

### 7.2 Optimization Strategies

| Strategy | Savings | Effort |
|----------|---------|--------|
| TTS caching (common phrases) | 15-20% on TTS costs | ✅ Already implemented |
| GPT-4o-mini (not GPT-4) | 90% on LLM costs | ✅ Already using |
| Whisper API (not Whisper Large local) | N/A — API is simpler | Current approach |
| S3 → R2 (no egress fees) | 100% on storage egress | ✅ Already using R2 |
| Reserved/spot instances (infra) | 30-60% on compute | Medium effort |
| Twilio committed use | 10-25% on telephony | Negotiation |
| OpenAI Tier 4+ pricing | Better rate limits | Volume-based |
| Silence detection (skip empty STT) | 10% on STT costs | ✅ Already implemented |
| Short audio filter (<125ms) | 5% on STT costs | ✅ Already implemented |
| CDN for TTS audio | Faster playback, lower S3 reads | Low effort |

---

## ═══════════════════════════════════════════════
## 8. DEPLOYMENT CHECKLIST
## ═══════════════════════════════════════════════

### Pre-Deploy
- [ ] All 40 unit tests passing
- [ ] Docker image builds successfully
- [ ] Docker image runs and passes health check locally
- [ ] All secrets configured in secrets manager
- [ ] MongoDB Atlas cluster provisioned and accessible
- [ ] S3/R2 bucket created with correct permissions
- [ ] Twilio phone numbers provisioned
- [ ] Twilio webhook URLs updated to production domain
- [ ] SSL certificate obtained and configured
- [ ] DNS records pointing to load balancer
- [ ] Nginx/Ingress configured with WebSocket support

### Deploy
- [ ] Push to main branch
- [ ] CI pipeline passes (test → build → staging)
- [ ] Staging health check passes
- [ ] Staging smoke test: make a test call
- [ ] Approve production deploy
- [ ] Production health check passes

### Post-Deploy
- [ ] `GET /health` returns `{"ok":true}`
- [ ] `GET /health/ready` returns database connected
- [ ] `GET /api/v1/metrics` returns valid metrics
- [ ] Make a real test call — verify greeting plays within 2s
- [ ] Speak to AI — verify response within 3s
- [ ] Be silent for 10s — verify "Are you still there?" prompt
- [ ] Re-verify MongoDB has Call, Transcript, Lead records
- [ ] Verify S3/R2 has TTS audio files
- [ ] Check logs for any errors
- [ ] Verify Twilio console shows successful call

### Ongoing
- [ ] Daily: Check P95 latency < 3000ms
- [ ] Daily: Check call success rate > 90%
- [ ] Daily: Check memory usage < 200MB
- [ ] Weekly: Review cost vs budget
- [ ] Weekly: Check MongoDB backup status
- [ ] Weekly: Review error logs for patterns
- [ ] Monthly: Update Node.js base image
- [ ] Monthly: Run `npm audit` for vulnerabilities
- [ ] Monthly: Rotate Twilio auth token

---

## ═══════════════════════════════════════════════
## 9. FILES DELIVERED
## ═══════════════════════════════════════════════

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage production image (95MB, non-root, tini) |
| `.dockerignore` | Exclude dev files from build context |
| `docker-compose.yml` | Local development with MongoDB + Redis |
| `deploy/nginx.conf` | SSL, WebSocket, rate limiting, DDoS protection |
| `deploy/k8s/deployment.yaml` | K8s namespace, deployment, service, ingress, HPA, PDB |
| `.github/workflows/deploy.yml` | 4-stage CI/CD with auto-rollback |
| `scripts/load-test.js` | WebSocket load tester (simulates real Twilio streams) |
| `src/server.js` | Enhanced with liveness/readiness probes, connection draining, HSTS |

---

*Report generated: 2026-02-14 | Architecture version: 2.0.0*

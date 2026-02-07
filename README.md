# AI Outbound Calling Agent

**Production-grade backend for outbound AI calling** using Twilio, OpenAI (Whisper, GPT, TTS), MongoDB, and cost-optimized call handling.

**Features:**
- ✅ Real-time two-way voice conversations with Twilio Media Streams
- ✅ Speech-to-text via OpenAI Whisper
- ✅ LLM-powered responses (GPT-4o-mini) with strict script adherence
- ✅ Text-to-speech synthesis and S3 storage
- ✅ Circuit-breaker & cost-control (₹2–2.5/min target)
- ✅ Call recording, transcripts, and full audit trail
- ✅ REST API for campaigns, call logs, and metrics

---

## Quick Start

### Prerequisites
- Node.js >= 18
- MongoDB running (local or Atlas)
- Twilio account with Voice API enabled
- OpenAI API key
- AWS S3 bucket (or compatible storage)

### Setup
```bash
# 1. Clone and install
git clone <repo>
cd ai-outbound-agent
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials:
# - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_CALLER_ID
# - OPENAI_API_KEY
# - MONGODB_URI
# - S3_* credentials

# 3. Run development server
npm run dev
# Server listens on http://localhost:3000

# 4. Run tests
npm test
```

---

## API Reference

### Start a Call
**POST** `/api/v1/calls/start`
```json
{
  "campaignId": "507f1f77bcf86cd799439011",
  "phoneNumber": "+919876543210",
  "fromNumber": "+19856141493"
}
```
**Response:**
```json
{
  "ok": true,
  "callId": "...",
  "callSid": "CA123..."
}
```

### End a Call
**POST** `/api/v1/calls/:id/end`
```json
{ }
```
**Response:**
```json
{
  "ok": true,
  "callId": "...",
  "durationSec": 45
}
```

### Upload Phone Numbers (CSV)
**POST** `/api/v1/calls/upload-numbers`
- Content-Type: `text/csv`
- Body: CSV with columns `phone,name,email`

**Example:**
```
+919876543210,Rajesh Kumar,rajesh@example.com
+919876543211,Priya Sharma,priya@example.com
```

**Response:**
```json
{
  "ok": true,
  "results": {
    "accepted": 2,
    "rejected": 0,
    "errors": []
  }
}
```

### Fetch Calls
**GET** `/api/v1/calls?campaignId=...&status=in-progress&page=1&perPage=50`

**Response:**
```json
{
  "ok": true,
  "data": [ { "callId", "phoneNumber", "status", "durationSec", ... } ],
  "total": 150,
  "page": 1,
  "perPage": 50
}
```

### Get Call Transcript
**GET** `/api/v1/calls/:id/transcript`

**Response:**
```json
{
  "ok": true,
  "data": {
    "callId": "...",
    "entries": [
      { "startMs": 0, "endMs": 2000, "speaker": "agent", "text": "Hello...", "confidence": 0.98 },
      { "startMs": 2000, "endMs": 3500, "speaker": "customer", "text": "Hi there", "confidence": 0.95 }
    ],
    "fullText": "Hello... Hi there"
  }
}
```

### Get Recordings
**GET** `/api/v1/calls/:id/recordings`

**Response:**
```json
{
  "ok": true,
  "data": [
    { "callId": "...", "url": "https://s3.../recording.wav", "durationSec": 45, "sizeBytes": 180000 }
  ]
}
```

### Get System Metrics
**GET** `/api/v1/metrics`

**Response:**
```json
{
  "ok": true,
  "data": {
    "callsStarted": 150,
    "callsCompleted": 120,
    "callsFailed": 30,
    "sttRequests": 500,
    "sttErrors": 5,
    "llmRequests": 450,
    "llmErrors": 10,
    "ttsRequests": 400,
    "ttsErrors": 3,
    "avgCallDurationSec": "38.2",
    "successRate": "80.00"
  }
}
```

---

## Deployment

### Option 1: Docker (Recommended)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t ai-calling-agent .
docker run -d -p 3000:3000 \
  -e MONGODB_URI=mongodb://mongo:27017/ai_outbound \
  -e TWILIO_ACCOUNT_SID=... \
  -e OPENAI_API_KEY=... \
  ai-calling-agent
```

### Option 2: Railway / Render
1. Push code to GitHub
2. Connect repo to Railway/Render
3. Set environment variables
4. Deploy — automatic HTTPS + scaling

### Option 3: AWS ECS / Kubernetes
- Build Docker image
- Push to ECR
- Deploy ECS task or K8s pod
- Use ALB/ingress for load balancing
- Enable auto-scaling based on request count

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Client / Admin Dashboard                                │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
                         ▼
         ┌───────────────────────────────────┐
         │ Express + express-ws Server       │
         │ - /api/v1/* endpoints             │
         │ - /twilio/* Twilio webhooks       │
         │ - /stream WebSocket (Media)       │
         └────────┬────────┬────────┬────────┘
                  │        │        │
        ┌─────────▼─┐  ┌───▼────┐  │
        │ Twilio    │  │Database│  │
        │ Voice API │  │MongoDB │  │
        └──────────┬┘  └────────┘  │
                   │               │
              ┌────▼─────────┬─────▼────┐
              │ STT          │ LLM      │
              │ (Whisper)    │ (GPT)    │
              │ OpenAI       │ OpenAI   │
              └──────────────┴──────────┘
                        │
                   ┌────▼────┐
                   │ TTS      │
                   │ (OpenAI) │
                   └────┬─────┘
                        │
                   ┌────▼────┐
                   │ S3       │
                   │ Storage  │
                   └──────────┘
```

---

## Cost Optimization (Target: ₹2–2.5/min)

### Cost Breakdown (Approximate)
| Component | Cost | Notes |
|-----------|------|-------|
| Twilio PSTN | ₹0.5/min | Outbound calls (India ~₹0.5) |
| Whisper | ₹0.4/min | Speech-to-text transcription |
| GPT-4o-mini | ₹0.8/min | ~300 tokens @ ₹2.5/1M tokens |
| TTS | ₹0.2/min | ~1500 chars @ ₹0.00002/char |
| Storage/Bandwidth | ₹0.05/min | S3 upload & CDN retrieval |
| **Total** | **~₹2.0/min** | Margin: 5–10% buffer |

### Optimization Strategies
1. **Short LLM responses** — enforce max 30 words (reduces token usage)
2. **Silence detection** — avoid processing silent frames (→ ↓ STT calls)
3. **Response batching** — queue small STT requests (→ ↓ API overhead)
4. **Circuit breaker** — prevent cascading failures and retries (→ ↓ wastage)
5. **Per-call budget cap** — automatic hangup if cost exceeds threshold
6. **Caching** — cache common responses and TTS audio

### Cost Tracking
The system automatically tracks:
- Per-call token usage (LLM)
- STT & TTS request counts
- Call duration
- Estimated cost breakdown

Access via `/api/v1/metrics`:
```bash
curl http://localhost:3000/api/v1/metrics | jq
```

---

## Testing

### Unit Tests
```bash
npm test
```

### Load Testing (5 concurrent calls)
```bash
CONCURRENT_CALLS=5 CALL_DURATION_SEC=30 node scripts/load-test.js
```

### Load Testing (10 concurrent calls)
```bash
CONCURRENT_CALLS=10 CALL_DURATION_SEC=30 node scripts/load-test.js
```

### Manual QA Checklist
See [`QA_CHECKLIST.md`](QA_CHECKLIST.md) for comprehensive testing steps.

---

## Configuration

All settings via environment variables (see `.env.example`):

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| PORT | No | 3000 | Server port |
| HOST | No | 0.0.0.0 | Server host |
| MONGODB_URI | Yes | - | MongoDB connection string |
| TWILIO_ACCOUNT_SID | Yes | - | Twilio account |
| TWILIO_AUTH_TOKEN | Yes | - | Twilio auth token |
| TWILIO_CALLER_ID | Yes | - | Outbound caller ID (E.164) |
| OPENAI_API_KEY | Yes | - | OpenAI API key |
| S3_BUCKET | Yes | - | S3 bucket for audio storage |
| S3_REGION | Yes | - | S3 region (e.g., us-east-1) |
| S3_ACCESS_KEY | Yes | - | AWS access key |
| S3_SECRET_KEY | Yes | - | AWS secret key |
| CALL_MAX_MINUTES | No | 10 | Max call duration (minutes) |
| CAMPAIGN_MONTHLY_BUDGET | No | 10000 | Monthly spend cap (₹) |

---

## Database Schema

### Collections
- **users** — Admin users & API keys
- **campaigns** — Call campaigns with scripts
- **calls** — Individual call records
- **transcripts** — Full call transcripts with entries
- **recordings** — Recording metadata & URLs

See [`src/models/`](src/models) for full schemas.

---

## Production Checklist

- [ ] Environment variables set (especially secrets)
- [ ] MongoDB replicated (backup + restore tested)
- [ ] Twilio phone numbers provisioned & purchased
- [ ] S3 bucket created & IAM policies configured
- [ ] OpenAI API key has quota and cost alerts enabled
- [ ] Application running behind reverse proxy (nginx/ALB) with HTTPS
- [ ] Rate limiting enabled on API endpoints
- [ ] Logging aggregated (CloudWatch / ELK)
- [ ] Health check endpoint active (`GET /health`)
- [ ] Auto-scaling configured (CPU/memory thresholds)
- [ ] Disaster recovery plan documented
- [ ] Call recordings encrypted in transit & at rest

---

## Troubleshooting

### "Circuit breaker is OPEN"
- LLM or TTS failures detected
- Wait 60 seconds for reset
- Check OpenAI API status

### "Failed to connect to MongoDB"
- Verify MONGODB_URI is correct
- Ensure MongoDB is running
- Check network connectivity

### "Twilio call failed: unauthorized"
- Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN
- Check caller ID is verified with Twilio

### "S3 upload failed: AccessDenied"
- Verify S3 credentials in .env
- Check IAM policy allows `PutObject` on bucket
- Confirm bucket exists in specified region

---

## Support & Contributions

For issues, feature requests, or contributions, please open an issue or PR on GitHub.

---

**Last Updated:** February 2026  
**License:** MIT

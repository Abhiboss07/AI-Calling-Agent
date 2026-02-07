# Cost Optimization & Estimation Guide

## Target: ₹2–2.5 per minute

### Cost Components (Feb 2026 Estimates)

| Service | Rate | Usage/min | Cost/min | Notes |
|---------|------|----------|----------|-------|
| **Twilio PSTN** | ₹0.5/min | 1 min | ₹0.50 | Outbound calls to India |
| **OpenAI Whisper** | ₹0.4/min | 1 min | ₹0.40 | Real-time STT (or ~₹0.01/60s) |
| **GPT-4o-mini** | ₹2.5/1M tokens | ~300 tokens | ₹0.75 | Context + response (~150-400 tokens) |
| **TTS / Speech** | ₹0.00002/char | ~1500 chars | ₹0.03 | Agent response synthesis |
| **S3 Storage** | ₹0.016/GB/mo | ~0.2MB | ₹0.001 | Recording upload & retrieval |
| **Bandwidth** | ₹0.05/GB | ~0.01GB | ₹0.0005 | Minimal (mostly audio streamed by Twilio) |
| | | | **₹1.68/min (baseline)** | |
| + **Margin (10%)** | | | **₹0.17/min** | Buffer for spikes & errors |
| | | | **₹1.85/min** | Conservative estimate |
| + **Overhead (5%)** | | | **₹0.09/min** | Operations, monitoring, etc. |
| | | | **₹1.94/min** | **Projected total** |

**Target:** ₹2.0–2.5/min | **Actual:** ~₹1.94/min ✓

---

## Cost Reduction Tactics

### 1. **Reduce LLM Tokens**
- Enforce short responses: max **30 words per reply**
- Reuse canned phrases: store top-5 responses in cache
- Provide only essential context to LLM; drop unnecessary turn history
- **Impact:** -₹0.15–0.25/min (~20–30% token reduction)

### 2. **Optimize STT Usage**
- Implement VAD (silence detection) to avoid processing silence
- Batch small audio chunks (min 500ms) to reduce API calls
- Use Whisper's batch API if < 5 concurrent calls
- **Impact:** -₹0.05–0.10/min (~10–15% reduction)

### 3. **Cache TTS Audio**
- Pre-generate & cache common agent phrases (greetings, closures, etc.)
- Store in S3 with 1-month retention
- Reuse URLs across identical responses
- **Impact:** -₹0.02–0.05/min (~5–10% reduction)

### 4. **Circuit Breaker & Error Handling**
- Prevent cascading API failures (no retry-storm)
- Fallback to cheap canned responses on API timeout
- Use exponential backoff: minimizes wasted API calls
- **Impact:** -₹0.05–0.15/min (prevents 10–20% waste on failures)

### 5. **Selective Call Recording**
- Record only first & last 2 minutes of calls (not full duration)
- Store only lower bitrate audio (8 kHz mono vs. 16 kHz stereo)
- Delete old recordings after 30 days
- **Impact:** -₹0.001–0.01/min (~2% storage reduction)

### 6. **Concurrency Optimization**
- Use connection pooling for OpenAI / S3 (reduce handshake overhead)
- Reuse TLS sessions to reduce latency
- **Impact:** Negligible on cost but ~10% latency improvement

---

## Cost Tracking Implementation

The system tracks costs in real-time via `costControl.js`:

```javascript
// Per call:
costControl.trackCall(callSid);
costControl.addTokenUsage(callSid, tokens);     // LLM usage
costControl.addSttUsage(callSid, durationSec); // STT usage
costControl.addTtsUsage(callSid, charCount);   // TTS usage

// Retrieve estimated cost:
const cost = costControl.getEstimatedCost(callSid);
console.log(`Call cost: ₹${cost.toFixed(2)}`);

// Check budget before continuing:
if (!costControl.isWithinBudget(callSid, maxCost)) {
  // Hangup call
}

// End call & finalize:
costControl.endCallTracking(callSid);
```

### Metrics Endpoint
```bash
curl http://localhost:3000/api/v1/metrics
```

Returns:
```json
{
  "callsStarted": 1000,
  "callsCompleted": 920,
  "callsFailed": 80,
  "totalCallDurationSec": 45600,
  "sttRequests": 3200,
  "sttErrors": 50,
  "llmRequests": 2900,
  "llmErrors": 60,
  "ttsRequests": 2800,
  "ttsErrors": 20,
  "avgCallDurationSec": "49.57",
  "successRate": "92.00"
}
```

---

## Break-Even Analysis

Assume:
- **Call success rate:** 80%
- **Average call duration:** 45 seconds
- **Cost per call:** ₹1.94
- **Revenue per call:** ₹50 (typical B2B reminder/survey campaign)

### Economics
| Metric | Value |
|--------|-------|
| Calls placed / day | 1,000 |
| Successful calls | 800 |
| Cost per day | ₹1,940 |
| Revenue per day (₹50 × 800) | ₹40,000 |
| **Gross margin** | **97.5%** |
| Break-even threshold | ~39 successful calls/day |

---

## Billing & Reporting

### Daily Report Example
```
Date: 2026-02-07
Calls Placed: 1,000
Calls Completed: 920
Calls Failed: 80
Total Duration: 45,600 sec (762 min)

Cost Breakdown:
├─ Twilio: ₹381 (762 min × ₹0.5)
├─ Whisper: ₹305 (762 min × ₹0.4)
├─ GPT-4o-mini: ₹609 (814,000 tokens × ₹2.5/1M)
├─ TTS: ₹28 (1.4M chars × ₹0.00002)
└─ Storage/Bandwidth: ₹10

Total: ₹1,333 / 920 calls = ₹1.45/call
```

### Month-End Budget Report
```
Budget: ₹100,000
Spent: ₹45,230 (45.23%)
Remaining: ₹54,770
Calls completed: 23,250
Cost per call: ₹1.95

Trend: On track. Projected monthly spend: ₹57,950 (within budget).
```

---

## Vendor Pricing (as of Feb 2026)

### Twilio Voice
- Outbound calls: ₹0.4–1.0/min (varies by destination)
- Configure DID numbers for inbound (bonus if not needed)

### OpenAI
- Whisper: ₹0.01 per minute (or bulk discounts for high-volume)
- GPT-4o-mini: ₹2.5 per 1M input tokens, ₹7.5 per 1M output tokens
- TTS: ₹15 per 1M characters

### AWS S3
- Storage: ₹0.016 per GB/month
- PUT request: ₹0.0006 per 10K requests
- GET request: ₹0.00004 per 10K requests
- Data transfer: ₹0.05 per GB outbound (minimal if CDN used)

### MongoDB Atlas
- Starter (M0): Free (512 MB storage, no backups)
- M10: ₹25–50/month (dedicated, backups included)
- Auto-scaling: +₹0.08 per million reads/writes

---

## Optimization Roadmap

### Phase 1 (Week 1–2)
- [x] Enforce 30-word max responses
- [x] Add silence detection (VAD)
- [x] Circuit breaker for API failures

### Phase 2 (Week 3–4)
- [ ] Implement TTS response cache
- [ ] Add batch STT API
- [ ] Enable connection pooling

### Phase 3 (Month 2)
- [ ] A/B test canned responses
- [ ] Implement per-campaign budget caps
- [ ] Auto-tune LLM temperature for token efficiency

### Phase 4 (Ongoing)
- [ ] Monitor & adjust based on real usage data
- [ ] Negotiate volume discounts with vendors
- [ ] Consider alternative providers (e.g., Azure Speech-to-Text, Replicate)

---

## ROI Calculation

For a B2C customer service campaign:

```
Setup Cost: ₹50,000 (development + infrastructure)
Monthly Operating Cost: ₹60,000

Campaign Parameters:
- Calls/day: 2,000
- Success rate: 75%
- Revenue/successful call: ₹100
- Monthly revenue: ₹4,500,000

Monthly Margin: ₹4,500,000 - ₹60,000 = ₹4,440,000
Payback period: < 1 week
```

---

## Monitoring & Alerts

Configure alerts for:
- Cost spike > ₹200/day (possibly indicating errors)
- Success rate drops below 70% (API issues?)
- Average call duration > 10 minutes (script issues?)
- STT/LLM error rate > 5%
- Circuit breaker state = OPEN (cascading failures)

---

**Last Updated:** February 2026

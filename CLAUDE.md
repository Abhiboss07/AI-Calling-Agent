# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start

# Run all tests
npm test

# Run a single test file
npx jest path/to/test.spec.js --runInBand --forceExit

# Run tests matching a name pattern
npx jest --testNamePattern="VAD" --runInBand --forceExit

# Ingest campaign leads from CSV
npm run ingest-campaign
```

## Architecture Overview

### Call Flow

```
POST /api/v1/calls/start
  → vobizClient.makeOutboundCall()       # Vobiz REST API dials the number
  → Vobiz calls POST /vobiz/answer        # Answer webhook (must be publicly accessible)
  → Returns XML with <Stream> WS URL      # Tells Vobiz to open WebSocket
  → Vobiz opens WS /stream?callUuid=...   # Bidirectional audio begins
  → ws-media-optimized.js handles session
```

### Real-Time Audio Pipeline (per call, inside `ws-media-optimized.js`)

```
Vobiz → WebSocket (μ-law 8kHz)
  → mulawToPcm16()             # Decode to PCM16
  → VAD (RMS + chunk counting) # Detect speech start/end
  → Buffer accumulation
  → STT: Whisper via OpenAI    # PCM wrapped in WAV header
  → LLM: generateReply()       # Returns JSON { speak, action, nextStep }
  → TTS: synthesizeRaw()       # OpenAI TTS → PCM 24kHz → downsample 8kHz → μ-law
  → WebSocket (μ-law 8kHz)     # Played back to caller via Vobiz
```

### LLM Response Format

Every LLM reply is JSON:
```json
{ "speak": "...", "action": "continue|collect|hangup|escalate|book_visit", "nextStep": "...", "data": {}, "qualityScore": 0, "reasoning": "..." }
```

The LLM has two paths:
1. **Deterministic fast-path** (`deterministicTurnReply` in `llm.js`) — regex rules handle availability_check, reschedule, and purpose steps without calling GPT.
2. **GPT-4o-mini** — handles everything else with temperature 0.25, max_tokens 100, JSON mode.

### Conversation State Machine (`src/services/conversationFSM.js`)

States: `INIT → INTRODUCING → WAITING_CONFIRMATION → QUALIFYING_LEAD → HANDLING_OBJECTION → BOOKING_SITE_VISIT → CLOSING → END_CALL`

Plus transient states: `LISTENING`, `PROCESSING`, `SPEAKING`.

The FSM drives the conversation script (outbound real estate flow). The FSM's `_mapStateToStep()` maps FSM states to LLM `nextStep` strings like `availability_check`, `purpose`, `book_visit`.

### Key Services

| Service | File | Purpose |
|---|---|---|
| WebSocket handler | `src/ws-media-optimized.js` | Core real-time audio loop |
| STT | `src/services/stt.js` | Whisper transcription with hallucination/noise filtering |
| TTS | `src/services/tts.js` | OpenAI TTS + LRU cache + 24kHz→8kHz downsampling |
| LLM | `src/services/llm.js` | GPT-4o-mini with deterministic fast-path |
| FSM | `src/services/conversationFSM.js` | Conversation state machine + intent classification |
| Vobiz client | `src/services/vobizClient.js` | REST API for outbound call initiation and termination |
| Cost control | `src/services/costControl.js` | Per-call cost tracking (STT/TTS/LLM/telephony) |

### Audio Codec Details

- **Inbound from Vobiz**: μ-law encoded, 8kHz
- **OpenAI TTS output**: PCM 16-bit mono, 24kHz
- **Resampling**: `downsample24kTo8kFast()` uses a 5-tap triangular FIR filter `[1,2,3,2,1]/9` (3:1 decimation). `sinc` mode (via `wavefile` library) is available via `TTS_RESAMPLE_MODE=sinc` but slower.
- **STT input**: PCM wrapped in WAV header (8kHz mono 16-bit = 16,000 bytes/sec)

### Routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /vobiz/answer` | None (webhook) | Answer webhook → returns XML |
| `POST /vobiz/hangup` | None (webhook) | Hangup webhook → updates DB |
| `WS /stream` | None | Bidirectional audio stream |
| `POST /api/v1/auth/*` | None | Login/register |
| `POST /api/v1/calls/test-start` | None | Test call (no Vobiz) |
| `POST /api/v1/calls/start` | JWT | Initiate outbound call |
| `GET /api/v1/*` | JWT | CRUD for calls, leads, docs, etc. |
| `GET /health` | None | Liveness probe |
| `GET /health/ready` | None | Readiness probe |

### System Prompt

Loaded from `config/ai_calling_agent_system_prompt.txt` (configurable via `SYSTEM_PROMPT_FILE` env var). Supports `{{company_name}}` and `{{agent_name}}` template variables. If the file is missing, an inline fallback is used.

### Important Environment Variables

- `BASE_URL` — **Critical**: must be the public URL Vobiz can reach (use ngrok in dev). Controls the WebSocket and webhook URLs embedded in answer XML.
- `VOBIZ_ENFORCE_SIGNATURE=true` — enables webhook HMAC verification in production.
- `METRICS_API_KEY` — if set, required on `GET /api/v1/metrics` as `X-Api-Key` header.
- Pipeline tuning (VAD, barge-in, silence detection) is centralized in `src/config/index.js` with clamped env overrides.

### Active Files

- `src/ws-media-optimized.js` — **active** (used by server.js)
- `src/services/costControl.js` — **active** (used by routes and ws-media-optimized.js)

### Barge-In

While the agent is speaking (playing TTS audio over WebSocket), VAD continues running on inbound audio. If the caller speaks loudly enough (`bargeInRmsMultiplier` × ambient RMS) for `bargeInRequiredChunks` consecutive chunks after `bargeInMinPlaybackMs` of playback, audio transmission is aborted and the pipeline resets to LISTENING.

### Outbound Call Speculative Early Response

At WebSocket connect time for outbound calls, the intro phrase is pre-synthesized from TTS cache (primed at startup via `prewarmPhrases`). If the phrase is cached, it plays with zero LLM latency.

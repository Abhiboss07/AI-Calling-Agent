# AI Calling Agent — Production Audit Plan
## Generated: 2026-02-14

### Critical Issues Found (35 Total)

#### 🔴 SECURITY (P0)
1. `.env` contains LIVE secrets (Twilio SID/Auth, OpenAI key, S3 keys) — committed to git
2. No Twilio webhook signature verification — anyone can call webhook endpoints
3. No rate limiting on any API endpoint
4. No input sanitization/validation
5. No CORS configuration
6. No helmet/security headers

#### 🔴 RUNTIME CRASHES (P0)
7. `ws-media.js` — no call state management; every WS message triggers full STT→LLM→TTS pipeline with no debouncing
8. `ws-media.js` — buffer never checked for empty/silence before sending to STT (wastes money, causes errors)
9. `ws-media.js` — hardcoded script object `{defaultReply, fallback}` — real estate logic missing
10. `llm.js` — `logger.warn` called but `warn` not defined on logger — runtime crash on prompt file load failure
11. `db.js` — deprecated `useNewUrlParser`/`useUnifiedTopology` options — warnings in Mongoose 7+
12. `db.js` — no reconnection logic, no error event handling
13. `tts.js` — fallback URL `example.com` is not a real audio file — Twilio will error
14. `twilio.js` (voice route) — no Pause/silence-fill before stream connects — caller hears nothing
15. `server.js` — global error handler AFTER `setupWs()` — WebSocket errors bypass it

#### 🟠 LOGIC ERRORS (P1)
16. `call.model.js` — `campaignId` typed as ObjectId but CSV upload sends string — type mismatch crash
17. `ws-media.js` — creates new Transcript document PER utterance instead of appending to one
18. `twilioClient.js` — `playAudio()` sends raw TwiML but `<Play>` requires URL-escaped content
19. `twilio.js` — `req.protocol.replace('http','ws')` also replaces 'http' in 'https' → 'wsss' 
20. No conversation state tracking between turns — LLM has no memory of previous exchanges
21. `costControl.js` — Map grows unbounded if `endCallTracking` is never called (memory leak)

#### 🟠 PERFORMANCE (P1)
22. STT called on every 6 audio chunks regardless of voice activity — burns API credits on silence
23. No streaming for LLM responses — full round-trip latency on every turn  
24. No connection pooling for OpenAI API calls
25. CSV upload processes rows sequentially — slow for large files
26. `metrics.js` — in-memory only, lost on restart

#### 🟡 ARCHITECTURE (P2)
27. No Lead model for real estate data capture
28. No conversation history model for multi-turn context
29. System prompt is generic — not optimized for real estate
30. No graceful shutdown handling
31. No health check for database connectivity
32. Unhandled promise rejection handler missing
33. No request ID tracking for debugging
34. `body-parser` is deprecated — Express 4.16+ has built-in parsing
35. No environment variable validation at startup

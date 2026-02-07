# Manual Testing Checklist for AI Outbound Calling Agent

## Pre-requisites
- [ ] MongoDB is running and accessible at MONGODB_URI
- [ ] Twilio credentials are filled in .env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_CALLER_ID)
- [ ] OpenAI API key is set (OPENAI_API_KEY)
- [ ] S3 credentials configured (S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY)
- [ ] Server started with `npm run dev`
- [ ] Test phone number available to receive calls

## Unit Tests
- [ ] Run `npm test` — all tests pass
- [ ] LLM voice agent generates short, human-like replies
- [ ] STT transcription handles error cases gracefully
- [ ] Cost control tracks usage correctly
- [ ] Metrics service increments counters

## API Integration Tests

### 1. Start Call
```bash
curl -X POST http://localhost:3000/api/v1/calls/start \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"507f1f77bcf86cd799439011","phoneNumber":"+19876543210","fromNumber":"+19856141493"}'
```
- [ ] Returns 200 with callId and callSid
- [ ] Call record created in MongoDB with status 'ringing'
- [ ] Twilio call placed successfully

### 2. Fetch Calls
```bash
curl http://localhost:3000/api/v1/calls?campaignId=507f1f77bcf86cd799439011&page=1&perPage=10
```
- [ ] Returns list of calls with correct structure
- [ ] Pagination works (page, perPage, total)
- [ ] Filtering by status works

### 3. Get Call Details
```bash
curl http://localhost:3000/api/v1/calls/{id}
```
- [ ] Returns individual call with all fields
- [ ] Status matches expected state

### 4. Upload CSV
```bash
curl -X POST http://localhost:3000/api/v1/calls/upload-numbers \
  -H "Content-Type: text/csv" \
  -d 'campaignId=507f1f77bcf86cd799439011' \
  --data-binary @numbers.csv
```
- [ ] Accepts well-formed CSV
- [ ] Rejects malformed rows
- [ ] Returns accepted/rejected counts

### 5. Get Transcript
```bash
curl http://localhost:3000/api/v1/calls/{id}/transcript
```
- [ ] Returns full conversation transcript
- [ ] Includes speaker (agent/customer) and timestamps
- [ ] fullText contains concatenated utterances

### 6. Get Recordings
```bash
curl http://localhost:3000/api/v1/calls/{id}/recordings
```
- [ ] Returns array of recording URLs
- [ ] URLs are publicly accessible or presigned

### 7. Get Metrics
```bash
curl http://localhost:3000/api/v1/metrics
```
- [ ] Returns callsStarted, callsCompleted, callsFailed, etc.
- [ ] All counters are integers >= 0

## Live Call Test

### Scenario 1: Basic Greeting
- [ ] Place outbound call to test number
- [ ] Agent greeting plays within 5 seconds
- [ ] Caller hears: "Hello, this is [campaign name]. How can I help?"
- [ ] Call is recorded

### Scenario 2: Natural Conversation
- [ ] Caller responds to agent greeting
- [ ] Agent parses speech accurately via Whisper
- [ ] Agent provides contextual, short reply (< 30 words)
- [ ] No robotic tone detected

### Scenario 3: Handling Silence
- [ ] Caller does not speak for 5 seconds
- [ ] Agent gently prompts once: "Are you there?"
- [ ] If silence continues, agent ends call politely

### Scenario 4: Interruption During Agent Speech
- [ ] Agent starts speaking
- [ ] Caller interrupts mid-sentence
- [ ] Agent stops speaking and recognizes caller input
- [ ] Agent processes new input and responds

### Scenario 5: User Requests to Stop
- [ ] Caller says "stop call" or "I'm busy"
- [ ] Agent acknowledges: "No problem, I'll call back later"
- [ ] Call ends immediately

### Scenario 6: Wrong Number
- [ ] Caller indicates wrong number
- [ ] Agent apologizes: "I apologize for the confusion. Goodbye."
- [ ] Call ends

## Performance & Load Tests

### Single Call Performance
- [ ] Call setup latency: < 2 seconds
- [ ] Agent response latency (speech → reply): < 4 seconds
- [ ] TTS audio generation: < 3 seconds
- [ ] Total call setup: < 10 seconds

### Concurrent Load Test (5 calls)
```bash
CONCURRENT_CALLS=5 CALL_DURATION_SEC=30 node scripts/load-test.js
```
- [ ] All 5 calls start successfully
- [ ] No timeout errors from API
- [ ] All calls complete within time window
- [ ] Success rate >= 80%

### Concurrent Load Test (10 calls)
```bash
CONCURRENT_CALLS=10 CALL_DURATION_SEC=30 node scripts/load-test.js
```
- [ ] Scaling to 10 concurrent calls works
- [ ] Success rate >= 70%
- [ ] Server remains responsive
- [ ] Memory usage < 500MB

### Cost Tracking
- [ ] Run 10 calls with max cost tracking enabled
- [ ] Verify costControl tracks token, STT, TTS usage
- [ ] Estimated cost per call is ~₹2-2.5
- [ ] Cost accumulation is correct (total = sum of calls)

## Error Handling & Resilience

### 1. Twilio API Failure
- [ ] Disable Twilio temporarily
- [ ] Attempt to start call
- [ ] Agent falls back gracefully (no crash)
- [ ] Error logged with retry counts

### 2. OpenAI API Timeout
- [ ] Start call and simulate timeout (set timeout to 0)
- [ ] Agent uses fallback script
- [ ] Circuit breaker prevents cascading failures
- [ ] Next call retries after reset period

### 3. MongoDB Connection Loss
- [ ] Disconnect MongoDB
- [ ] API request fails gracefully with 500 error
- [ ] Server attempts to reconnect
- [ ] Error message is descriptive

### 4. S3 Upload Failure
- [ ] Disable S3 credentials
- [ ] TTS URL generation should still work (returns fallback URL)
- [ ] Call continues without crashing

## Database Validation

### Call Records
```bash
db.calls.findOne({})
```
- [ ] Document has: campaignId, phoneNumber, callSid, status, startAt, endAt, durationSec
- [ ] status values are correct enum: queued, ringing, in-progress, completed, failed, busy, no-answer

### Transcripts
```bash
db.transcripts.findOne({})
```
- [ ] Document has: callId, entries, fullText
- [ ] entries array contains: { startMs, endMs, speaker, text, confidence }
- [ ] fullText is concatenation of all entries

### Recordings
```bash
db.recordings.findOne({})
```
- [ ] Document has: callId, url, durationSec, sizeBytes
- [ ] URL is publicly accessible

## Cleanup
- [ ] All test data removed from MongoDB
- [ ] S3 test audio files deleted
- [ ] Logs reviewed for any errors or warnings

---

## Summary
- **Total test cases:** 40+
- **Estimated time:** 2-3 hours
- **Pass/Fail threshold:** All critical tests must pass

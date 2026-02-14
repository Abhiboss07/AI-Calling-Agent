# AI Calling Agent

**Production-grade AI Voice Agent** for outbound calling, lead qualification, and real-time conversation. Built with Node.js, Express, Twilio, OpenAI (Whisper + GPT-4o-mini + TTS), and Next.js.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)

---

## 🚀 Features

- **Bidirectional Low-Latency Audio:** Uses Twilio Media Streams with direct µ-law streaming (no REST API overhead).
- **Real Estate Persona:** Pre-configured "Priya" persona for lead qualification, objection handling, and appointment booking.
- **Smart Pipeline:**
  - **Speech-to-Text:** OpenAI Whisper (optimized for short utterances).
  - **Intelligence:** GPT-4o-mini with structured JSON outputs and conversation state management.
  - **Text-to-Speech:** OpenAI TTS (Alloy) with 24kHz → 8kHz resampling and caching.
- **Resilience:** Circuit breakers, retry logic, and fallback mechanisms for all external APIs.
- **Observability:** Structured JSON logging, per-call metrics (latency, cost, tokens), and transcript generation.
- **Full Dashboard:** Next.js frontend for campaign management, call logs, analytics, and lead tracking.

---

## 🏗 Architecture

The system consists of two main parts:

### 1. Backend (`/src`)
- **Express Server:** Handles API endpoints and Twilio webhooks.
- **WebSocket Server:** Manages real-time audio streams (`/stream`).
- **Services:** Modular services for STT, LLM, TTS, Storage (S3/R2), and Database (MongoDB).
- **Worker:** Processes background tasks (optional, strictly speaking this is monolithic async).

### 2. Frontend (`/frontend`)
- **Next.js 14 (App Router):** Modern React framework.
- **Tailwind CSS:** Styling.
- **Dashboard:** View live calls, upload CSV leads, check analytics.

---

## 🛠 Prerequisites

- **Node.js** v20+
- **MongoDB** v6+ (Local or Atlas)
- **Twilio Account** (Account SID, Auth Token, Phone Number)
- **OpenAI API Key**
- **AWS S3** or **Cloudflare R2** bucket (for recordings/logs)

---

## ⚡ Quick Start

### 1. Backend Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Abhiboss07/AI-Calling-Agent.git
    cd AI-Calling-Agent
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Create a `.env` file in the root directory:
    ```env
    # Server
    PORT=3000
    NODE_ENV=development
    LOG_LEVEL=info

    # Database
    MONGODB_URI=mongodb://localhost:27017/ai_outbound

    # Twilio
    TWILIO_ACCOUNT_SID=AC...
    TWILIO_AUTH_TOKEN=...
    TWILIO_CALLER_ID=+1234567890

    # OpenAI
    OPENAI_API_KEY=sk-...

    # Storage (S3 or Cloudflare R2)
    S3_BUCKET=my-bucket
    S3_REGION=auto
    S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
    S3_ACCESS_KEY=...
    S3_SECRET_KEY=...
    S3_PUBLIC_URL=https://pub-domain.com  # Required for public access

    # Config
    COMPANY_NAME="Premier Realty"
    AGENT_NAME="Priya"
    ```

4.  **Run the Server:**
    ```bash
    npm run dev
    ```
    *Server runs on `http://localhost:3000` (WebSocket at `ws://localhost:3000/stream`)*

### 2. Frontend Setup

1.  **Navigate to frontend:**
    ```bash
    cd frontend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the Dashboard:**
    ```bash
    npm run dev
    ```
    *Dashboard runs on `http://localhost:3001` (proxies requests to backend)*

---

## 📡 API Reference

### Calls
- `POST /api/v1/calls/start` - Initiate a single call.
- `POST /api/v1/calls/upload-numbers` - Upload CSV of leads.
- `GET /api/v1/calls` - List calls (pagination, filters).
- `GET /api/v1/calls/:id` - Get call details.

### Leads
- `GET /api/v1/leads` - Get structured lead data (qualified/unqualified).
- `PUT /api/v1/leads/:id` - Update lead status manually.

### Metrics
- `GET /api/v1/metrics` - System health, costs, latency stats.

---

## 🧪 Testing

The backend includes a comprehensive test suite (Unit + Integration coverage).

```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/unit.test.js
```

**Load Testing:**
To simulate concurrent load (requires running backend):
```bash
# Simulate 10 concurrent calls
npm run load-test:100
```

---

## 🚢 Deployment

### Docker (Recommended)

1.  **Build the image:**
    ```bash
    npm run docker:build
    ```

2.  **Run the container:**
    ```bash
    npm run docker:run
    ```

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use `S3_PUBLIC_URL` for faster asset delivery.
- [ ] Ensure MongoDB has persistent storage.
- [ ] Configure Twilio Webhook to point to your domain (e.g., `https://api.myapp.com/twilio/voice`).
- [ ] Enable `trust proxy` in Express if behind Nginx/Load Balancer.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

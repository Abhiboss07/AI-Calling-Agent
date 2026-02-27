const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const config = require('../config');
const logger = require('../utils/logger');
const Call = require('../models/call.model');
const metrics = require('../services/metrics');

// WebSocket monitoring server for real-time frontend updates
class MonitoringServer {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.port = config.monitoring?.port || 3002;
    this.started = false;
  }

  handleConnection(ws) {
    logger.log('Monitoring client connected');
    this.clients.add(ws);

    const callMetrics = metrics.getMetrics();
    this.sendToClient(ws, {
      type: 'state',
      payload: {
        totalCalls: callMetrics.callsStarted || 0,
        activeCalls: callMetrics.activeCalls || 0
      }
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(ws, message);
      } catch (error) {
        logger.error('Monitoring message error:', error.message);
      }
    });

    ws.on('close', () => {
      logger.log('Monitoring client disconnected');
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      logger.error('Monitoring WebSocket error:', error.message);
      this.clients.delete(ws);
    });
  }

  start(app) {
    if (this.started) return;

    // Preferred mode: reuse main express-ws server and expose /monitor publicly.
    if (app && typeof app.ws === 'function') {
      app.ws('/monitor', (ws) => this.handleConnection(ws));
      logger.log('Monitoring WebSocket attached at /monitor');
    } else {
      // Fallback mode for local standalone usage
      const server = http.createServer();
      this.wss = new WebSocket.Server({ server });
      this.wss.on('connection', (ws) => this.handleConnection(ws));
      server.listen(this.port, () => {
        logger.log(`Monitoring server listening on port ${this.port}`);
      });
    }

    this.setupEventListeners();
    this.started = true;
  }

  async handleMessage(ws, message) {
    switch (message.type) {
      case 'get_state':
        const callMetrics = metrics.getMetrics();
        this.sendToClient(ws, {
          type: 'state',
          payload: {
            totalCalls: callMetrics.callsStarted,
            activeCalls: callMetrics.activeCalls
          }
        });
        break;
      case 'ping':
        this.sendToClient(ws, { type: 'pong', payload: { ts: Date.now() } });
        break;

      case 'subscribe_call':
        // Subscribe to specific call updates
        ws.subscribedCall = message.callUuid;
        break;

      default:
        logger.log('Unknown monitoring message:', message.type);
    }
  }

  setupEventListeners() {
    // Listen for call events from the main application
    
    // Call started event
    process.on('call_started', (data) => {
      this.broadcast({
        type: 'call_started',
        payload: {
          callUuid: data.callUuid,
          phoneNumber: data.phoneNumber,
          direction: data.direction,
          startTime: data.startTime
        }
      });
    });

    // Call ended event
    process.on('call_ended', (data) => {
      this.broadcast({
        type: 'call_ended',
        payload: {
          callUuid: data.callUuid,
          endTime: data.endTime,
          duration: data.duration
        }
      });
    });

    // Transcript update event
    process.on('transcript_update', (data) => {
      this.broadcast({
        type: 'transcript',
        payload: {
          callUuid: data.callUuid,
          speaker: data.speaker,
          text: data.text,
          confidence: data.confidence,
          timestamp: data.timestamp
        }
      });
    });

    // Agent speaking event
    process.on('agent_speaking', (data) => {
      this.broadcast({
        type: 'agent_speaking',
        payload: {
          callUuid: data.callUuid
        }
      });
    });

    // Customer speaking event
    process.on('customer_speaking', (data) => {
      this.broadcast({
        type: 'customer_speaking',
        payload: {
          callUuid: data.callUuid
        }
      });
    });

    // Metrics update event
    process.on('metrics_update', (data) => {
      this.broadcast({
        type: 'metrics',
        payload: data
      });
    });
  }

  sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcast(message, excludeClient = null) {
    const messageStr = JSON.stringify(message);
    
    this.clients.forEach(client => {
      if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  // Methods to be called from other parts of the application
  notifyCallStarted(callData) {
    process.emit('call_started', callData);
  }

  notifyCallEnded(callData) {
    process.emit('call_ended', callData);
  }

  notifyTranscriptUpdate(transcriptData) {
    process.emit('transcript_update', transcriptData);
  }

  notifyAgentSpeaking(callData) {
    process.emit('agent_speaking', callData);
  }

  notifyCustomerSpeaking(callData) {
    process.emit('customer_speaking', callData);
  }

  notifyMetricsUpdate(metricsData) {
    process.emit('metrics_update', metricsData);
  }
}

// Create singleton instance
const monitoringServer = new MonitoringServer();

// Express routes for monitoring API
const router = express.Router();

// Get current metrics
router.get('/metrics', async (req, res) => {
  try {
    const callMetrics = metrics.getMetrics();
    const activeCalls = await Call.find({ status: 'in-progress' });
    
    res.json({
      ok: true,
      metrics: {
        ...callMetrics,
        totalCalls: callMetrics.callsStarted || 0,
        activeCalls: activeCalls.length,
        recentCalls: activeCalls.map(call => ({
          id: call.callSid,
          phoneNumber: call.phoneNumber,
          status: call.status,
          startTime: call.startAt,
          agent: 'Shubhi',
          direction: call.direction
        }))
      }
    });
  } catch (error) {
    logger.error('Metrics API error:', error.message);
    res.status(500).json({ ok: false, error: 'Failed to get metrics' });
  }
});

// Get call transcript
router.get('/transcript/:callUuid', async (req, res) => {
  try {
    const { callUuid } = req.params;
    const Transcript = require('../models/transcript.model');
    
    const transcripts = await Transcript.find({ callUuid }).sort({ timestamp: 1 });
    
    res.json({
      ok: true,
      transcripts: transcripts.map(t => ({
        speaker: t.speaker,
        text: t.text,
        confidence: t.confidence,
        timestamp: t.timestamp
      }))
    });
  } catch (error) {
    logger.error('Transcript API error:', error.message);
    res.status(500).json({ ok: false, error: 'Failed to get transcript' });
  }
});

// Start monitoring server
function startMonitoring(app) {
  monitoringServer.start(app);
}

// Export monitoring server instance and router
module.exports = {
  startMonitoring,
  monitoringServer,
  router
};

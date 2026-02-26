'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2
} from 'lucide-react';
import { useCallData, useWebSocket } from '../contexts/WebSocketContext';

export default function CallMonitor() {
  const { connected, calls, activeCall, metrics, error } = useWebSocket();
  const [expandedCall, setExpandedCall] = useState(null);
  const recentCalls = useMemo(() => [...calls].reverse(), [calls]);

  if (error) {
    return (
      <div className="card monitor-shell">
        <div className="monitor-error">
          <AlertIcon />
          <div>
            <p className="monitor-error-title">WebSocket Error</p>
            <p className="monitor-error-text">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="monitor-stack">
      <div className="card monitor-shell fade-in-up">
        <div className="panel-head">
          <h3>Connection Stream</h3>
          <span className={`badge ${connected ? 'ok' : 'warn'}`}>
            <span className={`monitor-dot ${connected ? 'online' : 'offline'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="monitor-metrics">
          <div>
            <label>Active</label>
            <p>{metrics.activeCalls || 0}</p>
          </div>
          <div>
            <label>Total</label>
            <p>{metrics.totalCalls || 0}</p>
          </div>
          <div>
            <label>Status</label>
            <p>{connected ? 'Realtime sync healthy' : 'Waiting for reconnect'}</p>
          </div>
        </div>
      </div>

      {activeCall && (
        <div className="card monitor-shell fade-in-up delay-1">
          <div className="panel-head">
            <h3>Live Call</h3>
            <span className="badge badge-live"><Activity size={14} /> In Progress</span>
          </div>
          <div className="monitor-call-meta">
            <div>
              <label>Number</label>
              <p>{activeCall.phoneNumber || 'Unknown'}</p>
            </div>
            <div>
              <label>Direction</label>
              <p>{activeCall.direction || 'inbound'}</p>
            </div>
            <div>
              <label>Signals</label>
              <p>
                {activeCall.agentSpeaking && <span className="signal-chip agent"><Volume2 size={13} /> Agent</span>}
                {activeCall.customerSpeaking && <span className="signal-chip customer"><Mic size={13} /> Customer</span>}
                {!activeCall.agentSpeaking && !activeCall.customerSpeaking && <span className="text-muted">Silent</span>}
              </p>
            </div>
          </div>
          <CallTranscript callUuid={activeCall.id} />
        </div>
      )}

      <div className="card monitor-shell fade-in-up delay-2">
        <div className="panel-head">
          <h3>Recent Calls</h3>
          <span className="badge">{recentCalls.length} items</span>
        </div>

        {recentCalls.length === 0 ? (
          <div className="empty-state compact">
            <div className="empty-state-icon"><Phone size={24} /></div>
            <p>No calls yet. Activity appears here in real time.</p>
          </div>
        ) : (
          <div className="monitor-list">
            {recentCalls.map((call) => (
              <CallRow
                key={call.id}
                call={call}
                expanded={expandedCall === call.id}
                onToggle={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CallRow({ call, expanded, onToggle }) {
  const { transcript } = useCallData(call.id);
  const icon = call.status === 'completed' ? <PhoneOff size={14} /> : <Phone size={14} />;

  return (
    <div className="monitor-row">
      <button className="monitor-row-head" onClick={onToggle}>
        <div className="monitor-row-left">
          <span className={`monitor-icon status-${call.status || 'queued'}`}>{icon}</span>
          <div>
            <p className="monitor-row-title">{call.phoneNumber || 'Unknown number'}</p>
            <p className="monitor-row-sub">{call.direction || 'inbound'} • {call.agent || 'Agent'}</p>
          </div>
        </div>
        <div className="monitor-row-right">
          <span className={`status-badge status-${call.status || 'queued'}`}>{call.status || 'queued'}</span>
        </div>
      </button>

      {expanded && (
        <div className="monitor-row-body">
          {transcript.length === 0 ? (
            <p className="text-muted">No transcript available for this call.</p>
          ) : (
            <div className="monitor-mini-transcript">
              {transcript.slice(-6).map((entry, idx) => (
                <div key={`${entry.timestamp}-${idx}`} className="transcript-line">
                  <span className={`speaker ${entry.speaker === 'agent' ? 'agent' : 'customer'}`}>
                    {entry.speaker === 'agent' ? 'Agent' : 'Customer'}
                  </span>
                  <p>{entry.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CallTranscript({ callUuid }) {
  const { transcript } = useCallData(callUuid);

  if (transcript.length === 0) {
    return (
      <div className="monitor-empty-transcript">
        <MicOff size={16} />
        <span>Waiting for transcript segments...</span>
      </div>
    );
  }

  return (
    <div className="monitor-mini-transcript">
      {transcript.slice(-8).map((entry, idx) => (
        <div key={`${entry.timestamp}-${idx}`} className="transcript-line">
          <span className={`speaker ${entry.speaker === 'agent' ? 'agent' : 'customer'}`}>
            {entry.speaker === 'agent' ? 'Agent' : 'Customer'}
          </span>
          <p>{entry.text}</p>
        </div>
      ))}
    </div>
  );
}

function AlertIcon() {
  return (
    <span className="monitor-alert-icon">
      <Activity size={14} />
    </span>
  );
}

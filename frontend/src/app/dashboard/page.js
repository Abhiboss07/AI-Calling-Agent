'use client';

import { useEffect, useState } from 'react';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { API_BASE, getAuthHeaders } from '../../lib/api';

export default function LiveMonitorPage() {
  const { connected, calls, activeCall, metrics, transcripts } = useWebSocket();
  const [apiCalls, setApiCalls] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/v1/calls?perPage=10`, { headers: getAuthHeaders() });
        if (res.ok) { const d = await res.json(); if (d.ok && d.data) setApiCalls(d.data); }
      } catch { }
    }
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const activeCalls = metrics?.activeCalls || 0;
  const allCalls = [...(calls || []).reverse().slice(0, 5), ...apiCalls.slice(0, 5)];
  const activeTranscripts = activeCall ? (transcripts[activeCall.id] || []).slice(-8) : [];

  function formatDur(startTime) {
    if (!startTime) return '00:00';
    const s = Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      {/* Header */}
      <div className="fade-in-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="pulse-dot" />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ef4444' }}>
              Live System Status: {connected ? 'Optimal' : 'Disconnected'}
            </span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Active Agent Operations</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 8, margin: '8px 0 0' }}>Monitoring real-time conversations.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="glass-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span> Daily Report
          </button>
          <button className="glass-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--accent-light)', border: '1px solid rgba(19,91,236,0.2)', borderRadius: 8, color: 'var(--accent)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_list</span> Region: All
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Active Calls', value: activeCalls, icon: 'call', trend: '+12%', color: 'var(--accent)' },
          { label: 'Sentiment Score', value: '88%', icon: 'mood', trend: '+4%', color: '#eab308' },
          { label: 'Avg. Call Duration', value: '4:12', icon: 'timer', trend: '-2%', color: 'var(--text-muted)' },
          { label: 'Success Rate', value: '92.4%', icon: 'check_circle', trend: '+0.5%', color: 'var(--success)' },
        ].map((kpi, i) => (
          <div key={i} className="fade-in-up glass-card" style={{ padding: 20, borderRadius: 12, animationDelay: `${i * 0.08}s` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>{kpi.label}</p>
              <span className="material-symbols-outlined" style={{ color: kpi.color, fontSize: 22 }}>{kpi.icon}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <h3 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{kpi.value}</h3>
              <span style={{ color: kpi.trend.startsWith('+') ? 'var(--success)' : 'var(--danger)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{kpi.trend.startsWith('+') ? 'arrow_upward' : 'arrow_downward'}</span>{kpi.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Left: Live Transcription Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <span className="material-symbols-outlined">analytics</span> Live Transcription Feed
            </h2>
            <span style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>Updating in real-time...</span>
          </div>

          {/* Call Cards */}
          {activeCall ? (
            <div className="fade-in-up glass-card" style={{ borderRadius: 12, overflow: 'hidden', transition: 'all 0.3s' }}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)', background: 'rgba(30,41,59,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: 8, borderRadius: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>support_agent</span>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1 }}>{activeCall.phoneNumber || 'Active Call'}</h4>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', margin: '4px 0 0' }}>ID: #{activeCall.id?.slice(-8) || 'LIVE'}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                    Active {formatDur(activeCall.startTime)}
                  </span>
                </div>
              </div>
              <div style={{ padding: 16, maxHeight: 200, overflowY: 'auto', background: 'rgba(15,23,42,0.5)' }}>
                {activeTranscripts.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>...transcribing next response...</p>
                ) : activeTranscripts.map((t, i) => (
                  <p key={i} style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 12, margin: '0 0 12px' }}>
                    <span style={{ fontWeight: 700, fontStyle: 'italic', textTransform: 'uppercase', marginRight: 8, color: t.speaker === 'agent' ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {t.speaker === 'agent' ? 'Agent:' : 'Customer:'}
                    </span>
                    {`"${t.text}"`}
                  </p>
                ))}
              </div>
              <div style={{ padding: 16, display: 'flex', gap: 8 }}>
                <button className="neon-glow" style={{ flex: 1, background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 700, padding: '10px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>headphones</span> Listen In
                </button>
                <button style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--danger)' }}>call_end</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-card" style={{ borderRadius: 12, padding: 48, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.3, marginBottom: 16, display: 'block' }}>phone_paused</span>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>No active calls. Start a test call to see live transcription here.</p>
            </div>
          )}

          {/* Recently Completed */}
          <div className="fade-in-up glass-card" style={{ borderRadius: 12, padding: 24, animationDelay: '0.3s' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px' }}>
              <span className="material-symbols-outlined">history</span> Recently Completed
            </h3>
            {allCalls.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No recent calls.</p>
            ) : allCalls.slice(0, 5).map((call, i) => (
              <div key={i} className="table-row-hover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', width: 60 }}>
                    {call.createdAt ? new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  </span>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
                    {call.direction || 'Outbound'} Call - {call.phoneNumber || 'Unknown'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{
                    background: call.status === 'completed' ? 'var(--accent-light)' : 'var(--bg-hover)',
                    color: call.status === 'completed' ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 10, padding: '4px 8px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase'
                  }}>{call.status || 'ended'}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>chevron_right</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Agent Health */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="fade-in-up glass-card" style={{ borderRadius: 12, padding: 20, animationDelay: '0.2s' }}>
            <h3 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--success)' }}>memory</span> Neural Core Load
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '4px solid var(--accent)', borderTopColor: 'transparent',
                animation: 'spin 3s linear infinite'
              }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Processing Latency</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Average: 240ms</p>
              </div>
            </div>
            <p style={{
              fontSize: 11, color: 'var(--text-muted)', padding: 10, borderRadius: 6,
              background: 'rgba(15,23,42,0.5)', border: '1px solid var(--border-light)', margin: 0
            }}>
              Neural engine operating at 100% capacity. Auto-scaling active. No bottlenecks detected.
            </p>
          </div>

          {/* Connection Status */}
          <div className="fade-in-up glass-card" style={{ borderRadius: 12, padding: 20, animationDelay: '0.3s' }}>
            <h3 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>public</span> System Status
            </h3>
            {[
              { label: 'WebSocket', status: connected ? 'Connected' : 'Disconnected', ok: connected },
              { label: 'STT Engine', status: 'Ready', ok: true },
              { label: 'TTS Engine', status: 'Ready', ok: true },
              { label: 'LLM Pipeline', status: 'Active', ok: true },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--border-light)' : 'none' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.ok ? 'var(--success)' : 'var(--danger)', display: 'inline-block' }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: item.ok ? 'var(--success)' : 'var(--danger)' }}>{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

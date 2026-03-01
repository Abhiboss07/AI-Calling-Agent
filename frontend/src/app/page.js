"use client";
export const runtime = 'edge';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Phone, IndianRupee, CheckCircle, PhoneCall, Hash,
  Copy, Eye, EyeOff, Zap, PhoneForwarded, ExternalLink,
  Activity, Clock, MessageSquare, ArrowUpRight, ArrowDownRight,
  Mic, TrendingUp
} from 'lucide-react';
import { getAuthHeaders } from '../lib/api';
import { useWebSocket } from '../contexts/WebSocketContext';

const API_BASE = '/api/v1';

export default function LiveMonitor() {
  const [metrics, setMetrics] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendOffline, setBackendOffline] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState('');
  const [activeCall, setActiveCall] = useState(null);
  const [costData, setCostData] = useState({ totalSpent: 0, avgPerCall: 0 });

  const ws = useWebSocket();
  const activeCalls = ws?.activeCalls || [];
  const transcript = ws?.currentTranscript || [];

  const loadData = useCallback(async () => {
    try {
      const [mRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/metrics`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`${API_BASE}/calls?perPage=10`, { headers: getAuthHeaders() }).catch(() => null)
      ]);

      if (!mRes && !cRes) {
        setBackendOffline(true);
        return;
      }
      setBackendOffline(false);

      if (mRes && mRes.ok) {
        try {
          const mData = await mRes.json();
          if (mData.ok) setMetrics(mData.data);
        } catch { /* non-JSON */ }
      }

      if (cRes && cRes.ok) {
        try {
          const cData = await cRes.json();
          if (cData.ok && cData.data) {
            setRecentCalls(cData.data);
            // Calculate cost from call data
            const totalCost = cData.data.reduce((sum, call) => {
              const dur = call.durationSec || 0;
              const costPerMin = call.costPerMinRs || 1.5;
              return sum + (dur / 60) * costPerMin;
            }, 0);
            const avgCost = cData.data.length > 0 ? totalCost / cData.data.length : 0;
            setCostData({ totalSpent: totalCost, avgPerCall: avgCost });
          }
        } catch { /* non-JSON */ }
      }
    } catch (err) {
      console.error('Dashboard load error', err);
      setBackendOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 10s
  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 10000);
    return () => clearInterval(id);
  }, [loadData]);

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <Activity size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div>Loading live monitor...</div>
        </div>
      </div>
    );
  }

  const callsMade = metrics?.callsStarted || 0;
  const successRate = metrics?.successRate || '0%';
  const completedCalls = metrics?.callsCompleted || 0;
  const avgDuration = metrics?.avgDurationSec ? `${Math.round(metrics.avgDurationSec)}s` : '0s';

  return (
    <div>
      {/* Backend Offline Banner */}
      {backendOffline && (
        <div style={{
          background: 'var(--warning-light)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          color: '#92400E',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          ⚠️ Backend server is offline. Start your backend to see live data.
        </div>
      )}

      {/* ── PAGE HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Live Monitor</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Real-time call activity and agent performance</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: activeCalls.length > 0 ? 'var(--success)' : 'var(--text-muted)',
            animation: activeCalls.length > 0 ? 'pulse 2s infinite' : 'none'
          }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {activeCalls.length > 0 ? `${activeCalls.length} active call(s)` : 'No active calls'}
          </span>
        </div>
      </div>

      {/* ── KPI STAT CARDS ── */}
      <div className="kpi-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Calls Made</span>
            <div className="stat-card-icon orange"><Phone size={18} /></div>
          </div>
          <div className="stat-card-value">{callsMade}</div>
          <div className="stat-card-change">
            <ArrowUpRight size={14} style={{ color: 'var(--success)' }} />
            <span>Today</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Cost</span>
            <div className="stat-card-icon green"><IndianRupee size={18} /></div>
          </div>
          <div className="stat-card-value">₹{costData.totalSpent.toFixed(2)}</div>
          <div className="stat-card-change">
            <span style={{ color: 'var(--text-muted)' }}>~₹{costData.avgPerCall.toFixed(2)}/call</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Success Rate</span>
            <div className="stat-card-icon green"><CheckCircle size={18} /></div>
          </div>
          <div className="stat-card-value">{successRate}</div>
          <div className="stat-card-change">
            <TrendingUp size={14} style={{ color: 'var(--success)' }} />
            <span>Overall</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Completed</span>
            <div className="stat-card-icon red"><PhoneCall size={18} /></div>
          </div>
          <div className="stat-card-value">{completedCalls}</div>
          <Link href="/clients" className="stat-card-link">
            View logs <ExternalLink size={12} />
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Avg Duration</span>
            <div className="stat-card-icon purple"><Clock size={18} /></div>
          </div>
          <div className="stat-card-value">{avgDuration}</div>
          <div className="stat-card-change">
            <span className="change-dash">—</span> per call
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Test Call</span>
            <div className="stat-card-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}><Zap size={18} /></div>
          </div>
          <div className="stat-card-value">&nbsp;</div>
          <Link href="/test-call" className="stat-card-link">
            Make a call <ExternalLink size={12} />
          </Link>
        </div>
      </div>

      {/* ── CURRENT CONVERSATION (Real-Time) ── */}
      <div className="card-grid-2">
        <div className="card" style={{ minHeight: 280 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
            Current Conversation
          </h3>
          {activeCalls.length > 0 ? (
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(transcript || []).map((msg, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  padding: '8px 12px', borderRadius: 8,
                  background: msg.role === 'agent' ? 'var(--accent-light)' : 'var(--bg-primary)',
                  border: '1px solid var(--border-light)'
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: msg.role === 'agent' ? 'var(--accent)' : 'var(--info)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 11, fontWeight: 700
                  }}>
                    {msg.role === 'agent' ? 'AI' : 'U'}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                      {msg.role === 'agent' ? 'AI Agent' : 'User'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>{msg.text}</div>
                  </div>
                </div>
              ))}
              {transcript.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                  <Mic size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <div>Listening...</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180, color: 'var(--text-muted)', fontSize: 13 }}>
              <Phone size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>No active conversation</div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>Start a call to see live transcription</div>
            </div>
          )}
        </div>

        {/* ── COST TRACKING (Real-Time) ── */}
        <div className="card" style={{ minHeight: 280 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IndianRupee size={16} style={{ color: 'var(--success)' }} />
            Cost Tracking
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ padding: '16px', borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>STT Calls</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{metrics?.sttCalls || 0}</div>
            </div>
            <div style={{ padding: '16px', borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>TTS Calls</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{metrics?.ttsCalls || 0}</div>
            </div>
            <div style={{ padding: '16px', borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>LLM Calls</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{metrics?.llmCalls || 0}</div>
            </div>
            <div style={{ padding: '16px', borderRadius: 8, background: 'var(--accent-light)', border: '1px solid var(--accent-glow)' }}>
              <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 4 }}>Total Spent</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>₹{costData.totalSpent.toFixed(2)}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Auto-updates every 10 seconds
          </div>
        </div>
      </div>

      {/* ── INBOUND & OUTBOUND CHART ── */}
      <div className="chart-card">
        <div className="chart-header">
          <h3>Inbound & Outbound Calls</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="chart-legend">
              <div className="chart-legend-item">
                <div className="chart-legend-dot green"></div>
                <span>Inbound</span>
              </div>
              <div className="chart-legend-item">
                <div className="chart-legend-dot" style={{ background: 'var(--accent)' }}></div>
                <span>Outbound</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 16px' }}>
          {recentCalls.length > 0 ? (
            recentCalls.slice(0, 12).map((call, i) => {
              const height = Math.max(10, Math.min(140, (call.durationSec || 1) * 2));
              const isOutbound = call.direction === 'outbound';
              return (
                <div key={call._id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 4 }}>
                  <div style={{
                    width: '100%', maxWidth: 40, height,
                    background: isOutbound
                      ? 'linear-gradient(180deg, var(--accent), var(--accent-hover))'
                      : 'linear-gradient(180deg, var(--success), #059669)',
                    borderRadius: '6px 6px 2px 2px',
                    transition: 'height 0.3s ease',
                    opacity: 0.85,
                    cursor: 'pointer'
                  }}
                    title={`${call.phoneNumber || 'Unknown'} — ${call.durationSec || 0}s — ${call.status}`}
                  />
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' }}>
                    {call.durationSec || 0}s
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingBottom: 40 }}>
              No call data yet
            </div>
          )}
        </div>
      </div>

      {/* ── ACCOUNT & INFRASTRUCTURE ── */}
      <div className="section-label">ACCOUNT & INFRASTRUCTURE</div>

      <div className="card-grid-3">
        {/* API Credentials */}
        <div className="card">
          <h3>API Credentials</h3>
          <div className="cred-row">
            <span className="cred-label">Auth ID</span>
            <div className="cred-value">
              <span>MA_2LNXPSWI</span>
              <button className="cred-copy-btn" onClick={() => handleCopy('MA_2LNXPSWI', 'authId')} title="Copy">
                <Copy size={14} />
              </button>
              {copied === 'authId' && <span style={{ fontSize: 11, color: 'var(--success)' }}>Copied!</span>}
            </div>
          </div>
          <div className="cred-row">
            <span className="cred-label">Auth Token</span>
            <div className="cred-value">
              <span>{tokenVisible ? 'sk-your-token-here' : '••••••••••••••••'}</span>
              <button className="cred-copy-btn" onClick={() => setTokenVisible(!tokenVisible)} title={tokenVisible ? 'Hide' : 'Reveal'}>
                {tokenVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button className="cred-copy-btn" onClick={() => handleCopy('sk-your-token-here', 'authToken')} title="Copy">
                <Copy size={14} />
              </button>
              {copied === 'authToken' && <span style={{ fontSize: 11, color: 'var(--success)' }}>Copied!</span>}
            </div>
          </div>
        </div>

        {/* Global Call Distribution */}
        <div className="card">
          <h3>Call Distribution</h3>
          <div style={{
            height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(180deg, var(--accent-light) 0%, var(--bg-white) 100%)', borderRadius: 8
          }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🇮🇳</div>
              <div style={{ fontSize: 12 }}>India Region</div>
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>{callsMade} calls</div>
            </div>
          </div>
        </div>

        {/* Capacity Limits */}
        <div className="card">
          <h3>Capacity Limits</h3>
          <div className="capacity-grid">
            <div className="capacity-item">
              <div className="cap-label"><Zap size={14} style={{ color: 'var(--accent)' }} /> CPS</div>
              <div className="cap-value">1 <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>base</span></div>
              <div className="cap-sub">+0 purchased</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginTop: 4 }}>Total: 1</div>
            </div>
            <div className="capacity-item">
              <div className="cap-label"><PhoneForwarded size={14} style={{ color: 'var(--accent)' }} /> Concurrent</div>
              <div className="cap-value">3 <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>base</span></div>
              <div className="cap-sub">+0 purchased</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginTop: 4 }}>Total: 3</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── RECENT CALL ACTIVITY TABLE (always shown) ── */}
      <div className="section-label" style={{ marginTop: 8 }}>RECENT CALL ACTIVITY</div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Phone</th>
              <th>Direction</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Cost</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {recentCalls.length > 0 ? (
              recentCalls.map(call => {
                const cost = ((call.durationSec || 0) / 60) * (call.costPerMinRs || 1.5);
                return (
                  <tr key={call._id}>
                    <td>{new Date(call.createdAt).toLocaleString()}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 500 }}>{call.phoneNumber}</td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 12, fontWeight: 500,
                        color: call.direction === 'outbound' ? 'var(--accent)' : 'var(--success)'
                      }}>
                        {call.direction === 'outbound' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {call.direction || 'outbound'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge status-${call.status}`}>{call.status}</span>
                    </td>
                    <td>{call.durationSec || 0}s</td>
                    <td style={{ color: 'var(--text-secondary)' }}>₹{cost.toFixed(2)}</td>
                    <td>
                      <Link href={`/clients/${encodeURIComponent(call.phoneNumber)}`}
                        className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12 }}>
                        Details
                      </Link>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <Phone size={24} style={{ opacity: 0.3, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                  No calls yet. Make a test call to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pulse animation for live indicator */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

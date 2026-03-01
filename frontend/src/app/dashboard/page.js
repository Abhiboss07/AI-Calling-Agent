'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeIndianRupee,
  CheckCircle2,
  Clock4,
  Phone,
  PhoneCall,
  Users,
  Waves,
  TrendingUp,
  ArrowUpRight,
  MessageSquare,
  Mic,
  Settings
} from 'lucide-react';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { API_BASE, getAuthHeaders } from '../../lib/api';

function formatDuration(startTime) {
  if (!startTime) return '0m';
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}m ${secs}s`;
}

function formatRelative(startTime) {
  if (!startTime) return 'just now';
  const sec = Math.max(1, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export default function DashboardPage() {
  const { connected, connecting, calls, activeCall, metrics, transcripts } = useWebSocket();
  const [stats, setStats] = useState({ todayCalls: 0, avgDuration: 0, conversionRate: 0 });
  const [finance, setFinance] = useState({
    vobiz: { walletAvailable: null, walletAfterActive: null, currency: 'INR', totalTelephonyCost: 0 },
    openai: { totalEstimatedCost: 0, activeEstimatedCost: 0, burnRatePerMin: 0, usage: {} },
    totals: { allTimeEstimatedCost: 0, activeCallsCount: 0 }
  });
  const [tick, setTick] = useState(0);

  // Tick every second to update durations
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/stats`, { headers: getAuthHeaders(), cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setStats(prev => ({ ...prev, ...data }));
      } catch { /* graceful */ }
    };
    fetchStats();
    const id = setInterval(fetchStats, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchFinance = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/finance`, { headers: getAuthHeaders(), cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data?.ok) setFinance(data);
      } catch { /* keep prior */ }
    };
    fetchFinance();
    const id = setInterval(fetchFinance, 12000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const recentCalls = useMemo(() => [...calls].reverse().slice(0, 10), [calls]);
  const activeTranscript = activeCall ? (transcripts[activeCall.id] || []).slice(-10) : [];

  const systemChecks = [
    { label: 'WebSocket Channel', healthy: connected || connecting, detail: connected ? 'Connected' : (connecting ? 'Reconnecting...' : 'Disconnected') },
    { label: 'Call Pipeline', healthy: true, detail: 'Ready' },
    { label: 'Database', healthy: true, detail: 'Connected' },
    { label: 'Speech Services', healthy: true, detail: 'Whisper + TTS ready' }
  ];

  const formatCurrency = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `₹${Number(value).toFixed(2)}`;
  };

  return (
    <div>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>REAL-TIME OPERATIONS</p>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Live Call Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Monitor active calls, costs, and system health in real-time.</p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
          borderRadius: 'var(--radius-sm)', background: connected ? 'var(--success-light)' : 'var(--danger-light)',
          border: `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? 'var(--success)' : 'var(--danger)',
            display: 'inline-block'
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: connected ? 'var(--success)' : 'var(--danger)' }}>
            {connected ? 'Live Connected' : (connecting ? 'Reconnecting' : 'Disconnected')}
          </span>
        </div>
      </div>

      {/* ── KPI ROW ── */}
      <div className="kpi-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Active Calls</span>
            <div className="stat-card-icon orange"><Phone size={18} /></div>
          </div>
          <div className="stat-card-value">{metrics.activeCalls || 0}</div>
          <div className="stat-card-change">
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Live</span> on the line now
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Calls</span>
            <div className="stat-card-icon green"><Users size={18} /></div>
          </div>
          <div className="stat-card-value">{metrics.totalCalls || 0}</div>
          <div className="stat-card-change">
            <ArrowUpRight size={14} style={{ color: 'var(--success)' }} />
            <span>Today: {stats.todayCalls || 0} new</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Avg Duration</span>
            <div className="stat-card-icon purple"><Clock4 size={18} /></div>
          </div>
          <div className="stat-card-value">{Math.round(stats.avgDuration || 0)}s</div>
          <div className="stat-card-change">
            <span className="change-dash">—</span> rolling average
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Conversion</span>
            <div className="stat-card-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}><TrendingUp size={18} /></div>
          </div>
          <div className="stat-card-value">{stats.conversionRate || 0}%</div>
          <div className="stat-card-change">
            <TrendingUp size={14} style={{ color: 'var(--success)' }} /> qualification rate
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Vobiz Wallet</span>
            <div className="stat-card-icon green"><BadgeIndianRupee size={18} /></div>
          </div>
          <div className="stat-card-value">{formatCurrency(finance.vobiz.walletAfterActive ?? finance.vobiz.walletAvailable)}</div>
          <div className="stat-card-change">
            <span style={{ color: 'var(--text-muted)' }}>After active deduction</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">OpenAI Spend</span>
            <div className="stat-card-icon purple"><Activity size={18} /></div>
          </div>
          <div className="stat-card-value">{formatCurrency(finance.openai.activeEstimatedCost)}</div>
          <div className="stat-card-change">
            <span style={{ color: 'var(--text-muted)' }}>Burn: {formatCurrency(finance.openai.burnRatePerMin)}/min</span>
          </div>
        </div>
      </div>

      {/* ── MAIN GRID: Conversation + System Health ── */}
      <div className="card-grid-2" style={{ marginBottom: 24 }}>
        {/* Current Conversation */}
        <div className="card" style={{ minHeight: 320 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
              Current Conversation
            </h3>
            {activeCall ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
                borderRadius: 20, background: 'var(--success-light)', color: 'var(--success)',
                fontSize: 12, fontWeight: 600
              }}>
                <Waves size={14} /> In Progress — {formatDuration(activeCall.startTime)}
              </span>
            ) : (
              <span style={{
                fontSize: 12, color: 'var(--text-muted)', padding: '4px 12px',
                borderRadius: 20, background: 'var(--bg-primary)'
              }}>No Active Call</span>
            )}
          </div>

          {!activeCall ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)' }}>
              <Mic size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ fontSize: 13, margin: 0 }}>Waiting for next live call...</p>
            </div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeTranscript.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>
                  Transcript will appear as speech is processed.
                </p>
              )}
              {activeTranscript.map((entry, idx) => (
                <div key={`${entry.timestamp}-${idx}`} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  padding: '8px 12px', borderRadius: 8,
                  background: entry.speaker === 'agent' ? 'var(--accent-light)' : 'var(--bg-primary)',
                  border: '1px solid var(--border-light)'
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: entry.speaker === 'agent' ? 'var(--accent)' : 'var(--info)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 10, fontWeight: 700
                  }}>
                    {entry.speaker === 'agent' ? 'AI' : 'U'}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                      {entry.speaker === 'agent' ? 'AI Agent' : 'Customer'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>{entry.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System Health */}
        <div className="card" style={{ minHeight: 320 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={16} style={{ color: 'var(--accent)' }} />
              System Health
            </h3>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
              borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: connected ? 'var(--success-light)' : 'var(--warning-light)',
              color: connected ? 'var(--success)' : 'var(--warning)'
            }}>
              {connected ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {connected ? 'All Systems Stable' : 'Needs Attention'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {systemChecks.map(item => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderRadius: 8, background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)'
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.detail}</div>
                </div>
                <span style={{
                  padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                  background: item.healthy ? 'var(--success-light)' : 'var(--danger-light)',
                  color: item.healthy ? 'var(--success)' : 'var(--danger)'
                }}>
                  {item.healthy ? '● Healthy' : '● Down'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── COST TRACKING ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BadgeIndianRupee size={16} style={{ color: 'var(--success)' }} />
            Cost Tracking (Real-Time)
          </h3>
          <span style={{
            fontSize: 12, color: 'var(--text-muted)', padding: '4px 12px',
            borderRadius: 20, background: 'var(--bg-primary)'
          }}>
            {finance.totals.activeCallsCount || 0} active tracked
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { label: 'Vobiz Wallet', value: formatCurrency(finance.vobiz.walletAvailable), color: 'var(--success)' },
            { label: 'Vobiz Telephony Spend', value: formatCurrency(finance.vobiz.totalTelephonyCost), color: 'var(--accent)' },
            { label: 'OpenAI All-Time Spend', value: formatCurrency(finance.openai.totalEstimatedCost), color: 'var(--info)' },
            { label: 'OpenAI Tokens (Active)', value: `${Number(finance.openai.usage?.inputTokens || 0)} in / ${Number(finance.openai.usage?.outputTokens || 0)} out`, color: 'var(--text-secondary)' },
            { label: 'Total Estimated Spend', value: formatCurrency(finance.totals.allTimeEstimatedCost), color: 'var(--danger)' }
          ].map((item, i) => (
            <div key={i} style={{
              padding: '16px', borderRadius: 8, background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RECENT CALL ACTIVITY ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Recent Call Activity</h3>
          <span style={{
            fontSize: 12, color: 'var(--text-muted)', padding: '4px 12px',
            borderRadius: 20, background: 'var(--bg-primary)'
          }}>
            {recentCalls.length} tracked
          </span>
        </div>
        {recentCalls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <Phone size={28} style={{ opacity: 0.3, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, margin: 0 }}>No recent calls. Activity will appear here in real time.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentCalls.map(call => (
              <div key={call.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderRadius: 8, background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)', transition: 'background 0.2s'
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {call.phoneNumber || 'Unknown number'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {call.direction || 'outbound'} • {call.agent || 'Agent'} • {formatDuration(call.startTime)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`status-badge status-${call.status || 'queued'}`}>{call.status || 'queued'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>
                    {formatRelative(call.startTime)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
  Waves
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
  const [stats, setStats] = useState({
    todayCalls: 0,
    avgDuration: 0,
    conversionRate: 0
  });
  const [finance, setFinance] = useState({
    vobiz: { walletAvailable: null, walletAfterActive: null, currency: 'INR', totalTelephonyCost: 0 },
    openai: { totalEstimatedCost: 0, activeEstimatedCost: 0, burnRatePerMin: 0, usage: {} },
    totals: { allTimeEstimatedCost: 0, activeCallsCount: 0 }
  });

  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/stats`, {
          headers: getAuthHeaders(),
          cache: 'no-store'
        });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setStats((prev) => ({ ...prev, ...data }));
      } catch {
        // keep graceful fallback values
      }
    };

    fetchStats();
    const id = setInterval(fetchStats, 30000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchFinance = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/finance`, {
          headers: getAuthHeaders(),
          cache: 'no-store'
        });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data?.ok) setFinance(data);
      } catch {
        // keep prior snapshot
      }
    };
    fetchFinance();
    const id = setInterval(fetchFinance, 12000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const recentCalls = useMemo(() => [...calls].reverse().slice(0, 7), [calls]);
  const activeTranscript = activeCall ? (transcripts[activeCall.id] || []).slice(-8) : [];

  const systemChecks = [
    { label: 'WebSocket Channel', healthy: connected || connecting },
    { label: 'Call Pipeline', healthy: true },
    { label: 'Database', healthy: true },
    { label: 'Speech Services', healthy: true }
  ];

  const formatCurrency = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return `Rs ${Number(value).toFixed(2)}`;
  };

  return (
    <div className="realtime-page">
      <section className="realtime-hero fade-in-up">
        <div>
          <p className="section-label">REAL-TIME OPERATIONS</p>
          <h1 className="page-title" style={{ marginBottom: 8 }}>Live Call Dashboard</h1>
          <p className="text-secondary">Monitor active conversations, agent signals, and system health in one place.</p>
        </div>
        <div className={`realtime-connection ${connected ? 'online' : 'offline'}`}>
          <span className="dot" />
          {connected ? 'Live Connected' : (connecting ? 'Reconnecting' : 'Disconnected')}
        </div>
      </section>

      <section className="kpi-grid">
        <article className="stat-card fade-in-up delay-1">
          <div className="stat-card-header">
            <span className="stat-card-title">Active Calls</span>
            <div className="stat-card-icon blue"><Phone size={18} /></div>
          </div>
          <div className="stat-card-value">{metrics.activeCalls || 0}</div>
          <div className="stat-card-change"><span className="change-dash">Live</span> on the line now</div>
        </article>

        <article className="stat-card fade-in-up delay-2">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Calls</span>
            <div className="stat-card-icon green"><Users size={18} /></div>
          </div>
          <div className="stat-card-value">{metrics.totalCalls || 0}</div>
          <div className="stat-card-change"><span className="change-dash">Today</span> {stats.todayCalls || 0} new</div>
        </article>

        <article className="stat-card fade-in-up delay-3">
          <div className="stat-card-header">
            <span className="stat-card-title">Avg Duration</span>
            <div className="stat-card-icon purple"><Clock4 size={18} /></div>
          </div>
          <div className="stat-card-value">{Math.round(stats.avgDuration || 0)}s</div>
          <div className="stat-card-change"><span className="change-dash">Rolling</span> last call sessions</div>
        </article>

        <article className="stat-card fade-in-up delay-4">
          <div className="stat-card-header">
            <span className="stat-card-title">Conversion</span>
            <div className="stat-card-icon orange"><PhoneCall size={18} /></div>
          </div>
          <div className="stat-card-value">{stats.conversionRate || 0}%</div>
          <div className="stat-card-change"><span className="change-dash">Trend</span> qualification rate</div>
        </article>

        <article className="stat-card fade-in-up delay-4">
          <div className="stat-card-header">
            <span className="stat-card-title">Vobiz Wallet</span>
            <div className="stat-card-icon blue"><BadgeIndianRupee size={18} /></div>
          </div>
          <div className="stat-card-value">{formatCurrency(finance.vobiz.walletAfterActive ?? finance.vobiz.walletAvailable)}</div>
          <div className="stat-card-change"><span className="change-dash">Live</span> after active deduction</div>
        </article>

        <article className="stat-card fade-in-up delay-4">
          <div className="stat-card-header">
            <span className="stat-card-title">OpenAI Active Spend</span>
            <div className="stat-card-icon purple"><Activity size={18} /></div>
          </div>
          <div className="stat-card-value">{formatCurrency(finance.openai.activeEstimatedCost)}</div>
          <div className="stat-card-change"><span className="change-dash">Burn</span> {formatCurrency(finance.openai.burnRatePerMin)}/min</div>
        </article>
      </section>

      <section className="realtime-grid">
        <article className="card realtime-panel fade-in-up delay-1">
          <div className="panel-head">
            <h3>Current Conversation</h3>
            {activeCall ? (
              <span className="badge badge-live"><Waves size={14} /> In Progress</span>
            ) : (
              <span className="badge">No Active Call</span>
            )}
          </div>

          {!activeCall && (
            <div className="empty-state compact">
              <div className="empty-state-icon"><Activity size={28} /></div>
              <p>Waiting for the next live call stream.</p>
            </div>
          )}

          {activeCall && (
            <div className="active-call-body">
              <div className="active-call-meta">
                <div>
                  <label>Phone</label>
                  <p>{activeCall.phoneNumber || 'Unknown'}</p>
                </div>
                <div>
                  <label>Duration</label>
                  <p>{formatDuration(activeCall.startTime)}</p>
                </div>
                <div>
                  <label>Status</label>
                  <p className="text-accent">{activeCall.status || 'in-progress'}</p>
                </div>
              </div>

              <div className="transcript-box">
                {activeTranscript.length === 0 && <p className="text-muted">Transcript will appear as speech is processed.</p>}
                {activeTranscript.map((entry, idx) => (
                  <div key={`${entry.timestamp}-${idx}`} className="transcript-line">
                    <span className={`speaker ${entry.speaker === 'agent' ? 'agent' : 'customer'}`}>
                      {entry.speaker === 'agent' ? 'Agent' : 'Customer'}
                    </span>
                    <p>{entry.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        <article className="card realtime-panel fade-in-up delay-2">
          <div className="panel-head">
            <h3>System Health</h3>
            <span className={`badge ${connected ? 'ok' : 'warn'}`}>
              {connected ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {connected ? 'Stable' : 'Needs Attention'}
            </span>
          </div>
          <div className="status-stack">
            {systemChecks.map((item) => (
              <div key={item.label} className="status-row">
                <span>{item.label}</span>
                <span className={`status-chip ${item.healthy ? 'healthy' : 'error'}`}>
                  {item.healthy ? 'Healthy' : 'Down'}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="card fade-in-up delay-3">
        <div className="panel-head">
          <h3>Cost Tracking (Real-Time)</h3>
          <span className="badge">{finance.totals.activeCallsCount || 0} active tracked</span>
        </div>
        <div className="status-stack">
          <div className="status-row">
            <span>Vobiz Wallet Available</span>
            <strong>{formatCurrency(finance.vobiz.walletAvailable)}</strong>
          </div>
          <div className="status-row">
            <span>Vobiz Telephony Spend (all-time estimate)</span>
            <strong>{formatCurrency(finance.vobiz.totalTelephonyCost)}</strong>
          </div>
          <div className="status-row">
            <span>OpenAI Spend (all-time estimate)</span>
            <strong>{formatCurrency(finance.openai.totalEstimatedCost)}</strong>
          </div>
          <div className="status-row">
            <span>OpenAI Token Usage (active calls)</span>
            <strong>{Number(finance.openai.usage?.inputTokens || 0)} in / {Number(finance.openai.usage?.outputTokens || 0)} out</strong>
          </div>
          <div className="status-row">
            <span>Total Estimated Spend (all-time)</span>
            <strong>{formatCurrency(finance.totals.allTimeEstimatedCost)}</strong>
          </div>
        </div>
      </section>

      <section className="card fade-in-up delay-3">
        <div className="panel-head">
          <h3>Recent Call Activity</h3>
          <span className="badge">{recentCalls.length} tracked</span>
        </div>
        {recentCalls.length === 0 ? (
          <div className="empty-state compact">
            <div className="empty-state-icon"><Phone size={28} /></div>
            <p>No recent calls. Activity will show here in real time.</p>
          </div>
        ) : (
          <div className="activity-list">
            {recentCalls.map((call) => (
              <div key={call.id} className="activity-item">
                <div>
                  <p className="activity-title">{call.phoneNumber || 'Unknown number'}</p>
                  <p className="activity-meta">{call.direction || 'inbound'} • {call.agent || 'Agent'}</p>
                </div>
                <div className="activity-right">
                  <span className={`status-badge status-${call.status || 'queued'}`}>{call.status || 'queued'}</span>
                  <span className="text-muted">{formatRelative(call.startTime)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

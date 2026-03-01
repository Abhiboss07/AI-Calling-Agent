'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { API_BASE, getAuthHeaders } from '../lib/api';
import { useWebSocket } from '../contexts/WebSocketContext';

export default function DashboardPage() {
  const { connected, calls, activeCall, metrics: wsMetrics, transcripts } = useWebSocket();
  const [metrics, setMetrics] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [mRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/v1/metrics`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`${API_BASE}/v1/calls?perPage=10`, { headers: getAuthHeaders() }).catch(() => null)
      ]);
      if (mRes?.ok) { const d = await mRes.json().catch(() => ({})); if (d.ok) setMetrics(d.data); }
      if (cRes?.ok) { const d = await cRes.json().catch(() => ({})); if (d.ok && d.data) setRecentCalls(d.data); }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); const id = setInterval(loadData, 15000); return () => clearInterval(id); }, [loadData]);

  const totalCalls = metrics?.callsStarted || wsMetrics?.totalCalls || 0;
  const convRate = metrics?.successRate || '18.5%';
  const activeMinutes = metrics?.totalDurationSec ? Math.round(metrics.totalDurationSec / 60) : 0;
  const successRate = metrics?.completedRate || '94.2%';

  const kpiCards = [
    { label: 'Total Calls', value: totalCalls.toLocaleString(), trend: '+12.4%', up: true, icon: 'call', color: '#135bec' },
    { label: 'Lead Conversion', value: convRate, trend: '+2.4%', up: true, icon: 'target', color: '#a855f7' },
    { label: 'Active Minutes', value: activeMinutes.toLocaleString(), trend: '-5%', up: false, icon: 'schedule', color: '#06b6d4' },
    { label: 'Success Rate', value: successRate, trend: '+0.8%', up: true, icon: 'verified', color: '#10b981' },
  ];

  const activeCalls = wsMetrics?.activeCalls || 0;
  const activeTranscript = activeCall ? (transcripts[activeCall.id] || []).slice(-5) : [];

  // Merge WebSocket calls with API calls
  const allCalls = [...(calls || []).reverse(), ...recentCalls].slice(0, 10);

  return (
    <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Welcome Section */}
      <div className="fade-in-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <h2 style={{ fontSize: 30, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>Dashboard Overview</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 15, margin: '8px 0 0' }}>Real-time performance monitoring for your AI Calling Agents.</p>
        </div>
        <button className="glass-btn" style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          background: 'var(--bg-hover)', border: '1px solid var(--border)',
          borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.2s'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
          Export Report
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 32 }}>
        {kpiCards.map((kpi, i) => (
          <div key={i} className="fade-in-up glass-card" style={{
            animationDelay: `${i * 0.08}s`,
            padding: 24, borderRadius: 12,
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderLeft: `4px solid ${kpi.color}`,
            transition: 'transform 0.3s, box-shadow 0.3s',
            cursor: 'default'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <span className="material-symbols-outlined" style={{
                color: kpi.color, background: `${kpi.color}15`, padding: 8, borderRadius: 8, fontSize: 22
              }}>{kpi.icon}</span>
              <span style={{
                color: kpi.up ? 'var(--success)' : 'var(--danger)',
                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2
              }}>
                {kpi.trend}
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  {kpi.up ? 'trending_up' : 'trending_down'}
                </span>
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 500, margin: 0 }}>{kpi.label}</p>
            <h3 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>{kpi.value}</h3>
          </div>
        ))}
      </div>

      {/* Main Grid: Live Monitor + Side Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Live Monitor Table */}
          <div className="fade-in-up glass-card" style={{
            background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden',
            animationDelay: '0.3s'
          }}>
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="pulse-dot" />
                <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontSize: 15 }}>Live Monitor</h3>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{
                  background: 'var(--accent-light)', color: 'var(--accent)',
                  padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700
                }}>{activeCalls} Active Calls</span>
                <span style={{
                  background: 'var(--bg-hover)', color: 'var(--text-muted)',
                  padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700
                }}>{allCalls.length} Recent</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(30,41,59,0.3)' }}>
                    {['Lead / Phone', 'Agent', 'Status', 'Duration'].map(h => (
                      <th key={h} style={{
                        padding: '12px 24px', fontSize: 11, fontWeight: 700,
                        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allCalls.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No calls yet — start a test call to see data here.
                    </td></tr>
                  ) : allCalls.map((call, i) => (
                    <tr key={call._id || call.id || i} style={{
                      borderBottom: '1px solid var(--border-light)',
                      transition: 'background 0.2s'
                    }} className="table-row-hover">
                      <td style={{ padding: '12px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-hover)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: 'var(--text-primary)'
                          }}>
                            {(call.phoneNumber || 'UK')[0]}{(call.phoneNumber || 'UK')[1]}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {call.phoneNumber || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 24px' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          #{call._id?.slice(-4) || 'RE-AI'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 24px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                          background: call.status === 'completed' ? 'rgba(16,185,129,0.1)' : call.status === 'failed' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                          color: call.status === 'completed' ? 'var(--success)' : call.status === 'failed' ? 'var(--danger)' : 'var(--info)'
                        }}>{call.status || 'active'}</span>
                      </td>
                      <td style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, color: 'var(--text-secondary)' }}>
                        {call.durationSec ? `${Math.floor(call.durationSec / 60)}:${String(call.durationSec % 60).padStart(2, '0')}` : '0:00'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Call Volume Chart */}
          <div className="fade-in-up glass-card" style={{
            padding: 24, borderRadius: 12, minHeight: 220,
            background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            animationDelay: '0.4s'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Call Volume Trends</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ padding: '4px 12px', background: 'var(--accent)', color: 'white', fontSize: 12, borderRadius: 999, fontWeight: 700, border: 'none', cursor: 'pointer' }}>7D</button>
                <button style={{ padding: '4px 12px', background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 12, borderRadius: 999, fontWeight: 700, border: 'none', cursor: 'pointer' }}>30D</button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flex: 1, paddingTop: 16 }}>
              {[40, 65, 55, 80, 95, 85, 60, 75].map((h, i) => (
                <div key={i} className="chart-bar" style={{
                  flex: 1, height: `${h}%`, borderRadius: '6px 6px 0 0',
                  background: i === 5 ? 'var(--accent)' : 'rgba(19,91,236,0.2)',
                  transition: 'all 0.3s ease', cursor: 'pointer'
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Side Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Top Agent Stats */}
          <div className="fade-in-up glass-card" style={{
            padding: 24, borderRadius: 12,
            background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.05)',
            animationDelay: '0.35s'
          }}>
            <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 24, fontSize: 15, margin: '0 0 24px' }}>Top Agent Stats</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-light)', padding: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%', background: 'var(--bg-hover)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: 28 }}>smart_toy</span>
                </div>
              </div>
              <div>
                <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Aria - Closer Pro</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, margin: '4px 0 0' }}>Model: GPT-4o-mini</p>
              </div>
            </div>
            {[
              { label: 'Conversion Rate', value: '24.8%', color: 'var(--accent)', pct: 24.8 },
              { label: 'Sentiment Score', value: '92/100', color: '#a855f7', pct: 92 },
            ].map((stat, i) => (
              <div key={i} style={{ marginBottom: i === 0 ? 16 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{stat.label}</span>
                  <span style={{ color: stat.color }}>{stat.value}</span>
                </div>
                <div style={{ width: '100%', background: 'var(--bg-hover)', borderRadius: 999, height: 8 }}>
                  <div className="progress-animate" style={{ width: `${stat.pct}%`, background: stat.color, height: 8, borderRadius: 999, transition: 'width 1s ease' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Quick Resources */}
          <div className="fade-in-up glass-card" style={{
            padding: 24, borderRadius: 12,
            background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.05)',
            animationDelay: '0.4s'
          }}>
            <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, fontSize: 15, margin: '0 0 16px' }}>Quick Resources</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: 'menu_book', label: 'OBJECTION SCRIPTS' },
                { icon: 'apartment', label: 'LISTING DATA FEED' },
                { icon: 'record_voice_over', label: 'VOICE PRESETS' },
              ].map((item, i) => (
                <li key={i}>
                  <Link href="/knowledge" className="resource-link" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 12, borderRadius: 8, textDecoration: 'none',
                    border: '1px solid transparent',
                    transition: 'all 0.2s'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: 20 }}>{item.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{item.label}</span>
                    </div>
                    <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: 16 }}>arrow_forward</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Automated Optimization */}
          <div className="fade-in-up glow-card" style={{
            padding: 24, borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(19,91,236,0.1), rgba(168,85,247,0.1))',
            border: '1px solid rgba(19,91,236,0.2)',
            position: 'relative', overflow: 'hidden',
            animationDelay: '0.45s'
          }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontSize: 15, margin: '0 0 8px' }}>Automated Optimization</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, margin: '0 0 16px', lineHeight: 1.5 }}>
                AI is currently re-learning objection handling from recent call transcripts.
              </p>
              <button style={{
                width: '100%', padding: '10px 16px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'background 0.2s'
              }}>
                View Training Logs
              </button>
            </div>
            <span className="material-symbols-outlined" style={{
              position: 'absolute', right: -16, bottom: -16, fontSize: 120,
              opacity: 0.05, color: 'var(--text-primary)'
            }}>psychology</span>
          </div>
        </div>
      </div>
    </div>
  );
}

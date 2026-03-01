'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { API_BASE, getAuthHeaders } from '../../lib/api';

export default function WalletPage() {
  const [metrics, setMetrics] = useState(null);
  const [calls, setCalls] = useState([]);
  const [selectedAmount, setSelectedAmount] = useState('₹100');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [mRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/v1/metrics`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`${API_BASE}/v1/calls?perPage=10`, { headers: getAuthHeaders() }).catch(() => null)
      ]);
      if (mRes?.ok) { const d = await mRes.json().catch(() => ({})); if (d.ok) setMetrics(d.data); }
      if (cRes?.ok) { const d = await cRes.json().catch(() => ({})); if (d.ok && d.data) setCalls(d.data); }
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); const id = setInterval(loadData, 30000); return () => clearInterval(id); }, [loadData]);

  const balance = metrics?.walletBalance || 0;
  const totalSpent = metrics?.totalSpentRs || 0;
  const totalCalls = metrics?.callsStarted || 0;
  const avgCostPerCall = totalCalls > 0 ? (totalSpent / totalCalls).toFixed(2) : '0.00';

  return (
    <div style={{ padding: 32, maxWidth: 1024, margin: '0 auto' }}>
      {/* Header */}
      <div className="fade-in-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>Wallet & Billing</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: '8px 0 0' }}>Monitor your agent usage credits and manage payments.</p>
        </div>
        <button className="neon-glow" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 24px',
          background: 'var(--accent)', color: 'white', borderRadius: 8, fontWeight: 700, fontSize: 14,
          border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(19,91,236,0.2)'
        }}>
          <span className="material-symbols-outlined" style={{ marginRight: 8, fontSize: 20 }}>add_card</span>
          Top Up Credits
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 32 }}>
        {[
          { label: 'Current Balance', value: `₹${balance}`, sub: `~${Math.round(balance * 20)} credits`, subColor: 'var(--success)', note: 'Last top up recently', noteIcon: 'trending_up' },
          { label: 'Total Spent (30d)', value: `₹${totalSpent}`, subColor: 'var(--danger)', note: 'Based on recent calls', noteIcon: 'trending_up' },
          { label: 'Avg. Cost Per Call', value: `₹${avgCostPerCall}`, note: `Based on ${totalCalls} calls`, noteColor: 'var(--text-muted)' },
        ].map((card, i) => (
          <div key={i} className="fade-in-up glass-card" style={{ padding: 24, borderRadius: 12, animationDelay: `${i * 0.1}s` }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 500, margin: '0 0 8px' }}>{card.label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <p style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{card.value}</p>
              {card.sub && (
                <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 700, padding: '2px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: 4 }}>
                  {card.sub}
                </span>
              )}
            </div>
            {card.note && (
              <p style={{ color: card.noteColor || card.subColor || 'var(--text-muted)', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, margin: '8px 0 0' }}>
                {card.noteIcon && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{card.noteIcon}</span>}
                {card.note}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Spend Chart + Quick Top Up */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 32 }}>
        {/* Daily Spend Chart */}
        <div className="fade-in-up glass-card" style={{ padding: 24, borderRadius: 12, animationDelay: '0.3s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Daily Spend History</h3>
            <select style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', padding: '6px 16px 6px 8px' }}>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 180, gap: 8, padding: '0 8px' }}>
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day, i) => {
              const heights = [45, 60, 85, 35, 55, 20, 40];
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div className="chart-bar" style={{
                    width: '100%', height: `${heights[i]}%`, borderRadius: '4px 4px 0 0',
                    background: i === 2 ? 'var(--accent)' : 'rgba(19,91,236,0.2)',
                    transition: 'all 0.3s', cursor: 'pointer'
                  }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Top Up */}
        <div className="fade-in-up glass-card" style={{ padding: 24, borderRadius: 12, animationDelay: '0.35s' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>Quick Top Up</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 8, border: '1px solid var(--accent)', background: 'rgba(19,91,236,0.05)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>credit_card</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Payment Method</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>UPI / Card</p>
              </div>
            </div>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: 20 }}>check_circle</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', margin: '0 0 8px' }}>Select Amount</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {['₹50', '₹100', '₹250', 'Custom'].map(amt => (
              <button key={amt} onClick={() => setSelectedAmount(amt)} style={{
                padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
                border: selectedAmount === amt ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: selectedAmount === amt ? 'var(--accent)' : 'transparent',
                color: selectedAmount === amt ? 'white' : 'var(--text-primary)'
              }}>{amt}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Call Usage History Table */}
      <div className="fade-in-up glass-card" style={{ borderRadius: 12, padding: 24, animationDelay: '0.4s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Call Usage History</h3>
          <button style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
            Export CSV <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Agent / Call ID', 'Date & Time', 'Duration', 'Cost', 'Status'].map(h => (
                  <th key={h} style={{ padding: '16px 0', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No call data yet</td></tr>
              ) : calls.map((call, i) => (
                <tr key={call._id || i} className="table-row-hover" style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: 18 }}>support_agent</span>
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{call.phoneNumber || 'AI Agent'}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>#{call._id?.slice(-6) || 'N/A'}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 0', fontSize: 14 }}>{call.createdAt ? new Date(call.createdAt).toLocaleString() : 'N/A'}</td>
                  <td style={{ padding: '16px 0', fontSize: 14, fontWeight: 500 }}>{call.durationSec ? `${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s` : '0s'}</td>
                  <td style={{ padding: '16px 0', fontSize: 14, fontWeight: 700 }}>₹{call.costRs?.toFixed(2) || '0.00'}</td>
                  <td style={{ padding: '16px 0' }}>
                    <span style={{
                      display: 'inline-flex', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 500,
                      background: call.status === 'completed' ? 'rgba(16,185,129,0.1)' : call.status === 'failed' ? 'rgba(239,68,68,0.1)' : 'var(--bg-hover)',
                      color: call.status === 'completed' ? 'var(--success)' : call.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)'
                    }}>{call.status || 'Unknown'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {calls.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button style={{ padding: '8px 16px', fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Load more history
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

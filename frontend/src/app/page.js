"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Phone, IndianRupee, CheckCircle, PhoneCall, Hash,
  Copy, Eye, EyeOff, Zap, PhoneForwarded, ExternalLink
} from 'lucide-react';

const API_BASE = '/api/v1';

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendOffline, setBackendOffline] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const [mRes, cRes] = await Promise.all([
          fetch(`${API_BASE}/metrics`).catch(() => null),
          fetch(`${API_BASE}/calls?perPage=5`).catch(() => null)
        ]);

        if (!mRes && !cRes) {
          setBackendOffline(true);
          return;
        }

        if (mRes && mRes.ok) {
          const text = await mRes.text();
          try {
            const mData = JSON.parse(text);
            if (mData.ok) setMetrics(mData.data);
          } catch { /* non-JSON response */ }
        }

        if (cRes && cRes.ok) {
          const text = await cRes.text();
          try {
            const cData = JSON.parse(text);
            if (cData.ok) setRecentCalls(cData.data);
          } catch { /* non-JSON response */ }
        }
      } catch (err) {
        console.error('Dashboard load error', err);
        setBackendOffline(true);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        Loading dashboard...
      </div>
    );
  }

  const callsMade = metrics?.callsStarted || 0;
  const successRate = metrics?.successRate || '0%';
  const totalSpent = '₹0';

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
          ⚠️ Backend server is offline. Start your backend on port 3000 to see live data.
        </div>
      )}

      {/* ── KPI STAT CARDS ── */}
      <div className="kpi-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Calls Made</span>
            <div className="stat-card-icon blue">
              <Phone size={18} />
            </div>
          </div>
          <div className="stat-card-value">{callsMade}</div>
          <div className="stat-card-change">
            <span className="change-dash">—</span> vs previous period
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Total Spent</span>
            <div className="stat-card-icon green">
              <IndianRupee size={18} />
            </div>
          </div>
          <div className="stat-card-value">{totalSpent}</div>
          <div className="stat-card-change">
            <span className="change-dash">—</span> vs previous period
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Success Rate</span>
            <div className="stat-card-icon green">
              <CheckCircle size={18} />
            </div>
          </div>
          <div className="stat-card-value">{successRate}</div>
          <div className="stat-card-change">
            <span className="change-dash">—</span> vs previous period
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Completed Calls</span>
            <div className="stat-card-icon red">
              <PhoneCall size={18} />
            </div>
          </div>
          <div className="stat-card-value">{metrics?.callsCompleted || 0}</div>
          <div className="stat-card-change">
            <span className="change-dash">—</span> vs previous period
          </div>
          <Link href="/clients" className="stat-card-link">
            View logs <ExternalLink size={12} />
          </Link>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Active Numbers</span>
            <div className="stat-card-icon purple">
              <Hash size={18} />
            </div>
          </div>
          <div className="stat-card-value">1</div>
          <div className="stat-card-change">
            <span className="change-dash">—</span> vs previous period
          </div>
        </div>
      </div>

      {/* ── USAGE & COST ── */}
      <div className="card-grid-2">
        <div className="card">
          <h3>Usage Overview</h3>
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No data available
          </div>
        </div>
        <div className="card">
          <h3>Cost Analysis</h3>
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No data available
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
                <div className="chart-legend-dot blue"></div>
                <span>Outbound</span>
              </div>
            </div>
          </div>
        </div>
        <div className="chart-area">
          {recentCalls.length === 0 ? 'No call data available yet' : `${recentCalls.length} recent calls recorded`}
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
            background: 'linear-gradient(180deg, var(--accent-light) 0%, #ffffff 100%)', borderRadius: 8
          }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🏠</div>
              <div style={{ fontSize: 12 }}>India Region</div>
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

      {/* ── RECENT ACTIVITY TABLE ── */}
      {recentCalls.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 8 }}>RECENT ACTIVITY</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map(call => (
                  <tr key={call._id}>
                    <td>{new Date(call.createdAt).toLocaleString()}</td>
                    <td>{call.phoneNumber}</td>
                    <td>
                      <span className={`status-badge status-${call.status}`}>{call.status}</span>
                    </td>
                    <td>{call.durationSec}s</td>
                    <td>
                      <Link href={`/clients/${encodeURIComponent(call.phoneNumber)}`} className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12 }}>
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

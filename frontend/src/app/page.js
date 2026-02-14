"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_BASE = '/api/v1';

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [mRes, cRes] = await Promise.all([
          fetch(`${API_BASE}/metrics`),
          fetch(`${API_BASE}/calls?perPage=5`)
        ]);

        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData.ok) setMetrics(mData.data);
        } else {
          console.error('Metrics fetch failed', mRes.status);
        }

        if (cRes.ok) {
          const cData = await cRes.json();
          if (cData.ok) setRecentCalls(cData.data);
        } else {
          console.error('Calls fetch failed', cRes.status);
        }
      } catch (err) {
        console.error('Dashboard load error', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <div className="p-8 text-center text-secondary">Loading dashboard...</div>;

  return (
    <div>
      <div className="header-actions">
        <h1>Dashboard Overview</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/clients" className="btn btn-primary">
            <span>View Clients</span>
          </Link>
          <Link href="/csv" className="btn btn-outline">
            <span>Upload Data</span>
          </Link>
        </div>
      </div>

      {metrics && (
        <div className="kpi-grid">
          <div className="card">
            <h3>Total Calls</h3>
            <div className="value">{metrics.callsStarted}</div>
            <div className="subtext">
              <span className="text-success">{metrics.callsCompleted} completed</span>
              <span style={{ margin: '0 0.5rem', opacity: 0.3 }}>|</span>
              <span className="text-danger">{metrics.callsFailed} failed</span>
            </div>
          </div>
          <div className="card">
            <h3>Success Rate</h3>
            <div className="value">{metrics.successRate || '0%'}</div>
            <div className="subtext">
              Based on completed calls
            </div>
          </div>
          <div className="card">
            <h3>Avg Duration</h3>
            <div className="value">{typeof metrics.avgCallDurationSec === 'number' ? metrics.avgCallDurationSec.toFixed(1) : metrics.avgCallDurationSec}s</div>
            <div className="subtext">Target: 60s</div>
          </div>
          <div className="card">
            <h3>Active Clients</h3>
            <div className="value">{metrics.totalClients || 0}</div>
            <div className="subtext">Unique phone numbers</div>
          </div>
        </div>
      )}

      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Recent Activity</h2>
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
                  <span className={`status-badge status-${call.status}`}>
                    {call.status}
                  </span>
                </td>
                <td>{call.durationSec}s</td>
                <td>
                  <Link
                    href={`/clients/${encodeURIComponent(call.phoneNumber)}`}
                    className="btn btn-outline"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', minHeight: 'auto' }}
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))}
            {recentCalls.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  No recent activity found. Start a campaign or upload numbers.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

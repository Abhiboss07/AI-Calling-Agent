'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  Phone,
  Clock,
  IndianRupee,
  ArrowDownRight,
  ArrowUpRight,
  PieChart,
  BarChart3,
  Activity,
  Calendar
} from 'lucide-react';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { API_BASE, getAuthHeaders } from '../../lib/api';

// Chart component using SVG
function PieChartComponent({ data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = 0;
  
  return (
    <div className="pie-chart-container">
      <svg viewBox="0 0 100 100" className="pie-chart">
        {data.map((item, index) => {
          const angle = (item.value / total) * 360;
          const startAngle = currentAngle;
          currentAngle += angle;
          const endAngle = currentAngle;
          
          const startRad = (startAngle * Math.PI) / 180;
          const endRad = (endAngle * Math.PI) / 180;
          
          const x1 = 50 + 40 * Math.cos(startRad);
          const y1 = 50 + 40 * Math.sin(startRad);
          const x2 = 50 + 40 * Math.cos(endRad);
          const y2 = 50 + 40 * Math.sin(endRad);
          
          const largeArc = angle > 180 ? 1 : 0;
          
          return (
            <path
              key={index}
              d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={item.color}
              stroke="#fff"
              strokeWidth="2"
            />
          );
        })}
        <circle cx="50" cy="50" r="20" fill="#fff" />
      </svg>
      <div className="pie-legend">
        {data.map((item, index) => (
          <div key={index} className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: item.color }} />
            <span className="legend-label">{item.label}</span>
            <span className="legend-value">₹{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChartComponent({ data }) {
  const maxValue = Math.max(...data.map(d => d.value));
  
  return (
    <div className="bar-chart-container">
      <div className="bar-chart">
        {data.map((item, index) => (
          <div key={index} className="bar-item">
            <div className="bar-wrapper">
              <div 
                className="bar" 
                style={{ 
                  height: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: item.color || '#3b82f6'
                }}
              />
            </div>
            <span className="bar-label">{item.label}</span>
            <span className="bar-value">₹{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRelativeTime(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function WalletPage() {
  const { connected, metrics } = useWebSocket();
  const [walletData, setWalletData] = useState({
    currentBalance: 0,
    totalSpend: 0,
    previousPeriodSpend: 0,
    dailyAverage: 0,
    totalCalls: 0,
    totalMinutes: 0,
    successRate: 0,
    spendChange: 0
  });
  const [spendingCategories, setSpendingCategories] = useState([]);
  const [dailyBreakdown, setDailyBreakdown] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch wallet data from API
  useEffect(() => {
    let mounted = true;
    
    const fetchWalletData = async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/wallet`, {
          headers: getAuthHeaders(),
          cache: 'no-store'
        });
        
        if (!res.ok) throw new Error('Failed to fetch wallet data');
        
        const data = await res.json();
        if (!mounted) return;
        
        if (data?.ok && data?.data) {
          setWalletData(data.data);
          setSpendingCategories(data.data.spendingCategories || []);
          setDailyBreakdown(data.data.dailyBreakdown || []);
          setTransactions(data.data.transactions || []);
        }
      } catch (err) {
        console.error('Wallet fetch error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchWalletData();
    const interval = setInterval(fetchWalletData, 30000); // Refresh every 30s
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Real-time updates from WebSocket
  useEffect(() => {
    if (!metrics?.totalCalls) return;
    
    // Update call count in real-time
    setWalletData(prev => ({
      ...prev,
      totalCalls: metrics.totalCalls || prev.totalCalls
    }));
  }, [metrics]);

  const isSpendReduced = walletData.spendChange < 0;

  return (
    <div className="wallet-page">
      <section className="wallet-header fade-in-up">
        <div>
          <p className="section-label">BILLING & USAGE</p>
          <h1 className="page-title">Wallet Dashboard</h1>
          <p className="text-secondary">Monitor your balance, spending, and usage analytics in real-time.</p>
        </div>
        <div className={`realtime-connection ${connected ? 'online' : 'offline'}`}>
          <span className="dot" />
          {connected ? 'Live Updates' : 'Disconnected'}
        </div>
      </section>

      {/* Balance & Spend Overview */}
      <div className="wallet-grid">
        <div className="wallet-card balance-card fade-in-up delay-1">
          <div className="wallet-card-header">
            <div className="wallet-icon balance">
              <Wallet size={24} />
            </div>
            <div>
              <p className="wallet-label">Current Balance</p>
              <h2 className="wallet-value">₹{walletData.currentBalance.toFixed(2)}</h2>
            </div>
          </div>
          <button className="add-balance-btn">
              + Add Balance
            </button>
        </div>

        <div className="wallet-card spend-card fade-in-up delay-2">
          <div className="wallet-card-header">
            <div className="wallet-icon spend">
              <IndianRupee size={24} />
            </div>
            <div>
              <p className="wallet-label">Total Spend</p>
              <h2 className="wallet-value">₹{walletData.totalSpend.toFixed(0)}</h2>
            </div>
          </div>
          <div className="spend-change">
            <span className={`change-badge ${isSpendReduced ? 'positive' : 'negative'}`}>
              {isSpendReduced ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
              {Math.abs(walletData.spendChange)}%
            </span>
            <span className="change-text">vs previous period</span>
          </div>
        </div>
      </div>

      {/* Usage Analytics */}
      <section className="analytics-section fade-in-up delay-3">
        <h3 className="section-title">
          <Activity size={18} />
          Usage Analytics
          <span className="date-range">Feb 28, 2026 - Feb 28, 2026</span>
        </h3>
        
        <div className="analytics-grid">
          <div className="analytics-card">
            <div className="analytics-icon blue">
              <TrendingDown size={18} />
            </div>
            <div>
              <p className="analytics-value">₹{walletData.totalSpend.toFixed(0)}</p>
              <p className="analytics-label">Total Spend</p>
              <span className={`analytics-change ${isSpendReduced ? 'positive' : 'negative'}`}>
                {isSpendReduced ? '↓' : '↑'} {Math.abs(walletData.spendChange)}% vs prev period
              </span>
            </div>
          </div>

          <div className="analytics-card">
            <div className="analytics-icon purple">
              <Calendar size={18} />
            </div>
            <div>
              <p className="analytics-value">₹{walletData.dailyAverage}</p>
              <p className="analytics-label">Daily Average</p>
              <span className="analytics-sub">per day in period</span>
            </div>
          </div>

          <div className="analytics-card">
            <div className="analytics-icon green">
              <Phone size={18} />
            </div>
            <div>
              <p className="analytics-value">{walletData.totalCalls}</p>
              <p className="analytics-label">Total Calls</p>
              <span className="analytics-change positive">
                {walletData.successRate}% success
              </span>
            </div>
          </div>

          <div className="analytics-card">
            <div className="analytics-icon orange">
              <Clock size={18} />
            </div>
            <div>
              <p className="analytics-value">0h {walletData.totalMinutes}m</p>
              <p className="analytics-label">Total Minutes</p>
              <span className="analytics-sub">1m avg</span>
            </div>
          </div>
        </div>
      </section>

      {/* Charts Section */}
      <div className="charts-grid">
        {/* Spending Categories */}
        <section className="chart-card fade-in-up delay-4">
          <h3 className="chart-title">
            <PieChart size={18} />
            Spending Categories
          </h3>
          <PieChartComponent data={spendingCategories} />
        </section>

        {/* Daily Breakdown */}
        <section className="chart-card fade-in-up delay-4">
          <h3 className="chart-title">
            <BarChart3 size={18} />
            Daily Breakdown
          </h3>
          <BarChartComponent data={dailyBreakdown} />
        </section>
      </div>

      {/* Recent Transactions */}
      <section className="transactions-card fade-in-up delay-5">
        <div className="transactions-header">
          <h3>Recent Transactions</h3>
          <button className="see-all-btn">See all →</button>
        </div>
        
        <div className="transactions-list">
          {transactions.map((tx) => (
            <div key={tx.id} className="transaction-item">
              <div className="transaction-icon">
                {tx.type === 'call' && <Phone size={16} />}
                {tx.type === 'stream' && <Activity size={16} />}
                {tx.type === 'fee' && <ArrowDownRight size={16} />}
              </div>
              <div className="transaction-details">
                <p className="transaction-description">{tx.description}</p>
                <p className="transaction-meta">
                  {tx.duration && <span>{tx.duration}</span>}
                  <span>{formatRelativeTime(tx.time)}</span>
                </p>
              </div>
              <div className="transaction-amount negative">
                -₹{Math.abs(tx.amount).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <style jsx>{`
        .wallet-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px;
        }

        .wallet-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .section-label {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .page-title {
          font-size: 28px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 8px;
        }

        .text-secondary {
          color: #6b7280;
          font-size: 14px;
        }

        .realtime-connection {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 500;
          padding: 8px 16px;
          border-radius: 20px;
          background: #f3f4f6;
        }

        .realtime-connection.online {
          background: #d1fae5;
          color: #065f46;
        }

        .realtime-connection .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .wallet-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .wallet-card {
          background: #fff;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          border: 1px solid #e5e7eb;
        }

        .wallet-card-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .wallet-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .wallet-icon.balance {
          background: #fef3c7;
          color: #d97706;
        }

        .wallet-icon.spend {
          background: #dbeafe;
          color: #2563eb;
        }

        .wallet-label {
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 4px;
        }

        .wallet-value {
          font-size: 32px;
          font-weight: 700;
          color: #111827;
        }

        .add-balance-btn {
          width: 100%;
          padding: 12px;
          background: #f97316;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .add-balance-btn:hover {
          background: #ea580c;
        }

        .spend-change {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .change-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .change-badge.positive {
          background: #d1fae5;
          color: #065f46;
        }

        .change-badge.negative {
          background: #fee2e2;
          color: #dc2626;
        }

        .change-text {
          font-size: 13px;
          color: #6b7280;
        }

        .analytics-section {
          background: #fff;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          border: 1px solid #e5e7eb;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 20px;
        }

        .date-range {
          margin-left: auto;
          font-size: 13px;
          color: #6b7280;
          font-weight: 400;
        }

        .analytics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .analytics-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          background: #f9fafb;
          border-radius: 12px;
        }

        .analytics-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .analytics-icon.blue {
          background: #dbeafe;
          color: #2563eb;
        }

        .analytics-icon.purple {
          background: #e9d5ff;
          color: #7c3aed;
        }

        .analytics-icon.green {
          background: #d1fae5;
          color: #059669;
        }

        .analytics-icon.orange {
          background: #ffedd5;
          color: #ea580c;
        }

        .analytics-value {
          font-size: 20px;
          font-weight: 700;
          color: #111827;
        }

        .analytics-label {
          font-size: 13px;
          color: #6b7280;
          margin-top: 2px;
        }

        .analytics-change {
          font-size: 12px;
          font-weight: 500;
          margin-top: 4px;
        }

        .analytics-change.positive {
          color: #059669;
        }

        .analytics-change.negative {
          color: #dc2626;
        }

        .analytics-sub {
          font-size: 12px;
          color: #9ca3af;
          margin-top: 4px;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .chart-card {
          background: #fff;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          border: 1px solid #e5e7eb;
        }

        .chart-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 20px;
        }

        .pie-chart-container {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .pie-chart {
          width: 150px;
          height: 150px;
          transform: rotate(-90deg);
        }

        .pie-legend {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }

        .legend-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .legend-label {
          flex: 1;
          color: #374151;
        }

        .legend-value {
          font-weight: 600;
          color: #111827;
        }

        .bar-chart-container {
          padding: 16px 0;
        }

        .bar-chart {
          display: flex;
          align-items: flex-end;
          gap: 16px;
          height: 150px;
        }

        .bar-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .bar-wrapper {
          width: 40px;
          height: 120px;
          background: #f3f4f6;
          border-radius: 8px;
          position: relative;
          overflow: hidden;
        }

        .bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          border-radius: 8px;
          transition: height 0.3s ease;
        }

        .bar-label {
          font-size: 12px;
          color: #6b7280;
        }

        .bar-value {
          font-size: 12px;
          font-weight: 600;
          color: #111827;
        }

        .transactions-card {
          background: #fff;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          border: 1px solid #e5e7eb;
        }

        .transactions-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .transactions-header h3 {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        .see-all-btn {
          font-size: 13px;
          color: #f97316;
          background: none;
          border: none;
          cursor: pointer;
          font-weight: 500;
        }

        .transactions-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .transaction-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f9fafb;
          border-radius: 10px;
        }

        .transaction-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: #fee2e2;
          color: #dc2626;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .transaction-details {
          flex: 1;
        }

        .transaction-description {
          font-size: 14px;
          font-weight: 500;
          color: #111827;
        }

        .transaction-meta {
          font-size: 12px;
          color: #6b7280;
          margin-top: 2px;
          display: flex;
          gap: 8px;
        }

        .transaction-amount {
          font-size: 14px;
          font-weight: 600;
        }

        .transaction-amount.negative {
          color: #dc2626;
        }

        .fade-in-up {
          animation: fadeInUp 0.5s ease-out;
        }

        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
        .delay-3 { animation-delay: 0.3s; }
        .delay-4 { animation-delay: 0.4s; }
        .delay-5 { animation-delay: 0.5s; }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 768px) {
          .wallet-grid {
            grid-template-columns: 1fr;
          }
          
          .charts-grid {
            grid-template-columns: 1fr;
          }
          
          .analytics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

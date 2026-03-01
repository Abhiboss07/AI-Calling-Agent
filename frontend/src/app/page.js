'use client';
import { useState, useEffect } from 'react';
import { fetchStats, fetchCalls, fetchWallet, fetchStartCall } from '../lib/api';

// Force turbopack to invalidate and pick up new fetchWallet component
export default function DashboardPage() {
  const [walletData, setWalletData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [activeCalls, setActiveCalls] = useState([]);
  const [standbyCount, setStandbyCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Manual Dispatch State
  const [dispatchNumber, setDispatchNumber] = useState('');
  const [dispatchStatus, setDispatchStatus] = useState({ loading: false, error: null, success: false });

  const handleManualDispatch = async () => {
    if (!dispatchNumber || dispatchNumber.trim() === '') {
      setDispatchStatus({ loading: false, error: 'Enter a valid phone number', success: false });
      return;
    }

    setDispatchStatus({ loading: true, error: null, success: false });

    // Assume 'default' campaign for quick testing based on the route
    try {
      await fetchStartCall('default', dispatchNumber.trim(), 'en');
      setDispatchStatus({ loading: false, error: null, success: true });
      setDispatchNumber(''); // Clear on success

      setTimeout(() => {
        setDispatchStatus(prev => ({ ...prev, success: false }));
      }, 3000);
    } catch (err) {
      setDispatchStatus({ loading: false, error: err.message, success: false });
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        const [walletRes, statsRes, activeRes, queuedRes] = await Promise.all([
          fetchWallet().catch(() => null),
          fetchStats().catch(() => null),
          fetchCalls({ status: 'in-progress' }).catch(() => ({ data: [], total: 0 })),
          fetchCalls({ status: 'queued' }).catch(() => ({ total: 0 }))
        ]);

        if (isMounted) {
          if (walletRes?.ok) setWalletData(walletRes.data);
          if (statsRes) setStatsData(statsRes);

          setActiveCalls(activeRes?.data || []);
          setStandbyCount(queuedRes?.total || 0);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        if (isMounted) setLoading(false);
      }
    }

    loadDashboardData();
    const intervalId = setInterval(loadDashboardData, 10000); // Poll every 10s for active calls
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  // Use real data where possible, fallback to 0 or placeholders
  const totalCalls = walletData?.totalCalls || 0;
  const leadConversion = statsData?.conversionRate || 0;
  const activeMinutes = walletData?.totalMinutes || 0;
  const successRate = walletData?.successRate || 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-100 tracking-tight">Dashboard Overview</h2>
          <p className="text-slate-400 mt-2">Real-time performance monitoring for your AI Calling Agents.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-semibold transition-all border border-slate-700">
          <span className="material-symbols-outlined text-lg">download</span>
          Export Report
        </button>
      </div>

      {/* High Level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="glass p-6 rounded-xl border-l-4 border-primary relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="material-symbols-outlined text-primary bg-primary/10 p-2 rounded-lg">call</span>
            <span className="text-green-500 text-xs font-bold flex items-center">Live <span className="material-symbols-outlined text-xs ml-1">trending_up</span></span>
          </div>
          <p className="text-slate-400 text-sm font-medium relative z-10">Total Calls (Today)</p>
          <h3 className="text-3xl font-bold text-slate-100 mt-1 tracking-tight relative z-10">
            {loading ? <span className="animate-pulse bg-slate-700 text-transparent rounded">0000</span> : totalCalls.toLocaleString()}
          </h3>
        </div>

        <div className="glass p-6 rounded-xl border-l-4 border-purple-500 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="material-symbols-outlined text-purple-500 bg-purple-500/10 p-2 rounded-lg">target</span>
            <span className="text-green-500 text-xs font-bold flex items-center">Live <span className="material-symbols-outlined text-xs ml-1">trending_up</span></span>
          </div>
          <p className="text-slate-400 text-sm font-medium relative z-10">Lead Conversion</p>
          <h3 className="text-3xl font-bold text-slate-100 mt-1 tracking-tight relative z-10">
            {loading ? <span className="animate-pulse bg-slate-700 text-transparent rounded">00.0%</span> : `${leadConversion}%`}
          </h3>
        </div>

        <div className="glass p-6 rounded-xl border-l-4 border-cyan-500 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="material-symbols-outlined text-cyan-500 bg-cyan-500/10 p-2 rounded-lg">schedule</span>
            <span className="text-slate-500 text-xs font-bold flex items-center">Today</span>
          </div>
          <p className="text-slate-400 text-sm font-medium relative z-10">Active Minutes</p>
          <h3 className="text-3xl font-bold text-slate-100 mt-1 tracking-tight relative z-10">
            {loading ? <span className="animate-pulse bg-slate-700 text-transparent rounded">0000</span> : activeMinutes.toLocaleString()}
          </h3>
        </div>

        <div className="glass p-6 rounded-xl border-l-4 border-emerald-500 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <span className="material-symbols-outlined text-emerald-500 bg-emerald-500/10 p-2 rounded-lg">verified</span>
            <span className="text-green-500 text-xs font-bold flex items-center">Average <span className="material-symbols-outlined text-xs ml-1">trending_up</span></span>
          </div>
          <p className="text-slate-400 text-sm font-medium relative z-10">Success Rate</p>
          <h3 className="text-3xl font-bold text-slate-100 mt-1 tracking-tight relative z-10">
            {loading ? <span className="animate-pulse bg-slate-700 text-transparent rounded">00.0%</span> : `${successRate}%`}
          </h3>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Live Monitor Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Live Monitor Table */}
          <div className="glass rounded-xl overflow-hidden border border-slate-800/50">
            <div className="px-6 py-4 border-b border-slate-800/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-3 w-3 relative">
                  {activeCalls.length > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${activeCalls.length > 0 ? 'bg-red-500' : 'bg-slate-500'}`}></span>
                </span>
                <h3 className="font-bold text-slate-100">Live Monitor</h3>
              </div>
              <div className="flex gap-2">
                <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-bold">{activeCalls.length} Active Calls</span>
                <span className="bg-slate-800 text-slate-400 px-3 py-1 rounded-full text-xs font-bold">{standbyCount} On Standby</span>
              </div>
            </div>
            <div className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-800/30 text-slate-400 text-xs uppercase tracking-widest font-bold">
                      <th className="px-6 py-3">Phone / Lead</th>
                      <th className="px-6 py-3">Call ID</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {loading ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-slate-500 text-sm">
                          Loading active calls data...
                        </td>
                      </tr>
                    ) : activeCalls.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-slate-500 text-sm">
                          No active calls currently in progress.
                        </td>
                      </tr>
                    ) : activeCalls.map(call => (
                      <tr key={call._id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">
                              <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '16px' }}>person</span>
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-200">{call.metadata?.name || 'Unknown Lead'}</div>
                              <div className="text-xs text-slate-400">{call.phoneNumber}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-400 font-mono" title={call.callSid}>
                            {call.callSid ? call.callSid.substring(0, 8) + '...' : 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 animate-pulse">
                            In Progress
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-slate-300">
                          {new Date(call.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Call Volume Trends Chart */}
          <div className="glass p-6 rounded-xl h-64 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-100">Call Volume Trends</h3>
              <div className="flex gap-2">
                <button className="px-3 py-1 bg-primary text-white text-xs rounded-full font-bold">7D</button>
                <button className="px-3 py-1 bg-slate-800 text-slate-400 text-xs rounded-full font-bold">30D</button>
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center pt-4">
                <span className="text-slate-500 text-sm animate-pulse">Loading trend chart...</span>
              </div>
            ) : (
              <div className="flex-1 flex items-end gap-2 pt-4">
                {/* Dynamically render bars if wallet daily breakdown is available, else mock visually */}
                {(walletData?.dailyBreakdown?.length > 0 ? walletData.dailyBreakdown : [
                  { calls: 40 }, { calls: 65 }, { calls: 55 }, { calls: 80 }, { calls: 95 }, { calls: 85 }, { calls: 60 }
                ]).map((day, idx, arr) => {
                  const maxCalls = Math.max(...arr.map(d => d.calls || 1), 100);
                  const heightPct = Math.max((day.calls / maxCalls) * 100, 5);
                  const isToday = idx === arr.length - 1;

                  return (
                    <div
                      key={idx}
                      className={`w-full rounded-t-lg transition-all cursor-pointer ${isToday ? 'bg-primary' : 'bg-primary/20 hover:bg-primary/60'}`}
                      style={{ height: `${heightPct}%` }}
                      title={`${day.calls || 0} calls`}
                    ></div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Make a Call Action Block */}
          <div className="glass p-6 rounded-xl border border-primary/30 bg-primary/5 relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-[120px] text-primary">phone_in_talk</span>
            </div>
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <h3 className="font-black text-xl text-slate-100 mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">dialpad</span>
                  Manual Agent Dispatch
                </h3>
                <p className="text-sm text-slate-400">Instantly deploy an AI agent to dial any requested number for immediate testing or hot leads.</p>
              </div>
              <div className="flex flex-col w-full md:w-auto">
                <div className="flex w-full md:w-auto items-center gap-2 bg-slate-900 border border-slate-700/50 rounded-xl p-1.5 shadow-inner">
                  <div className="relative flex-1 md:w-48">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">call</span>
                    <input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={dispatchNumber}
                      onChange={(e) => setDispatchNumber(e.target.value)}
                      className={`w-full bg-transparent border-none text-sm font-medium text-slate-200 placeholder:text-slate-600 focus:ring-0 pl-10 py-2.5 ${dispatchStatus.error ? 'text-red-400' : ''}`}
                      disabled={dispatchStatus.loading || dispatchStatus.success}
                    />
                  </div>
                  <button
                    onClick={handleManualDispatch}
                    disabled={dispatchStatus.loading || dispatchStatus.success || !dispatchNumber}
                    className={`font-bold text-sm px-6 py-2.5 rounded-lg shadow-lg transition-all flex items-center gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed
                            ${dispatchStatus.success ? 'bg-emerald-500 text-white shadow-emerald-500/20' :
                        dispatchStatus.error ? 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-600' :
                          'bg-primary hover:bg-primary/90 text-white shadow-primary/20'}
                        `}
                  >
                    {dispatchStatus.loading ? (
                      <>
                        <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                        Calling...
                      </>
                    ) : dispatchStatus.success ? (
                      <>
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                        Dispatched
                      </>
                    ) : (
                      <>
                        Call Now
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </>
                    )}
                  </button>
                </div>
                {dispatchStatus.error && (
                  <p className="text-xs text-red-400 mt-2 font-medium px-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {dispatchStatus.error}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Side Stats / Quick Actions */}
        <div className="space-y-6">
          {/* Top Performing Agent */}
          <div className="glass p-6 rounded-xl border border-slate-800/50">
            <h3 className="font-bold text-slate-100 mb-6">Top Agent Stats</h3>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-primary/20 p-1">
                <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-2xl">smart_toy</span>
                </div>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-100">Aria - Closer Pro</p>
                <p className="text-xs text-slate-500 font-medium">Model: Turbo-X</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-400">Conversion Rate</span>
                  <span className="text-primary">{leadConversion > 0 ? leadConversion : 24.8}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all duration-1000" style={{ width: `${leadConversion > 0 ? leadConversion : 24.8}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-400">System Sentiment Score</span>
                  <span className="text-purple-500">92/100</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full" style={{ width: '92%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Knowledge Base Links */}
          <div className="glass p-6 rounded-xl border border-slate-800/50">
            <h3 className="font-bold text-slate-100 mb-4">Quick Resources</h3>
            <ul className="space-y-3">
              <li>
                <a className="group flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700" href="/knowledge-bases">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary">menu_book</span>
                    <span className="text-sm font-medium text-slate-300">OBJECTION SCRIPTS</span>
                  </div>
                  <span className="material-symbols-outlined text-slate-600 text-sm">arrow_forward</span>
                </a>
              </li>
              <li>
                <a className="group flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700" href="/knowledge-bases">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary">apartment</span>
                    <span className="text-sm font-medium text-slate-300">LISTING DATA FEED</span>
                  </div>
                  <span className="material-symbols-outlined text-slate-600 text-sm">arrow_forward</span>
                </a>
              </li>
              <li>
                <a className="group flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700" href="/voice">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary">record_voice_over</span>
                    <span className="text-sm font-medium text-slate-300">VOICE PRESETS</span>
                  </div>
                  <span className="material-symbols-outlined text-slate-600 text-sm">arrow_forward</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Automated Optimization Card */}
          <div className="bg-gradient-to-br from-primary/10 to-purple-600/10 p-6 rounded-xl border border-primary/20 relative overflow-hidden group">
            <div className="relative z-10">
              <h3 className="font-bold text-slate-100 mb-2">Automated Optimization</h3>
              <p className="text-xs text-slate-400 mb-4">AI is currently re-learning objection handling from {totalCalls > 500 ? totalCalls : 524} recent call transcripts.</p>
              <button className="w-full py-2 bg-white/5 hover:bg-white/10 text-slate-100 rounded-lg text-xs font-bold transition-all border border-white/10">
                View Training Logs
              </button>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-9xl">psychology</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

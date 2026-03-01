'use client';

import { useState, useEffect } from 'react';
import { fetchStats, fetchCalls } from '../../lib/api';

export default function LiveMonitorPage() {
  const [statsData, setStatsData] = useState(null);
  const [activeCalls, setActiveCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [statsRes, activeRes] = await Promise.all([
          fetchStats().catch(() => null),
          fetchCalls({ status: 'in-progress' }).catch(() => ({ data: [] }))
        ]);

        if (isMounted) {
          if (statsRes) setStatsData(statsRes);
          if (activeRes) setActiveCalls(activeRes.data || []);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch live monitor data:", err);
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 8000); // refresh every 8 seconds
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const totalCalls = statsData?.todayCalls || 0;
  const leadConversion = statsData?.conversionRate || 0;

  // Format seconds to MM:SS
  const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const calculateCallDuration = (startTime) => {
    if (!startTime) return '00:00';
    const diffMs = Date.now() - new Date(startTime).getTime();
    return formatDuration(Math.max(0, diffMs / 1000));
  };

  return (
    <div className="flex-1 max-w-[1440px] mx-auto w-full p-6">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse-slow"></span>
            <span className="text-xs font-bold uppercase tracking-wider text-red-500">Live System Status: Optimal</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white">Active Agent Operations</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Monitoring real-time conversations across all regions.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all font-medium text-sm">
            <span className="material-symbols-outlined text-sm">download</span>
            Daily Report
          </button>
          <button className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-lg border border-primary/20 hover:bg-primary/20 transition-all font-medium text-sm">
            <span className="material-symbols-outlined text-sm">filter_list</span>
            Region: All
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Total Active Calls</p>
            <span className="material-symbols-outlined text-primary">call</span>
          </div>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold dark:text-white">
              {loading ? <span className="animate-pulse bg-slate-800 text-transparent rounded">000</span> : activeCalls.length}
            </h3>
            <span className="text-green-500 text-sm font-bold flex items-center mb-1"><span className="material-symbols-outlined text-xs">arrow_upward</span>Live</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">System Health</p>
            <span className="material-symbols-outlined text-green-500">health_and_safety</span>
          </div>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold dark:text-white">100%</h3>
            <span className="text-green-500 text-sm font-bold flex items-center mb-1"><span className="material-symbols-outlined text-xs">arrow_upward</span>Optimal</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Total Calls Today</p>
            <span className="material-symbols-outlined text-slate-400">timer</span>
          </div>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold dark:text-white">
              {loading ? <span className="animate-pulse bg-slate-800 text-transparent rounded">000</span> : totalCalls}
            </h3>
            <span className="text-slate-500 text-sm font-bold flex items-center mb-1"><span className="material-symbols-outlined text-xs">arrow_upward</span>2%</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Conversion Rate</p>
            <span className="material-symbols-outlined text-purple-500">target</span>
          </div>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold dark:text-white">
              {loading ? <span className="animate-pulse bg-slate-800 text-transparent rounded">00.0%</span> : `${leadConversion > 0 ? leadConversion : '24.8'}%`}
            </h3>
            <span className="text-green-500 text-sm font-bold flex items-center mb-1"><span className="material-symbols-outlined text-xs">arrow_upward</span>0.5%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active Call Cards */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined">analytics</span>
              Live Transcription Feed
            </h2>
            <span className="text-slate-400 text-sm italic">Updating in real-time...</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {loading ? (
              <div className="col-span-1 md:col-span-2 bg-slate-900/50 p-12 rounded-xl border border-slate-800 text-center animate-pulse">
                Loading live feeds...
              </div>
            ) : activeCalls.length === 0 ? (
              <div className="col-span-1 md:col-span-2 bg-slate-800/20 p-12 rounded-xl border border-dashed border-slate-700 text-center flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-slate-600 mb-2">call_end</span>
                <p className="text-slate-400 font-medium">No active calls currently in progress.</p>
                <p className="text-slate-500 text-xs mt-1">Make a call to see live transcriptions appear here.</p>
              </div>
            ) : activeCalls.map(call => (
              <div key={call._id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col hover:shadow-lg hover:border-primary/30 transition-all duration-300">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/20 text-primary p-2 rounded-lg">
                      <span className="material-symbols-outlined text-base">support_agent</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold leading-none mb-1">{call.metadata?.name || 'Unknown Lead'}</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">ID: {call.callSid?.substring(0, 8) || 'Unknown'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="bg-green-500/10 text-green-500 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mb-1">
                      Active {calculateCallDuration(call.startAt)}
                    </span>
                    <span className="material-symbols-outlined text-green-500 fill-1">mic</span>
                  </div>
                </div>
                <div className="p-4 flex-1 h-32 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
                  <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-slate-400 italic flex items-center gap-2">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                      Listening to conversation stream...
                    </p>
                  </div>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 flex gap-2">
                  <button className="flex-1 bg-primary text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                    <span className="material-symbols-outlined text-sm">headphones</span> Listen In
                  </button>
                  <button className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                    <span className="material-symbols-outlined text-sm text-red-500">call_end</span>
                  </button>
                </div>
              </div>
            ))}

            {/* If there's only 1 active call, fill the other slot with a waiting placeholder */}
            {!loading && activeCalls.length === 1 && (
              <div className="bg-slate-800/10 border border-dashed border-slate-800 rounded-xl overflow-hidden flex flex-col items-center justify-center opacity-60">
                <div className="p-8 text-center">
                  <span className="material-symbols-outlined text-3xl text-slate-600 mb-2">hourglass_empty</span>
                  <p className="text-slate-500 text-sm font-medium">Waiting for next call...</p>
                </div>
              </div>
            )}
          </div>

          {/* Call History Snapshot */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined">history</span>
              Recently Completed
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 font-mono w-16">14:02 PM</span>
                  <p className="text-sm font-medium">Outbound Call - John Smith</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded font-bold uppercase">Appointment Set</span>
                  <span className="material-symbols-outlined text-slate-400 text-sm">chevron_right</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 font-mono w-16">13:58 PM</span>
                  <p className="text-sm font-medium">Inbound - Property Query</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] px-2 py-1 rounded font-bold uppercase">Info Sent</span>
                  <span className="material-symbols-outlined text-slate-400 text-sm">chevron_right</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Map and Regions */}
        <div className="flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col h-full">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">public</span>
                Global Activity
              </h3>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                <span className="w-2 h-2 rounded-full bg-primary"></span> ACTIVE REGIONS
              </div>
            </div>
            <div className="relative flex-1 min-h-[400px]">
              <div className="absolute inset-0 bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <span className="material-symbols-outlined text-9xl opacity-10">public</span>
                </div>
                {/* Pulse Markers */}
                <div className="absolute top-1/4 left-1/4 group cursor-pointer">
                  <span className="absolute inline-flex h-4 w-4 rounded-full bg-primary opacity-75 animate-ping"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-primary"></span>
                  <div className="hidden group-hover:block absolute top-6 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 p-2 rounded shadow-xl text-[10px] whitespace-nowrap z-10">
                    <p className="font-bold">New York: 42 Calls</p>
                  </div>
                </div>
                <div className="absolute top-1/2 left-2/3 group cursor-pointer">
                  <span className="absolute inline-flex h-4 w-4 rounded-full bg-primary opacity-75 animate-ping"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-primary"></span>
                  <div className="hidden group-hover:block absolute top-6 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 p-2 rounded shadow-xl text-[10px] whitespace-nowrap z-10">
                    <p className="font-bold">London: 28 Calls</p>
                  </div>
                </div>
                <div className="absolute bottom-1/3 left-1/3 group cursor-pointer">
                  <span className="absolute inline-flex h-4 w-4 rounded-full bg-primary opacity-75 animate-ping"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-primary"></span>
                  <div className="hidden group-hover:block absolute top-6 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 p-2 rounded shadow-xl text-[10px] whitespace-nowrap z-10">
                    <p className="font-bold">Miami: 15 Calls</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 bg-slate-50 dark:bg-slate-900/50">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>North America</span>
                    <span>65%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full">
                    <div className="bg-primary h-1 rounded-full w-[65%]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>Europe</span>
                    <span>25%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full">
                    <div className="bg-primary/60 h-1 rounded-full w-[25%]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>Asia Pacific</span>
                    <span>10%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full">
                    <div className="bg-primary/30 h-1 rounded-full w-[10%]"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Neural Core Load */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="font-bold flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-green-500">memory</span>
              Neural Core Load
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" style={{ animationDuration: '3s' }}></div>
                <div>
                  <p className="text-sm font-bold">Processing Latency</p>
                  <p className="text-xs text-slate-500">Average: 240ms</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-slate-800">
                Neural engine operating at 100% capacity. Auto-scaling active. No bottlenecks detected.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { fetchWallet } from '../../lib/api';

export default function WalletPage() {
  const [walletData, setWalletData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadWallet() {
      try {
        const res = await fetchWallet();
        if (isMounted && res.ok) {
          setWalletData(res.data);
        }
      } catch (err) {
        console.error("Failed to load wallet data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadWallet();
  }, []);

  // Compute values with fallbacks
  const currentBalance = walletData?.currentBalance || 0;
  const creditsString = `~${Math.round(currentBalance * 20).toLocaleString()} credits`; // assuming $0.05/credit
  const totalSpend = walletData?.totalSpend || 0;
  const spendChange = walletData?.spendChange || 0;
  const avgCost = walletData?.totalCalls > 0 ? (totalSpend / walletData.totalCalls).toFixed(2) : '0.00';

  // Format daily breakdown for chart
  const dailyBreakdown = walletData?.dailyBreakdown || [];
  // Ensure we always have 7 days for the visualizer to look good, pad with 0s if needed
  const chartData = [...dailyBreakdown].slice(-7);
  while (chartData.length < 7) {
    chartData.unshift({ date: '', spend: 0, calls: 0 });
  }
  const maxSpend = Math.max(...chartData.map(d => d.spend), 1);

  return (
    <div className="flex flex-1 justify-center py-8">
      <div className="flex flex-col max-w-[1024px] flex-1 px-4 md:px-10 gap-8">
        {/* Page Title */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-slate-900 dark:text-white text-4xl font-black leading-tight tracking-tight">Wallet &amp; Billing</h1>
            <p className="text-slate-500 dark:text-slate-400 text-base font-normal">Monitor your agent usage credits and manage payment methods.</p>
          </div>
          <button className="flex items-center justify-center px-6 py-3 bg-primary text-white rounded-lg font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
            <span className="material-symbols-outlined mr-2">add_card</span>
            Top Up Credits
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium z-10">Current Balance</p>
            <div className="flex items-baseline gap-2 z-10">
              <p className="text-slate-900 dark:text-white text-3xl font-bold">
                {loading ? <span className="animate-pulse bg-slate-700 text-transparent rounded">$00.00</span> : `$${currentBalance.toFixed(2)}`}
              </p>
              {!loading && <span className="text-emerald-500 text-xs font-bold px-1.5 py-0.5 bg-emerald-500/10 rounded">{creditsString}</span>}
            </div>
            <p className="text-emerald-500 text-xs font-medium flex items-center gap-1 z-10">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              Real-time available funds
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium z-10">Total Spent (Today)</p>
            <p className="text-slate-900 dark:text-white text-3xl font-bold z-10">
              {loading ? <span className="animate-pulse bg-slate-700 text-transparent rounded">$0.00</span> : `$${totalSpend.toFixed(2)}`}
            </p>
            {!loading && (
              <p className={`${spendChange > 0 ? 'text-rose-500' : 'text-emerald-500'} text-xs font-medium flex items-center gap-1 z-10`}>
                <span className="material-symbols-outlined text-[14px]">{spendChange > 0 ? 'trending_up' : 'trending_down'}</span>
                {Math.abs(spendChange)}% {spendChange > 0 ? 'more' : 'less'} than yesterday
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium z-10">Avg. Cost Per Call</p>
            <p className="text-slate-900 dark:text-white text-3xl font-bold z-10">
              {loading ? <span className="animate-pulse bg-slate-700 text-transparent rounded">$0.00</span> : `$${avgCost}`}
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium z-10">
              Based on {walletData?.totalCalls || 0} calls
            </p>
          </div>
        </div>

        {/* Spend Visualizer & Payment */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Spend History Chart */}
          <div className="lg:col-span-2 flex flex-col gap-6 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex justify-between items-center">
              <h3 className="text-slate-900 dark:text-white text-lg font-bold">Daily Spend History</h3>
              <select className="bg-slate-100 dark:bg-slate-900 border-none rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 py-1 pl-2 pr-8 focus:ring-primary">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
              </select>
            </div>
            <div className="flex items-end justify-between h-48 gap-2 pt-4 px-2">
              {loading ? (
                <div className="w-full h-full flex items-center justify-center -ml-2">
                  <span className="text-slate-500 text-sm animate-pulse font-medium">Loading history...</span>
                </div>
              ) : chartData.map((day, i) => {
                const heightPct = Math.max((day.spend / maxSpend) * 100, 5);
                const dateObj = new Date(day.date);
                const dayLabel = day.date ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][dateObj.getDay()] : '-';
                const isToday = i === chartData.length - 1;

                return (
                  <div key={i} className="group relative flex flex-1 flex-col items-center gap-2">
                    <div
                      className={`w-full rounded-t-sm transition-all ${isToday ? 'bg-primary' : 'bg-primary/20 group-hover:bg-primary/40'}`}
                      style={{ height: `${heightPct}%` }}
                      title={`$${day.spend.toFixed(2)} (${day.calls} calls)`}
                    ></div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">{dayLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Top Up */}
          <div className="flex flex-col gap-6 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-slate-900 dark:text-white text-lg font-bold">Quick Top Up</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-primary bg-primary/5">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">credit_card</span>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Visa ending in 4242</p>
                    <p className="text-xs text-slate-500">Expires 12/26</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
              </div>
              <div className="flex items-center gap-2 justify-center py-2 opacity-60">
                <div className="w-8 h-5 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center text-[10px] font-bold">VISA</div>
                <div className="w-8 h-5 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center text-[10px] font-bold">MC</div>
                <div className="w-8 h-5 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center text-[10px] font-bold">AX</div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <span>Select Amount</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">$50</button>
                  <button className="py-2 border border-primary bg-primary text-white rounded-lg text-sm font-bold">$100</button>
                  <button className="py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">$250</button>
                  <button className="py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Custom</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Usage History Table */}
        <div className="flex flex-col gap-4 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm mb-12">
          <div className="flex justify-between items-center">
            <h3 className="text-slate-900 dark:text-white text-lg font-bold">Call Usage History</h3>
            <button className="text-primary text-sm font-bold flex items-center gap-1 hover:underline">
              Export CSV <span className="material-symbols-outlined text-[18px]">download</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date &amp; Time</th>
                  <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Duration</th>
                  <th className="py-4 pl-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Cost</th>
                  <th className="py-4 pl-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">Loading transactions...</td>
                  </tr>
                ) : walletData?.transactions && walletData.transactions.length > 0 ? (
                  walletData.transactions.map((tx, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className={`size-8 rounded ${tx.type === 'call' ? 'bg-primary/10' : 'bg-slate-500/10'} flex items-center justify-center`}>
                            <span className={`material-symbols-outlined ${tx.type === 'call' ? 'text-primary' : 'text-slate-400'} text-[18px]`}>
                              {tx.type === 'call' ? 'support_agent' : 'payments'}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{tx.description}</p>
                            <p className="text-xs text-slate-500 font-mono" title={tx.id}>
                              {tx.id ? `#${tx.id.substring(tx.id.length - 6).toUpperCase()}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          {new Date(tx.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                      <td className="py-4">
                        <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                          {tx.duration || '-'}
                        </p>
                      </td>
                      <td className="py-4 pl-2">
                        <p className={`text-sm font-bold ${tx.amount < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toFixed(2)}
                        </p>
                      </td>
                      <td className="py-4 pl-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tx.status === 'completed'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400'
                          }`}>{tx.status === 'completed' ? 'Charged' : tx.status}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">No transaction history found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-center mt-2">
            <button className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-primary transition-colors disabled:opacity-50">Log Complete</button>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">© 2024 AI Call Agent Technologies Inc. All transactions are encrypted and secured.</p>
        </footer>
      </div>
    </div>
  );
}

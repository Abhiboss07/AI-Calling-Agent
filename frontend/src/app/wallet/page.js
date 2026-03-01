'use client';

export default function WalletPage() {
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
          <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Current Balance</p>
            <div className="flex items-baseline gap-2">
              <p className="text-slate-900 dark:text-white text-3xl font-bold">$425.50</p>
              <span className="text-emerald-500 text-xs font-bold px-1.5 py-0.5 bg-emerald-500/10 rounded">~8,510 credits</span>
            </div>
            <p className="text-emerald-500 text-xs font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              Last top up 2 days ago
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Total Spent (30d)</p>
            <p className="text-slate-900 dark:text-white text-3xl font-bold">$1,240.00</p>
            <p className="text-rose-500 text-xs font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              12% more than last month
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Avg. Cost Per Call</p>
            <p className="text-slate-900 dark:text-white text-3xl font-bold">$0.14</p>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Based on 8,857 calls</p>
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
              {[
                { h: '45%', label: 'MON' },
                { h: '60%', label: 'TUE' },
                { h: '85%', label: 'WED', active: true },
                { h: '35%', label: 'THU' },
                { h: '55%', label: 'FRI' },
                { h: '20%', label: 'SAT' },
                { h: '40%', label: 'SUN' },
              ].map((bar, i) => (
                <div key={i} className="group relative flex flex-1 flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-t-sm ${bar.active ? 'bg-primary' : 'bg-primary/20 group-hover:bg-primary/40'} transition-colors`}
                    style={{ height: bar.h }}
                  ></div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">{bar.label}</span>
                </div>
              ))}
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
        <div className="flex flex-col gap-4 rounded-xl p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
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
                  <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Agent / Call ID</th>
                  <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date &amp; Time</th>
                  <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Duration</th>
                  <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cost</th>
                  <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {[
                  { agent: 'Listing Inquiry Bot', id: '#48592-CL', date: 'Oct 24, 2:15 PM', duration: '4m 32s', cost: '$0.64', status: 'Success' },
                  { agent: 'Listing Inquiry Bot', id: '#48588-CL', date: 'Oct 24, 1:40 PM', duration: '1m 15s', cost: '$0.20', status: 'Success' },
                  { agent: 'Outbound Prospecting', id: '#48582-CL', date: 'Oct 24, 11:12 AM', duration: '0m 45s', cost: '$0.15', status: 'No Answer' },
                  { agent: 'Listing Inquiry Bot', id: '#48575-CL', date: 'Oct 24, 9:05 AM', duration: '8m 10s', cost: '$1.12', status: 'Success' },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded bg-primary/10 flex items-center justify-center">
                          <span className="material-symbols-outlined text-primary text-[18px]">support_agent</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{row.agent}</p>
                          <p className="text-xs text-slate-500">{row.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <p className="text-sm text-slate-700 dark:text-slate-300">{row.date}</p>
                    </td>
                    <td className="py-4">
                      <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{row.duration}</p>
                    </td>
                    <td className="py-4">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{row.cost}</p>
                    </td>
                    <td className="py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.status === 'Success'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400'
                        }`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-center mt-2">
            <button className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-primary transition-colors">Load more history</button>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 py-6 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">© 2024 AI Call Agent Technologies Inc. All transactions are encrypted and secured.</p>
        </footer>
      </div>
    </div>
  );
}

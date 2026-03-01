'use client';

export default function DashboardPage() {
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
        <div className="glass p-6 rounded-xl border-l-4 border-primary">
          <div className="flex justify-between items-start mb-4">
            <span className="material-symbols-outlined text-primary bg-primary/10 p-2 rounded-lg">call</span>
            <span className="text-green-500 text-xs font-bold flex items-center">+12.4% <span className="material-symbols-outlined text-xs">trending_up</span></span>
          </div>
          <p className="text-slate-400 text-sm font-medium">Total Calls</p>
          <h3 className="text-3xl font-bold text-slate-100 mt-1 tracking-tight">12,482</h3>
        </div>

        <div className="glass p-6 rounded-xl border-l-4 border-purple-500">
          <div className="flex justify-between items-start mb-4">
            <span className="material-symbols-outlined text-purple-500 bg-purple-500/10 p-2 rounded-lg">target</span>
            <span className="text-green-500 text-xs font-bold flex items-center">+2.4% <span className="material-symbols-outlined text-xs">trending_up</span></span>
          </div>
          <p className="text-slate-400 text-sm font-medium">Lead Conversion</p>
          <h3 className="text-3xl font-bold text-slate-100 mt-1 tracking-tight">18.5%</h3>
        </div>

        <div className="glass p-6 rounded-xl border-l-4 border-cyan-500">
          <div className="flex justify-between items-start mb-4">
            <span className="material-symbols-outlined text-cyan-500 bg-cyan-500/10 p-2 rounded-lg">schedule</span>
            <span className="text-red-400 text-xs font-bold flex items-center">-5% <span className="material-symbols-outlined text-xs">trending_down</span></span>
          </div>
          <p className="text-slate-400 text-sm font-medium">Active Minutes</p>
          <h3 className="text-3xl font-bold text-slate-100 mt-1 tracking-tight">45,200</h3>
        </div>

        <div className="glass p-6 rounded-xl border-l-4 border-emerald-500">
          <div className="flex justify-between items-start mb-4">
            <span className="material-symbols-outlined text-emerald-500 bg-emerald-500/10 p-2 rounded-lg">verified</span>
            <span className="text-green-500 text-xs font-bold flex items-center">+0.8% <span className="material-symbols-outlined text-xs">trending_up</span></span>
          </div>
          <p className="text-slate-400 text-sm font-medium">Success Rate</p>
          <h3 className="text-3xl font-bold text-slate-100 mt-1 tracking-tight">94.2%</h3>
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
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <h3 className="font-bold text-slate-100">Live Monitor</h3>
              </div>
              <div className="flex gap-2">
                <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-bold">8 Active Calls</span>
                <span className="bg-slate-800 text-slate-400 px-3 py-1 rounded-full text-xs font-bold">12 On Standby</span>
              </div>
            </div>
            <div className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-800/30 text-slate-400 text-xs uppercase tracking-widest font-bold">
                      <th className="px-6 py-3">Lead Name</th>
                      <th className="px-6 py-3">Agent ID</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    <tr className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">RS</div>
                          <div className="text-sm font-semibold text-slate-200">Robert Smith</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-400 font-mono">#RE-772</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                          Negotiating
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-slate-300">04:12</td>
                    </tr>
                    <tr className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">AM</div>
                          <div className="text-sm font-semibold text-slate-200">Alice Miller</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-400 font-mono">#RE-249</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500">
                          Initial Greeting
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-slate-300">01:34</td>
                    </tr>
                    <tr className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">TK</div>
                          <div className="text-sm font-semibold text-slate-200">Thomas Klein</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-400 font-mono">#RE-772</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-500">
                          Qualifying
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-slate-300">08:45</td>
                    </tr>
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
            <div className="flex-1 flex items-end gap-2 pt-4">
              <div className="w-full bg-primary/20 rounded-t-lg h-[40%] hover:bg-primary transition-all cursor-pointer"></div>
              <div className="w-full bg-primary/20 rounded-t-lg h-[65%] hover:bg-primary transition-all cursor-pointer"></div>
              <div className="w-full bg-primary/20 rounded-t-lg h-[55%] hover:bg-primary transition-all cursor-pointer"></div>
              <div className="w-full bg-primary/20 rounded-t-lg h-[80%] hover:bg-primary transition-all cursor-pointer"></div>
              <div className="w-full bg-primary/20 rounded-t-lg h-[95%] hover:bg-primary transition-all cursor-pointer"></div>
              <div className="w-full bg-primary h-[85%] rounded-t-lg"></div>
              <div className="w-full bg-primary/20 rounded-t-lg h-[60%] hover:bg-primary transition-all cursor-pointer"></div>
              <div className="w-full bg-primary/20 rounded-t-lg h-[75%] hover:bg-primary transition-all cursor-pointer"></div>
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
                  <span className="text-primary">24.8%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: '24.8%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-400">Sentiment Score</span>
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
                <a className="group flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700" href="#">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary">menu_book</span>
                    <span className="text-sm font-medium text-slate-300">OBJECTION SCRIPTS</span>
                  </div>
                  <span className="material-symbols-outlined text-slate-600 text-sm">arrow_forward</span>
                </a>
              </li>
              <li>
                <a className="group flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700" href="#">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary">apartment</span>
                    <span className="text-sm font-medium text-slate-300">LISTING DATA FEED</span>
                  </div>
                  <span className="material-symbols-outlined text-slate-600 text-sm">arrow_forward</span>
                </a>
              </li>
              <li>
                <a className="group flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700" href="#">
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
              <p className="text-xs text-slate-400 mb-4">AI is currently re-learning objection handling from 524 recent call transcripts.</p>
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

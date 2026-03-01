'use client';

export default function LiveMonitorPage() {
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
            <h3 className="text-3xl font-bold dark:text-white">142</h3>
            <span className="text-green-500 text-sm font-bold flex items-center mb-1"><span className="material-symbols-outlined text-xs">arrow_upward</span>12%</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Sentiment Score</p>
            <span className="material-symbols-outlined text-yellow-500">mood</span>
          </div>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold dark:text-white">88%</h3>
            <span className="text-green-500 text-sm font-bold flex items-center mb-1"><span className="material-symbols-outlined text-xs">arrow_upward</span>4%</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Avg. Call Duration</p>
            <span className="material-symbols-outlined text-slate-400">timer</span>
          </div>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold dark:text-white">4:12</h3>
            <span className="text-red-500 text-sm font-bold flex items-center mb-1"><span className="material-symbols-outlined text-xs">arrow_downward</span>2%</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Success Rate</p>
            <span className="material-symbols-outlined text-green-500">check_circle</span>
          </div>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold dark:text-white">92.4%</h3>
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
            {/* Call Card 1 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col hover:shadow-lg hover:border-primary/30 transition-all duration-300">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/20 text-primary p-2 rounded-lg">
                    <span className="material-symbols-outlined text-base">support_agent</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold leading-none mb-1">Agent Alex (Lead Gen)</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">ID: #CALL-49210</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="bg-green-500/10 text-green-500 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mb-1">Active 03:24</span>
                  <span className="material-symbols-outlined text-green-500 fill-1">sentiment_very_satisfied</span>
                </div>
              </div>
              <div className="p-4 flex-1 h-32 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed"><span className="font-bold text-primary mr-1 italic uppercase">Agent:</span> &quot;The property on 5th Ave has been renovated recently. Would you like a viewing?&quot;</p>
                  <p className="text-xs leading-relaxed"><span className="font-bold text-slate-400 mr-1 italic uppercase">Customer:</span> &quot;Yes, I&apos;m very interested in the kitchen area specifically. Is it open plan?&quot;</p>
                  <p className="text-xs leading-relaxed text-slate-400 italic">...transcribing next response...</p>
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

            {/* Call Card 2 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col hover:shadow-lg hover:border-primary/30 transition-all duration-300">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/20 text-primary p-2 rounded-lg">
                    <span className="material-symbols-outlined text-base">smart_toy</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold leading-none mb-1">Agent Sarah (Outbound)</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">ID: #CALL-49215</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mb-1">Active 01:12</span>
                  <span className="material-symbols-outlined text-slate-400">sentiment_neutral</span>
                </div>
              </div>
              <div className="p-4 flex-1 h-32 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed"><span className="font-bold text-primary mr-1 italic uppercase">Agent:</span> &quot;We have several listings that match your criteria. Are you looking to buy or rent?&quot;</p>
                  <p className="text-xs leading-relaxed"><span className="font-bold text-slate-400 mr-1 italic uppercase">Customer:</span> &quot;I&apos;m looking to buy, but my budget is strictly under 1.2M.&quot;</p>
                  <p className="text-xs leading-relaxed"><span className="font-bold text-primary mr-1 italic uppercase">Agent:</span> &quot;Understood. I&apos;m filtering for properties under 1.2M now.&quot;</p>
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

            {/* Call Card 3 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col hover:shadow-lg hover:border-primary/30 transition-all duration-300">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/20 text-primary p-2 rounded-lg">
                    <span className="material-symbols-outlined text-base">support_agent</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold leading-none mb-1">Agent Mike (Follow up)</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">ID: #CALL-49219</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="bg-green-500/10 text-green-500 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mb-1">Active 08:45</span>
                  <span className="material-symbols-outlined text-green-500 fill-1">sentiment_very_satisfied</span>
                </div>
              </div>
              <div className="p-4 flex-1 h-32 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed"><span className="font-bold text-slate-400 mr-1 italic uppercase">Customer:</span> &quot;That sounds exactly like what we need. When can we sign the papers?&quot;</p>
                  <p className="text-xs leading-relaxed"><span className="font-bold text-primary mr-1 italic uppercase">Agent:</span> &quot;Excellent! I will send the digital contract to your email right now.&quot;</p>
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

            {/* Call Card 4 - Dispute */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col hover:shadow-lg border-red-500/30 dark:border-red-500/20 shadow-red-500/5">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-red-50/50 dark:bg-red-950/20 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-red-500/20 text-red-500 p-2 rounded-lg">
                    <span className="material-symbols-outlined text-base">warning</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold leading-none mb-1">Agent Jordan (Dispute)</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">ID: #CALL-49221</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="bg-red-500/10 text-red-500 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase mb-1">Active 05:10</span>
                  <span className="material-symbols-outlined text-red-500 fill-1">sentiment_dissatisfied</span>
                </div>
              </div>
              <div className="p-4 flex-1 h-32 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed"><span className="font-bold text-slate-400 mr-1 italic uppercase">Customer:</span> &quot;I&apos;ve been waiting for three weeks for the callback! This is unacceptable!&quot;</p>
                  <p className="text-xs leading-relaxed"><span className="font-bold text-primary mr-1 italic uppercase">Agent:</span> &quot;I truly apologize for the delay. I am prioritizing your file now to resolve this today.&quot;</p>
                </div>
              </div>
              <div className="p-4 bg-white dark:bg-slate-900 flex gap-2">
                <button className="flex-1 bg-red-500 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                  <span className="material-symbols-outlined text-sm">support</span> Take Over
                </button>
                <button className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                  <span className="material-symbols-outlined text-sm text-red-500">call_end</span>
                </button>
              </div>
            </div>
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

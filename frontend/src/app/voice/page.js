'use client';

export default function VoicePage() {
    return (
        <div className="flex-1 flex flex-col items-center">
            <div className="w-full max-w-[1200px] px-6 py-8">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-2 mb-6">
                    <a className="text-slate-500 dark:text-slate-400 text-sm font-medium hover:text-primary" href="/">Dashboard</a>
                    <span className="material-symbols-outlined text-slate-400 text-sm">chevron_right</span>
                    <span className="text-slate-900 dark:text-slate-100 text-sm font-medium">Voice Configuration</span>
                </div>

                {/* Header Section */}
                <div className="flex flex-col gap-2 mb-10">
                    <h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">Voice Configuration &amp; Preview</h1>
                    <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl">Fine-tune your AI agent&apos;s vocal characteristics for natural consultations and lead nurturing.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Voice Selection */}
                    <div className="lg:col-span-7 flex flex-col gap-6">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-xl font-bold">Premium AI Voices</h2>
                            <button className="text-primary text-sm font-semibold flex items-center gap-1">
                                <span className="material-symbols-outlined text-lg">add</span>
                                Custom Voice
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Voice Card Active */}
                            <div className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-primary/5 p-5 transition-all">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-primary rounded-full text-white">
                                        <span className="material-symbols-outlined">play_arrow</span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-white px-2 py-0.5 rounded">Selected</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">Professional - Sarah</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">Calm, authoritative, and trustworthy. Best for luxury listings.</p>
                                </div>
                            </div>

                            {/* Voice Card 2 */}
                            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 hover:border-primary/50 transition-all cursor-pointer group">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                        <span className="material-symbols-outlined">play_arrow</span>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">Friendly - Mark</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">Energetic, approachable, and helpful. Great for first-time buyers.</p>
                                </div>
                            </div>

                            {/* Voice Card 3 */}
                            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 hover:border-primary/50 transition-all cursor-pointer group">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                        <span className="material-symbols-outlined">play_arrow</span>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">Sophisticated - James</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">Formal, experienced, and precise. Ideal for commercial real estate.</p>
                                </div>
                            </div>

                            {/* Voice Card 4 */}
                            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 hover:border-primary/50 transition-all cursor-pointer group">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                        <span className="material-symbols-outlined">play_arrow</span>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">Warm - Elena</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">Gentle, patient, and inviting. Perfect for rental inquiries.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Visualizer & Controls */}
                    <div className="lg:col-span-5 space-y-6">
                        {/* Visualizer Card */}
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 p-8 flex flex-col items-center justify-center text-center overflow-hidden relative">
                            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent"></div>
                            <div className="flex items-center justify-center gap-1.5 h-24 mb-6 relative z-10">
                                <div className="w-1 bg-primary/40 h-8 rounded-full"></div>
                                <div className="w-1 bg-primary/60 h-16 rounded-full"></div>
                                <div className="w-1 bg-primary h-24 rounded-full"></div>
                                <div className="w-1 bg-primary/80 h-20 rounded-full"></div>
                                <div className="w-1 bg-primary h-28 rounded-full"></div>
                                <div className="w-1 bg-primary/60 h-16 rounded-full"></div>
                                <div className="w-1 bg-primary/40 h-10 rounded-full"></div>
                                <div className="w-1 bg-primary/20 h-6 rounded-full"></div>
                                <div className="w-1 bg-primary/60 h-16 rounded-full"></div>
                                <div className="w-1 bg-primary h-24 rounded-full"></div>
                                <div className="w-1 bg-primary/80 h-20 rounded-full"></div>
                                <div className="w-1 bg-primary/40 h-8 rounded-full"></div>
                            </div>
                            <p className="text-primary font-mono text-xs uppercase tracking-widest mb-2 relative z-10">Live Preview Output</p>
                            <p className="text-white text-sm font-medium italic relative z-10">&quot;Hello, I&apos;m Sarah from AI Call Agent. How can I help you today?&quot;</p>
                        </div>

                        {/* Controls Card */}
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 space-y-8">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Stability</label>
                                    <span className="text-sm font-mono text-primary font-bold">65%</span>
                                </div>
                                <input className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary" type="range" defaultValue="65" />
                                <p className="text-xs text-slate-500">Determines how consistent the voice is across different responses.</p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Clarity + Similarity</label>
                                    <span className="text-sm font-mono text-primary font-bold">82%</span>
                                </div>
                                <input className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary" type="range" defaultValue="82" />
                                <p className="text-xs text-slate-500">Higher values produce clearer output but may reduce emotional range.</p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Speaking Rate</label>
                                    <span className="text-sm font-mono text-primary font-bold">1.0x</span>
                                </div>
                                <input className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary" type="range" min="0.5" max="2" step="0.1" defaultValue="1.0" />
                                <p className="text-xs text-slate-500">Adjust the pace of the agent&apos;s speech for natural conversations.</p>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button className="flex-1 py-3 px-4 border border-slate-200 dark:border-slate-700 rounded-lg font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-lg">settings_backup_restore</span>
                                    Reset
                                </button>
                                <button className="flex-1 py-3 px-4 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-lg">check_circle</span>
                                    Save Profile
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Voice Training Section */}
                <div className="mt-12 p-8 rounded-2xl bg-primary/5 border border-primary/20 flex flex-col md:flex-row items-center gap-8">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold mb-2">Want to use your own voice?</h2>
                        <p className="text-slate-600 dark:text-slate-400">Record or upload a 60-second clip of your voice to create a personalized AI clone. Maintain your personal brand even when you&apos;re busy.</p>
                    </div>
                    <button className="whitespace-nowrap px-8 py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform flex items-center gap-3">
                        <span className="material-symbols-outlined">mic</span>
                        Start Voice Training
                    </button>
                </div>

                {/* Footer */}
                <footer className="mt-12 border-t border-slate-200 dark:border-slate-800 py-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-sm text-slate-500">© 2024 AI Call Agent. All rights reserved.</p>
                        <div className="flex gap-6">
                            <a className="text-sm text-slate-500 hover:text-primary transition-colors" href="#">Documentation</a>
                            <a className="text-sm text-slate-500 hover:text-primary transition-colors" href="#">API Status</a>
                            <a className="text-sm text-slate-500 hover:text-primary transition-colors" href="#">Support</a>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}

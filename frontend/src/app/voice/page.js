'use client';

import { useState } from 'react';

const VOICES = [
    { id: 'v1', name: 'Professional - Sarah', desc: 'Calm, authoritative, and trustworthy. Best for luxury listings.' },
    { id: 'v2', name: 'Friendly - Mark', desc: 'Energetic, approachable, and helpful. Great for first-time buyers.' },
    { id: 'v3', name: 'Sophisticated - James', desc: 'Formal, experienced, and precise. Ideal for commercial real estate.' },
    { id: 'v4', name: 'Warm - Elena', desc: 'Gentle, patient, and inviting. Perfect for rental inquiries.' },
];

export default function VoicePage() {
    const [activeVoice, setActiveVoice] = useState('v1');
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    const handlePlayToggle = (e) => {
        e.stopPropagation();
        setIsPlaying(!isPlaying);
    };

    const handleVoiceSelect = (id) => {
        setActiveVoice(id);
        setIsPlaying(false);
    };

    const handleRecordToggle = () => {
        setIsRecording(!isRecording);
    };

    return (
        <div className="flex-1 flex flex-col items-center pb-12">
            <div className="w-full max-w-[1200px] px-6 py-8">

                {/* Inline Styles for Waveform */}
                <style dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes soundwave {
                        0% { transform: scaleY(0.2); opacity: 0.5; }
                        50% { transform: scaleY(1); opacity: 1; }
                        100% { transform: scaleY(0.2); opacity: 0.5; }
                    }
                    .wave-bar {
                        transform-origin: center bottom;
                        transition: all 0.2s ease;
                    }
                    .wave-playing .wave-bar {
                        animation: soundwave 1.2s infinite ease-in-out alternate;
                    }
                `}} />

                {/* Breadcrumbs */}
                <div className="flex items-center gap-2 mb-6">
                    <a className="text-slate-500 dark:text-slate-400 text-sm font-medium hover:text-primary transition-colors" href="/">Dashboard</a>
                    <span className="material-symbols-outlined text-slate-400 text-sm">chevron_right</span>
                    <span className="text-slate-900 dark:text-slate-100 text-sm font-medium border-b border-primary/30 pb-0.5">Voice Configuration</span>
                </div>

                {/* Header Section */}
                <div className="flex flex-col gap-3 mb-12">
                    <h1 className="text-3xl md:text-5xl font-black leading-tight tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary text-4xl bg-primary/10 p-2 rounded-xl">record_voice_over</span>
                        Voice Config & Preview
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl font-medium ml-[68px]">Fine-tune your AI agent&apos;s vocal characteristics for natural consultations and lead nurturing.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Voice Selection */}
                    <div className="lg:col-span-7 flex flex-col gap-6">
                        <div className="flex items-center justify-between px-2 mb-2">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Premium AI Voices</h2>
                            <button className="text-primary text-sm font-bold flex items-center gap-1 hover:underline underline-offset-4">
                                <span className="material-symbols-outlined text-[18px]">add</span>
                                Custom Voice
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {VOICES.map((voice) => {
                                const isActive = activeVoice === voice.id;
                                return (
                                    <div
                                        key={voice.id}
                                        onClick={() => handleVoiceSelect(voice.id)}
                                        className={`flex flex-col gap-4 rounded-2xl p-6 transition-all duration-300 cursor-pointer border-2 ${isActive
                                                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-primary/40'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <button
                                                onClick={(e) => {
                                                    if (isActive) {
                                                        handlePlayToggle(e);
                                                    } else {
                                                        e.stopPropagation();
                                                        setActiveVoice(voice.id);
                                                        setIsPlaying(true);
                                                    }
                                                }}
                                                className={`p-2.5 rounded-full flex items-center justify-center transition-all ${isActive
                                                        ? 'bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/30'
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-primary/20 hover:text-primary'
                                                    }`}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">
                                                    {isActive && isPlaying ? 'pause' : 'play_arrow'}
                                                </span>
                                            </button>

                                            {isActive && (
                                                <span className="text-[10px] font-black uppercase tracking-widest bg-primary text-white px-2.5 py-1 rounded-md animate-in fade-in zoom-in duration-200">
                                                    Selected
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1.5">{voice.name}</h3>
                                            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed">{voice.desc}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Column: Visualizer & Controls */}
                    <div className="lg:col-span-5 space-y-6">
                        {/* Visualizer Card */}
                        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-900 p-8 flex flex-col items-center justify-center text-center overflow-hidden relative shadow-2xl">
                            <div className={`absolute inset-0 transition-opacity duration-1000 ${isPlaying ? 'opacity-30' : 'opacity-10'} bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent`}></div>

                            <div className={`flex items-end justify-center gap-1.5 h-32 mb-8 relative z-10 w-full ${isPlaying ? 'wave-playing' : ''}`}>
                                {[...Array(24)].map((_, i) => {
                                    // Generate a pseudo-random height base for the bars
                                    const heights = [20, 40, 60, 80, 100, 70, 50, 30, 90, 100, 80, 40];
                                    const baseHeight = heights[i % heights.length];
                                    const delay = (i * 0.05).toFixed(2);

                                    return (
                                        <div
                                            key={i}
                                            className="wave-bar w-1.5 rounded-full bg-primary"
                                            style={{
                                                height: isPlaying ? `${baseHeight}%` : '4px',
                                                animationDelay: `${delay}s`,
                                                opacity: isPlaying ? (baseHeight / 100) : 0.3
                                            }}
                                        ></div>
                                    );
                                })}
                            </div>

                            <div className="relative z-10 w-full">
                                <p className="text-primary font-mono text-[10px] font-bold uppercase tracking-[0.2em] mb-3 flex items-center justify-center gap-2">
                                    {isPlaying ? (
                                        <><span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span> Streaming Voice</>
                                    ) : (
                                        <><span className="w-2 h-2 rounded-full bg-slate-500"></span> Ready parameter preview</>
                                    )}
                                </p>
                                <p className={`text-white text-base font-medium italic transition-opacity duration-300 ${isPlaying ? 'opacity-100' : 'opacity-50'}`}>
                                    &quot;Hello, I&apos;m {VOICES.find(v => v.id === activeVoice)?.name.split(' - ')[1]} from AI Call Agent. How can I help you today?&quot;
                                </p>
                            </div>
                        </div>

                        {/* Controls Card */}
                        <div className="rounded-3xl border border-slate-200 dark:border-slate-800/50 glass p-8 space-y-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                            <div className="space-y-4 relative z-10">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Stability</label>
                                    <span className="text-sm font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">65%</span>
                                </div>
                                <input className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-primary" type="range" defaultValue="65" />
                                <p className="text-[11px] font-medium text-slate-500">Determines how consistent the voice is across different responses.</p>
                            </div>

                            <div className="space-y-4 relative z-10">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Clarity + Similarity</label>
                                    <span className="text-sm font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">82%</span>
                                </div>
                                <input className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-primary" type="range" defaultValue="82" />
                                <p className="text-[11px] font-medium text-slate-500">Higher values produce clearer output but may reduce emotional range.</p>
                            </div>

                            <div className="space-y-4 relative z-10">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Speaking Rate</label>
                                    <span className="text-sm font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">1.0x</span>
                                </div>
                                <input className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-primary flex" type="range" min="0.5" max="2" step="0.1" defaultValue="1.0" />
                                <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1 mt-1">
                                    <span>Slow</span>
                                    <span>Normal</span>
                                    <span>Fast</span>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 relative z-10">
                                <button className="flex-1 py-3 px-4 border border-slate-200 dark:border-slate-700/80 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-2 text-sm">
                                    <span className="material-symbols-outlined text-[18px]">settings_backup_restore</span>
                                    Reset
                                </button>
                                <button className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-sm">
                                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                    Save Profile
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Voice Training Section */}
                <div className="mt-12 p-8 md:p-10 rounded-3xl bg-gradient-to-br from-primary/10 to-purple-600/5 border border-primary/20 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden group">
                    <div className="absolute -right-20 -bottom-20 opacity-5 group-hover:opacity-10 transition-opacity duration-700">
                        <span className="material-symbols-outlined text-[240px]">graphic_eq</span>
                    </div>

                    <div className="flex-1 relative z-10">
                        <h2 className="text-2xl font-black mb-3 text-slate-900 dark:text-white tracking-tight">Want to use your own voice?</h2>
                        <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed max-w-2xl text-sm md:text-base">Record or upload a 60-second clip of your voice to create a personalized AI clone. Maintain your personal brand and build deeper trust with your clients even when you&apos;re busy.</p>
                    </div>

                    <div className="relative z-10 flex flex-col items-center">
                        <button
                            onClick={handleRecordToggle}
                            className={`relative px-8 py-4 ${isRecording ? 'bg-red-500 shadow-red-500/30 text-white' : 'bg-primary shadow-primary/30 text-white'} font-bold rounded-2xl shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-3 w-full sm:w-auto overflow-hidden`}
                        >
                            {isRecording && (
                                <span className="absolute inset-0 w-full h-full bg-red-600 animate-pulse opacity-50"></span>
                            )}
                            <span className="material-symbols-outlined text-[24px] relative z-10">
                                {isRecording ? 'stop_circle' : 'mic'}
                            </span>
                            <span className="relative z-10 uppercase tracking-wider text-sm">{isRecording ? 'Stop Recording' : 'Start Voice Training'}</span>
                        </button>

                        {isRecording && (
                            <p className="text-red-500 text-xs font-bold uppercase tracking-widest mt-4 animate-pulse flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                Recording active...
                            </p>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

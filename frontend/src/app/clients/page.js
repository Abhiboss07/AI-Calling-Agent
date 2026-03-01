'use client';

import { useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../../lib/api';

const voices = [
    { id: 'professional', name: 'Professional - Sarah', desc: 'Calm, authoritative, and trustworthy. Best for important calls.', selected: true },
    { id: 'friendly', name: 'Friendly - Mark', desc: 'Energetic, approachable, and helpful. Great for first-time contacts.' },
    { id: 'sophisticated', name: 'Sophisticated - James', desc: 'Formal, experienced, and precise. Ideal for formal conversations.' },
    { id: 'warm', name: 'Warm - Elena', desc: 'Gentle, patient, and inviting. Perfect for follow-up calls.' },
];

export default function VoicePage() {
    const [selectedVoice, setSelectedVoice] = useState('professional');
    const [stability, setStability] = useState(65);
    const [clarity, setClarity] = useState(82);
    const [speed, setSpeed] = useState(1.0);
    const [calls, setCalls] = useState([]);

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch(`${API_BASE}/v1/calls?perPage=20`, { headers: getAuthHeaders() });
                if (res.ok) { const d = await res.json(); if (d.ok && d.data) setCalls(d.data); }
            } catch { }
        }
        load();
    }, []);

    // Get unique phone numbers from calls
    const phoneNumbers = [...new Set(calls.map(c => c.phoneNumber).filter(Boolean))];

    return (
        <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
            {/* Breadcrumbs */}
            <div className="fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                <a href="/" style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>Dashboard</a>
                <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: 16 }}>chevron_right</span>
                <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500 }}>Voice Configuration</span>
            </div>

            {/* Header */}
            <div className="fade-in-up" style={{ marginBottom: 40 }}>
                <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>Voice Configuration & Preview</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 18, maxWidth: 640, margin: '8px 0 0' }}>Fine-tune your AI agent&apos;s vocal characteristics for natural conversations.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 32 }}>
                {/* Left: Voice Selection */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '0 8px' }}>
                        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Premium AI Voices</h2>
                        <button style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Custom Voice
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                        {voices.map((v, i) => {
                            const isActive = selectedVoice === v.id;
                            return (
                                <div key={v.id} className={`fade-in-up ${!isActive ? 'glass-card' : ''}`}
                                    onClick={() => setSelectedVoice(v.id)}
                                    style={{
                                        padding: 20, borderRadius: 12, cursor: 'pointer',
                                        border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                                        background: isActive ? 'rgba(19,91,236,0.05)' : undefined,
                                        transition: 'all 0.3s',
                                        animationDelay: `${i * 0.08}s`
                                    }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <div style={{
                                            padding: 8, borderRadius: 999,
                                            background: isActive ? 'var(--accent)' : 'var(--bg-hover)',
                                            color: isActive ? 'white' : 'var(--text-primary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>play_arrow</span>
                                        </div>
                                        {isActive && (
                                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--accent)', color: 'white', padding: '2px 8px', borderRadius: 4 }}>Selected</span>
                                        )}
                                    </div>
                                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{v.name}</h3>
                                    <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{v.desc}</p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Phone Numbers Section */}
                    {phoneNumbers.length > 0 && (
                        <div className="fade-in-up glass-card" style={{ marginTop: 24, padding: 24, borderRadius: 12, animationDelay: '0.4s' }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>contact_phone</span>
                                Client Numbers ({phoneNumbers.length})
                            </h3>
                            {phoneNumbers.map((num, i) => {
                                const numCalls = calls.filter(c => c.phoneNumber === num).length;
                                return (
                                    <div key={i} className="table-row-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < phoneNumbers.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>person</span>
                                            </div>
                                            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'monospace' }}>{num}</span>
                                        </div>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{numCalls} calls</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right: Visualizer & Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* Visualizer */}
                    <div className="fade-in-up" style={{
                        borderRadius: 12, background: '#0f172a', padding: 32,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                        position: 'relative', overflow: 'hidden', border: '1px solid var(--border)',
                        animationDelay: '0.2s'
                    }}>
                        <div style={{ position: 'absolute', inset: 0, opacity: 0.2, background: 'radial-gradient(circle at center, var(--accent), transparent 70%)' }} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 96, marginBottom: 24, position: 'relative', zIndex: 1 }}>
                            {[30, 60, 100, 80, 112, 60, 40, 24, 60, 100, 80, 30].map((h, i) => (
                                <div key={i} className="wave-bar" style={{
                                    width: 4, borderRadius: 999,
                                    background: `rgba(19,91,236,${0.4 + (h / 200)})`,
                                    height: `${h}%`,
                                    animationDelay: `${i * 0.1}s`
                                }} />
                            ))}
                        </div>
                        <p style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8, position: 'relative', zIndex: 1, margin: '0 0 8px' }}>
                            Live Preview Output
                        </p>
                        <p style={{ color: 'white', fontSize: 14, fontWeight: 500, fontStyle: 'italic', position: 'relative', zIndex: 1, margin: 0 }}>
                            &ldquo;Hello, I&apos;m {voices.find(v => v.id === selectedVoice)?.name.split(' - ')[1]} from RE-Agent AI. How can I help you today?&rdquo;
                        </p>
                    </div>

                    {/* Controls */}
                    <div className="fade-in-up glass-card" style={{ padding: 24, borderRadius: 12, animationDelay: '0.3s' }}>
                        {[
                            { label: 'Stability', value: `${stability}%`, state: stability, setter: setStability, max: 100, step: 1, desc: 'Determines how consistent the voice is across different responses.' },
                            { label: 'Clarity + Similarity', value: `${clarity}%`, state: clarity, setter: setClarity, max: 100, step: 1, desc: 'Higher values produce clearer output but may reduce emotional range.' },
                            { label: 'Speaking Rate', value: `${speed.toFixed(1)}x`, state: speed, setter: setSpeed, max: 2, step: 0.1, min: 0.5, desc: "Adjust the pace of the agent's speech for natural conversations." },
                        ].map((ctrl, i) => (
                            <div key={i} style={{ marginBottom: i < 2 ? 32 : 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <label style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{ctrl.label}</label>
                                    <span style={{ fontSize: 14, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{ctrl.value}</span>
                                </div>
                                <input type="range" min={ctrl.min || 0} max={ctrl.max} step={ctrl.step} value={ctrl.state}
                                    onChange={e => ctrl.setter(parseFloat(e.target.value))}
                                    style={{ width: '100%', height: 8, borderRadius: 8, appearance: 'none', background: 'var(--bg-hover)', cursor: 'pointer', accentColor: 'var(--accent)' }}
                                />
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>{ctrl.desc}</p>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
                            <button style={{
                                flex: 1, padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 8,
                                background: 'transparent', fontWeight: 700, cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-primary)',
                                transition: 'background 0.2s', fontSize: 14
                            }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>settings_backup_restore</span> Reset
                            </button>
                            <button className="neon-glow" style={{
                                flex: 1, padding: '14px 16px', background: 'var(--accent)', color: 'white', borderRadius: 8,
                                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, border: 'none', fontSize: 14, transition: 'all 0.2s'
                            }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span> Save Profile
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Voice Training Banner */}
            <div className="fade-in-up glow-card" style={{
                marginTop: 48, padding: 32, borderRadius: 16,
                background: 'rgba(19,91,236,0.05)', border: '1px solid rgba(19,91,236,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32,
                animationDelay: '0.5s'
            }}>
                <div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Want to use your own voice?</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: 0 }}>
                        Record or upload a 60-second clip of your voice to create a personalized AI clone.
                    </p>
                </div>
                <button className="neon-glow" style={{
                    whiteSpace: 'nowrap', padding: '16px 32px', background: 'var(--accent)', color: 'white',
                    fontWeight: 700, borderRadius: 12, border: 'none', cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(19,91,236,0.2)',
                    display: 'flex', alignItems: 'center', gap: 12, fontSize: 16,
                    transition: 'transform 0.2s'
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>mic</span>
                    Start Voice Training
                </button>
            </div>
        </div>
    );
}

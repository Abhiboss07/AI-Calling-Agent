'use client';

import { useState } from 'react';
import Link from 'next/link';

const voices = [
    {
        id: 'sarah',
        name: 'Professional - Sarah',
        description: 'Calm, authoritative, and trustworthy. Best for luxury listings.',
        selected: true
    },
    {
        id: 'mark',
        name: 'Friendly - Mark',
        description: 'Energetic, approachable, and helpful. Great for first-time buyers.',
        selected: false
    },
    {
        id: 'james',
        name: 'Sophisticated - James',
        description: 'Formal, experienced, and precise. Ideal for commercial real estate.',
        selected: false
    },
    {
        id: 'elena',
        name: 'Warm - Elena',
        description: 'Gentle, patient, and inviting. Perfect for rental inquiries.',
        selected: false
    }
];

export default function VoiceConfigurationPage() {
    const [selectedVoice, setSelectedVoice] = useState('sarah');
    const [stability, setStability] = useState(65);
    const [clarity, setClarity] = useState(82);
    const [speakingRate, setSpeakingRate] = useState(1.0);
    const [isPlaying, setIsPlaying] = useState(false);

    const handleVoiceSelect = (voiceId) => {
        setSelectedVoice(voiceId);
    };

    const handlePlayPreview = (voiceId) => {
        setIsPlaying(true);
        setTimeout(() => setIsPlaying(false), 2000);
    };

    const handleReset = () => {
        setStability(65);
        setClarity(82);
        setSpeakingRate(1.0);
    };

    const handleSave = () => {
        // Save voice configuration
        console.log('Saving voice configuration...');
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background-light)' }}>
            {/* Navigation Header */}
            <header style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 24px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--background-light)',
                position: 'sticky',
                top: 0,
                zIndex: 50
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ 
                        width: 32, 
                        height: 32, 
                        background: 'var(--primary)', 
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <span className="material-symbols-outlined" style={{ color: 'white', fontSize: 20 }}>rocket_launch</span>
                    </div>
                    <h2 style={{ 
                        fontSize: 18, 
                        fontWeight: 700, 
                        letterSpacing: '-0.015em',
                        margin: 0,
                        color: 'var(--text-primary)'
                    }}>EstateVoice AI</h2>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 32, flex: 1, justifyContent: 'flex-end' }}>
                    <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                        <Link href="/" style={{ 
                            fontSize: 14, 
                            fontWeight: 500, 
                            color: 'var(--text-muted)',
                            textDecoration: 'none',
                            transition: 'color 0.2s'
                        }}>Dashboard</Link>
                        <Link href="/clients" style={{ 
                            fontSize: 14, 
                            fontWeight: 500, 
                            color: 'var(--text-muted)',
                            textDecoration: 'none',
                            transition: 'color 0.2s'
                        }}>Agents</Link>
                        <Link href="/voice" style={{ 
                            fontSize: 14, 
                            fontWeight: 500, 
                            color: 'var(--primary)',
                            textDecoration: 'none'
                        }}>Voices</Link>
                        <Link href="/analytics" style={{ 
                            fontSize: 14, 
                            fontWeight: 500, 
                            color: 'var(--text-muted)',
                            textDecoration: 'none',
                            transition: 'color 0.2s'
                        }}>Analytics</Link>
                        <Link href="/settings" style={{ 
                            fontSize: 14, 
                            fontWeight: 500, 
                            color: 'var(--text-muted)',
                            textDecoration: 'none',
                            transition: 'color 0.2s'
                        }}>Settings</Link>
                    </nav>
                    
                    <button style={{
                        minWidth: 84,
                        height: 40,
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s'
                    }}>
                        Deploy Agent
                    </button>
                    
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'var(--bg-hover)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDV2oe2tZYAwVQbKBr1rCIxupMG2RndLosXvAZR0aiBBN2e_RPFf09xVVGQT3TmUgUGj4MIALLU3eWo1bTY6bGZSUCaB_1QCHeAg4cDZhRDVTQvUgUmectyKOzSHFA-_JxPtMzvD_SMJmMal8Aj-aKuK8CpItiqGoT-TqWmUAkh8bi3lYqiJiQwWn8SG66koRc6UtWeN4XPo9JK8N0PfpEDTuZSREiRPs-I0RLTFOQ5OYJ7KFlwjQCvbaS8euzUVcT0_O4XWO2vX00")'
                    }} />
                </div>
            </header>

            <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Breadcrumbs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                    <Link href="/" style={{ 
                        fontSize: 14, 
                        fontWeight: 500, 
                        color: 'var(--text-muted)',
                        textDecoration: 'none'
                    }}>Dashboard</Link>
                    <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: 16 }}>chevron_right</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Voice Configuration</span>
                </div>

                {/* Header Section */}
                <div style={{ marginBottom: 40 }}>
                    <h1 style={{ 
                        fontSize: 48, 
                        fontWeight: 900, 
                        lineHeight: 1.1,
                        letterSpacing: '-0.02em',
                        margin: '0 0 8px',
                        color: 'var(--text-primary)'
                    }}>Voice Configuration & Preview</h1>
                    <p style={{ 
                        fontSize: 18, 
                        color: 'var(--text-muted)', 
                        margin: 0,
                        maxWidth: '640px',
                        lineHeight: 1.5
                    }}>
                        Fine-tune your AI agent's vocal characteristics for natural real estate consultations and lead nurturing.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 32 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 32 }}>
                        {/* Left Column: Voice Selection */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, padding: '0 8px' }}>
                                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Premium AI Voices</h2>
                                <button style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--primary)',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                                    Custom Voice
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                {voices.map((voice) => (
                                    <div
                                        key={voice.id}
                                        onClick={() => handleVoiceSelect(voice.id)}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 16,
                                            padding: 20,
                                            borderRadius: 12,
                                            border: selectedVoice === voice.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                            background: selectedVoice === voice.id ? 'var(--primary-light)' : 'white',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePlayPreview(voice.id);
                                                }}
                                                style={{
                                                    width: 40,
                                                    height: 40,
                                                    borderRadius: '50%',
                                                    background: selectedVoice === voice.id ? 'var(--primary)' : 'var(--bg-hover)',
                                                    border: 'none',
                                                    color: selectedVoice === voice.id ? 'white' : 'var(--text-muted)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <span className="material-symbols-outlined">
                                                    {isPlaying && selectedVoice === voice.id ? 'stop' : 'play_arrow'}
                                                </span>
                                            </button>
                                            {selectedVoice === voice.id && (
                                                <span style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.1em',
                                                    background: 'var(--primary)',
                                                    color: 'white',
                                                    padding: '2px 8px',
                                                    borderRadius: 4
                                                }}>
                                                    Selected
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{voice.name}</h3>
                                            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                                                {voice.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right Column: Visualizer & Controls */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {/* Visualizer Card */}
                            <div style={{
                                borderRadius: 12,
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                padding: 32,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    opacity: 0.2,
                                    background: 'radial-gradient(circle at center, var(--primary), transparent 70%)'
                                }} />
                                
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    gap: 6, 
                                    height: 96, 
                                    marginBottom: 24,
                                    position: 'relative',
                                    zIndex: 10
                                }}>
                                    {[40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260].map((height, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                width: 4,
                                                height: `${height * 0.3}px`,
                                                background: `rgba(19, 91, 236, ${0.2 + (i * 0.06)})`,
                                                borderRadius: 2,
                                                animation: `waveBar ${1.2 + (i * 0.1)}s ease-in-out infinite`
                                            }}
                                        />
                                    ))}
                                </div>
                                
                                <p style={{ 
                                    color: 'var(--primary)', 
                                    fontFamily: 'monospace', 
                                    fontSize: 12, 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.1em',
                                    margin: '0 0 8px',
                                    position: 'relative',
                                    zIndex: 10
                                }}>
                                    Live Preview Output
                                </p>
                                <p style={{ 
                                    color: 'white', 
                                    fontSize: 14, 
                                    fontStyle: 'italic',
                                    margin: 0,
                                    position: 'relative',
                                    zIndex: 10
                                }}>
                                    "Hello, I'm Sarah from EstateVoice. How can I help with your property search today?"
                                </p>
                            </div>

                            {/* Controls Card */}
                            <div style={{
                                borderRadius: 12,
                                border: '1px solid var(--border)',
                                background: 'white',
                                padding: 24,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 32
                            }}>
                                {/* Stability Control */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ 
                                            fontSize: 14, 
                                            fontWeight: 700, 
                                            textTransform: 'uppercase', 
                                            letterSpacing: '0.05em',
                                            color: 'var(--text-muted)'
                                        }}>
                                            Stability
                                        </label>
                                        <span style={{ 
                                            fontSize: 14, 
                                            fontFamily: 'monospace', 
                                            fontWeight: 700, 
                                            color: 'var(--primary)' 
                                        }}>
                                            {stability}%
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={stability}
                                        onChange={(e) => setStability(parseInt(e.target.value))}
                                        style={{
                                            width: '100%',
                                            height: 8,
                                            borderRadius: 4,
                                            background: 'var(--bg-hover)',
                                            outline: 'none',
                                            cursor: 'pointer',
                                            WebkitAppearance: 'none'
                                        }}
                                    />
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                                        Determines how consistent voice is across different responses.
                                    </p>
                                </div>

                                {/* Clarity Control */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ 
                                            fontSize: 14, 
                                            fontWeight: 700, 
                                            textTransform: 'uppercase', 
                                            letterSpacing: '0.05em',
                                            color: 'var(--text-muted)'
                                        }}>
                                            Clarity + Similarity
                                        </label>
                                        <span style={{ 
                                            fontSize: 14, 
                                            fontFamily: 'monospace', 
                                            fontWeight: 700, 
                                            color: 'var(--primary)' 
                                        }}>
                                            {clarity}%
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={clarity}
                                        onChange={(e) => setClarity(parseInt(e.target.value))}
                                        style={{
                                            width: '100%',
                                            height: 8,
                                            borderRadius: 4,
                                            background: 'var(--bg-hover)',
                                            outline: 'none',
                                            cursor: 'pointer',
                                            WebkitAppearance: 'none'
                                        }}
                                    />
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                                        Higher values produce clearer output but may reduce emotional range.
                                    </p>
                                </div>

                                {/* Speaking Rate Control */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ 
                                            fontSize: 14, 
                                            fontWeight: 700, 
                                            textTransform: 'uppercase', 
                                            letterSpacing: '0.05em',
                                            color: 'var(--text-muted)'
                                        }}>
                                            Speaking Rate
                                        </label>
                                        <span style={{ 
                                            fontSize: 14, 
                                            fontFamily: 'monospace', 
                                            fontWeight: 700, 
                                            color: 'var(--primary)' 
                                        }}>
                                            {speakingRate.toFixed(1)}x
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.0"
                                        step="0.1"
                                        value={speakingRate}
                                        onChange={(e) => setSpeakingRate(parseFloat(e.target.value))}
                                        style={{
                                            width: '100%',
                                            height: 8,
                                            borderRadius: 4,
                                            background: 'var(--bg-hover)',
                                            outline: 'none',
                                            cursor: 'pointer',
                                            WebkitAppearance: 'none'
                                        }}
                                    />
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                                        Adjust the pace of agent's speech for natural conversations.
                                    </p>
                                </div>

                                {/* Action Buttons */}
                                <div style={{ display: 'flex', gap: 16, paddingTop: 16 }}>
                                    <button
                                        onClick={handleReset}
                                        style={{
                                            flex: 1,
                                            padding: '12px 16px',
                                            border: '1px solid var(--border)',
                                            borderRadius: 8,
                                            background: 'white',
                                            color: 'var(--text-primary)',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 8,
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>settings_backup_restore</span>
                                        Reset
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        style={{
                                            flex: 1,
                                            padding: '12px 16px',
                                            border: 'none',
                                            borderRadius: 8,
                                            background: 'var(--primary)',
                                            color: 'white',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 8,
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                                        Save Profile
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Voice Training Section */}
                <div style={{
                    marginTop: 48,
                    padding: 32,
                    borderRadius: 16,
                    background: 'var(--primary-light)',
                    border: '1px solid var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 32
                }}>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
                            Want to use your own voice?
                        </h2>
                        <p style={{ fontSize: 16, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                            Record or upload a 60-second clip of your voice to create a personalized AI clone. 
                            Maintain your personal brand even when you're busy.
                        </p>
                    </div>
                    <button style={{
                        padding: '16px 32px',
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 12,
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        transition: 'transform 0.2s',
                        whiteSpace: 'nowrap'
                    }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>mic</span>
                        Start Voice Training
                    </button>
                </div>
            </main>
        </div>
    );
}

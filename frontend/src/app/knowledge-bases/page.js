'use client';

import { useState } from 'react';

const documents = [
    { name: 'AI_Agent_System_Prompt.txt', type: 'Script', status: 'ready', date: 'Active', size: '12 KB', icon: 'article', color: '#f59e0b' },
    { name: 'Objection_Handling_Flows.pdf', type: 'Listing', status: 'ready', date: 'Feb 2025', size: '1.2 MB', icon: 'picture_as_pdf', color: '#ef4444' },
    { name: 'Product_Knowledge_Base.docx', type: 'Script', status: 'processing', date: 'Just now', size: '45 KB', icon: 'article', color: '#f59e0b' },
    { name: 'FAQ_Responses.pdf', type: 'Finance', status: 'ready', date: 'Jan 2025', size: '2.4 MB', icon: 'picture_as_pdf', color: '#ef4444' },
];

export default function KnowledgeBasePage() {
    const [activeCategory, setActiveCategory] = useState('all');
    const [chatMessages, setChatMessages] = useState([
        { from: 'ai', text: "Hi! I've processed your latest documents. Ask me anything about what I've learned.", time: '10:24 AM' },
    ]);
    const [chatInput, setChatInput] = useState('');

    const handleSend = () => {
        if (!chatInput.trim()) return;
        setChatMessages(prev => [...prev, { from: 'user', text: chatInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
        setChatInput('');
        setTimeout(() => {
            setChatMessages(prev => [...prev, {
                from: 'ai',
                text: "Based on my training data, I can provide insights about this topic. Let me check the relevant documents for you.",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                source: 'AI_Agent_System_Prompt.txt'
            }]);
        }, 1500);
    };

    const categories = [
        { id: 'all', label: 'All Documents', icon: 'folder', count: documents.length },
        { id: 'scripts', label: 'Scripts & FAQs', icon: 'description' },
        { id: 'data', label: 'Product Data', icon: 'home_work' },
        { id: 'legal', label: 'Legal & Contracts', icon: 'gavel' },
    ];

    return (
        <div style={{ display: 'flex', height: 'calc(100vh - var(--topbar-height))' }}>
            {/* Left Sidebar */}
            <aside style={{ width: 256, borderRight: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 32, flexShrink: 0 }}>
                <div>
                    <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, margin: '0 0 16px' }}>Ingestion</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button className="neon-glow" style={{
                            display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px',
                            borderRadius: 8, background: 'var(--accent)', color: 'white', fontWeight: 500, fontSize: 14,
                            border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(19,91,236,0.2)'
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload_file</span> Upload PDFs
                        </button>
                        <button style={{
                            display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px',
                            borderRadius: 8, background: 'transparent', border: '1px solid var(--border)',
                            color: 'var(--text-secondary)', fontWeight: 500, fontSize: 14, cursor: 'pointer',
                            transition: 'background 0.2s'
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>link</span> Sync Website URL
                        </button>
                    </div>
                </div>

                <div>
                    <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, margin: '0 0 16px' }}>Categories</h3>
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {categories.map(cat => {
                            const isSel = activeCategory === cat.id;
                            return (
                                <a key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 12px', borderRadius: 8, fontSize: 14,
                                    background: isSel ? 'var(--accent-light)' : 'transparent',
                                    color: isSel ? 'var(--accent)' : 'var(--text-muted)',
                                    fontWeight: isSel ? 500 : 400, cursor: 'pointer', textDecoration: 'none',
                                    transition: 'all 0.2s'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{cat.icon}</span>
                                        {cat.label}
                                    </div>
                                    {cat.count && <span style={{ fontSize: 10, background: 'rgba(19,91,236,0.2)', padding: '2px 8px', borderRadius: 999 }}>{cat.count}</span>}
                                </a>
                            );
                        })}
                    </nav>
                </div>

                <div style={{ marginTop: 'auto' }}>
                    <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, margin: '0 0 8px' }}>Storage Usage</p>
                        <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 999, marginBottom: 8 }}>
                            <div className="progress-animate" style={{ width: '75%', height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>750MB / 1GB (75%)</p>
                    </div>
                </div>
            </aside>

            {/* Main Content: Document List */}
            <main style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
                <div style={{ maxWidth: 960, margin: '0 auto' }}>
                    <div className="fade-in-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                        <div>
                            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px' }}>Learned Documents</h1>
                            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Manage the resources your AI agent uses to answer inquiries.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button style={{ padding: 8, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined">grid_view</span>
                            </button>
                            <button style={{ padding: 8, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined">view_list</span>
                            </button>
                        </div>
                    </div>

                    {/* Document Table */}
                    <div className="fade-in-up glass-card" style={{ borderRadius: 12, overflow: 'hidden', animationDelay: '0.1s' }}>
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(30,41,59,0.3)' }}>
                                    {['Document Name', 'Type', 'Status', 'Added On', ''].map(h => (
                                        <th key={h} style={{ padding: '16px 24px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === '' ? 'right' : 'left' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc, i) => (
                                    <tr key={i} className="table-row-hover" style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 32, height: 40, borderRadius: 4, background: `${doc.color}20`, color: doc.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{doc.icon}</span>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{doc.name}</p>
                                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{doc.size}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{doc.type}</span>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{
                                                    width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                                                    background: doc.status === 'ready' ? 'var(--success)' : 'var(--accent)',
                                                    animation: doc.status === 'processing' ? 'pingPulse 1.5s infinite' : 'none'
                                                }} />
                                                <span style={{
                                                    fontSize: 12, fontWeight: 500,
                                                    color: doc.status === 'ready' ? 'var(--success)' : 'var(--accent)'
                                                }}>{doc.status === 'ready' ? 'Ready' : 'Processing...'}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--text-muted)' }}>{doc.date}</td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <button style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>more_horiz</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Showing {documents.length} documents</p>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>chevron_left</span>
                                </button>
                                <button style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>chevron_right</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Right Sidebar: Test Chat */}
            <aside style={{ width: 320, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ padding: 16, borderBottom: '1px solid var(--border)', background: 'rgba(30,41,59,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Test Knowledge</h3>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}>Live</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Verify what the AI knows about your documents.</p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {chatMessages.map((msg, i) => (
                        <div key={i} className="fade-in-up" style={{
                            maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 6,
                            alignSelf: msg.from === 'user' ? 'flex-end' : 'flex-start',
                            animationDelay: `${i * 0.1}s`
                        }}>
                            <div style={{
                                padding: 12, borderRadius: 12,
                                borderTopLeftRadius: msg.from === 'ai' ? 0 : 12,
                                borderTopRightRadius: msg.from === 'user' ? 0 : 12,
                                background: msg.from === 'user' ? 'var(--accent)' : 'var(--bg-hover)',
                                color: msg.from === 'user' ? 'white' : 'var(--text-secondary)',
                                fontSize: 12
                            }}>
                                {msg.text}
                                {msg.source && (
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                        <p style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>source</span>
                                            Source: {msg.source}
                                        </p>
                                    </div>
                                )}
                            </div>
                            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, padding: '0 4px' }}>
                                {msg.from === 'ai' ? 'AI Agent' : 'You'} • {msg.time}
                            </p>
                        </div>
                    ))}
                </div>

                <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
                    <div style={{ position: 'relative' }}>
                        <textarea
                            value={chatInput} onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder="Ask a question..."
                            rows={2}
                            style={{
                                width: '100%', background: 'var(--bg-hover)', border: '1px solid var(--border)',
                                borderRadius: 8, fontSize: 12, padding: '12px 44px 12px 12px', resize: 'none',
                                color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none'
                            }}
                        />
                        <button onClick={handleSend} style={{
                            position: 'absolute', right: 8, bottom: 8, padding: 6,
                            background: 'var(--accent)', color: 'white', borderRadius: 6, border: 'none', cursor: 'pointer'
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, lineHeight: 1 }}>send</span>
                        </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>mic</span>
                            </button>
                            <button style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>settings_voice</span>
                            </button>
                        </div>
                        <button onClick={() => setChatMessages([chatMessages[0]])} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer' }}>
                            Reset Chat
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';

const documents = [
    { 
        name: 'Oceanview_Penthouse_Listing.pdf', 
        type: 'Listing', 
        status: 'ready', 
        date: 'Oct 24, 2023', 
        size: '1.2 MB • 4 pages', 
        icon: 'picture_as_pdf', 
        color: '#ef4444' 
    },
    { 
        name: 'https://realestate.com/faq-section', 
        type: 'Website URL', 
        status: 'processing', 
        date: 'Just now', 
        size: 'Scraped 12 pages', 
        icon: 'language', 
        color: '#3b82f6' 
    },
    { 
        name: 'First_Time_Buyer_Script.docx', 
        type: 'Script', 
        status: 'ready', 
        date: 'Oct 20, 2023', 
        size: '45 KB • 2 pages', 
        icon: 'article', 
        color: '#f59e0b' 
    },
    { 
        name: 'Mortgage_Rates_2024.pdf', 
        type: 'Finance', 
        status: 'paused', 
        date: 'Oct 18, 2023', 
        size: '2.4 MB • 15 pages', 
        icon: 'picture_as_pdf', 
        color: '#ef4444' 
    },
];

export default function KnowledgeBasePage() {
    const [activeCategory, setActiveCategory] = useState('all');
    const [chatMessages, setChatMessages] = useState([
        { from: 'ai', text: "Hi! I've processed your latest listings. You can ask me anything about the Oceanview Penthouse or buyer scripts.", time: '10:24 AM' },
        { from: 'user', text: "How many bedrooms are in the Oceanview Penthouse?", time: '10:25 AM' },
        { from: 'ai', text: "The Oceanview Penthouse listing specifies 4 bedrooms and 4.5 bathrooms, including a primary suite with floor-to-ceiling glass walls.", time: '10:25 AM', source: 'Oceanview_Penthouse_Listing.pdf' },
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
                source: 'Knowledge Base'
            }]);
        }, 1500);
    };

    const categories = [
        { id: 'all', label: 'All Documents', icon: 'folder', count: 24 },
        { id: 'listings', label: 'Property Listings', icon: 'home_work' },
        { id: 'scripts', label: 'Scripts & FAQs', icon: 'description' },
        { id: 'legal', label: 'Legal & Contracts', icon: 'gavel' },
    ];

    const getStatusColor = (status) => {
        switch(status) {
            case 'ready': return { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', dot: '#10b981' };
            case 'processing': return { bg: 'rgba(19, 91, 236, 0.1)', color: '#135bec', dot: '#135bec' };
            case 'paused': return { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', dot: '#9ca3af' };
            default: return { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', dot: '#9ca3af' };
        }
    };

    return (
        <div style={{ display: 'flex', height: 'calc(100vh - var(--topbar-height))' }}>
            {/* Left Sidebar */}
            <aside className="glass" style={{ 
                width: 256, 
                padding: 24, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 32, 
                flexShrink: 0,
                background: 'white',
                borderRight: '1px solid var(--border)'
            }}>
                <div>
                    <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, margin: '0 0 16px' }}>Ingestion</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button className="neon-glow-blue" style={{
                            display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px',
                            borderRadius: 8, background: 'var(--primary)', color: 'white', fontWeight: 500, fontSize: 14,
                            border: 'none', cursor: 'pointer'
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
                    <div className="glass" style={{ padding: 16, borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, margin: '0 0 8px' }}>Storage Usage</p>
                        <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 999, marginBottom: 8 }}>
                            <div className="progress-animate" style={{ width: '75%', height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>750MB / 1GB (75%)</p>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, overflowY: 'auto', padding: 32, background: 'var(--background-light)' }}>
                <div style={{ maxWidth: 1024, margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
                        <div>
                            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Learned Documents</h1>
                            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Manage the resources your AI agent uses to answer client inquiries.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button style={{ padding: 8, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined">grid_view</span>
                            </button>
                            <button style={{ padding: 8, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined">view_list</span>
                            </button>
                        </div>
                    </div>

                    {/* Documents Table */}
                    <div className="glass" style={{ 
                        background: 'white', 
                        border: '1px solid var(--border)', 
                        borderRadius: 12, 
                        overflow: 'hidden' 
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                                    <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>Document Name</th>
                                    <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>Type</th>
                                    <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>Status</th>
                                    <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>Added On</th>
                                    <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc, i) => {
                                    const statusStyle = getStatusColor(doc.status);
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.2s' }} className="table-row-hover">
                                            <td style={{ padding: '16px 24px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{ 
                                                        width: 32, height: 40, 
                                                        background: `${doc.color}15`, 
                                                        color: doc.color, 
                                                        borderRadius: 4, 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        justifyContent: 'center' 
                                                    }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{doc.icon}</span>
                                                    </div>
                                                    <div>
                                                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{doc.name}</p>
                                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{doc.size}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px 24px' }}>
                                                <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                                                    {doc.type}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px 24px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ 
                                                        width: 8, height: 8, 
                                                        borderRadius: '50%', 
                                                        background: statusStyle.dot,
                                                        animation: doc.status === 'processing' ? 'pulse 2s infinite' : 'none'
                                                    }} />
                                                    <span style={{ fontSize: 12, fontWeight: 500, color: statusStyle.color }}>
                                                        {doc.status === 'ready' ? 'Ready' : doc.status === 'processing' ? 'Processing...' : 'Paused'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px 24px', fontSize: 14, color: 'var(--text-muted)' }}>
                                                {doc.date}
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                                    <span className="material-symbols-outlined">more_horiz</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing 4 of 24 documents</p>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
                                </button>
                                <button style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Right Sidebar - Test Chat */}
            <aside className="glass" style={{ 
                width: 320, 
                borderLeft: '1px solid var(--border)', 
                background: 'white',
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden' 
            }}>
                <div style={{ padding: 16, borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Test Knowledge</h3>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>Live</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Verify what the AI knows about your uploaded documents.</p>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {chatMessages.map((msg, i) => (
                        <div key={i} style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: 6, 
                            maxWidth: '90%',
                            alignSelf: msg.from === 'user' ? 'flex-end' : 'flex-start'
                        }}>
                            <div style={{
                                background: msg.from === 'user' ? 'var(--primary)' : 'var(--bg-hover)',
                                color: msg.from === 'user' ? 'white' : 'var(--text-primary)',
                                padding: 12,
                                borderRadius: 12,
                                borderTopLeftRadius: msg.from === 'ai' ? 4 : 12,
                                borderTopRightRadius: msg.from === 'user' ? 4 : 12,
                                borderLeft: msg.source ? `2px solid var(--primary)` : 'none'
                            }}>
                                <p style={{ fontSize: 12, margin: 0, lineHeight: 1.4 }}>{msg.text}</p>
                                {msg.source && (
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                        <p style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>source</span>
                                            Source: {msg.source}
                                        </p>
                                    </div>
                                )}
                            </div>
                            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, marginLeft: msg.from === 'user' ? 'auto' : 4, marginRight: msg.from === 'user' ? 4 : 'auto' }}>
                                {msg.from === 'user' ? 'You' : 'AI Agent'} • {msg.time}
                            </p>
                        </div>
                    ))}
                </div>

                <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
                    <div style={{ position: 'relative' }}>
                        <textarea
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                            placeholder="Ask a question..."
                            rows={2}
                            style={{
                                width: '100%',
                                background: 'var(--bg-hover)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                fontSize: 12,
                                padding: '12px 36px 12px 12px',
                                resize: 'none',
                                outline: 'none',
                                fontFamily: 'inherit'
                            }}
                        />
                        <button 
                            onClick={handleSend}
                            style={{
                                position: 'absolute',
                                right: 8,
                                bottom: 8,
                                padding: 6,
                                background: 'var(--primary)',
                                color: 'white',
                                borderRadius: 6,
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 14, lineHeight: 1 }}>send</span>
                        </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>mic</span>
                            </button>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>settings_voice</span>
                            </button>
                        </div>
                        <button style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer' }}>
                            Reset Chat
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    );
}

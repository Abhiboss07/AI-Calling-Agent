'use client';

import { useState, useEffect } from 'react';

export default function TopBar() {
    return (
        <header style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: '1px solid var(--border)',
            padding: '12px 32px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: 20 }}>search</span>
                <input
                    type="text"
                    placeholder="Search leads or recordings..."
                    style={{
                        background: 'transparent', border: 'none', outline: 'none',
                        color: 'var(--text-secondary)', fontSize: 14, width: 256,
                        fontFamily: 'inherit'
                    }}
                />
            </div>

            {/* Right Side */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingRight: 24, borderRight: '1px solid var(--border)' }}>
                    <button style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>notifications</span>
                        <span style={{
                            position: 'absolute', top: 0, right: 0, width: 8, height: 8,
                            background: 'var(--danger)', borderRadius: '50%',
                            border: '2px solid var(--bg-primary)'
                        }} />
                    </button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>chat_bubble</span>
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1, margin: 0 }}>Abhishek Yadav</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, margin: '4px 0 0' }}>Admin Account</p>
                    </div>
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent), #7c3aed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 700, fontSize: 14,
                        border: '2px solid var(--bg-hover)'
                    }}>
                        AY
                    </div>
                </div>
            </div>
        </header>
    );
}

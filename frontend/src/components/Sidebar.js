'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
    { href: '/', label: 'Dashboard', icon: 'dashboard' },
    { href: '/clients', label: 'Voice', icon: 'mic' },
    { href: '/wallet', label: 'Wallet', icon: 'account_balance_wallet' },
    { href: '/management', label: 'Management', icon: 'settings_suggest' },
    { href: '/knowledge-bases', label: 'Knowledge Base', icon: 'database' },
    { href: '/dashboard', label: 'Live Monitor', icon: 'monitoring' },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="sidebar" style={{
            width: 'var(--sidebar-width)',
            background: 'var(--bg-sidebar)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: 30,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)'
        }}>
            {/* Logo */}
            <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                    background: 'var(--accent)',
                    borderRadius: 8,
                    padding: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <span className="material-symbols-outlined" style={{ color: 'white', fontSize: 24 }}>rocket_launch</span>
                </div>
                <div>
                    <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', margin: 0 }}>RE-Agent AI</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Real Estate Pro</p>
                </div>
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {navItems.map(item => {
                    const isActive = pathname === item.href;
                    return (
                        <Link key={item.href} href={item.href} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 16px', borderRadius: 8,
                            background: isActive ? 'linear-gradient(90deg, rgba(19,91,236,0.2) 0%, rgba(19,91,236,0) 100%)' : 'transparent',
                            borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                            color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                            fontSize: 14, fontWeight: isActive ? 600 : 500,
                            textDecoration: 'none',
                            transition: 'all 0.2s'
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Usage Credits */}
            <div style={{ padding: '24px', marginTop: 'auto' }}>
                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16
                }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Usage Credits</p>
                    <div style={{ width: '100%', background: 'var(--bg-hover)', borderRadius: 999, height: 6, marginBottom: 8 }}>
                        <div style={{ width: '75%', background: 'var(--accent)', height: 6, borderRadius: 999 }} />
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>1,240 / 2,000 mins</p>
                </div>
                <Link href="/test-call" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', padding: '12px 16px',
                    background: 'var(--accent)',
                    color: 'white',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 0 15px rgba(19,91,236,0.3)',
                    transition: 'opacity 0.2s'
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_circle</span>
                    Deploy New Agent
                </Link>
            </div>
        </aside>
    );
}

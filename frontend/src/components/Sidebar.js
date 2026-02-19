"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, FileText, Upload, Settings } from 'lucide-react';

const Sidebar = () => {
    const pathname = usePathname();

    const links = [
        { href: '/', label: 'Overview', icon: LayoutDashboard },
        { href: '/clients', label: 'Clients', icon: Users },
        { href: '/knowledge-bases', label: 'Knowledge Base', icon: FileText },
        { href: '/csv', label: 'Management', icon: Upload },
        // { href: '/settings', label: 'Settings', icon: Settings },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h1>AI Agent</h1>
            </div>
            <nav className="sidebar-nav">
                {links.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                    return (
                        <Link key={link.href} href={link.href} className={`nav-item ${isActive ? 'active' : ''}`}>
                            <Icon size={22} className={isActive ? 'text-accent' : 'text-secondary'} style={{ color: isActive ? '#fff' : 'inherit' }} />
                            <span>{link.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div style={{ marginTop: 'auto', paddingTop: '2rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                v1.2.0 • Pro
            </div>
        </aside>
    );
};

export default Sidebar;

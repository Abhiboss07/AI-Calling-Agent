"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home,
    Phone,
    FileText,
    Upload,
    Headphones,
    User,
    Activity
} from 'lucide-react';

const Sidebar = () => {
    const pathname = usePathname();

    // Hide sidebar on auth pages
    if (['/login', '/signup', '/verify'].includes(pathname)) return null;

    const links = [
        { href: '/dashboard', label: 'Live Monitor', icon: Activity },
        { href: '/', label: 'Dashboard', icon: Home },
        { href: '/clients', label: 'Voice', icon: Phone },
        { href: '/csv', label: 'Management', icon: Upload },
        { href: '/knowledge-bases', label: 'Knowledge Base', icon: FileText },
    ];

    const bottomLinks = [
        { href: '/support', label: 'Support', icon: Headphones },
        { href: '/profile', label: 'Profile', icon: User },
    ];

    return (
        <aside className="sidebar">
            <Link href="/" className="sidebar-logo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
            </Link>

            <nav className="sidebar-nav">
                {links.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                    return (
                        <Link key={link.href} href={link.href} className={`nav-item ${isActive ? 'active' : ''}`}>
                            <Icon size={20} />
                            <span className="nav-tooltip">{link.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <nav className="sidebar-nav" style={{ gap: '4px' }}>
                    {bottomLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;
                        return (
                            <Link key={link.href} href={link.href} className={`nav-item ${isActive ? 'active' : ''}`}>
                                <Icon size={20} />
                                <span className="nav-tooltip">{link.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
};

export default Sidebar;

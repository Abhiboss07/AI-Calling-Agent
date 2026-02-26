"use client";

import { usePathname } from 'next/navigation';
import { Search, Calendar, Wallet } from 'lucide-react';

const TopBar = () => {
    const pathname = usePathname();
    const normalizedPath = pathname && pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

    // Hide topbar on auth pages
    if (['/login', '/signup', '/verify'].includes(normalizedPath)) return null;

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const formatDate = (d) =>
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div className="topbar">
            <div className="topbar-left">
                <div className="topbar-search">
                    <Search size={16} />
                    <input type="text" placeholder="Search properties, clients..." />
                </div>
            </div>

            <div className="topbar-right">
                <div className="topbar-date">
                    <Calendar size={14} />
                    <span>{formatDate(startOfMonth)} - {formatDate(today)}</span>
                </div>

                <div className="topbar-wallet">
                    <Wallet size={14} />
                    <span>₹25</span>
                </div>

                <div className="topbar-user">
                    <div className="topbar-avatar">EA</div>
                    <div className="topbar-user-info">
                        <span className="topbar-user-name">Estate Agent</span>
                        <span className="topbar-user-email">admin@estateagent.ai</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TopBar;

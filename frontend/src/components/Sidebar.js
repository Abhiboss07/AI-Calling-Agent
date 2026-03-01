'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
    { href: '/', icon: 'dashboard', label: 'Dashboard' },
    { href: '/voice', icon: 'mic', label: 'Voice' },
    { href: '/wallet', icon: 'account_balance_wallet', label: 'Wallet' },
    { href: '/clients', icon: 'settings_suggest', label: 'Management' },
    { href: '/knowledge-bases', icon: 'database', label: 'Knowledge Base' },
    { href: '/dashboard', icon: 'monitoring', label: 'Live Monitor' },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-72 bg-surface/50 border-r border-slate-800/50 flex flex-col shrink-0">
            {/* Logo */}
            <div className="p-6 flex items-center gap-3">
                <div className="bg-primary rounded-lg p-1.5 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-2xl">rocket_launch</span>
                </div>
                <div>
                    <h1 className="text-slate-100 font-bold tracking-tight text-lg">AI Call Agent</h1>
                    <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Calling Pro</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-4 space-y-1">
                {navItems.map((item) => {
                    const isActive = pathname === item.href ||
                        (item.href !== '/' && pathname?.startsWith(item.href));

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive
                                    ? 'sidebar-active text-primary'
                                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
                                }`}
                        >
                            <span className="material-symbols-outlined">{item.icon}</span>
                            <span className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Section */}
            <div className="p-6 mt-auto">
                {/* Usage Credits */}
                <div className="glass rounded-xl p-4 mb-4">
                    <p className="text-xs text-slate-400 mb-2">Usage Credits</p>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2">
                        <div className="bg-primary h-1.5 rounded-full" style={{ width: '75%' }}></div>
                    </div>
                    <p className="text-xs font-medium text-slate-200">1,240 / 2,000 mins</p>
                </div>

                {/* Deploy Button */}
                <button className="w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold text-sm transition-colors neon-glow-blue flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-sm">add_circle</span>
                    Deploy New Agent
                </button>
            </div>
        </aside>
    );
}

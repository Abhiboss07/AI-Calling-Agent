'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { fetchWallet } from '../lib/api';

export default function TopBar() {
    const { user, logout } = useAuth();
    const router = useRouter();

    const [balance, setBalance] = useState(null);
    const [prevBalance, setPrevBalance] = useState(null);
    const [isBalanceAnimating, setIsBalanceAnimating] = useState(false);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Initial fetch and polling for wallet balance
    useEffect(() => {
        let isMounted = true;

        async function loadBalance() {
            try {
                const res = await fetchWallet();
                if (res.ok && isMounted) {
                    const newBalance = res.data?.currentBalance ?? 0;
                    setBalance(current => {
                        if (current !== null && current !== newBalance) {
                            setIsBalanceAnimating(true);
                            setTimeout(() => setIsBalanceAnimating(false), 2000);
                        }
                        return newBalance;
                    });
                }
            } catch (err) {
                console.error("Failed to load balance for topbar", err);
            }
        }

        if (user) {
            loadBalance();
            const intervalId = setInterval(loadBalance, 30000); // 30s poll
            return () => {
                isMounted = false;
                clearInterval(intervalId);
            };
        }
    }, [user]);

    // Handle clicks outside dropdown to close it
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'A';
    const userName = user?.name || 'Admin';

    return (
        <header className="sticky top-0 z-50 glass border-b border-slate-800/50 px-8 py-4 flex items-center justify-between">
            {/* Search */}
            <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400">search</span>
                <input
                    className="bg-transparent border-none focus:ring-0 text-sm text-slate-300 w-64 placeholder:text-slate-500"
                    placeholder="Search leads or recordings..."
                    type="text"
                />
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-6">

                {/* Balance Display */}
                {balance !== null && (
                    <div className="flex flex-col items-end border-r border-slate-800 pr-6">
                        <span className="text-xs text-slate-500 font-medium">Balance</span>
                        <div className="flex items-center gap-1.5">
                            <span className={`text-lg font-bold text-slate-100 ${isBalanceAnimating ? 'text-green-400 animate-pulse' : 'transition-colors duration-500'}`}>
                                ${balance.toFixed(2)}
                            </span>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-4 border-r border-slate-800 pr-6">
                    <a
                        href="https://workabhi.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 group hover:bg-slate-800/50 py-1.5 px-3 rounded-lg transition-colors border border-transparent hover:border-slate-700"
                    >
                        <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
                            <span className="text-primary font-black text-xs">W</span>
                        </div>
                        <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">workabhi</span>
                    </a>
                </div>

                {/* User Profile & Dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex items-center gap-3 focus:outline-none hover:opacity-80 transition-opacity"
                        aria-expanded={isDropdownOpen}
                        aria-haspopup="true"
                    >
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-semibold text-slate-100 leading-none">{userName}</p>
                            <p className="text-xs text-slate-500 mt-1 truncate max-w-[120px]">{user?.email || 'Admin Account'}</p>
                        </div>
                        {user?.avatar ? (
                            <img src={user.avatar} alt="Profile" className="h-10 w-10 rounded-full border-2 border-slate-800 object-cover" />
                        ) : (
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold border-2 border-slate-800">
                                {userInitial}
                            </div>
                        )}
                        <span className={`material-symbols-outlined text-slate-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}>
                            expand_more
                        </span>
                    </button>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                        <div className="absolute right-0 mt-3 w-56 rounded-xl border border-slate-800/80 bg-[#151c2c] shadow-xl overflow-hidden py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="px-4 py-3 border-b border-slate-800/80 mb-1 sm:hidden">
                                <p className="text-sm font-semibold text-slate-100">{userName}</p>
                                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                            </div>

                            <button
                                onClick={() => { setIsDropdownOpen(false); router.push('/profile'); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">person</span>
                                Profile Settings
                            </button>

                            <button
                                onClick={() => { setIsDropdownOpen(false); logout(); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">logout</span>
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

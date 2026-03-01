"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Calendar, Wallet, ChevronDown, LogOut, LifeBuoy, User, Moon, Sun } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useTheme } from '../contexts/ThemeContext';
import { API_BASE, getAuthHeaders } from '../lib/api';

const TopBar = () => {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const router = useRouter();
    const pathname = usePathname();
    const normalizedPath = pathname && pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const menuRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileImage, setProfileImage] = useState('');
    const [storedProfile, setStoredProfile] = useState(null);
    const [walletBalance, setWalletBalance] = useState(0);
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');

    const isAuthPage = ['/login', '/signup', '/verify'].includes(normalizedPath);

    useEffect(() => {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        setDateStart(start.toISOString().split('T')[0]);
        setDateEnd(today.toISOString().split('T')[0]);

        const loadProfile = () => {
            try {
                const data = localStorage.getItem('ea_profile');
                const image = localStorage.getItem('ea_profile_image');
                setStoredProfile(data ? JSON.parse(data) : null);
                setProfileImage(image || '');
            } catch {
                setStoredProfile(null);
                setProfileImage('');
            }
        };

        const handleOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        };

        loadProfile();
        window.addEventListener('ea-profile-updated', loadProfile);
        document.addEventListener('mousedown', handleOutside);
        return () => {
            window.removeEventListener('ea-profile-updated', loadProfile);
            document.removeEventListener('mousedown', handleOutside);
        };
    }, []);

    useEffect(() => {
        let mounted = true;
        const fetchWallet = async () => {
            try {
                const res = await fetch(`${API_BASE}/v1/wallet`, { headers: getAuthHeaders(), cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (mounted && data?.ok && data?.data) {
                    setWalletBalance(data.data.currentBalance || 0);
                }
            } catch { /* silent */ }
        };
        fetchWallet();
        const id = setInterval(fetchWallet, 30000);
        return () => { mounted = false; clearInterval(id); };
    }, []);

    const displayName = useMemo(() => storedProfile?.name || user?.name || 'Agent User', [storedProfile, user]);
    const displayEmail = useMemo(() => storedProfile?.email || user?.email || 'admin@agent.ai', [storedProfile, user]);
    const initials = useMemo(() => displayName.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase(), [displayName]);

    const formatDate = (d) => {
        if (!d) return '';
        const date = new Date(d + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    if (isAuthPage) return null;

    return (
        <div className="topbar">
            <div className="topbar-left">
                <div className="topbar-search">
                    <Search size={16} />
                    <input type="text" placeholder="Search calls, clients..." />
                </div>
            </div>

            <div className="topbar-right">
                <div className="topbar-date">
                    <Calendar size={14} />
                    <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }} />
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }} />
                </div>

                <div className="topbar-wallet" onClick={() => router.push('/wallet')} style={{ cursor: 'pointer' }}>
                    <Wallet size={14} />
                    <span>₹{walletBalance.toFixed(2)}</span>
                </div>

                <div className="topbar-user" ref={menuRef}>
                    <button className="topbar-user-trigger" onClick={() => setMenuOpen(!menuOpen)}>
                        {profileImage ? (
                            <img className="topbar-avatar-image" src={profileImage} alt={displayName} />
                        ) : (
                            <div className="topbar-avatar">{initials}</div>
                        )}
                        <div className="topbar-user-info">
                            <span className="topbar-user-name">{displayName}</span>
                            <span className="topbar-user-email">{displayEmail}</span>
                        </div>
                        <ChevronDown size={16} className={`topbar-user-chevron ${menuOpen ? 'open' : ''}`} />
                    </button>

                    {menuOpen && (
                        <div className="topbar-menu">
                            <button className="topbar-menu-item" onClick={() => toggleTheme()}>
                                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                            </button>
                            <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }} />
                            <button className="topbar-menu-item" onClick={() => { setMenuOpen(false); router.push('/profile'); }}>
                                <User size={14} />
                                <span>Profile Settings</span>
                            </button>
                            <button className="topbar-menu-item" onClick={() => { setMenuOpen(false); router.push('/support'); }}>
                                <LifeBuoy size={14} />
                                <span>Support Center</span>
                            </button>
                            <button className="topbar-menu-item danger" onClick={() => { setMenuOpen(false); logout(); }}>
                                <LogOut size={14} />
                                <span>Logout</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TopBar;

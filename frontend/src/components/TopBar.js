"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Calendar, Wallet, ChevronDown, LogOut, LifeBuoy, User } from 'lucide-react';
import { useAuth } from './AuthProvider';

const TopBar = () => {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const normalizedPath = pathname && pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const menuRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileImage, setProfileImage] = useState('');
    const [storedProfile, setStoredProfile] = useState(null);

    // Hide topbar on auth pages
    if (['/login', '/signup', '/verify'].includes(normalizedPath)) return null;

    useEffect(() => {
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

    const displayName = useMemo(
        () => storedProfile?.name || user?.name || 'Estate Agent',
        [storedProfile, user]
    );
    const displayEmail = useMemo(
        () => storedProfile?.email || user?.email || 'admin@estateagent.ai',
        [storedProfile, user]
    );
    const initials = useMemo(
        () => displayName.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase(),
        [displayName]
    );

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

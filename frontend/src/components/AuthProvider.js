"use client";

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { API_BASE } from '../lib/api';

const AuthContext = createContext(null);

const PUBLIC_ROUTES = ['/login', '/signup', '/verify'];
const normalizePath = (path = '') => {
    if (!path) return '/';
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
};

export function AuthProvider({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const normalizedPath = normalizePath(pathname);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState(null);

    useEffect(() => {
        console.debug('AuthProvider initializing, API_BASE =', API_BASE);
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem('ea_token');
        if (stored) {
            setToken(stored);
            fetchUser(stored);
        } else {
            setLoading(false);
        }
    }, []);

    async function fetchUser(jwt) {
        try {
            const res = await fetch(`${API_BASE}/v1/auth/me`, {
                headers: { Authorization: `Bearer ${jwt}` }
            });
            if (res.ok) {
                const text = await res.text();
                try {
                    const data = JSON.parse(text);
                    if (data.ok) {
                        setUser(data.user);
                        return;
                    }
                } catch { /* non-JSON */ }
            }
            localStorage.removeItem('ea_token');
            setToken(null);
        } catch {
            // Backend offline — keep token for retry
        } finally {
            setLoading(false);
        }
    }

    function login(jwt, userData) {
        localStorage.setItem('ea_token', jwt);
        setToken(jwt);
        setUser(userData);
        router.replace('/');
    }

    function logout() {
        localStorage.removeItem('ea_token');
        setToken(null);
        setUser(null);
        router.replace('/login');
    }

    const isPublicRoute = PUBLIC_ROUTES.includes(normalizedPath);

    if (loading) {
        return (
            <AuthContext.Provider value={{ user, token, login, logout, loading }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#101622', color: '#9ca3af' }}>
                    Loading...
                </div>
            </AuthContext.Provider>
        );
    }

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

export default AuthProvider;

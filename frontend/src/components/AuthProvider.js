"use client";

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const AuthContext = createContext(null);

const PUBLIC_ROUTES = ['/login', '/signup', '/verify'];

export function AuthProvider({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState(null);

    useEffect(() => {
        const stored = localStorage.getItem('ea_token');
        if (stored) {
            setToken(stored);
            fetchUser(stored);
        } else {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!loading && !user && !PUBLIC_ROUTES.includes(pathname)) {
            router.replace('/login');
        }
    }, [loading, user, pathname, router]);

    async function fetchUser(jwt) {
        try {
            const res = await fetch('/api/v1/auth/me', {
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
            // Token invalid — clear
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

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    // Show nothing while checking auth (prevents flash)
    if (loading) {
        return (
            <AuthContext.Provider value={{ user, token, login, logout, loading }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8f9fa', color: '#9ca3af' }}>
                    Loading...
                </div>
            </AuthContext.Provider>
        );
    }

    // Auth pages — render without layout wrapper
    if (isPublicRoute) {
        return (
            <AuthContext.Provider value={{ user, token, login, logout, loading }}>
                {children}
            </AuthContext.Provider>
        );
    }

    // Protected pages — redirect if not authenticated
    if (!user) {
        return null;
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

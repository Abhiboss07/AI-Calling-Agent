"use client";

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

function VerifyForm() {
    const searchParams = useSearchParams();
    const { login } = useAuth();
    const email = searchParams.get('email') || '';
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const inputRefs = useRef([]);

    useEffect(() => {
        if (inputRefs.current[0]) inputRefs.current[0].focus();
    }, []);

    const handleChange = (index, value) => {
        if (!/^\d*$/.test(value)) return;

        const newCode = [...code];
        newCode[index] = value.slice(-1);
        setCode(newCode);

        // Auto-focus next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all digits entered
        if (newCode.every(d => d !== '') && index === 5) {
            handleVerify(newCode.join(''));
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e) => {
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            const newCode = pasted.split('');
            setCode(newCode);
            inputRefs.current[5]?.focus();
            handleVerify(pasted);
            e.preventDefault();
        }
    };

    const handleVerify = async (codeStr) => {
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/v1/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code: codeStr || code.join('') })
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                setError(data.error || 'Verification failed');
                setCode(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
                return;
            }

            login(data.token, data.user);
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        setError('');
        setSuccess('');

        try {
            const res = await fetch('/api/v1/auth/resend-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await res.json();
            if (data.ok) {
                setSuccess('New verification code sent!');
            } else {
                setError(data.error || 'Failed to resend');
            }
        } catch {
            setError('Network error');
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-logo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24, color: 'white' }}>
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <polyline points="3 7 12 13 21 7" />
                    </svg>
                </div>

                <h1 className="auth-title">Verify Email</h1>
                <p className="auth-subtitle">
                    We sent a 6-digit code to<br />
                    <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
                </p>

                {error && <div className="auth-error">{error}</div>}
                {success && <div className="auth-success">{success}</div>}

                <div style={{ marginTop: 20, marginBottom: 20 }}>
                    <div className="verify-inputs" onPaste={handlePaste}>
                        {code.map((digit, i) => (
                            <input
                                key={i}
                                ref={el => inputRefs.current[i] = el}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                onChange={(e) => handleChange(i, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(i, e)}
                                disabled={loading}
                            />
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '10px 16px', fontSize: 14, justifyContent: 'center' }}
                    onClick={() => handleVerify()}
                    disabled={loading || code.some(d => d === '')}
                >
                    {loading ? 'Verifying...' : 'Verify Email'}
                </button>

                <div className="auth-footer">
                    Didn't receive a code?{' '}
                    <button
                        onClick={handleResend}
                        disabled={resending}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 13 }}
                    >
                        {resending ? 'Sending...' : 'Resend'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function VerifyPage() {
    return (
        <Suspense fallback={
            <div className="auth-page">
                <div className="auth-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            </div>
        }>
            <VerifyForm />
        </Suspense>
    );
}

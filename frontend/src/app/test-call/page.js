"use client";
export const runtime = 'edge';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../lib/api';

export default function TestCallPage() {
    const router = useRouter();
    const [campaignId, setCampaignId] = useState('default');
    const [phone, setPhone] = useState('');
    const [fromNumber, setFromNumber] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setError('');
        setLoading(true);
        try {
            const url = `${API_BASE}/v1/calls/start`;
            console.debug('starting call', url, { campaignId, phone, fromNumber });
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId, phoneNumber: phone, fromNumber: fromNumber || undefined })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                setError(data.error || 'Failed to start call');
            } else {
                setMessage(`Call queued (id ${data.callId}, sid ${data.callSid})`);
            }
        } catch (err) {
            console.error(err);
            setError('Network error contacting backend');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card" style={{ maxWidth: 400, margin: '40px auto' }}>
            <h2>Trigger Test Outbound Call</h2>
            <p className="text-muted" style={{ fontSize: 13 }}>Use to manually enqueue an outbound call via the API.</p>
            {message && <div className="alert alert-success">{message}</div>}
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit} className="auth-form">
                <div className="form-group">
                    <label>Campaign ID</label>
                    <input value={campaignId} onChange={e => setCampaignId(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Phone Number</label>
                    <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+911234567890" required />
                </div>
                <div className="form-group">
                    <label>From Number (optional)</label>
                    <input value={fromNumber} onChange={e => setFromNumber(e.target.value)} placeholder="+91..." />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
                    {loading ? 'Calling…' : 'Start Call'}
                </button>
            </form>
        </div>
    );
}

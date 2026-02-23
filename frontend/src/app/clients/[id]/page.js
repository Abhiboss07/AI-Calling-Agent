"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Phone } from 'lucide-react';

export default function ClientDetail() {
    const params = useParams();
    const phoneNumber = decodeURIComponent(params.id);
    const [calls, setCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [transcript, setTranscript] = useState(null);

    useEffect(() => {
        if (!phoneNumber) return;
        async function load() {
            setLoading(true);
            try {
                const res = await fetch(`/api/v1/calls?phoneNumber=${encodeURIComponent(phoneNumber)}`);
                const data = await res.json();
                if (data.ok) setCalls(data.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [phoneNumber]);

    const handleTranscript = async (callId) => {
        try {
            const res = await fetch(`/api/v1/calls/${callId}/transcript`);
            if (res.status === 404) {
                alert("No transcript found");
                return;
            }
            const json = await res.json();
            if (json.ok) {
                if (json.signedUrl) {
                    window.open(json.signedUrl, '_blank');
                } else {
                    setTranscript(json.parsed || json.data);
                }
            } else {
                alert("Error fetching transcript: " + json.error);
            }
        } catch (e) {
            alert("Error: " + e.message);
        }
    };

    return (
        <div>
            <div className="header-actions">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Link href="/clients" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>← Back</Link>
                    <h1>Client: {phoneNumber}</h1>
                </div>
            </div>

            <div className="kpi-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                    <div className="stat-card-header">
                        <span className="stat-card-title">Total Calls</span>
                        <div className="stat-card-icon orange">
                            <Phone size={18} />
                        </div>
                    </div>
                    <div className="stat-card-value">{calls.length}</div>
                </div>
            </div>

            <div className="section-label">CALL HISTORY</div>
            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Duration</th>
                            <th>Transcript</th>
                            <th>Recording</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Loading calls...</td></tr>
                        ) : calls.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No calls found for this client.</td></tr>
                        ) : (
                            calls.map(call => (
                                <tr key={call._id}>
                                    <td>{new Date(call.createdAt).toLocaleString()}</td>
                                    <td>
                                        <span className={`status-badge status-${call.status}`}>
                                            {call.status}
                                        </span>
                                    </td>
                                    <td>{call.durationSec}s</td>
                                    <td>
                                        <button
                                            className="btn btn-outline"
                                            style={{ fontSize: 12, padding: '4px 12px' }}
                                            onClick={() => handleTranscript(call._id)}
                                        >
                                            View Transcript
                                        </button>
                                    </td>
                                    <td>
                                        <button
                                            className="btn btn-outline"
                                            style={{ fontSize: 12, padding: '4px 12px' }}
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch(`/api/v1/calls/${call._id}/recordings`);
                                                    const d = await res.json();
                                                    if (d.ok && d.data && d.data.length > 0) {
                                                        window.open(d.data[0].url, '_blank');
                                                    } else {
                                                        alert("No recording found");
                                                    }
                                                } catch (e) { console.error(e); }
                                            }}
                                        >
                                            Play Audio
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Transcript Modal */}
            {transcript && (
                <div
                    onClick={() => setTranscript(null)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                    }}
                >
                    <div
                        className="card"
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: 600, width: '90%', maxHeight: '80vh', overflowY: 'auto',
                            boxShadow: 'var(--shadow-lg)'
                        }}
                    >
                        <h3 style={{ marginBottom: 16 }}>Transcript</h3>
                        <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', lineHeight: 1.7, maxHeight: '60vh', overflowY: 'auto', fontSize: 13 }}>
                            {transcript.fullText || (transcript.entries && transcript.entries.map(e => `${e.speaker}: ${e.text}`).join('\n'))}
                        </div>
                        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={() => setTranscript(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

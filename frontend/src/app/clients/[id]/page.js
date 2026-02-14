"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function ClientDetail() {
    const params = useParams();
    const phoneNumber = decodeURIComponent(params.id);
    const [calls, setCalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [transcript, setTranscript] = useState(null); // For modal

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
                    // Show modal with text
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
                <h1>Client: {phoneNumber}</h1>
            </div>

            <div className="kpi-grid">
                <div className="card">
                    <div className="subtext">Total Calls</div>
                    <div className="value">{calls.length}</div>
                </div>
                {/* Could add total duration or last active here */}
            </div>

            <h3>Call History</h3>
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
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>Loading calls...</td></tr>
                        ) : calls.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No calls found for this client.</td></tr>
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
                                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                            onClick={() => handleTranscript(call._id)}
                                        >
                                            View Transcript
                                        </button>
                                    </td>
                                    <td>
                                        <button
                                            className="btn btn-outline"
                                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
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

            {transcript && (
                <div className="modal-backdrop" onClick={() => setTranscript(null)} style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{
                        padding: '2rem', borderRadius: '1rem',
                        maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Transcript</h3>
                        <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: '60vh', overflowY: 'auto' }}>
                            {transcript.fullText || (transcript.entries && transcript.entries.map(e => `${e.speaker}: ${e.text}`).join('\n'))}
                        </div>
                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={() => setTranscript(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

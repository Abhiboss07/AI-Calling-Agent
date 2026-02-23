"use client";
import { useState, useEffect } from 'react';

const SAMPLE_CSV = [
    ['+915550101', 'John Doe', 'john@example.com'],
    ['+915550102', 'Jane Smith', 'jane@example.com'],
    ['+915550103', 'Bob Johnson', 'bob@example.com']
];

export default function CSVManagement() {
    const [file, setFile] = useState(null);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [campaignId, setCampaignId] = useState('');
    const [mode, setMode] = useState('append');
    const [history, setHistory] = useState([]);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = () => {
        fetch('/api/v1/uploads')
            .then(res => res.json())
            .then(d => d.ok && setHistory(d.data))
            .catch(console.error);
    };

    const loadSample = () => {
        setData(SAMPLE_CSV);
        setMessage('Loaded sample data into preview. Upload to proceed.');
        const content = SAMPLE_CSV.map(row => row.join(',')).join('\n');
        const blob = new Blob([content], { type: 'text/csv' });
        const f = new File([blob], 'sample_numbers.csv', { type: 'text/csv' });
        setFile(f);
    };

    const handleFile = (e) => {
        const f = e.target.files[0];
        if (f) {
            setFile(f);
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target.result;
                const lines = text.split('\n').filter(l => l.trim());
                const parsed = lines.map(line => line.split(',').map(c => c.trim()));
                setData(parsed);
            };
            reader.readAsText(f);
        }
    };

    const upload = async () => {
        if (!file || !campaignId) return;
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/v1/calls/upload-numbers?campaignId=${campaignId}&mode=${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/csv' },
                body: await file.text()
            });
            const json = await res.json();
            if (json.ok) {
                setMessage(`Success! Accepted: ${json.results.accepted}, Rejected: ${json.results.rejected}`);
                setFile(null);
                setData([]);
                setTimeout(fetchHistory, 1000);
            } else {
                setMessage(`Error: ${json.error}`);
            }
        } catch (e) {
            setMessage(`Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="header-actions">
                <h1>CSV Management</h1>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* Upload Form */}
                <div className="card" style={{ flex: '1 1 400px' }}>
                    <h3>Upload Numbers</h3>
                    <div style={{ display: 'grid', gap: 14 }}>
                        <div>
                            <label>Campaign</label>
                            <CampaignSelector
                                selectedId={campaignId}
                                onSelect={(id) => setCampaignId(id)}
                            />
                        </div>
                        <div>
                            <label>Upload Mode</label>
                            <select value={mode} onChange={e => setMode(e.target.value)}>
                                <option value="append">Append (Add to existing)</option>
                                <option value="replace">Replace (Clear queued & add new)</option>
                            </select>
                        </div>
                        <div>
                            <label>Select File (.csv, .txt)</label>
                            <input type="file" accept=".csv,.txt" onChange={handleFile} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Format: phone, name, email</span>
                                <button
                                    type="button"
                                    onClick={loadSample}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                                >
                                    Load Sample
                                </button>
                            </div>
                        </div>

                        <button className="btn btn-primary" onClick={upload} disabled={!file || !campaignId || loading}>
                            {loading ? 'Uploading...' : 'Upload File'}
                        </button>
                    </div>

                    {message && (
                        <div style={{
                            marginTop: 14,
                            padding: 12,
                            background: message.startsWith('Error') ? 'var(--danger-light)' : 'var(--success-light)',
                            borderRadius: 8,
                            border: `1px solid ${message.startsWith('Error') ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                            color: message.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
                            fontSize: 13,
                            fontWeight: 500
                        }}>
                            {message}
                        </div>
                    )}
                </div>

                {/* Upload History */}
                <div className="card" style={{ flex: '1 1 400px', maxHeight: 500, display: 'flex', flexDirection: 'column' }}>
                    <h3>Upload History</h3>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {history.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', padding: 16, textAlign: 'center', fontSize: 13 }}>
                                No upload history found.
                            </p>
                        ) : (
                            <table style={{ width: '100%', fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: 10, textAlign: 'left' }}>Date</th>
                                        <th style={{ padding: 10, textAlign: 'left' }}>Campaign</th>
                                        <th style={{ padding: 10, textAlign: 'right' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(log => (
                                        <tr key={log._id}>
                                            <td style={{ padding: 10 }}>
                                                {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString()}
                                            </td>
                                            <td style={{ padding: 10 }}>{log.campaignId}</td>
                                            <td style={{ padding: 10, textAlign: 'right' }}>
                                                <span style={{ color: 'var(--success)', marginRight: 8 }}>{log.recordsAccepted} ok</span>
                                                {log.recordsRejected > 0 && <span style={{ color: 'var(--danger)' }}>{log.recordsRejected} err</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Preview */}
            {data.length > 0 && (
                <div style={{ marginTop: 24 }}>
                    <div className="section-label">DATA PREVIEW ({data.length} RECORDS)</div>
                    <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Phone</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.slice(0, 100).map((row, i) => (
                                    <tr key={i}>
                                        <td>{row[0]}</td>
                                        <td>{row[1] || '-'}</td>
                                        <td>{row[2] || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {data.length > 100 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Showing first 100 rows...</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

function CampaignSelector({ selectedId, onSelect }) {
    const [campaigns, setCampaigns] = useState([]);
    const [kbs, setKbs] = useState([]);
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');
    const [newKbId, setNewKbId] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch('/api/v1/campaigns').then(r => r.json()).then(d => d.ok && setCampaigns(d.data));
        fetch('/api/v1/knowledge-bases').then(r => r.json()).then(d => d.ok && setKbs(d.data));
    }, []);

    const createCampaign = async () => {
        if (!newName) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, knowledgeBaseId: newKbId || null })
            });
            const d = await res.json();
            if (d.ok) {
                setCampaigns([d.data, ...campaigns]);
                onSelect(d.data._id);
                setShowNew(false);
                setNewName('');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (showNew) {
        return (
            <div style={{ background: 'var(--bg-primary)', padding: 14, borderRadius: 8, border: '1px solid var(--accent)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 600 }}>New Campaign</h4>
                <input
                    type="text"
                    placeholder="Campaign Name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    style={{ marginBottom: 8 }}
                />
                <select
                    value={newKbId}
                    onChange={e => setNewKbId(e.target.value)}
                    style={{ marginBottom: 10 }}
                >
                    <option value="">-- No Knowledge Base --</option>
                    {kbs.map(kb => (
                        <option key={kb._id} value={kb._id}>{kb.name} ({kb.companyName})</option>
                    ))}
                </select>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowNew(false)} className="btn btn-outline" style={{ fontSize: 12, padding: '4px 12px' }}>Cancel</button>
                    <button onClick={createCampaign} disabled={loading} className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }}>
                        {loading ? 'Creating...' : 'Create'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', gap: 8 }}>
            <select value={selectedId} onChange={e => onSelect(e.target.value)} style={{ flex: 1 }}>
                <option value="">Select or Create Campaign...</option>
                {campaigns.map(c => (
                    <option key={c._id} value={c._id}>
                        {c.name} {c.knowledgeBaseId ? `(KB: ${c.knowledgeBaseId.name || 'Linked'})` : ''}
                    </option>
                ))}
            </select>
            <button
                onClick={() => setShowNew(true)}
                title="Create New Campaign"
                className="btn btn-primary"
                style={{ padding: '0 12px' }}
            >
                +
            </button>
        </div>
    );
}

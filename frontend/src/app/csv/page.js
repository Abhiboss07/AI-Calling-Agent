"use client";
import { useState, useEffect } from 'react';

// Sample data to simulate "numbers.csv" or a template
const SAMPLE_CSV = [
    ['+15550101', 'John Doe', 'john@example.com'],
    ['+15550102', 'Jane Smith', 'jane@example.com'],
    ['+15550103', 'Bob Johnson', 'bob@example.com']
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
        // Create a dummy file object for upload if user clicks upload
        const content = SAMPLE_CSV.map(row => row.join(',')).join('\n');
        const blob = new Blob([content], { type: 'text/csv' });
        const file = new File([blob], 'sample_numbers.csv', { type: 'text/csv' });
        setFile(file);
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

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* Left Column: Upload Form */}
                <div className="card" style={{ flex: '1 1 400px' }}>
                    <h3>Upload Numbers</h3>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Campaign</label>
                            <CampaignSelector
                                selectedId={campaignId}
                                onSelect={(id) => setCampaignId(id)}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Upload Mode</label>
                            <select
                                value={mode}
                                onChange={e => setMode(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px' }}
                            >
                                <option value="append">Append (Add to existing)</option>
                                <option value="replace">Replace (Clear queued & add new)</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Select File (.csv, .txt)</label>
                            <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ width: '100%' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Format: phone, name, email</span>
                                <button type="button" onClick={loadSample} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>
                                    Load Sample
                                </button>
                            </div>
                        </div>

                        <button className="btn btn-primary" onClick={upload} disabled={!file || !campaignId || loading}>
                            {loading ? 'Uploading...' : 'Upload File'}
                        </button>
                    </div>

                    {message && (
                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                            {message}
                        </div>
                    )}
                </div>

                {/* Right Column: Upload History */}
                <div className="card" style={{ flex: '1 1 400px', maxHeight: '500px', display: 'flex', flexDirection: 'column' }}>
                    <h3>Upload History</h3>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {history.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', padding: '1rem', textAlign: 'center' }}>No upload history found.</p>
                        ) : (
                            <table style={{ width: '100%', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Date</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Campaign</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(log => (
                                        <tr key={log._id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                            <td style={{ padding: '0.75rem' }}>{new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString()}</td>
                                            <td style={{ padding: '0.75rem' }}>{log.campaignId}</td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                                                <span style={{ color: 'var(--success)', marginRight: '0.5rem' }}>{log.recordsAccepted} ok</span>
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

            {/* Full Width: Preview */}
            {data.length > 0 && (
                <div style={{ marginTop: '2rem' }}>
                    <h3>Data Preview ({data.length} records)</h3>
                    <div className="table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
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
                        {data.length > 100 && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Showing first 100 rows...</div>}
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
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--accent)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>New Campaign</h4>
                <input
                    type="text"
                    placeholder="Campaign Name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    style={{ width: '100%', marginBottom: '0.5rem', padding: '0.4rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white' }}
                />
                <select
                    value={newKbId}
                    onChange={e => setNewKbId(e.target.value)}
                    style={{ width: '100%', marginBottom: '0.5rem', padding: '0.4rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white' }}
                >
                    <option value="">-- No Knowledge Base --</option>
                    {kbs.map(kb => (
                        <option key={kb._id} value={kb._id}>{kb.name} ({kb.companyName})</option>
                    ))}
                </select>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                    <button onClick={createCampaign} disabled={loading} style={{ background: 'var(--accent)', border: 'none', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '2px', cursor: 'pointer', fontSize: '0.8rem' }}>
                        {loading ? 'Creating...' : 'Create'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
                value={selectedId}
                onChange={e => onSelect(e.target.value)}
                style={{ flex: 1, padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px' }}
            >
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
                className="btn btn-outline"
                style={{ padding: '0 0.8rem', minHeight: 'auto' }}
            >
                +
            </button>
        </div>
    );
}

"use client";
export const runtime = 'edge';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { API_BASE } from '../../lib/api';

export default function KnowledgeBaseList() {
    const [kbs, setKbs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_BASE}/v1/knowledge-bases`)
            .then(res => res.json())
            .then(data => {
                if (data.ok) setKbs(data.data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
                Loading...
            </div>
        );
    }

    return (
        <div>
            <div className="header-actions">
                <h1>Knowledge Bases</h1>
                <Link href="/knowledge-bases/create" className="btn btn-primary">
                    + New Knowledge Base
                </Link>
            </div>

            {kbs.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <FileText size={32} />
                        </div>
                        <h3>No Knowledge Bases found</h3>
                        <p>Create your first knowledge base to get started.</p>
                        <Link href="/knowledge-bases/create" className="btn btn-primary" style={{ marginTop: 16 }}>
                            Create your first one
                        </Link>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                    {kbs.map(kb => (
                        <div key={kb._id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <h3 style={{ margin: 0, fontSize: 16 }}>{kb.name}</h3>
                                <Link
                                    href={`/knowledge-bases/${kb._id}`}
                                    style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}
                                >
                                    Edit
                                </Link>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                <strong>Agent:</strong> {kb.agentName}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                                <strong>Company:</strong> {kb.companyName}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 'auto' }}>
                                Created: {new Date(kb.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

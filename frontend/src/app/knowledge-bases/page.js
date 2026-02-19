"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function KnowledgeBaseList() {
    const [kbs, setKbs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/v1/knowledge-bases')
            .then(res => res.json())
            .then(data => {
                if (data.ok) setKbs(data.data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-8 text-center text-secondary">Loading...</div>;

    return (
        <div>
            <div className="header-actions">
                <h1>Knowledge Bases</h1>
                <Link href="/knowledge-bases/create" className="btn btn-primary">
                    <span>+ New Knowledge Base</span>
                </Link>
            </div>

            {kbs.length === 0 ? (
                <div className="card text-center p-8">
                    <p className="text-secondary mb-4">No Knowledge Bases found.</p>
                    <Link href="/knowledge-bases/create" className="btn btn-primary">
                        Create your first one
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {kbs.map(kb => (
                        <div key={kb._id} className="card hover:border-accent transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-semibold">{kb.name}</h3>
                                <Link href={`/knowledge-bases/${kb._id}`} className="text-accent text-sm hover:underline">
                                    Edit
                                </Link>
                            </div>
                            <div className="text-sm text-secondary mb-2">
                                <strong>Agent:</strong> {kb.agentName}
                            </div>
                            <div className="text-sm text-secondary mb-4">
                                <strong>Company:</strong> {kb.companyName}
                            </div>
                            <div className="text-xs text-secondary opacity-70">
                                Created: {new Date(kb.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

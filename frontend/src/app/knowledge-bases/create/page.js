"use client";
export const runtime = 'edge';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function KnowledgeBaseForm({ params }) {
    const router = useRouter();
    const isEdit = !!params?.id;
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        agentName: '',
        companyName: '',
        systemPrompt: '',
        content: ''
    });

    useEffect(() => {
        if (isEdit) {
            fetch(`/api/v1/knowledge-bases/${params.id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.ok) setFormData(data.data);
                    else setError(data.error);
                })
                .catch(err => setError(err.message))
                .finally(() => setLoading(false));
        }
    }, [isEdit, params?.id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            const url = isEdit
                ? `/api/v1/knowledge-bases/${params.id}`
                : '/api/v1/knowledge-bases';

            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const json = await res.json();
            if (json.ok) {
                router.push('/knowledge-bases');
                router.refresh();
            } else {
                setError(json.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this Knowledge Base?')) return;

        setSaving(true);
        try {
            const res = await fetch(`/api/v1/knowledge-bases/${params.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.ok) {
                router.push('/knowledge-bases');
                router.refresh();
            } else {
                setError(json.error);
                setSaving(false);
            }
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
                Loading...
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Link href="/knowledge-bases" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        ← Back
                    </Link>
                    <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                        {isEdit ? 'Edit Knowledge Base' : 'New Knowledge Base'}
                    </h1>
                </div>
                {isEdit && (
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="btn btn-danger"
                        disabled={saving}
                        style={{ fontSize: 13 }}
                    >
                        Delete
                    </button>
                )}
            </div>

            <div className="card">
                {error && (
                    <div style={{
                        background: 'var(--danger-light)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: 'var(--danger)',
                        padding: 14,
                        borderRadius: 8,
                        marginBottom: 20,
                        fontSize: 13
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                            <label>Internal Name *</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. Real Estate Client A"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label>Company Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Dream Homes"
                                value={formData.companyName}
                                onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label>Agent Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Sarah"
                            value={formData.agentName}
                            onChange={e => setFormData({ ...formData, agentName: e.target.value })}
                        />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label>
                            Knowledge Base Content
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                Provide context for the AI (FAQs, product info, pricing, etc.)
                            </span>
                        </label>
                        <textarea
                            style={{ height: 160, fontFamily: 'monospace', fontSize: 13 }}
                            placeholder="We are a real estate agency specializing in..."
                            value={formData.content}
                            onChange={e => setFormData({ ...formData, content: e.target.value })}
                        />
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <label>
                            System Prompt Override (Optional)
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {"Overrides the default system prompt. Use {{company_name}}, {{agent_name}}, and {{knowledge_base}} variables."}
                            </span>
                        </label>
                        <textarea
                            style={{ height: 130, fontFamily: 'monospace', fontSize: 13 }}
                            placeholder="You are an AI assistant..."
                            value={formData.systemPrompt}
                            onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" disabled={saving} className="btn btn-primary">
                            {saving ? 'Saving...' : (isEdit ? 'Update Knowledge Base' : 'Create Knowledge Base')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

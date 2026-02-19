"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function KnowledgeBaseForm({ params }) {
    const router = useRouter();
    const isEdit = !!params.id; // Correct check for edit mode
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
    }, [isEdit, params.id]);

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

    if (loading) return <div className="p-8 text-center text-secondary">Loading...</div>;

    return (
        <div className="max-w-3xl mx-auto">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/knowledge-bases" className="text-secondary hover:text-primary transition-colors">
                        ← Back
                    </Link>
                    <h1 className="text-2xl font-bold">{isEdit ? 'Edit Knowledge Base' : 'New Knowledge Base'}</h1>
                </div>
                {isEdit && (
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="text-red-500 hover:text-red-400 text-sm px-3 py-1 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors"
                        disabled={saving}
                    >
                        Delete
                    </button>
                )}
            </div>

            <div className="card p-6">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded mb-6">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-2">Internal Name *</label>
                            <input
                                type="text"
                                required
                                className="w-full bg-black/20 border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-accent transition-colors"
                                placeholder="e.g. Real Estate Client A"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-2">Company Name</label>
                            <input
                                type="text"
                                className="w-full bg-black/20 border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-accent transition-colors"
                                placeholder="e.g. Dream Homes"
                                value={formData.companyName}
                                onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-secondary mb-2">Agent Name</label>
                        <input
                            type="text"
                            className="w-full bg-black/20 border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-accent transition-colors"
                            placeholder="e.g. Sarah"
                            value={formData.agentName}
                            onChange={e => setFormData({ ...formData, agentName: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-secondary mb-2">
                            Knowledge Base Content
                            <span className="block text-xs opacity-60 mt-1">Provide context for the AI (FAQs, product info, pricing, etc.)</span>
                        </label>
                        <textarea
                            className="w-full h-40 bg-black/20 border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-accent transition-colors font-mono text-sm"
                            placeholder="We are a real estate agency specializing in..."
                            value={formData.content}
                            onChange={e => setFormData({ ...formData, content: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-secondary mb-2">
                            System Prompt Override (Optional)
                            <span className="block text-xs opacity-60 mt-1">Overrides the default system prompt. Use {"{{company_name}}"}, {"{{agent_name}}"}, and {"{{knowledge_base}}"} variables.</span>
                        </label>
                        <textarea
                            className="w-full h-32 bg-black/20 border border-white/10 rounded px-4 py-2 text-white focus:outline-none focus:border-accent transition-colors font-mono text-sm"
                            placeholder="You are an AI assistant..."
                            value={formData.systemPrompt}
                            onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })}
                        />
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn btn-primary px-8"
                        >
                            {saving ? 'Saving...' : (isEdit ? 'Update Knowledge Base' : 'Create Knowledge Base')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

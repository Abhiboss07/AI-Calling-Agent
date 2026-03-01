'use client';
import { useState, useEffect } from 'react';
import { fetchDocuments, deleteDocument } from '../../lib/api';
import UploadModal from '../../components/UploadModal';
// Add Toast notifications for document actions if you have a toast system, or we can use native alerts

const CATEGORIES = [
    { id: 'All Documents', icon: 'folder', count: 0 },
    { id: 'Property Listings', icon: 'home_work', count: 0 },
    { id: 'Scripts & FAQs', icon: 'description', count: 0 },
    { id: 'Legal & Contracts', icon: 'gavel', count: 0 }
];

export default function KnowledgeBasePage() {
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
    const [activeCategory, setActiveCategory] = useState('All Documents');
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);

    // Chat state
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChatMessages] = useState([
        { role: 'agent', text: "Hi! I've processed your latest listings. You can ask me anything about the Oceanview Penthouse or buyer scripts.", time: '10:24 AM' }
    ]);

    // Upload Modal State
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [uploadType, setUploadType] = useState(null); // 'pdf' | 'url'

    // Fetch documents
    const loadDocuments = async () => {
        setLoading(true);
        try {
            const res = await fetchDocuments(activeCategory);
            setDocuments(res.data || []);
        } catch (error) {
            console.error("Failed to load documents", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDocuments();
    }, [activeCategory]);

    // Handle Document Deletion
    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this document?')) return;
        try {
            await deleteDocument(id);
            setDocuments(prev => prev.filter(d => d._id !== id));
        } catch (err) {
            console.error("Failed to delete", err);
            alert("Failed to delete document");
        }
    };

    // Handle Chat Submit
    const handleChatSubmit = (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;

        const newUserMsg = { role: 'user', text: chatInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        setChatMessages(prev => [...prev, newUserMsg]);
        setChatInput('');

        // Simulate AI response
        setTimeout(() => {
            const aiMsg = {
                role: 'agent',
                text: "I found 3 matching references for that query in your Property Listings. Would you like me to summarize them?",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setChatMessages(prev => [...prev, aiMsg]);
        }, 1000);
    };

    // Calculate Dynamic Categories counts (assuming local for now)
    const categoryCounts = CATEGORIES.map(c => ({
        ...c,
        count: c.id === 'All Documents'
            ? documents.length
            : documents.filter(d => d.category === c.id).length
    }));

    return (
        <div className="flex flex-1 overflow-hidden h-full">
            {/* Left Sidebar: Actions & Controls */}
            <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-background-light dark:bg-background-dark p-6 flex flex-col gap-8">
                <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Ingestion</h3>
                    <div className="space-y-2">
                        <button
                            onClick={() => { setUploadType('pdf'); setIsUploadModalOpen(true); }}
                            className="w-full flex items-center justify-center gap-3 px-3 py-2.5 rounded-lg bg-primary text-white font-medium text-sm transition-all hover:bg-primary/90 shadow-lg"
                        >
                            <span className="material-symbols-outlined text-sm">upload_file</span>
                            Upload PDFs
                        </button>
                        <button
                            onClick={() => { setUploadType('url'); setIsUploadModalOpen(true); }}
                            className="w-full flex items-center justify-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                        >
                            <span className="material-symbols-outlined text-sm">link</span>
                            Sync Website URL
                        </button>
                    </div>
                </div>
                <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Categories</h3>
                    <nav className="space-y-1">
                        {categoryCounts.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${activeCategory === cat.id
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-sm">{cat.icon}</span>
                                    {cat.id}
                                </div>
                                {cat.count > 0 && <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full">{cat.count}</span>}
                            </button>
                        ))}
                    </nav>
                </div>
                <div className="mt-auto">
                    <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Storage Usage</p>
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mb-2">
                            <div className="w-3/4 h-full bg-primary rounded-full"></div>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">750MB / 1GB (75%)</p>
                    </div>
                </div>
            </aside>

            {/* Main Content: Document List */}
            <main className="flex-1 overflow-y-auto p-6 bg-background-light dark:bg-background-dark">
                <div className="w-full max-w-6xl mx-auto">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Learned Documents</h1>
                            <p className="text-slate-500 dark:text-slate-400 text-xs text-balance max-w-md">
                                {activeCategory === 'All Documents' ? 'Manage the resources your AI agent uses to answer client inquiries.' : `Viewing ${activeCategory} documents.`}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded ${viewMode === 'grid' ? 'text-primary bg-primary/10' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                            >
                                <span className="material-symbols-outlined">grid_view</span>
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded ${viewMode === 'list' ? 'text-primary bg-primary/10' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                            >
                                <span className="material-symbols-outlined">view_list</span>
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">
                            <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-700 mb-4">inventory_2</span>
                            <h3 className="text-slate-900 dark:text-slate-100 font-medium mb-1">No documents found</h3>
                            <p className="text-xs text-slate-500 max-w-xs">Upload PDFs or sync Website URLs to expand the agent's knowledge base.</p>
                        </div>
                    ) : viewMode === 'list' ? (
                        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Document Name</th>
                                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Added On</th>
                                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {documents.map(doc => (
                                        <tr key={doc._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-7 h-8 rounded flex items-center justify-center flex-shrink-0 ${doc.type === 'Website URL' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
                                                        <span className="material-symbols-outlined text-[16px]">
                                                            {doc.type === 'Website URL' ? 'language' : 'picture_as_pdf'}
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate pr-2" title={doc.title}>{doc.title}</p>
                                                        <p className="text-[10px] text-slate-400">
                                                            {doc.type === 'Website URL' ? `${doc.pages} pages` : `${Math.round(doc.sizeBytes / 1024)} KB • ${doc.pages} pages`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 whitespace-nowrap">{doc.type}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5 min-w-[70px]">
                                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${doc.status === 'Ready' ? 'bg-emerald-500' : doc.status === 'Processing' ? 'bg-primary animate-pulse' : 'bg-slate-400'}`}></span>
                                                    <span className={`text-[10px] font-medium ${doc.status === 'Ready' ? 'text-emerald-600 dark:text-emerald-400' : doc.status === 'Processing' ? 'text-primary' : 'text-slate-500'}`}>{doc.status}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-[10px] text-slate-500 whitespace-nowrap">
                                                {new Date(doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => handleDelete(doc._id)} className="text-slate-400 hover:text-red-500 transition-colors focus:outline-none">
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : ( // Grid View
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {documents.map(doc => (
                                <div key={doc._id} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-primary/50 transition-colors relative group">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${doc.type === 'Website URL' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
                                            <span className="material-symbols-outlined text-[20px]">
                                                {doc.type === 'Website URL' ? 'language' : 'picture_as_pdf'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-background-light dark:bg-background-dark py-1 px-2 rounded-full border border-slate-200 dark:border-slate-800">
                                            <span className={`w-1.5 h-1.5 rounded-full ${doc.status === 'Ready' ? 'bg-emerald-500' : doc.status === 'Processing' ? 'bg-primary pulse' : 'bg-slate-400'}`}></span>
                                            <span className="text-[9px] font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">{doc.status}</span>
                                        </div>
                                    </div>
                                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate mb-1" title={doc.title}>{doc.title}</h3>
                                    <p className="text-[10px] text-slate-500 mb-4">{doc.type === 'Website URL' ? `${doc.pages} Scraped pages` : `${Math.round(doc.sizeBytes / 1024)} KB • ${doc.pages} pages`}</p>
                                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-200 dark:border-slate-800">
                                        <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{doc.type}</span>
                                        <button onClick={() => handleDelete(doc._id)} className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                            <span className="material-symbols-outlined text-[16px] block">delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Right Sidebar: Test Chat */}
            <aside className="w-80 border-l border-slate-200 dark:border-slate-800 bg-background-light dark:bg-background-dark flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Test Knowledge</h3>
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">Live</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Verify what the AI knows about your uploaded documents.</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex flex-col gap-1.5 max-w-[90%] ${msg.role === 'user' ? 'items-end ml-auto' : ''}`}>
                            <div className={`p-3 rounded-xl ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-slate-100 dark:bg-slate-800 rounded-tl-none'} ${msg.role === 'agent' && i > 0 ? 'border-l-2 border-primary' : ''}`}>
                                <p className={`text-xs ${msg.role === 'agent' ? 'text-slate-700 dark:text-slate-300' : ''}`}>{msg.text}</p>
                            </div>
                            <p className={`text-[10px] text-slate-400 ${msg.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                                {msg.role === 'user' ? 'You' : 'AI Agent'} • {msg.time}
                            </p>
                        </div>
                    ))}
                </div>
                {/* Input Area */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <form onSubmit={handleChatSubmit} className="relative">
                        <textarea
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(e); } }}
                            className="w-full bg-background-light dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg text-xs py-3 pl-3 pr-10 resize-none focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none"
                            placeholder="Ask a question..."
                            rows="2"
                        ></textarea>
                        <button type="submit" className="absolute right-2 bottom-2 pt-1 pb-0.5 px-1.5 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors">
                            <span className="material-symbols-outlined text-[16px] leading-none">send</span>
                        </button>
                    </form>
                    <div className="flex items-center justify-between mt-3 px-1">
                        <div className="flex gap-2">
                            {/* Removed the extra Mic symbol requested by user, keeping only Voice Settings icon */}
                            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Voice Settings">
                                <span className="material-symbols-outlined text-sm">settings_voice</span>
                            </button>
                        </div>
                        <button onClick={() => setChatMessages([])} className="text-[10px] font-bold text-slate-400 uppercase hover:text-red-500 transition-colors">Reset Chat</button>
                    </div>
                </div>
            </aside>

            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                type={uploadType}
                onUploadComplete={(newDoc) => {
                    // Prepend new doc to the current view if categories match or we are on "All Documents"
                    if (activeCategory === 'All Documents' || newDoc.category === activeCategory) {
                        setDocuments(prev => [newDoc, ...prev]);
                    }
                }}
            />
        </div>
    );
}

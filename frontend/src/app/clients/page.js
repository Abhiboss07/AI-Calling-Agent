'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchClients, fetchTranscript } from '../../lib/api';

function TranscriptModal({ isOpen, onClose, clientPhone, transcriptText, loading }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[80vh]">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">description</span>
                        Transcript
                        <span className="text-sm font-normal text-slate-500 ml-2">{clientPhone}</span>
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-950/50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500 animate-pulse">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">hourglass_empty</span>
                            <p>Loading transcript data...</p>
                        </div>
                    ) : transcriptText ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none font-mono text-xs leading-relaxed whitespace-pre-wrap">
                            {transcriptText}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">speaker_notes_off</span>
                            <p>No transcript available for this client&apos;s last call.</p>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ClientsManagementPage() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Dropdown state
    const [activeDropdown, setActiveDropdown] = useState(null);
    const dropdownRef = useRef(null);

    // Transcript Modal state
    const [isTranscriptModalOpen, setIsTranscriptModalOpen] = useState(false);
    const [selectedClientPhone, setSelectedClientPhone] = useState(null);
    const [transcriptText, setTranscriptText] = useState("");
    const [isTranscriptLoading, setIsTranscriptLoading] = useState(false);

    useEffect(() => {
        let isMounted = true;
        async function getClients() {
            try {
                setLoading(true);
                const res = await fetchClients(page, 20);
                if (isMounted && res.ok) {
                    setClients(res.data || []);
                    // Basic calculation if 'res.total' were present, or assume 1 page for now
                    setTotalPages(res.total ? Math.ceil(res.total / 20) : 1);
                }
            } catch (err) {
                console.error("Failed to load clients:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        getClients();

        return () => { isMounted = false; };
    }, [page]);

    // Handle clicking outside the dropdown to close it
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setActiveDropdown(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleViewTranscript = async (client) => {
        setActiveDropdown(null);
        setSelectedClientPhone(client.phoneNumber);
        setTranscriptText("");
        setIsTranscriptModalOpen(true);
        setIsTranscriptLoading(true);

        try {
            if (!client.lastCallId) {
                setTranscriptText(null);
                return;
            }
            const res = await fetchTranscript(client.lastCallId);
            if (res && res.parsed && res.parsed.text) {
                setTranscriptText(res.parsed.text);
            } else {
                setTranscriptText(null);
            }
        } catch (err) {
            console.error("Failed to load transcript:", err);
            setTranscriptText("Error loading transcript. Please try again later.");
        } finally {
            setIsTranscriptLoading(false);
        }
    };

    return (
        <div className="flex-1 max-w-[1440px] mx-auto w-full p-6">
            {/* Header Info */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white">Client Management</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">View historical interactions and call metrics for every contact.</p>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all font-medium text-sm">
                        <span className="material-symbols-outlined text-sm">download</span>
                        Export CSV
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                    <h3 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                        <span className="material-symbols-outlined text-primary">contacts</span>
                        Contact Directory
                    </h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-widest font-bold border-b border-slate-200 dark:border-slate-800">
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider">Phone Number</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider">Total Calls</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider">Total Duration</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider">Last Interaction</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-slate-500 text-sm animate-pulse">
                                        Loading client data from system...
                                    </td>
                                </tr>
                            ) : clients.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-slate-500 text-sm">
                                        No clients found in the system yet.
                                    </td>
                                </tr>
                            ) : (
                                clients.map((client, idx) => {
                                    const durationMins = Math.floor(client.totalDuration / 60);
                                    const durationSecs = client.totalDuration % 60;

                                    return (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                        <span className="material-symbols-outlined text-[16px]">person</span>
                                                    </div>
                                                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-200 font-mono">
                                                        {client.phoneNumber}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                                    {client.totalCalls}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                                    {durationMins > 0 ? `${durationMins}m ` : ''}{durationSecs}s
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                                    {client.lastCall ? new Date(client.lastCall).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right relative">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveDropdown(activeDropdown === idx ? null : idx);
                                                    }}
                                                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
                                                >
                                                    <span className="material-symbols-outlined text-[20px] leading-none">more_vert</span>
                                                </button>

                                                {/* Action Dropdown */}
                                                {activeDropdown === idx && (
                                                    <div
                                                        ref={dropdownRef}
                                                        className="absolute right-8 top-10 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-10 animate-fade-in origin-top-right text-left"
                                                    >
                                                        <button
                                                            onClick={() => handleViewTranscript(client)}
                                                            className="w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">description</span>
                                                            View Transcript
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                    <span className="text-xs text-slate-500 font-medium">Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                            className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary disabled:opacity-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">chevron_left</span>
                        </button>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => p + 1)}
                            className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary disabled:opacity-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            <TranscriptModal
                isOpen={isTranscriptModalOpen}
                onClose={() => setIsTranscriptModalOpen(false)}
                clientPhone={selectedClientPhone}
                transcriptText={transcriptText}
                loading={isTranscriptLoading}
            />
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { fetchClients } from '../../lib/api';

export default function ClientsManagementPage() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

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
                                            <td className="px-6 py-4 text-right">
                                                <button className="text-slate-400 hover:text-primary transition-colors focus:outline-none">
                                                    <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                                                </button>
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
        </div>
    );
}

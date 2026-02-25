"use client";
export const runtime = 'edge';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';

export default function ClientList() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const res = await fetch(`/api/v1/clients?page=${page}`);
                const data = await res.json();
                if (data.ok) setClients(data.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [page]);

    return (
        <div>
            <div className="header-actions">
                <h1>Clients</h1>
            </div>

            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Phone Number</th>
                            <th>Total Calls</th>
                            <th>Total Duration (min)</th>
                            <th>Last Call</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</td></tr>
                        ) : clients.length === 0 ? (
                            <tr>
                                <td colSpan="5">
                                    <div className="empty-state">
                                        <div className="empty-state-icon">
                                            <Users size={32} />
                                        </div>
                                        <h3>No clients found</h3>
                                        <p>Start a campaign or upload numbers to see clients here.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            clients.map(client => (
                                <tr key={client.phoneNumber}>
                                    <td style={{ fontWeight: 600 }}>{client.phoneNumber}</td>
                                    <td>{client.totalCalls}</td>
                                    <td>{(client.totalDuration / 60).toFixed(1)}</td>
                                    <td>{new Date(client.lastCall).toLocaleString()}</td>
                                    <td>
                                        <Link
                                            href={`/clients/${encodeURIComponent(client.phoneNumber)}`}
                                            className="btn btn-outline"
                                            style={{ fontSize: 12, padding: '4px 12px' }}
                                        >
                                            Details
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="pagination">
                <button
                    className="btn btn-outline"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                >
                    Previous
                </button>
                <span>Page {page}</span>
                <button className="btn btn-outline" onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
        </div>
    );
}

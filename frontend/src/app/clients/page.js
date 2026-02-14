"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';

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
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
                        ) : clients.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No clients found</td></tr>
                        ) : (
                            clients.map(client => (
                                <tr key={client.phoneNumber}>
                                    <td>{client.phoneNumber}</td>
                                    <td>{client.totalCalls}</td>
                                    <td>{(client.totalDuration / 60).toFixed(1)}</td>
                                    <td>{new Date(client.lastCall).toLocaleString()}</td>
                                    <td>
                                        <Link
                                            href={`/clients/${encodeURIComponent(client.phoneNumber)}`}
                                            className="btn btn-outline"
                                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
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

            <div className="pagination" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button
                    className="btn btn-outline"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    style={{ opacity: page <= 1 ? 0.5 : 1 }}
                >
                    Previous
                </button>
                <span style={{ color: 'var(--text-secondary)' }}>Page {page}</span>
                <button className="btn btn-outline" onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
        </div>
    );
}

// Allow overriding the API base at deploy time via NEXT_PUBLIC_API_BASE
export const API_BASE = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE)
    ? process.env.NEXT_PUBLIC_API_BASE.replace(/\/+$/,'')
    : '/api';

export async function fetchMetrics() {
    const res = await fetch(`${API_BASE}/v1/metrics`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch metrics');
    return res.json();
}

export async function fetchClients(page = 1, perPage = 20) {
    const res = await fetch(`${API_BASE}/v1/clients?page=${page}&perPage=${perPage}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch clients');
    return res.json();
}

export async function fetchCalls(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/v1/calls?${query}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch calls');
    return res.json();
}

export async function fetchCallDetails(id) {
    const res = await fetch(`${API_BASE}/v1/calls/${id}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch call details');
    return res.json();
}

export async function fetchTranscript(id) {
    const res = await fetch(`${API_BASE}/v1/calls/${id}/transcript`, { cache: 'no-store' });
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch transcript');
    }
    return res.json();
}

export async function uploadCSV(csvText, campaignId = 'default', mode = 'append') {
    const res = await fetch(`${API_BASE}/v1/calls/upload-numbers?campaignId=${encodeURIComponent(campaignId)}&mode=${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText
    });
    if (!res.ok) throw new Error('Failed to upload CSV');
    return res.json();
}

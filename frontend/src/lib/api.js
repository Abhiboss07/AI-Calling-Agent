// Allow overriding the API base at deploy time via NEXT_PUBLIC_API_BASE.
// For backward compatibility, NEXT_PUBLIC_API_URL is also supported.
// When using an external backend the value should include the host only (no
// trailing slash); '/api' will be added automatically. If the variable already
// contains '/api' the suffix is not duplicated.
export const API_BASE = (() => {
    let base = '/api';
    if (typeof process !== 'undefined') {
        const configuredBase = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL;
        if (!configuredBase) return base;

        base = configuredBase.replace(/\/+$/, '');
        if (!base.match(/\/api(\/|$)/)) {
            base = base + '/api';
        }
    }
    return base;
})();

export function getAuthHeaders() {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('ea_token');
        if (token) return { 'Authorization': `Bearer ${token}` };
    }
    return {};
}

export async function fetchMetrics() {
    const res = await fetch(`${API_BASE}/v1/metrics`, { cache: 'no-store', headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch metrics');
    return res.json();
}

export async function fetchStats() {
    const res = await fetch(`${API_BASE}/v1/stats`, { cache: 'no-store', headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
}

export async function fetchClients(page = 1, perPage = 20) {
    const res = await fetch(`${API_BASE}/v1/clients?page=${page}&perPage=${perPage}`, { cache: 'no-store', headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch clients');
    return res.json();
}

export async function fetchCalls(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/v1/calls?${query}`, { cache: 'no-store', headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch calls');
    return res.json();
}

export async function fetchCallDetails(id) {
    const res = await fetch(`${API_BASE}/v1/calls/${id}`, { cache: 'no-store', headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch call details');
    return res.json();
}

export async function fetchWallet() {
    const res = await fetch(`${API_BASE}/v1/wallet`, { cache: 'no-store', headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch wallet info');
    return res.json();
}

export async function fetchStartCall(campaignId, phoneNumber, language = 'en') {
    const res = await fetch(`${API_BASE}/v1/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ campaignId, phoneNumber, language })
    });

    // Check for conflict (409) or other errors to throw a descriptive issue
    if (!res.ok) {
        let errStr = "Failed to start call";
        try {
            const errData = await res.json();
            if (errData.error) errStr = errData.error;
        } catch (e) { }
        throw new Error(errStr);
    }

    return res.json();
}

export async function fetchTranscript(id) {
    const res = await fetch(`${API_BASE}/v1/calls/${id}/transcript`, { cache: 'no-store', headers: getAuthHeaders() });
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch transcript');
    }
    return res.json();
}

export async function uploadCSV(csvText, campaignId = 'default', mode = 'append') {
    const res = await fetch(`${API_BASE}/v1/calls/upload-numbers?campaignId=${encodeURIComponent(campaignId)}&mode=${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv', ...getAuthHeaders() },
        body: csvText
    });
    if (!res.ok) throw new Error('Failed to upload CSV');
    return res.json();
}

export async function updateProfile(data) {
    const res = await fetch(`${API_BASE}/v1/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function changePassword(data) {
    const res = await fetch(`${API_BASE}/v1/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function updateAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await fetch(`${API_BASE}/v1/auth/avatar`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
    });
    return res.json();
}

export async function deleteAccount() {
    const res = await fetch(`${API_BASE}/v1/auth/account`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE BASE (DOCUMENTS)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchDocuments(category = 'All Documents') {
    // Use URL to cleanly handle query params
    const url = new URL(`${API_BASE}/v1/documents`, window.location.origin);
    url.searchParams.append('category', category);

    const res = await fetch(url.toString(), { cache: 'no-store', headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch documents');
    return res.json();
}

export async function deleteDocument(id) {
    const res = await fetch(`${API_BASE}/v1/documents/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete document');
    return res.json();
}

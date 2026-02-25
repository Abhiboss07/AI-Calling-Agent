export async function makeOutboundCall(env, { to, from, answerUrl, hangupUrl }) {
    const callerId = from || env.VOBIZ_CALLER_ID;
    const url = `https://api.vobiz.ai/api/v1/Account/${env.VOBIZ_AUTH_ID}/Call/`;

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Auth-ID': env.VOBIZ_AUTH_ID,
            'X-Auth-Token': env.VOBIZ_AUTH_TOKEN,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            to,
            from: callerId,
            answer_url: answerUrl,
            answer_method: 'POST',
            hangup_url: hangupUrl,
            hangup_method: 'POST',
            ring_timeout: 30,
            machine_detection: 'true'
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Vobiz Call Error: ${resp.status} - ${errText}`);
    }

    const data = await resp.json();
    return {
        callUuid: data.request_uuid || data.call_uuid || data.callUuid,
        sid: data.request_uuid || data.call_uuid || data.callUuid,
        message: data.message
    };
}

export async function endCall(env, callUuid) {
    const url = `https://api.vobiz.ai/api/v1/Account/${env.VOBIZ_AUTH_ID}/Call/${callUuid}/`;

    const resp = await fetch(url, {
        method: 'DELETE',
        headers: {
            'X-Auth-ID': env.VOBIZ_AUTH_ID,
            'X-Auth-Token': env.VOBIZ_AUTH_TOKEN
        }
    });

    if (!resp.ok && resp.status !== 404) {
        const errText = await resp.text();
        throw new Error(`Vobiz End Call Error: ${resp.status} - ${errText}`);
    }

    return true;
}

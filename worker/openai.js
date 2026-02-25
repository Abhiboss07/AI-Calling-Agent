export async function transcribeAudio(env, buffer, language = 'en') {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    if (language) formData.append('language', language);

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`
        },
        body: formData
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`OpenAI STT Error: ${resp.status} - ${errText}`);
    }

    return resp.json();
}

export async function chatCompletion(env, messages, model = 'gpt-4o-mini', opts = {}) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: opts.temperature ?? 0.3,
            max_tokens: opts.max_tokens ?? 200
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`OpenAI LLM Error: ${resp.status} - ${errText}`);
    }

    return resp.json();
}

export async function ttsSynthesize(env, text, voice = 'alloy', format = 'mp3') {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'tts-1',
            voice,
            input: text,
            response_format: format === 'pcm' ? 'pcm' : 'mp3'
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`OpenAI TTS Error: ${resp.status} - ${errText}`);
    }

    return resp.arrayBuffer();
}

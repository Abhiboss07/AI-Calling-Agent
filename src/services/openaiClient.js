const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

const OPENAI_BASE = 'https://api.openai.com';

function getAuthHeaders(){
  return { Authorization: `Bearer ${config.openaiApiKey}` };
}

async function transcribeAudio(buffer, mimeType='audio/wav'){
  if(!config.openaiApiKey) throw new Error('OPENAI_API_KEY missing');
  const form = new FormData();
  form.append('file', buffer, { filename: 'audio.wav', contentType: mimeType });
  form.append('model', 'whisper-1');

  const fn = async ()=>{
    const resp = await axios.post(`${OPENAI_BASE}/v1/audio/transcriptions`, form, {
      headers: { ...form.getHeaders(), ...getAuthHeaders() },
      timeout: 20000
    });
    return resp.data; // {text: '...'}
  };
  return retry(fn, {retries:3, minDelay:300, factor:2});
}

async function chatCompletion(messages, model='gpt-4o-mini', opts={}){
  if(!config.openaiApiKey) throw new Error('OPENAI_API_KEY missing');
  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.0,
    max_tokens: opts.max_tokens ?? 256
  };
  const fn = async ()=>{
    const resp = await axios.post(`${OPENAI_BASE}/v1/chat/completions`, body, { headers: { 'Content-Type':'application/json', ...getAuthHeaders() }, timeout: 10000 });
    return resp.data;
  };
  return retry(fn, {retries:2, minDelay:200, factor:2});
}

async function ttsSynthesize(text, voice='alloy'){
  if(!config.openaiApiKey) throw new Error('OPENAI_API_KEY missing');
  const body = { model: 'gpt-4o-mini-tts', voice, input: text };
  // Some OpenAI TTS endpoints return audio directly; we request arraybuffer
  const fn = async ()=>{
    const resp = await axios.post(`${OPENAI_BASE}/v1/audio/speech`, body, { headers: { 'Content-Type':'application/json', ...getAuthHeaders() }, responseType: 'arraybuffer', timeout: 15000 });
    return resp.data; // ArrayBuffer -> Buffer
  };
  return retry(fn, {retries:2, minDelay:200, factor:2});
}

module.exports = { transcribeAudio, chatCompletion, ttsSynthesize };

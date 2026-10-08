'use strict';

const { respond, authorize } = require('../lib/common');

const MAX_BYTES = 4.5 * 1024 * 1024; // batas request Netlify 6 MB, sisakan ruang
const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

async function requestTranscript(model, buf, prompt, key) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/wav' }), 'potongan.wav');
  form.append('model', model);
  form.append('language', 'id');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (prompt) form.append('prompt', prompt);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 24000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { raw: text.slice(0, 300) };
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// Menerima satu potongan audio WAV (biner) dan mengembalikan teksnya.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Metode tidak diizinkan.' });
  const denied = await authorize(event);
  if (denied) return denied;

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return respond(500, {
      error: 'OPENAI_API_KEY belum diatur di Netlify. Fitur suara memerlukan API OpenAI.',
    });
  }

  const buf = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'binary');
  if (!buf.length) return respond(400, { error: 'Potongan audio kosong.' });
  if (buf.length > MAX_BYTES) {
    return respond(413, { error: 'Potongan audio terlalu besar. Muat ulang halaman dan coba lagi.' });
  }

  let prompt = '';
  try {
    prompt = decodeURIComponent((event.headers || {})['x-prompt'] || '').slice(0, 600);
  } catch (_) {
    prompt = '';
  }

  const primary = process.env.TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
  try {
    let r = await requestTranscript(primary, buf, prompt, key);
    // Jika model tidak dikenal, coba whisper-1 sebagai cadangan.
    if (!r.ok && (r.status === 404 || /model/i.test(JSON.stringify(r.data || {}))) && primary !== 'whisper-1') {
      r = await requestTranscript('whisper-1', buf, prompt, key);
    }
    if (!r.ok) {
      let msg = 'Transkripsi gagal.';
      if (r.status === 401 || r.status === 403) msg = 'OPENAI_API_KEY tidak valid atau tidak punya akses.';
      else if (r.status === 429) msg = 'Batas pemakaian atau kuota API OpenAI tercapai.';
      else if (r.status >= 500) msg = 'Layanan transkripsi sedang sibuk.';
      else if (r.data && r.data.error && r.data.error.message) msg = String(r.data.error.message).slice(0, 200);
      return respond(r.status >= 500 || r.status === 429 ? r.status : 502, { error: msg });
    }
    return respond(200, { text: String((r.data && r.data.text) || '').trim() });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      return respond(504, { error: 'Waktu habis saat transkripsi potongan audio.' });
    }
    return respond(502, { error: 'Tidak bisa menghubungi layanan transkripsi.' });
  }
};

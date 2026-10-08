'use strict';

const { respond, authorize, envInt } = require('../lib/common');
const { callLLM } = require('../lib/llm');
const { buildPrompt, parseJsonLoose } = require('../lib/prompts');

// Satu panggilan = satu bagian dari satu tugas. Teks tidak disimpan di server.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Metode tidak diizinkan.' });
  const denied = await authorize(event);
  if (denied) return denied;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return respond(400, { error: 'Format permintaan tidak valid.' });
  }

  const { task, part } = body;
  const payload = body.payload || {};
  const maxChars = envInt('MAX_INPUT_CHARS', 120000);

  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    return respond(400, { error: 'Bahan teks kosong.' });
  }
  if (payload.text.length > maxChars) {
    return respond(413, {
      error: `Teks terlalu panjang (maksimal ${maxChars.toLocaleString('id-ID')} karakter). Pecah menjadi beberapa bagian.`,
    });
  }

  let prompt;
  try {
    prompt = buildPrompt(task, part, payload);
  } catch (e) {
    return respond(e.status || 400, { error: e.message });
  }

  try {
    const out = await callLLM(prompt);
    if (task === 'audit') {
      const data = parseJsonLoose(out.text);
      return respond(200, {
        data,
        parsed: !!data,
        provider: out.provider,
        model: out.model,
      });
    }
    return respond(200, {
      text: (out.text || '').trim(),
      truncated: !!out.truncated,
      provider: out.provider,
      model: out.model,
    });
  } catch (e) {
    // Semua kegagalan dari penyedia AI dikirim sebagai 502/504 agar tidak
    // tertukar dengan 401 (kata sandi aplikasi salah).
    return respond(e.status === 504 ? 504 : e.status === 500 ? 500 : 502, {
      error: e.message || 'Terjadi kesalahan saat memanggil AI.',
    });
  }
};

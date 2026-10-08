'use strict';

const crypto = require('crypto');

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function respond(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

// Alamat dasar API. Di Netlify, AI Gateway menyuntikkan *_BASE_URL secara otomatis.
function anthropicUrl(path) {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com')
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '');
  return base + '/v1' + path;
}

function openaiUrl(path) {
  let base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (!/\/v1$/.test(base)) base += '/v1';
  return base + path;
}

function sha(s) {
  return crypto.createHash('sha256').update(String(s)).digest();
}

function envInt(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getProvider() {
  const wanted = (process.env.LLM_PROVIDER || '').toLowerCase().trim();
  if (wanted === 'anthropic' || wanted === 'claude') return 'anthropic';
  if (wanted === 'openai' || wanted === 'chatgpt') return 'openai';
  // Tidak diatur: pilih yang kuncinya tersedia.
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'openai';
}

function getModel(provider) {
  if (provider === 'anthropic') return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  return process.env.OPENAI_MODEL || 'gpt-4.1';
}

/**
 * Memeriksa kata sandi akses dari header x-app-password.
 * Mengembalikan objek respons error jika gagal, atau null jika lolos.
 */
async function authorize(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return respond(500, {
      error: 'APP_PASSWORD belum diatur di Environment Variables Netlify.',
    });
  }
  let given = req.headers.get('x-app-password') || '';
  try {
    given = decodeURIComponent(given);
  } catch (_) {
    /* biarkan apa adanya */
  }
  if (!crypto.timingSafeEqual(sha(given), sha(expected))) {
    // Jeda kecil untuk memperlambat tebak-tebakan kata sandi.
    await new Promise((r) => setTimeout(r, 700));
    return respond(401, { error: 'Kata sandi salah.' });
  }
  return null;
}

module.exports = { respond, authorize, envInt, getProvider, getModel, anthropicUrl, openaiUrl };

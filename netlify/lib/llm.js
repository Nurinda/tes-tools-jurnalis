'use strict';

const { envInt, getProvider, getModel, baseUrl } = require('./common');

async function postJson(url, headers, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const err = new Error('Kelamaan menunggu jawaban. Coba ulangi, atau pakai teks yang lebih pendek.');
      err.status = 504;
      throw err;
    }
    const err = new Error('Layanan sedang tidak bisa dihubungi. Coba lagi sebentar lagi.');
    err.status = 502;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function upstreamError(provider, r) {
  const raw = JSON.stringify(r.data || {});
  const detail =
    (r.data && r.data.error && (r.data.error.message || r.data.error)) || '';
  let msg;
  if (r.status === 401 || r.status === 403) {
    msg = `API key ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} tidak valid atau tidak punya akses. Periksa Environment Variables di Netlify.`;
  } else if (r.status === 404 || /model/i.test(raw) && /not.?found|does not exist|invalid/i.test(raw)) {
    msg = `Nama model tidak dikenali. Periksa ${provider === 'anthropic' ? 'ANTHROPIC_MODEL' : 'OPENAI_MODEL'} di Netlify.`;
  } else if (r.status === 429) {
    msg = 'Kuota pemakaian sedang habis. Tunggu sebentar atau hubungi admin.';
  } else if (r.status === 529 || r.status >= 500) {
    msg = 'Layanan sedang sibuk. Coba lagi sebentar lagi.';
  } else {
    msg = `Permintaan ke AI ditolak (${r.status}). ${typeof detail === 'string' ? detail.slice(0, 200) : ''}`.trim();
  }
  const err = new Error(msg);
  err.status = 502;
  return err;
}

function mentionsTemperature(r) {
  return r.status === 400 && /temperature/i.test(JSON.stringify(r.data || {}));
}

function mentionsReasoning(r) {
  return r.status === 400 && /reasoning/i.test(JSON.stringify(r.data || {}));
}

// Model keluarga GPT-5 / o-series adalah model penalaran: tidak menerima
// temperature selain bawaan dan memakai sebagian token untuk berpikir.
function isReasoningModel(model) {
  return /^(gpt-5|o\d)/i.test(model || '');
}

async function callAnthropic({ system, user, maxTokens, temperature }, timeoutMs) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const e = new Error('ANTHROPIC_API_KEY belum diatur di Netlify.');
    e.status = 500;
    throw e;
  }
  const body = {
    model: getModel('anthropic'),
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  };
  const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  const url = baseUrl('ANTHROPIC_BASE_URL', 'https://api.anthropic.com') + '/v1/messages';
  let r = await postJson(url, headers, body, timeoutMs);
  if (!r.ok && mentionsTemperature(r)) {
    delete body.temperature; // beberapa model tidak menerima parameter ini
    r = await postJson(url, headers, body, timeoutMs);
  }
  if (!r.ok) throw upstreamError('anthropic', r);
  const blocks = Array.isArray(r.data.content) ? r.data.content : [];
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join(''),
    truncated: r.data.stop_reason === 'max_tokens',
  };
}

async function callOpenAI({ system, user, maxTokens, temperature }, timeoutMs) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const e = new Error('OPENAI_API_KEY belum diatur di Netlify.');
    e.status = 500;
    throw e;
  }
  const model = getModel('openai');
  const reasoning = isReasoningModel(model);
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: maxTokens,
    temperature,
  };
  if (reasoning) {
    delete body.temperature;
    // Penalaran minimal agar cepat dan token tidak habis sebelum teks keluar.
    body.reasoning_effort = process.env.OPENAI_REASONING_EFFORT || 'minimal';
    body.max_completion_tokens = maxTokens * 2;
  }
  const headers = { Authorization: `Bearer ${key}` };
  const url = openaiBase() + '/chat/completions';
  let r = await postJson(url, headers, body, timeoutMs);
  if (!r.ok && body.reasoning_effort && mentionsReasoning(r)) {
    // Beberapa versi GPT-5 tidak mengenal 'minimal'; coba 'low', lalu tanpa parameter.
    body.reasoning_effort = 'low';
    r = await postJson(url, headers, body, timeoutMs);
    if (!r.ok && mentionsReasoning(r)) {
      delete body.reasoning_effort;
      r = await postJson(url, headers, body, timeoutMs);
    }
  }
  if (!r.ok && mentionsTemperature(r)) {
    delete body.temperature;
    r = await postJson(url, headers, body, timeoutMs);
  }
  if (!r.ok) throw upstreamError('openai', r);
  const choice = (r.data.choices && r.data.choices[0]) || {};
  return {
    text: (choice.message && choice.message.content) || '',
    truncated: choice.finish_reason === 'length',
  };
}

function openaiBase() {
  const b = baseUrl('OPENAI_BASE_URL', 'https://api.openai.com/v1');
  return /\/v1$/.test(b) ? b : b + '/v1';
}

async function callLLM(prompt) {
  const timeoutMs = envInt('LLM_TIMEOUT_MS', 25000);
  const provider = getProvider();
  const out =
    provider === 'anthropic'
      ? await callAnthropic(prompt, timeoutMs)
      : await callOpenAI(prompt, timeoutMs);
  return Object.assign(out, { provider, model: getModel(provider) });
}

module.exports = { callLLM, openaiBase };

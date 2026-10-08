import common from '../lib/common.js';

const { respond, authorize, envInt } = common;

// Membuat gambar ilustrasi lewat model gambar Gemini (Netlify AI Gateway).
// Gambar dikirim balik sebagai base64 dan tidak disimpan di server.

const STYLES = {
  photo:
    'An authentic editorial stock photograph, the kind found on Freepik, Unsplash or Canva photo libraries. ' +
    'Shot on a full-frame DSLR with a 35mm or 50mm prime lens, natural available light, realistic depth of field, ' +
    'true-to-life colors with gentle contrast, subtle natural film grain, slight real-world imperfections ' +
    '(dust, uneven surfaces, natural wear). Candid documentary feel, not staged.',
  still:
    'A natural still-life / object stock photograph like a premium Freepik or Canva photo. ' +
    'Real objects on a real surface, soft window light, realistic shadows and textures, shallow depth of field, ' +
    'muted true-to-life colors, clean but lived-in composition.',
  place:
    'A realistic documentary-style photograph of a place or scene, like a professional news agency or stock photo. ' +
    'Natural daylight or ambient light, realistic perspective, wide establishing composition, ' +
    'true-to-life colors, subtle grain, no dramatic effects.',
  flat:
    'A clean flat vector illustration in the style of popular Freepik and Canva editorial illustrations. ' +
    'Simple geometric shapes, limited harmonious palette, subtle grain texture, generous negative space, ' +
    'balanced composition suitable for a news article header.',
  isometric:
    'A tidy isometric vector illustration in the style of Freepik and Canva infographic illustrations. ' +
    'Soft pastel palette, clean outlines, simple objects and buildings, gentle shadows, white or light background.',
};

const RATIOS = ['16:9', '1:1', '4:5', '9:16', '3:2'];

const BASE_RULES = [
  'Make it look like a real, professionally made stock asset, never like an AI render.',
  'Avoid the typical AI look: no plastic or waxy skin, no over-smoothing, no oversaturated or neon colors, no HDR glow, ' +
    'no excessive bokeh, no glossy CGI surfaces, no fantasy lighting, no perfect symmetry, no surreal or melting details.',
  'Do not add any text, letters, captions, logos, brand names, watermarks, signatures or UI elements in the image.',
  'Keep every object physically plausible with correct proportions and correct counts (hands, fingers, wheels, legs).',
];

const NO_FACES =
  'Do not show any recognizable human face or portrait. Prefer scenes without people. ' +
  'If people are needed to tell the story, show them only from behind, as distant small figures, as silhouettes, ' +
  'cropped to hands or feet, or heavily out of focus in the background. Never a close-up of a person.';

function buildImagePrompt({ prompt, style, noFaces }) {
  return [
    STYLES[style] || STYLES.photo,
    '',
    'Subject (the description may be written in Indonesian; the setting is Indonesia unless stated otherwise):',
    prompt,
    '',
    'Rules:',
    ...BASE_RULES.concat(noFaces ? [NO_FACES] : []).map((r) => '- ' + r),
  ].join('\n');
}

function gemini() {
  if (process.env.GEMINI_API_KEY) {
    return {
      key: process.env.GEMINI_API_KEY,
      base: (process.env.GOOGLE_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, ''),
    };
  }
  if (process.env.NETLIFY_AI_GATEWAY_KEY && process.env.NETLIFY_AI_GATEWAY_BASE_URL) {
    return {
      key: process.env.NETLIFY_AI_GATEWAY_KEY,
      base: process.env.NETLIFY_AI_GATEWAY_BASE_URL.replace(/\/+$/, ''),
    };
  }
  return null;
}

async function requestImage(cfg, model, text, ratio, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: ratio },
        },
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      data = { raw: raw.slice(0, 300) };
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function pickImage(data) {
  const cands = (data && data.candidates) || [];
  for (const c of cands) {
    const parts = (c.content && c.content.parts) || [];
    for (const p of parts) {
      const d = p.inlineData || p.inline_data;
      if (d && d.data) return { data: d.data, mime: d.mimeType || d.mime_type || 'image/png' };
    }
  }
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'Metode tidak diizinkan.' });
  const denied = await authorize(req);
  if (denied) return denied;

  let body;
  try {
    body = JSON.parse((await req.text()) || '{}');
  } catch (_) {
    return respond(400, { error: 'Format permintaan tidak valid.' });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return respond(400, { error: 'Deskripsi gambarnya masih kosong.' });
  if (prompt.length > 2000) return respond(413, { error: 'Deskripsinya terlalu panjang (maksimal 2.000 karakter).' });

  const style = STYLES[body.style] ? body.style : 'photo';
  const ratio = RATIOS.includes(body.ratio) ? body.ratio : '16:9';
  const noFaces = body.noFaces !== false;

  const cfg = gemini();
  if (!cfg) {
    return respond(500, { error: 'Layanan gambar belum aktif. Pastikan AI Gateway Netlify menyala untuk situs ini.' });
  }

  const text = buildImagePrompt({ prompt, style, noFaces });
  const timeoutMs = envInt('IMAGE_TIMEOUT_MS', 28000);
  const primary = process.env.IMAGE_MODEL || 'gemini-3.1-flash-image';

  try {
    let r = await requestImage(cfg, primary, text, ratio, timeoutMs);
    // Jika model tidak dikenal, coba model gambar cadangan.
    if (!r.ok && r.status === 404 && primary !== 'gemini-2.5-flash-image') {
      r = await requestImage(cfg, 'gemini-2.5-flash-image', text, ratio, timeoutMs);
    }
    if (!r.ok) {
      let msg = 'Gambar gagal dibuat.';
      if (r.status === 401 || r.status === 403) msg = 'Akses ke layanan gambar ditolak. Periksa pengaturan AI Gateway di Netlify.';
      else if (r.status === 429) msg = 'Batas pemakaian layanan gambar tercapai. Tunggu sebentar lalu coba lagi.';
      else if (r.status >= 500) msg = 'Layanan gambar sedang sibuk. Coba lagi sebentar lagi.';
      else if (r.data && r.data.error && r.data.error.message) msg = 'Gambar gagal dibuat: ' + String(r.data.error.message).slice(0, 200);
      return respond(r.status === 429 ? 429 : 502, { error: msg });
    }
    const img = pickImage(r.data);
    if (!img) {
      return respond(502, {
        error: 'Model tidak mengembalikan gambar. Coba ubah deskripsinya (hindari tokoh nyata, kekerasan, atau konten sensitif).',
      });
    }
    return respond(200, { image: img.data, mime: img.mime, ratio, style });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      return respond(504, { error: 'Pembuatan gambar kelamaan. Coba lagi, atau sederhanakan deskripsinya.' });
    }
    return respond(502, { error: 'Layanan gambar sedang tidak bisa dihubungi.' });
  }
};

import common from '../lib/common.js';

const { respond, authorize, getProvider, getModel } = common;

// Dipakai halaman login: memeriksa kata sandi dan melaporkan kesiapan mesin AI.
export default async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'Metode tidak diizinkan.' });
  const denied = await authorize(req);
  if (denied) return denied;

  const provider = getProvider();
  const llmReady =
    provider === 'anthropic' ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY;

  return respond(200, {
    ok: true,
    provider,
    model: getModel(provider),
    llmReady,
    voice: !!process.env.OPENAI_API_KEY,
  });
};

import { CODE_RE } from '../../js/short.js';

// _headers does not apply to Function responses, so set them here.
const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
};

const page = (status, title, msg) => new Response(
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#f7f1e3;color:#14213d;max-width:32rem;margin:15vh auto;padding:0 16px}a{color:#14213d}</style>` +
  `<h1>${title}</h1><p>${msg}</p><p><a href="/">Make your own invite link</a></p></html>`,
  { status, headers: HEADERS });

export async function onRequestGet({ params, env }) {
  const code = String(params.code ?? '');
  if (!CODE_RE.test(code)) return page(404, 'Link not found', 'This short link does not exist or has expired.');
  let fragment;
  try { fragment = await env.SHORTLINKS.get(code); } catch { return page(503, 'Temporarily unavailable', 'Short links are unavailable right now. Try again later.'); }
  if (!fragment) return page(404, 'Link not found', 'This short link does not exist or has expired.');
  // Always our own origin: relative Location, fragment we stored ourselves.
  return new Response(null, { status: 302, headers: { location: `/#${fragment}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

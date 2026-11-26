import { decode, encode } from '../../js/state.js';
import { codeFor } from '../../js/short.js';

const MAX_BODY = 2048;
const TTL = 365 * 24 * 60 * 60; // 1 year

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  });

export async function onRequestPost({ request, env }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'forbidden' }, 403);
  if ((Number(request.headers.get('content-length')) || 0) > MAX_BODY) return json({ error: 'too large' }, 413);

  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY) return json({ error: 'too large' }, 413);

  const res = decode(body);
  if (!res.ok) return json({ error: res.error }, 400);

  const fragment = encode(res.event); // canonical form: same event -> same code
  const code = await codeFor(fragment);
  try {
    if (!(await env.SHORTLINKS.get(code))) await env.SHORTLINKS.put(code, fragment, { expirationTtl: TTL });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
  return json({ code });
}

export const onRequest = () => json({ error: 'method not allowed' }, 405, { allow: 'POST' });

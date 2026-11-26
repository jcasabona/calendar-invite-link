// Short-link code: first 8 base62 chars of SHA-256 of the canonical fragment.
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export async function codeFor(fragment) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fragment)));
  let n = 0n;
  for (const b of digest) n = (n << 8n) | BigInt(b);
  let out = '';
  while (out.length < 8) { out += B62[Number(n % 62n)]; n /= 62n; }
  return out;
}

export const CODE_RE = /^[0-9A-Za-z]{8}$/;

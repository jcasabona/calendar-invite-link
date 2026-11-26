// Zone-local <-> UTC helpers. Intl only, no dependencies.
const cache = new Map();

function dtf(zone) {
  let f = cache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    cache.set(zone, f);
  }
  return f;
}

export const pad = (n, w = 2) => String(n).padStart(w, '0');

export function isValidZone(zone) {
  if (typeof zone !== 'string' || !zone || zone.length > 64) return false;
  try { dtf(zone); return true; } catch { return false; }
}

export function browserZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function listZones() {
  try {
    const z = Intl.supportedValuesOf('timeZone');
    return z.includes('UTC') ? z : ['UTC', ...z];
  } catch { return ['UTC']; }
}

/** Parse 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm'. Returns parts or null. */
export function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s ?? '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], h = +(m[4] ?? 0), mi = +(m[5] ?? 0);
  if (y < 1900 || y > 2200 || h > 23 || mi > 59) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d, h, mi };
}

function localParts(ms, zone) {
  const p = {};
  for (const { type, value } of dtf(zone).formatToParts(new Date(ms))) p[type] = value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Offset of `zone` from UTC at instant `ms`, in minutes (EST = -300). */
export function offsetMinutes(ms, zone) {
  const p = localParts(ms, zone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** 'YYYY-MM-DDTHH:mm' wall time in `zone` -> UTC epoch ms. */
export function zonedToUtc(local, zone) {
  const p = parseLocal(local);
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  let t = wall - offsetMinutes(wall, zone) * 60000;
  t = wall - offsetMinutes(t, zone) * 60000;
  return t;
}

/** UTC epoch ms -> 'YYYY-MM-DDTHH:mm' wall time in `zone`. */
export function utcToLocalString(ms, zone) {
  const p = localParts(ms, zone);
  return `${pad(p.y, 4)}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

export function addDays(date, n) {
  const p = parseLocal(date.slice(0, 10));
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d + n));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const compactDate = (s) => s.slice(0, 10).replaceAll('-', '');
export const compactLocal = (s) => compactDate(s) + 'T' + s.slice(11, 13) + s.slice(14, 16) + '00';
export function compactUtc(ms) {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
export const isoUtc = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function startMs(ev) { return zonedToUtc(ev.start, ev.zone); }
export function endMs(ev) { return startMs(ev) + ev.duration * 60000; }

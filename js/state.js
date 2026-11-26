// Event <-> URL fragment (schema v1). Shared by the browser and the shorten function.
import { isValidZone, parseLocal, zonedToUtc, compactUtc, compactDate, utcToLocalString } from './time.js';

export const VERSION = '1';
export const CAPS = { t: 200, l: 500, d: 4000, s: 16, z: 64, m: 5, a: 1, e: 10, r: 200 };
const KEYS = new Set(['v', ...Object.keys(CAPS)]);
const RRULE = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;COUNT=\d{1,4}|;UNTIL=\d{8}(T\d{6}Z)?)?$/;

const fail = (error) => ({ ok: false, error });

/** event -> fragment string (no leading '#'). Fixed key order, so equal events give equal strings. */
export function encode(ev) {
  const p = new URLSearchParams();
  p.set('v', VERSION);
  const put = (k, v) => { if (v !== '' && v != null) p.set(k, String(v)); };
  put('t', ev.title);
  put('l', ev.location);
  put('d', ev.description);
  put('s', ev.start);
  put('z', ev.zone);
  if (ev.allDay) { put('a', '1'); put('e', ev.endDate); } else put('m', ev.duration);
  put('r', ev.rrule);
  return p.toString();
}

/** fragment string -> { ok, event } | { ok:false, error }. Strict: unknown keys, caps, formats. */
export function decode(fragment) {
  const str = String(fragment ?? '').replace(/^#/, '');
  const raw = {};
  for (const [k, v] of new URLSearchParams(str)) {
    if (!KEYS.has(k)) return fail(`Unknown field "${k}"`);
    if (k in raw) return fail(`Duplicate field "${k}"`);
    if (k !== 'v' && v.length > CAPS[k]) return fail(`Field "${k}" is too long`);
    raw[k] = v;
  }
  if (raw.v !== VERSION) return fail('Unsupported link version');
  const title = (raw.t ?? '').trim();
  if (!title) return fail('Add a title');
  if (!isValidZone(raw.z)) return fail('Choose a valid time zone');
  if (raw.a !== undefined && raw.a !== '1') return fail('Bad all-day flag');
  const allDay = raw.a === '1';
  const start = raw.s ?? '';
  if (!parseLocal(start) || start.length !== (allDay ? 10 : 16)) return fail('Pick a valid start date' + (allDay ? '' : ' and time'));

  let duration = 60, endDate = '';
  if (allDay) {
    if (raw.e) {
      if (!parseLocal(raw.e) || raw.e.length !== 10) return fail('Bad end date');
      if (raw.e < start) return fail('End date is before start date');
      endDate = raw.e;
    }
    duration = 0;
  } else if (raw.m !== undefined) {
    if (!/^\d{1,5}$/.test(raw.m) || +raw.m < 1 || +raw.m > 10080) return fail('Duration must be 1 to 10080 minutes');
    duration = +raw.m;
  }
  const rrule = raw.r ?? '';
  if (rrule && !RRULE.test(rrule)) return fail('Bad repeat rule');

  return { ok: true, event: { title, location: raw.l ?? '', description: raw.d ?? '', start, zone: raw.z, duration, allDay, endDate, rrule } };
}

/** Form choices -> RRULE value ('' for none). */
export function buildRule({ freq, endType, until, count }, { allDay, zone }) {
  if (!freq || freq === 'none') return '';
  let r = `FREQ=${freq}`;
  if (endType === 'count') {
    r += `;COUNT=${Math.min(Math.max(parseInt(count, 10) || 1, 1), 999)}`;
  } else if (endType === 'date' && parseLocal(until)) {
    r += ';UNTIL=' + (allDay ? compactDate(until) : compactUtc(zonedToUtc(`${until}T23:59`, zone)));
  }
  return r;
}

/** RRULE value -> short human summary. */
export function describeRule(rrule, zone = 'UTC') {
  const m = /^FREQ=(\w+)(?:;COUNT=(\d+)|;UNTIL=(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?)?$/.exec(rrule || '');
  if (!m) return '';
  let s = `Repeats ${{ DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[m[1]]}`;
  if (m[2]) s += `, ${m[2]} time${m[2] === '1' ? '' : 's'}`;
  else if (m[3]) {
    let day = `${m[3]}-${m[4]}-${m[5]}`;
    if (m[6]) day = utcToLocalString(Date.UTC(+m[3], +m[4] - 1, +m[5], +m[6], +m[7], +m[8]), zone).slice(0, 10);
    s += `, until ${day}`;
  }
  return s;
}

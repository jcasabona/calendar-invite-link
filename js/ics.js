// iCalendar (RFC 5545) builder.
import { addDays, compactDate, compactLocal, compactUtc, startMs, endMs, offsetMinutes, utcToLocalString, pad } from './time.js';

const enc = new TextEncoder();

export function escapeText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold at 75 octets (never splitting a UTF-8 character), continuation lines start with a space. */
export function fold(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const fmtOffset = (min) => `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;
const localCompact = (ms) => compactUtc(ms).slice(0, -1); // treat ms as wall-clock

/** UTC instants where `zone`'s offset changes in [from, to). */
function transitions(zone, from, to) {
  const out = [];
  const day = 864e5;
  let prev = offsetMinutes(from, zone);
  for (let t = from; t < to; t += day) {
    const n = Math.min(t + day, to);
    const o = offsetMinutes(n, zone);
    if (o === prev) continue;
    let lo = t, hi = n;
    while (hi - lo > 60000) {
      let mid = lo + Math.floor((hi - lo) / 2 / 60000) * 60000;
      if (mid === lo) mid += 60000;
      if (offsetMinutes(mid, zone) === prev) lo = mid; else hi = mid;
    }
    out.push({ at: hi, from: prev, to: o });
    prev = o;
  }
  return out;
}

/** VTIMEZONE with explicit observances for 10 years from the event's year (no helper library). */
export function vtimezone(zone, eventMs) {
  const year = new Date(eventMs).getUTCFullYear();
  const from = Date.UTC(year, 0, 1);
  const trs = transitions(zone, from, Date.UTC(year + 10, 0, 1));
  const o0 = offsetMinutes(from, zone);
  const min = Math.min(o0, ...trs.map((t) => t.to));
  const kind = (o) => (o > min ? 'DAYLIGHT' : 'STANDARD');
  const lines = ['BEGIN:VTIMEZONE', `TZID:${zone}`];
  const obs = (k, dtstart, f, t) => lines.push(`BEGIN:${k}`, `DTSTART:${dtstart}`, `TZOFFSETFROM:${fmtOffset(f)}`, `TZOFFSETTO:${fmtOffset(t)}`, `END:${k}`);
  obs(kind(o0), '19700101T000000', o0, o0);
  for (const t of trs) obs(kind(t.to), localCompact(t.at + t.from * 60000), t.from, t.to);
  lines.push('END:VTIMEZONE');
  return lines;
}

export function ics(ev, { uid, now } = {}) {
  const recurringTimed = !ev.allDay && !!ev.rrule;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//calendar-invite-link//EN', 'CALSCALE:GREGORIAN'];
  if (recurringTimed) lines.push(...vtimezone(ev.zone, startMs(ev)));
  lines.push('BEGIN:VEVENT',
    `UID:${uid ?? `${globalThis.crypto.randomUUID()}@calendar-invite-link`}`,
    `DTSTAMP:${compactUtc(now ?? Date.now())}`);
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(ev.start)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(ev.endDate || ev.start, 1))}`);
  } else if (recurringTimed) {
    lines.push(`DTSTART;TZID=${ev.zone}:${compactLocal(ev.start)}`,
      `DTEND;TZID=${ev.zone}:${compactLocal(utcToLocalString(endMs(ev), ev.zone))}`);
  } else {
    lines.push(`DTSTART:${compactUtc(startMs(ev))}`, `DTEND:${compactUtc(endMs(ev))}`);
  }
  lines.push(`SUMMARY:${escapeText(ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

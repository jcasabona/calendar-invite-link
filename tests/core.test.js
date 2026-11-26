import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, buildRule, describeRule } from '../js/state.js';
import { zonedToUtc, utcToLocalString, addDays, offsetMinutes, isValidZone } from '../js/time.js';
import { google, outlook, office365, yahoo, targets } from '../js/links.js';
import { ics, fold, escapeText } from '../js/ics.js';
import { codeFor } from '../js/short.js';

const base = { title: 'Coffee chat', location: '', description: '', start: '2026-12-01T14:00', zone: 'America/New_York', duration: 60, allDay: false, endDate: '', rrule: '' };
const q = (u, k) => new URL(u).searchParams.get(k);

/* time */
test('time: zone conversion and DST', () => {
  assert.equal(zonedToUtc('2026-12-01T14:00', 'America/New_York'), Date.UTC(2026, 11, 1, 19, 0));
  assert.equal(zonedToUtc('2026-07-01T14:00', 'America/New_York'), Date.UTC(2026, 6, 1, 18, 0));
  assert.equal(offsetMinutes(Date.UTC(2026, 11, 1), 'Asia/Kolkata'), 330);
  assert.equal(utcToLocalString(Date.UTC(2026, 11, 1, 19, 0), 'America/New_York'), '2026-12-01T14:00');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.ok(isValidZone('Europe/Paris') && !isValidZone('Nope/Zone'));
});

/* state */
test('state: round-trips emoji, &, #, line breaks', () => {
  const ev = { ...base, title: '🎉 Q&A #1 = fun+', location: 'Room 5; "A"', description: 'line1\nline2 & more #tag' };
  const res = decode(encode(ev));
  assert.ok(res.ok);
  assert.deepEqual(res.event, ev);
});
test('state: all-day, recurrence, validation', () => {
  const ad = { ...base, start: '2026-12-01', allDay: true, duration: 0, endDate: '2026-12-03', rrule: 'FREQ=WEEKLY;COUNT=6' };
  assert.deepEqual(decode(encode(ad)).event, ad);
  assert.equal(decode('v=2&t=x&s=2026-12-01T10:00&z=UTC').ok, false);
  assert.equal(decode('v=1&t=x&s=2026-12-01T10:00&z=UTC&evil=1').ok, false);
  assert.equal(decode('v=1&t=x&s=2026-12-01T10:00&z=Nope').ok, false);
  assert.equal(decode('v=1&t=x&s=2026-13-01T10:00&z=UTC').ok, false);
  assert.equal(decode('v=1&t=' + 'a'.repeat(201) + '&s=2026-12-01T10:00&z=UTC').ok, false);
  assert.equal(decode('v=1&t=x&s=2026-12-01T10:00&z=UTC&r=FREQ%3DHOURLY').ok, false);
  assert.equal(decode('v=1&t=x&s=2026-12-01T10:00&z=UTC&m=0').ok, false);
});
test('state: buildRule / describeRule', () => {
  const ctx = { allDay: false, zone: 'America/New_York' };
  assert.equal(buildRule({ freq: 'none' }, ctx), '');
  assert.equal(buildRule({ freq: 'WEEKLY', endType: 'count', count: 6 }, ctx), 'FREQ=WEEKLY;COUNT=6');
  const r = buildRule({ freq: 'DAILY', endType: 'date', until: '2026-12-31' }, ctx);
  assert.match(r, /^FREQ=DAILY;UNTIL=20270101T045900Z$/);
  assert.equal(describeRule(r, ctx.zone), 'Repeats daily, until 2026-12-31');
  assert.equal(describeRule('FREQ=WEEKLY;COUNT=6'), 'Repeats weekly, 6 times');
  assert.equal(buildRule({ freq: 'YEARLY', endType: 'date', until: '2027-05-04' }, { allDay: true, zone: 'UTC' }), 'FREQ=YEARLY;UNTIL=20270504');
});

/* links */
test('links: google timed (zone-local + ctz) and recur', () => {
  const u = google({ ...base, rrule: 'FREQ=WEEKLY;COUNT=6', location: 'HQ', description: 'hi' });
  assert.equal(q(u, 'dates'), '20261201T140000/20261201T150000');
  assert.equal(q(u, 'ctz'), 'America/New_York');
  assert.equal(q(u, 'recur'), 'RRULE:FREQ=WEEKLY;COUNT=6');
  assert.equal(q(u, 'text'), 'Coffee chat');
});
test('links: all-day end is exclusive', () => {
  const one = { ...base, start: '2026-12-01', allDay: true };
  assert.equal(q(google(one), 'dates'), '20261201/20261202');
  assert.equal(q(google({ ...one, endDate: '2026-12-03' }), 'dates'), '20261201/20261204');
  assert.equal(q(yahoo(one), 'dur'), 'allday');
  assert.equal(q(outlook({ ...one, endDate: '2026-12-03' }), 'enddt'), '2026-12-04');
});
test('links: outlook/o365/yahoo use UTC', () => {
  assert.equal(q(outlook(base), 'startdt'), '2026-12-01T19:00:00Z');
  assert.equal(q(outlook(base), 'enddt'), '2026-12-01T20:00:00Z');
  assert.match(office365(base), /^https:\/\/outlook\.office\.com\/calendar\/0\/deeplink\/compose\?/);
  assert.equal(q(yahoo(base), 'st'), '20261201T190000Z');
});
test('links: recurring swaps Outlook/O365/Yahoo for .ics', () => {
  assert.deepEqual(targets(base).map((t) => t.id), ['google', 'outlook', 'office365', 'yahoo', 'ics']);
  assert.deepEqual(targets({ ...base, rrule: 'FREQ=DAILY' }).map((t) => t.id), ['google', 'ics']);
});

/* ics */
const opts = { uid: 'x@y', now: Date.UTC(2026, 10, 26) };
test('ics: one-off timed uses UTC', () => {
  const s = ics(base, opts);
  assert.ok(s.includes('DTSTART:20261201T190000Z\r\nDTEND:20261201T200000Z\r\n'));
  assert.ok(!s.includes('VTIMEZONE'));
  assert.ok(s.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(s));
});
test('ics: recurring timed has TZID + VTIMEZONE with both offsets', () => {
  const s = ics({ ...base, rrule: 'FREQ=WEEKLY;COUNT=6' }, opts);
  assert.ok(s.includes('DTSTART;TZID=America/New_York:20261201T140000'));
  assert.ok(s.includes('BEGIN:VTIMEZONE') && s.includes('TZOFFSETTO:-0400') && s.includes('TZOFFSETTO:-0500'));
  assert.ok(s.includes('RRULE:FREQ=WEEKLY;COUNT=6'));
});
test('ics: all-day uses VALUE=DATE, exclusive end', () => {
  const s = ics({ ...base, start: '2026-12-01', allDay: true, endDate: '2026-12-02' }, opts);
  assert.ok(s.includes('DTSTART;VALUE=DATE:20261201') && s.includes('DTEND;VALUE=DATE:20261203'));
});
test('ics: escaping and 75-octet folding', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const s = ics({ ...base, description: '🎉 héllo, '.repeat(40) }, opts);
  for (const line of s.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(fold('x'.repeat(75)).includes('\r\n'), false);
  const unfolded = s.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DESCRIPTION:' + escapeText('🎉 héllo, '.repeat(40))));
});

/* short */
test('short: stable 8-char base62 code', async () => {
  const f = encode(base);
  const c = await codeFor(f);
  assert.match(c, /^[0-9A-Za-z]{8}$/);
  assert.equal(c, await codeFor(f));
  assert.notEqual(c, await codeFor(encode({ ...base, title: 'Other' })));
});

// Calendar deep links. Pure functions: event -> URL.
// Vendors don't document these formats; see README "Verify" list.
import { addDays, compactDate, compactLocal, compactUtc, isoUtc, startMs, endMs, utcToLocalString } from './time.js';

const qs = (o) => Object.entries(o)
  .filter(([, v]) => v !== '' && v != null)
  .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  .join('&');

export function google(ev) {
  let dates, ctz = '';
  if (ev.allDay) {
    dates = `${compactDate(ev.start)}/${compactDate(addDays(ev.endDate || ev.start, 1))}`; // end exclusive
  } else {
    dates = `${compactLocal(ev.start)}/${compactLocal(utcToLocalString(endMs(ev), ev.zone))}`; // zone-local, no Z
    ctz = ev.zone;
  }
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&' + qs({
    text: ev.title, dates, ctz, details: ev.description, location: ev.location,
    recur: ev.rrule ? `RRULE:${ev.rrule}` : '',
  });
}

function microsoft(host, ev) {
  const timed = ev.allDay
    ? { startdt: ev.start, enddt: addDays(ev.endDate || ev.start, 1), allday: 'true' }
    : { startdt: isoUtc(startMs(ev)), enddt: isoUtc(endMs(ev)) }; // UTC, never offsets
  return `https://${host}/calendar/0/deeplink/compose?` + qs({
    path: '/calendar/action/compose', rru: 'addevent',
    subject: ev.title, ...timed, body: ev.description, location: ev.location,
  });
}
export const outlook = (ev) => microsoft('outlook.live.com', ev);
export const office365 = (ev) => microsoft('outlook.office.com', ev);

export function yahoo(ev) {
  let when;
  if (ev.allDay) {
    const end = ev.endDate || ev.start;
    when = end === ev.start
      ? { st: compactDate(ev.start), dur: 'allday' }
      : { st: compactDate(ev.start), et: compactDate(addDays(end, 1)) };
  } else {
    when = { st: compactUtc(startMs(ev)), et: compactUtc(endMs(ev)) };
  }
  return 'https://calendar.yahoo.com/?v=60&' + qs({ title: ev.title, ...when, desc: ev.description, in_loc: ev.location });
}

/** Which buttons to show. Recurring events: Outlook/O365/Yahoo have no repeat param -> .ics only. */
export function targets(ev) {
  const all = [
    { id: 'google', label: 'Google', url: google(ev) },
    ...(ev.rrule ? [] : [
      { id: 'outlook', label: 'Outlook.com', url: outlook(ev) },
      { id: 'office365', label: 'Office 365', url: office365(ev) },
      { id: 'yahoo', label: 'Yahoo', url: yahoo(ev) },
    ]),
    { id: 'ics', label: 'Apple / .ics', url: null },
  ];
  return all;
}

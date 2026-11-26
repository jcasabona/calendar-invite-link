import { encode, decode, buildRule, describeRule } from './state.js';
import { browserZone, listZones, pad, parseLocal, startMs, endMs, utcToLocalString } from './time.js';
import { targets } from './links.js';
import { ics } from './ics.js';

const $ = (id) => document.getElementById(id);
let formReady = false;
let current = null; // { frag, longUrl }

function route() {
  const frag = location.hash.slice(1);
  $('form-view').hidden = frag !== '';
  $('share-view').hidden = frag === '';
  if (frag) renderShare(frag);
  else { document.title = 'Calendar Invite Link'; initForm(); }
}

/* ---------- form ---------- */

function initForm() {
  if (formReady) return;
  formReady = true;
  for (const z of listZones()) { const o = document.createElement('option'); o.value = z; $('zones').append(o); }
  $('zone').value = browserZone();
  const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
  $('date').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  $('time').value = `${pad(d.getHours())}:00`;

  const form = $('invite-form');
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (e) => e.preventDefault());
  $('copy').addEventListener('click', copy);
  $('shorten').addEventListener('click', shorten);
  refresh();
}

function readForm() {
  const allDay = $('allday').checked;
  const date = $('date').value;
  const dur = $('duration').value === 'custom' ? $('custom').value : $('duration').value;
  const zone = $('zone').value.trim();
  const endDate = $('enddate').value;
  return {
    title: $('title').value.trim(),
    location: $('location').value.trim(),
    description: $('description').value.trim(),
    start: allDay ? date : `${date}T${$('time').value}`,
    zone,
    duration: +dur || 60,
    allDay,
    endDate: allDay && endDate && endDate > date ? endDate : '',
    rrule: buildRule(
      { freq: $('repeat').value, endType: $('ends').value, until: $('until').value, count: $('count').value },
      { allDay, zone: parseLocal(date) ? zone : 'UTC' },
    ),
  };
}

function setUrl(url) {
  $('out').value = url;
  $('open').href = url;
  $('open').setAttribute('aria-disabled', 'false');
}

function refresh() {
  const allDay = $('allday').checked, rep = $('repeat').value !== 'none', ends = $('ends').value;
  $('time-row').hidden = allDay;
  $('time').required = !allDay;
  $('duration-row').hidden = allDay;
  $('enddate-row').hidden = !allDay;
  $('custom-row').hidden = $('duration').value !== 'custom';
  $('ends-row').hidden = !rep;
  $('until-row').hidden = !rep || ends !== 'date';
  $('count-row').hidden = !rep || ends !== 'count';

  $('status').textContent = '';
  let ev, res;
  try { ev = readForm(); res = decode(encode(ev)); } catch { res = { ok: false, error: 'Check the form' }; }
  if (!res.ok) {
    current = null;
    $('out').value = '';
    $('open').removeAttribute('href');
    $('open').setAttribute('aria-disabled', 'true');
  } else {
    const frag = encode(res.event);
    current = { frag, longUrl: `${location.origin}${location.pathname}#${frag}` };
    setUrl(current.longUrl);
  }
  $('copy').disabled = !current;
  $('shorten').disabled = !current;
}

async function copy() {
  const url = $('out').value;
  if (!url) return;
  try { await navigator.clipboard.writeText(url); }
  catch { $('out').select(); document.execCommand('copy'); }
  $('status').textContent = 'Copied.';
}

async function shorten() {
  if (!current) return;
  const btn = $('shorten');
  btn.disabled = true;
  try {
    const r = await fetch('/api/shorten', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: current.frag });
    if (!r.ok) throw new Error('bad status');
    const { code } = await r.json();
    if (!/^[0-9A-Za-z]{8}$/.test(code)) throw new Error('bad code');
    setUrl(new URL(`/s/${code}`, location.href).href);
    $('status').textContent = 'Short link ready.';
  } catch {
    $('status').textContent = "Couldn't shorten right now. The long link still works.";
  } finally {
    btn.disabled = !current;
  }
}

/* ---------- share page ---------- */

const fmtFull = (ms, zone) => new Intl.DateTimeFormat(undefined, {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: zone,
}).format(ms);
const fmtTime = (ms, zone) => new Intl.DateTimeFormat(undefined, {
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: zone,
}).format(ms);
const fmtDay = (dateStr) => {
  const p = parseLocal(dateStr);
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(Date.UTC(p.y, p.mo - 1, p.d));
};

function whenText(ev, zone) {
  if (ev.allDay) return ev.endDate ? `${fmtDay(ev.start)} – ${fmtDay(ev.endDate)}` : fmtDay(ev.start);
  const s = startMs(ev), e = endMs(ev);
  const sameDay = utcToLocalString(s, zone).slice(0, 10) === utcToLocalString(e, zone).slice(0, 10);
  return `${fmtFull(s, zone)} – ${sameDay ? fmtTime(e, zone) : fmtFull(e, zone)}`;
}

function download(ev) {
  const blob = new Blob([ics(ev)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  const slug = ev.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  a.href = URL.createObjectURL(blob);
  a.download = `${slug || 'event'}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function renderShare(frag) {
  const res = decode(frag);
  const buttons = $('s-buttons');
  buttons.replaceChildren();
  for (const id of ['s-when', 's-local', 's-where', 's-repeat', 's-desc', 's-note']) $(id).textContent = '';
  if (!res.ok) {
    document.title = 'Calendar Invite Link';
    $('s-title').textContent = 'This link is not valid';
    $('s-note').textContent = res.error;
    return;
  }
  const ev = res.event;
  document.title = `${ev.title} – Calendar Invite Link`;
  $('s-title').textContent = ev.title;
  $('s-when').textContent = ev.allDay ? whenText(ev) : whenText(ev, ev.zone);

  const viewer = browserZone();
  if (!ev.allDay && viewer !== ev.zone) {
    const mine = whenText(ev, viewer);
    if (mine !== $('s-when').textContent) $('s-local').textContent = `In your time zone: ${mine}`;
  }

  const where = $('s-where');
  if (ev.location) {
    let url = null;
    try { const u = new URL(ev.location); if (u.protocol === 'http:' || u.protocol === 'https:') url = u; } catch { /* plain text */ }
    if (url) {
      const a = document.createElement('a');
      a.href = url.href; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.textContent = ev.location;
      where.replaceChildren(a);
    } else where.textContent = ev.location;
  }
  $('s-repeat').textContent = describeRule(ev.rrule, ev.zone);
  $('s-desc').textContent = ev.description;

  for (const t of targets(ev)) {
    if (t.url) {
      const a = document.createElement('a');
      a.className = 'btn'; a.href = t.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = t.label;
      buttons.append(a);
    } else {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = t.label;
      b.addEventListener('click', () => download(ev));
      buttons.append(b);
    }
  }
  if (ev.rrule) $('s-note').textContent = 'Outlook and Yahoo links can’t carry repeats. Use the .ics download for those.';
}

addEventListener('hashchange', route);
route();

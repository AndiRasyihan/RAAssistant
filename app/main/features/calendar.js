// Agenda: quick-added local events + iCal feed (Google/Outlook/iCloud secret URL), reminders, meeting links.
const { net } = require('electron');
const P = require('../../shared/prayer.js');

const LINK_RE = /(https?:\/\/(?:meet\.google\.com\/[a-z0-9-]+|[\w.-]*zoom\.us\/(?:j|my|w)\/[^\s"<>\\]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>\\]+|teams\.live\.com\/meet\/[^\s"<>\\]+))/i;

function unfold(text) { return String(text).replace(/\r?\n[ \t]/g, ''); }
function unescape(s) { return String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }

function parseDate(val, params, defTz) {
  if (!val) return null;
  const allDay = /VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(val);
  const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [y, mo, d, hh = '0', mm = '0', ss = '0', z] = m.slice(1);
  if (allDay) return { at: new Date(+y, +mo - 1, +d).getTime(), allDay: true };
  const utc = Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss);
  if (z) return { at: utc, allDay: false };
  const tzid = (params.match(/TZID=([^;:]+)/) || [])[1] || defTz;
  if (!tzid) return { at: new Date(+y, +mo - 1, +d, +hh, +mm, +ss).getTime(), allDay: false };
  const off = P.tzOffset(tzid.replace(/"/g, ''), new Date(utc));
  return { at: utc - off * 3600000, allDay: false };
}

function parseIcs(text, from, to) {
  const out = [];
  const body = unfold(text);
  const calTz = (body.match(/X-WR-TIMEZONE:([^\r\n]+)/) || [])[1];
  for (const block of body.split('BEGIN:VEVENT').slice(1)) {
    const ev = {}; const ex = [];
    for (const line of block.split(/\r?\n/)) {
      const i = line.indexOf(':'); if (i < 0) continue;
      const left = line.slice(0, i), val = line.slice(i + 1);
      const [name, ...prm] = left.split(';');
      const params = prm.join(';');
      if (name === 'DTSTART') ev.start = parseDate(val, params, calTz);
      else if (name === 'DTEND') ev.end = parseDate(val, params, calTz);
      else if (name === 'SUMMARY') ev.title = unescape(val);
      else if (name === 'LOCATION') ev.location = unescape(val);
      else if (name === 'DESCRIPTION') ev.description = unescape(val);
      else if (name === 'URL') ev.url = val;
      else if (name === 'RRULE') ev.rrule = val;
      else if (name === 'EXDATE') for (const v of val.split(',')) { const d = parseDate(v, params, calTz); if (d) ex.push(d.at); }
      else if (name === 'STATUS') ev.status = val;
      if (line.startsWith('END:VEVENT')) break;
    }
    if (!ev.start || ev.status === 'CANCELLED') continue;
    const dur = ev.end ? ev.end.at - ev.start.at : (ev.start.allDay ? 86400000 : 3600000);
    const link = ((ev.location || '') + ' ' + (ev.description || '') + ' ' + (ev.url || '')).match(LINK_RE);
    const base = { title: ev.title || '(tanpa judul)', allDay: ev.start.allDay, link: link ? link[1] : '', location: ev.location || '', source: 'ical' };
    const push = (at) => { if (at + dur >= from && at <= to && !ex.includes(at)) out.push({ ...base, start: at, end: at + dur }); };
    if (!ev.rrule) { push(ev.start.at); continue; }
    // Minimal RRULE support: DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY (weekly).
    const r = Object.fromEntries(ev.rrule.split(';').map((x) => x.split('=')));
    const interval = +(r.INTERVAL || 1), count = r.COUNT ? +r.COUNT : Infinity;
    const until = r.UNTIL ? (parseDate(r.UNTIL, '', calTz) || {}).at : Infinity;
    const days = r.BYDAY ? r.BYDAY.split(',').map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(d.slice(-2))) : null;
    let n = 0;
    const s = new Date(ev.start.at);
    for (let i = 0; i < 1500 && n < count; i++) {
      let cand;
      if (r.FREQ === 'DAILY') cand = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i * interval, s.getHours(), s.getMinutes());
      else if (r.FREQ === 'WEEKLY') {
        const week = Math.floor(i / 7), dow = i % 7;
        if (week % interval) continue;
        cand = new Date(s.getFullYear(), s.getMonth(), s.getDate() - s.getDay() + week * 7 + dow, s.getHours(), s.getMinutes());
        if (cand < s) continue;
        if (days ? !days.includes(cand.getDay()) : cand.getDay() !== s.getDay()) continue;
      } else if (r.FREQ === 'MONTHLY') cand = new Date(s.getFullYear(), s.getMonth() + i * interval, s.getDate(), s.getHours(), s.getMinutes());
      else if (r.FREQ === 'YEARLY') cand = new Date(s.getFullYear() + i * interval, s.getMonth(), s.getDate(), s.getHours(), s.getMinutes());
      else break;
      const at = cand.getTime();
      if (at > until || at > to) break;
      n++;
      push(at);
    }
  }
  return out;
}

exports.init = (ctx) => {
  const S = () => ctx.settings();
  const t = ctx.i18n.t;
  let icalEvents = [], fetchedAt = 0, icalError = '';
  const notified = new Set();

  function publish() {
    const now = Date.now();
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = from.getTime() + 35 * 86400000;
    const local = (ctx.data.get('events') || []).filter((e) => e.at + (e.dur || 3600000) >= from.getTime() && e.at <= to)
      .map((e) => ({ id: e.id, title: e.title, start: e.at, end: e.at + (e.dur || 3600000), allDay: false, link: (e.title.match(LINK_RE) || [])[1] || '', source: 'local' }));
    const events = [...icalEvents, ...local].sort((a, b) => a.start - b.start);
    ctx.state('agenda', { events, fetchedAt, error: icalError, now });
  }

  async function fetchIcal() {
    const url = (S().today.ical || '').trim().replace(/^webcal:/i, 'https:');
    if (!url) { icalEvents = []; icalError = ''; publish(); return; }
    try {
      const r = await net.fetch(url, { headers: { 'User-Agent': 'RA Assistant' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - 1);
      icalEvents = parseIcs(text, from.getTime(), from.getTime() + 40 * 86400000);
      fetchedAt = Date.now(); icalError = '';
    } catch (e) { icalError = String(e.message || e); }
    publish();
  }

  ctx.handle('events.add', (title, at, dur) => {
    const list = [...(ctx.data.get('events') || [])].filter((e) => e.at > Date.now() - 30 * 86400000);
    list.push({ id: Date.now().toString(36), title: String(title).slice(0, 200), at: +at, dur: +dur || 3600000 });
    ctx.data.set('events', list); publish(); return true;
  });
  ctx.handle('events.remove', (id) => { ctx.data.set('events', (ctx.data.get('events') || []).filter((e) => e.id !== id)); publish(); return true; });
  ctx.handle('agenda.refresh', fetchIcal);

  // Reminders (Pengingat tab)
  const pubRem = () => ctx.state('reminders', ctx.data.get('reminders') || []);
  ctx.handle('reminders.add', (title, at, repeat) => {
    const list = [...(ctx.data.get('reminders') || [])];
    list.push({ id: Date.now().toString(36), title: String(title).slice(0, 200), at: +at, repeat: repeat || 'none', done: false });
    ctx.data.set('reminders', list); pubRem(); return true;
  });
  ctx.handle('reminders.update', (id, patch) => {
    ctx.data.set('reminders', (ctx.data.get('reminders') || []).map((r) => (r.id === id ? { ...r, ...patch } : r))); pubRem(); return true;
  });
  ctx.handle('reminders.remove', (id) => { ctx.data.set('reminders', (ctx.data.get('reminders') || []).filter((r) => r.id !== id)); pubRem(); return true; });
  ctx.handle('todos.set', (list) => { ctx.data.set('todos', list); ctx.state('todos', list); return true; });

  setInterval(() => {
    const now = Date.now();
    // Due reminders
    let changed = false;
    const rem = (ctx.data.get('reminders') || []).map((r) => {
      if (r.done || r.at > now) return r;
      ctx.toast({ kind: 'reminder', title: '⏰ ' + r.title, body: new Date(r.at).toTimeString().slice(0, 5), icon: 'reminders', urgent: true, ms: 15000 });
      changed = true;
      if (r.repeat === 'daily') return { ...r, at: r.at + 86400000 * Math.ceil((now - r.at + 1) / 86400000) };
      if (r.repeat === 'weekly') return { ...r, at: r.at + 7 * 86400000 * Math.ceil((now - r.at + 1) / (7 * 86400000)) };
      return { ...r, done: true };
    });
    if (changed) { ctx.data.set('reminders', rem); pubRem(); }
    // Event starting in 1 minute: toast with Join
    const ag = ctx.getState('agenda');
    if (ag && S().today.eventCountdown) for (const e of ag.events) {
      if (e.allDay) continue;
      const id = e.title + e.start;
      if (e.start - now <= 60000 && e.start > now - 30000 && !notified.has(id)) {
        notified.add(id);
        ctx.toast({ kind: 'event', title: '📅 ' + e.title, body: new Date(e.start).toTimeString().slice(0, 5) + (e.location ? ' · ' + e.location : ''), link: e.link, icon: 'today', urgent: true, ms: 20000 });
      }
    }
  }, 15000);

  setInterval(fetchIcal, 15 * 60000);
  setTimeout(() => { fetchIcal(); pubRem(); ctx.state('todos', ctx.data.get('todos') || []); }, 1200);
  ctx.bus.on('settings', (p) => { if (p === 'today.ical') fetchIcal(); });
  void t;
};

exports.parseIcs = parseIcs;

// Worship: offline prayer times, reminders, adhan playback (in the island renderer), Ramadan, custom schedules.
const path = require('path');
const { pathToFileURL } = require('url');
const { dialog } = require('electron');
const P = require('../../shared/prayer.js');

exports.init = (ctx) => {
  const t = ctx.i18n.t;
  const S = () => ctx.settings();
  const fired = new Set();
  let computedFor = '';
  let times = null;

  const adzanUrl = () => pathToFileURL(S().worship.adzanFile || path.join(ctx.ASSETS, 'adzan', 'adzan.ogg')).href;

  function recompute() {
    const loc = S().today.location;
    const now = new Date();
    const { y, m, d } = P.dateIn(loc.tz, now);
    const k = `${y}-${m}-${d}|${loc.lat},${loc.lon}`;
    if (k !== computedFor) {
      computedFor = k;
      const today = P.compute(loc, y, m, d);
      const tm = new Date(Date.UTC(y, m - 1, d + 1, 12));
      const tmd = P.dateIn(loc.tz, tm);
      const tomorrow = P.compute(loc, tmd.y, tmd.m, tmd.d);
      times = { today, tomorrow };
    }
    const hijri = P.hijri(now, loc.tz);
    const ramadan = !!(hijri && hijri.m === 9);
    const list = [];
    for (const day of [times.today, times.tomorrow]) for (const key of P.ORDER) list.push({ key, at: day[key].getTime() });
    const next = list.find((x) => x.at > Date.now() && P.PRAYERS.includes(x.key));
    const nextImsak = list.find((x) => x.at > Date.now() && x.key === 'imsak');
    const nextIftar = list.find((x) => x.at > Date.now() && x.key === 'maghrib');
    const state = {
      mode: S().worship.mode,
      times: Object.fromEntries(P.ORDER.map((k2) => [k2, times.today[k2].getTime()])),
      next, ramadan, hijri, location: loc,
      imsak: ramadan ? nextImsak : null, iftar: ramadan ? nextIftar : null,
      custom: nextCustom()
    };
    ctx.state('prayer', state);
    return state;
  }

  function nextCustom() {
    const list = S().worship.custom || [];
    if (!list.length) return null;
    const now = new Date();
    let best = null;
    for (const c of list) {
      const [hh, mm] = String(c.time || '00:00').split(':').map(Number);
      for (let add = 0; add < 8; add++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, hh, mm);
        if (d.getDay() !== c.day || d <= now) continue;
        if (!best || d < best.at) best = { at: d.getTime(), title: c.title };
        break;
      }
    }
    return best;
  }

  function trigger(key, at) {
    const id = key + at;
    if (fired.has(id)) return;
    fired.add(id);
    const W = S().worship;
    if (W.mode !== 'prayer') return;
    if (W.remind) ctx.toast({ kind: 'prayer', title: `${t('prayer.now')} ${t('prayer.' + key)}`, body: new Date(at).toTimeString().slice(0, 5), icon: 'prayer', urgent: true, ms: 12000 });
    const inMeeting = ctx.inMeeting && ctx.inMeeting();
    const playAdzan = W.adzan && (key !== 'subuh' || W.subuhAdzan) && !(W.noAdzanInMeeting && inMeeting);
    const media = ctx.media && ctx.media();
    if ((W.pauseMusic || playAdzan) && media && media.status === 4 && !inMeeting) {
      ctx.sys.send({ c: 'media', a: 'pause' });
      // Offer to resume once the adhan is over / the user is back.
      setTimeout(() => ctx.toast({ kind: 'resume', title: t('resume.music'), body: `${media.title}${media.artist ? ' · ' + media.artist : ''}`, icon: 'music', ms: 20000 }), playAdzan ? 160000 : 5 * 60000);
    }
    if (playAdzan) ctx.state('adzan', { play: true, src: adzanUrl(), volume: W.adzanVolume, key, at: Date.now() });
  }

  function tick() {
    const st = recompute();
    if (st.mode === 'prayer') {
      const now = Date.now();
      for (const key of P.PRAYERS) {
        const at = st.times[key];
        if (now >= at && now - at < 90000) trigger(key, at);
      }
    } else if (st.mode === 'custom' && st.custom && st.custom.at - Date.now() < 30000 && st.custom.at > Date.now()) {
      const id = 'c' + st.custom.at;
      if (!fired.has(id)) { fired.add(id); setTimeout(() => ctx.toast({ kind: 'prayer', title: st.custom.title, body: t('prayer.custom'), icon: 'prayer', urgent: true }), st.custom.at - Date.now()); }
    }
  }
  setInterval(tick, 20000);
  setTimeout(tick, 1500);
  ctx.bus.on('settings', (p) => { if (p.startsWith('today.location') || p.startsWith('worship')) { computedFor = ''; tick(); } });

  ctx.handle('adzan.pick', async () => {
    const r = await dialog.showOpenDialog({ title: 'Adzan', filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac', 'opus', 'flac'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return {};
    ctx.settingsStore.set('worship.adzanFile', r.filePaths[0]);
    return { path: r.filePaths[0] };
  });
  ctx.handle('adzan.test', (on) => ctx.state('adzan', on ? { play: true, src: adzanUrl(), volume: S().worship.adzanVolume, test: true, at: Date.now() } : { play: false, at: Date.now() }));
  ctx.handle('prayer.times', (y, m, d) => {
    const r = P.compute(S().today.location, y, m, d);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.getTime()]));
  });
};

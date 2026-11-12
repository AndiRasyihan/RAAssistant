/* Worship tab: prayer times (Kemenag/JAKIM), countdowns, Ramadan, adhan, custom schedule. */
(function () {
  const RA = window.RA;
  let pane = null, st = null, playing = null;
  const audio = document.getElementById('adzan');
  const label = (k) => RA.t('prayer.' + k);
  // Show times in the selected location's time zone (may differ from the laptop's).
  const hm = (ms) => { try { return new Intl.DateTimeFormat('id-ID', { timeZone: st && st.location ? st.location.tz : undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)); } catch { return RA.hm(ms); } };
  const hijriMonths = ['Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Awal', 'Jumadil Akhir', 'Rajab', "Sya'ban", 'Ramadan', 'Syawal', "Dzulqa'dah", 'Dzulhijjah'];

  function countdown(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h} ${RA.L('j', 'h')} ${m} ${RA.t('common.min')}` : m ? `${m} ${RA.t('common.min')}` : `${s % 60} ${RA.t('common.sec')}`;
  }

  function render() {
    if (!pane) return;
    if (!st || st.mode === 'off') { pane.innerHTML = `<div class="empty">${RA.L('Widget ibadah dimatikan di Pengaturan.', 'Worship widget is off in Settings.')}</div>`; return; }
    if (st.mode === 'custom') {
      const c = st.custom;
      pane.innerHTML = `<div class="h">${RA.t('prayer.custom')}</div>
        ${c ? `<div class="card"><div class="big-time" style="font-size:26px">${RA.esc(c.title)}</div><div class="muted" style="text-align:center">${new Date(c.at).toLocaleString(RA.S.lang === 'en' ? 'en-GB' : 'id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit' })} · ${countdown(c.at - Date.now())} ${RA.t('prayer.in')}</div></div>` : `<div class="empty">${RA.L('Belum ada jadwal. Tambahkan di Pengaturan → Ibadah.', 'No schedule yet. Add one in Settings → Worship.')}</div>`}`;
      return;
    }
    const n = st.next;
    const hj = st.hijri ? `${st.hijri.d} ${hijriMonths[st.hijri.m - 1] || ''} ${st.hijri.y} H` : '';
    const cells = ['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'].map((k) => {
      const at = st.times[k];
      const cls = n && n.key === k && Math.abs(n.at - at) < 60000 ? 'next' : at < Date.now() ? 'past' : '';
      return `<div class="pr ${cls}"><div class="n">${label(k)}</div><div class="v">${hm(at)}</div></div>`;
    }).join('');
    const ram = st.ramadan ? `<div class="card" style="margin-top:8px">🌙 <b>${RA.t('prayer.ramadan')}</b> · ${RA.t('prayer.imsak')} ${st.imsak ? hm(st.imsak.at) + ' (' + countdown(st.imsak.at - Date.now()) + ')' : '—'} · ${RA.t('prayer.iftar')} ${st.iftar ? hm(st.iftar.at) + ' (' + countdown(st.iftar.at - Date.now()) + ')' : '—'}</div>` : '';
    pane.innerHTML = `
      <div class="row" style="margin-bottom:8px"><div class="grow"><div class="h" style="margin:0">${n ? `${label(n.key)} ${hm(n.at)}` : ''}</div>
        <div class="muted small">${n ? countdown(n.at - Date.now()) + ' ' + RA.t('prayer.in') : ''} · 📍 ${RA.esc(st.location.name)} · ${hj}</div></div>
        ${playing ? `<button class="btn pri" data-stop>${RA.t('prayer.stopAdzan')}</button>` : ''}</div>
      <div class="pr-grid">${cells}</div>${ram}
      <div class="small muted" style="margin-top:8px">${st.location.country === 'MY' ? 'JAKIM' : 'Kemenag RI'} · ${RA.L('dihitung offline', 'computed offline')}</div>`;
  }

  RA.tab({
    id: 'prayer', height: 250,
    render(p) { pane = p; p.addEventListener('click', (e) => { if (e.target.closest('[data-stop]')) RA.invoke('adzan.test', false); }); render(); },
    onShow: render
  });
  RA.on('prayer', (v) => { st = v; RA.st.prayer = v; if (RA.tab === 'prayer' && RA.expanded) render(); RA.refresh(); });

  // Adhan playback lives here because the island renderer is always alive.
  RA.on('adzan', (a) => {
    if (a && a.play) {
      audio.src = a.src; audio.volume = Math.max(0, Math.min(1, a.volume == null ? 0.8 : a.volume));
      audio.play().catch(() => {});
      playing = a;
    } else { audio.pause(); audio.removeAttribute('src'); audio.load(); playing = null; }
    render(); RA.refresh();
  });
  audio.addEventListener('ended', () => { playing = null; render(); RA.refresh(); });

  RA.activity('prayer', () => {
    if (!st || !RA.S) return null;
    const W = RA.S.worship;
    if (playing) {
      return { pri: 95, w: 300, html: `<div class="act"><span style="width:16px">${RA.icons.prayer}</span><span class="txt"><b>${RA.L('Adzan', 'Adhan')}</b> <span class="sub">${playing.key ? label(playing.key) : RA.t('common.test')}</span></span></div>` };
    }
    if (st.mode === 'prayer') {
      const now = Date.now();
      if (st.ramadan && W.ramadan) {
        for (const ev of [st.imsak && { k: 'imsak', ...st.imsak }, st.iftar && { k: 'iftar', ...st.iftar }]) {
          if (ev && ev.at - now <= 30 * 60000 && ev.at > now) return { pri: 65, w: 320, html: `<div class="act">🌙<span class="txt"><b>${label(ev.k)} ${hm(ev.at)}</b> <span class="sub">· ${countdown(ev.at - now)} ${RA.t('prayer.in')}</span></span></div>` };
        }
      }
      if (W.countdown && st.next && st.next.at - now <= 10 * 60000 && st.next.at > now) {
        return { pri: 60, w: 320, html: `<div class="act"><span style="width:16px">${RA.icons.prayer}</span><span class="txt"><b>${label(st.next.key)} ${hm(st.next.at)}</b> <span class="sub">· ${countdown(st.next.at - now)} ${RA.t('prayer.in')}</span></span></div>` };
      }
    } else if (st.mode === 'custom' && st.custom && st.custom.at - Date.now() <= 10 * 60000) {
      return { pri: 60, w: 320, html: `<div class="act">🕊️<span class="txt"><b>${RA.esc(st.custom.title)}</b> <span class="sub">· ${countdown(st.custom.at - Date.now())} ${RA.t('prayer.in')}</span></span></div>` };
    }
    return null;
  });
})();

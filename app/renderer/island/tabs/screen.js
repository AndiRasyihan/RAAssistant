/* Screen tab: today's screen time (active / idle / locked / asleep), top apps and the last 7 days. */
(function () {
  const RA = window.RA;
  let pane = null, timer = null;
  const dur = (ms) => {
    const m = Math.round(ms / 60000);
    if (m < 1) return ms > 0 ? '<1' + RA.L('m', 'm') : '0' + RA.L('m', 'm');
    return m >= 60 ? Math.floor(m / 60) + RA.L('j ', 'h ') + (m % 60) + 'm' : m + 'm';
  };

  async function render() {
    if (!pane) return;
    const r = await RA.invoke('screentime.get');
    if (!r) return;
    if (!r.enabled) { pane.innerHTML = `<div class="small muted" style="padding:10px">${RA.L('Pantauan layar dimatikan. Nyalakan di Pengaturan → Perilaku.', 'Screen time is off. Turn it on in Settings → Behaviour.')}</div>`; return; }
    const t = r.today || { active: 0, idle: 0, locked: 0, sleep: 0, apps: [] };
    const max = Math.max(1, ...t.apps.map((a) => a.ms));
    const dmax = Math.max(1, ...r.days.map((d) => d.active));
    const wd = (k) => new Date(k + 'T12:00').toLocaleDateString(RA.S.lang === 'en' ? 'en-GB' : 'id-ID', { weekday: 'short' });
    pane.innerHTML = `
      <div class="row" style="gap:14px;align-items:flex-end">
        <div><div class="small muted">${RA.L('Layar aktif hari ini', 'Screen on today')}</div><div style="font-size:24px;font-weight:700">${dur(t.active)}</div></div>
        <div class="grow small muted" style="line-height:1.6">
          ${RA.L('Diam', 'Idle')} <b>${dur(t.idle)}</b> · ${RA.L('Terkunci', 'Locked')} <b>${dur(t.locked)}</b> · ${RA.L('Tidur/standby', 'Sleep/standby')} <b>${dur(t.sleep)}</b><br>
          ${t.first ? RA.L('Mulai', 'First use') + ' ' + RA.hm(t.first) + ' · ' + RA.L('terakhir', 'last') + ' ' + RA.hm(t.last) : ''}
        </div>
        <div class="row" style="gap:3px;align-items:flex-end;height:46px">${r.days.map((d) => `<div title="${d.day}: ${dur(d.active)}" style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="width:12px;height:${Math.max(2, Math.round((d.active / dmax) * 32))}px;border-radius:3px;background:var(--accent);opacity:${d.day === (r.today && r.today.day) ? 1 : 0.5}"></div><span style="font-size:9px" class="muted">${wd(d.day).slice(0, 2)}</span></div>`).join('')}</div>
      </div>
      <div class="h" style="margin:10px 0 4px">${RA.L('Aplikasi di layar', 'Apps on screen')}</div>
      <div class="list" style="max-height:150px;overflow-y:auto">${t.apps.length ? t.apps.map((a) => `
        <div class="row" style="gap:8px;padding:3px 4px"><span class="ell" style="width:120px">${RA.esc(a.name)}</span>
          <div class="grow" style="height:6px;border-radius:3px;background:var(--card)"><div style="height:100%;width:${(a.ms / max) * 100}%;border-radius:3px;background:var(--accent)"></div></div>
          <span class="small muted" style="width:54px;text-align:right">${dur(a.ms)}</span></div>`).join('') : `<div class="small muted" style="padding:6px">${RA.L('Belum ada data.', 'No data yet.')}</div>`}</div>`;
  }

  RA.tab({
    id: 'screen', height: 300,
    render(p) { pane = p; render(); },
    onShow() { render(); clearInterval(timer); timer = setInterval(render, 30000); },
    onHide() { clearInterval(timer); timer = null; }
  });
})();

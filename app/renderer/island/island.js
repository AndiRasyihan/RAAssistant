/* Island boot: settings/theme application, state routing, gestures. */
(function () {
  const RA = window.RA;
  const body = document.body;

  function applyLook() {
    const S = RA.S;
    window.RAI18N.setLang(S.lang);
    body.classList.toggle('notch', S.appearance.style === 'notch');
    for (const c of [...body.classList]) if (c.startsWith('theme-')) body.classList.remove(c);
    body.classList.add('theme-' + S.appearance.theme);
    document.documentElement.style.setProperty('--accent', S.appearance.accent);
    if (!/^cover/.test(S.appearance.theme)) document.documentElement.style.setProperty('--cover', S.appearance.accent);
  }

  function setMode(mode) {
    RA.mode = mode;
    for (const c of [...body.classList]) if (c.startsWith('mode-')) body.classList.remove(c);
    body.classList.add('mode-' + mode);
    if (mode !== 'normal' && RA.expanded) RA.expand(false);
    RA.size();
    if (mode === 'normal' && RA.pointerInside) RA.setPointer(true);
  }

  async function boot() {
    const init = await RA.invoke('init');
    RA.S = init.settings;
    RA.st = Object.assign(init.state || {}, RA.st);
    RA.ver = init.version;
    applyLook();
    RA.buildTabs();
    setMode((RA.st.layout && RA.st.layout.mode) || 'normal');
    for (const k of Object.keys(RA.st)) if (k !== 'toast') RA.emit(k, RA.st[k]);
    RA.refresh();
    setInterval(tick, 1000);
    battery();
  }

  window.ra.on('ra:state', (key, val) => { RA.st[key] = val; if (RA.S) RA.emit(key, val); });
  window.ra.on('ra:settings', (S, changed) => {
    const prevTabs = JSON.stringify(RA.S.behaviour.tabs);
    const prevLang = RA.S.lang;
    RA.S = S;
    applyLook();
    if (prevTabs !== JSON.stringify(S.behaviour.tabs) || prevLang !== S.lang) {
      if (prevLang !== S.lang) for (const t of RA.tabs) { if (t.pane) { t.pane.innerHTML = ''; t.render(t.pane); } }
      RA.buildTabs();
    }
    RA.emit('settings', { S, changed });
    RA.refresh();
  });
  window.ra.on('ra:blur', () => { if (!RA.pointerInside && !RA.pins) RA.expand(false); });

  RA.on('layout', (v) => setMode(v.mode));
  RA.on('zoom', (k) => { RA.zoom = k; RA.size(); });
  RA.on('pointer', (v) => RA.setPointer(v.inside));
  RA.on('volume', (v) => { if (v.osd) RA.osd('volume', v.muted ? 0 : v.v); });
  RA.on('brightness', (v) => RA.osd('sun', v.v / 100));
  RA.on('caps', (v) => RA.osd('caps', null, v.on ? RA.t('osd.capsOn') : RA.t('osd.capsOff')));
  RA.on('toast', (item) => {
    if (!item || !item.title) return;
    const it = { ...item };
    if (it.kind === 'notif') {
      it.onClick = () => RA.invoke('notif.open', it.aumid, it.launch);
      if (it.otp) { it.actions = [{ label: `${RA.t('otp.copy')} ${it.otp}`, pri: true, run: () => RA.invoke('copyOtp', it.otp) }]; it.ms = 15000; }
    }
    if (it.kind === 'download') it.onClick = () => RA.invoke('showItem', it.file);
    if (it.kind === 'resume') it.actions = [{ label: RA.t('common.resume'), pri: true, run: () => RA.invoke('media', 'play') }];
    if (it.kind === 'agent') it.onClick = () => RA.expand(true, 'agents');
    if (it.kind === 'drink') it.actions = [{ label: RA.t('drink.add'), pri: true, run: () => RA.invoke('drink.add', 1) }];
    if (it.kind === 'event' && it.link) it.actions = [{ label: RA.t('common.join'), pri: true, run: () => RA.invoke('openExternal', it.link) }];
    if (it.kind === 'prayer') it.onClick = () => RA.expand(true, 'prayer');
    RA.toast(it);
  });

  // ---- meeting mode
  const micBtn = RA.$('#micBtn');
  micBtn.innerHTML = RA.icons.mic;
  micBtn.onclick = () => RA.invoke('mics.toggle');
  RA.on('mics', (m) => { micBtn.classList.toggle('muted', !!m.muted); micBtn.innerHTML = m.muted ? RA.icons.micOff : RA.icons.mic; micBtn.title = m.muted ? RA.t('meeting.unmuteAll') : RA.t('meeting.muteAll'); });
  RA.on('meeting', (m) => {
    const was = RA.meetingActive;
    RA.meetingActive = !!m.on;
    body.classList.toggle('meeting', !!m.on && RA.S.meetings.micButton);
    if (was && !m.on) RA.releaseHeld(RA.t('meeting.summary'));
    RA.refresh(); RA.size();
  });
  RA.activity('meeting', () => {
    const m = RA.st.meeting;
    if (!m || !m.on) return null;
    const mins = Math.floor((Date.now() - m.since) / 60000);
    return { pri: 70, w: 320, html: `<div class="act"><span class="dot rec"></span><span class="txt"><b>${RA.t('meeting.on')}</b> <span class="sub">${RA.esc((m.apps || []).join(', '))} · ${mins} ${RA.t('common.min')}${RA.held.length ? ' · ' + RA.held.length + ' ' + RA.t('meeting.held') : ''}</span></span></div>` };
  });

  // ---- downloads
  RA.activity('downloads', () => {
    const d = RA.st.downloads;
    if (!d || !d.length) return null;
    const x = d[0];
    const mb = (n) => (n / 1048576).toFixed(1);
    return { pri: 30, w: 340, html: `<div class="act"><span style="width:16px">${RA.icons.download}</span><span class="txt">${RA.esc(x.name)} <span class="sub">${mb(x.size)} MB · ${mb(x.speed)} MB/s${d.length > 1 ? ' · +' + (d.length - 1) : ''}</span></span></div>` };
  });

  // ---- idle mascot
  RA.activity('idle', () => {
    const i = RA.st.idle;
    if (!i || !i.on) return null;
    const h = new Date().getHours();
    const msg = h >= 22 || h < 5 ? RA.L('Rara mengantuk… zZ', 'Rara is sleepy… zZ') : RA.L('Rara menunggumu kembali', 'Rara is waiting for you');
    return { pri: 5, w: 280, counts: false, html: `<div class="act">${RA.mascotHtml()}<span class="txt sub">${msg}</span></div>` };
  });
  RA.on('idle', () => RA.refresh());
  RA.on('downloads', () => RA.refresh());
  RA.on('privacy', (p) => {
    body.classList.toggle('cam-on', !!(p && p.cam));
    body.classList.toggle('mic-on', !!(p && p.mic));
    RA.applyMascot();
  });
  RA.on('cpu', () => RA.applyMascot());

  let lastActivity = null;
  function tick() {
    RA.refresh();
    if (RA.activityOn !== lastActivity) { lastActivity = RA.activityOn; RA.invoke('activity', !!RA.activityOn); }
    RA.emit('tick', Date.now());
  }

  async function battery() {
    if (!navigator.getBattery) return;
    try {
      const b = await navigator.getBattery();
      const upd = (ev) => {
        const prev = RA.st.battery;
        RA.st.battery = { level: b.level, charging: b.charging };
        if (prev && !prev.charging && b.charging) RA.mascot.plugAt = Date.now();
        RA.emit('battery', RA.st.battery);
        RA.applyMascot(); RA.refresh();
      };
      b.addEventListener('levelchange', upd);
      b.addEventListener('chargingchange', upd);
      upd();
    } catch {}
  }

  // ------------------------------------------------------------- gestures
  const isl = RA.$('#island');
  let wheelAcc = 0, swipeAcc = 0, swipeLock = 0;
  isl.addEventListener('wheel', (e) => {
    const S = RA.S;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      if (!RA.expanded || Date.now() < swipeLock) return;
      swipeAcc += e.deltaX;
      if (Math.abs(swipeAcc) > 60) { RA.cycleTab(swipeAcc > 0 ? 1 : -1); swipeAcc = 0; swipeLock = Date.now() + 450; }
      return;
    }
    if (!S.music.gestures) return;
    // Inside scrollable panes, scrolling scrolls. On the bar / compact island it changes volume.
    if (RA.expanded && !e.target.closest('#tabbar') && !e.target.closest('.music .left')) return;
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) >= 40) {
      RA.invoke('volumeDelta', wheelAcc > 0 ? -0.02 : 0.02);
      wheelAcc = 0;
    }
  }, { passive: false });

  isl.addEventListener('dblclick', (e) => {
    if (!RA.S.music.gestures) return;
    if (e.target.closest('button, input, select, textarea, a, .lyrics p, .prog, .pane .list, .agent')) return;
    RA.invoke('media', 'toggle');
  });

  // Tab key quick switch when focused
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { window.ra.focus(false); RA.expand(false); }
  });

  boot();
})();

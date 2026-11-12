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
    RA.st = init.state || {};
    RA.ver = init.version;
    applyLook();
    RA.buildTabs();
    setMode((RA.st.layout && RA.st.layout.mode) || 'normal');
    for (const k of Object.keys(RA.st)) RA.emit(k, RA.st[k]);
    RA.refresh();
    setInterval(tick, 1000);
    battery();
  }

  window.ra.on('ra:state', (key, val) => { RA.st[key] = val; RA.emit(key, val); });
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
  RA.on('toast', (item) => { if (item && item.title) RA.toast(item); });
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

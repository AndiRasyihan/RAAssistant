/* Timer tab: countdown timer, stopwatch with laps, Pomodoro focus (holds notifications), detachable pill. */
(function () {
  const RA = window.RA;
  let pane = null, mode = 'timer';
  const T = { timer: { dur: 5 * 60000, left: 5 * 60000, endAt: 0, running: false }, sw: { base: 0, startAt: 0, running: false, laps: [] }, focus: { phase: 'idle', endAt: 0, left: 0, cycles: 0 } };

  const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + RA.pad(m) : RA.pad(m)) + ':' + RA.pad(x); };
  const swNow = () => T.sw.base + (T.sw.running ? Date.now() - T.sw.startAt : 0);
  const timerLeft = () => (T.timer.running ? T.timer.endAt - Date.now() : T.timer.left);
  const focusLeft = () => (T.focus.phase === 'idle' ? RA.S.focus.minutes * 60000 : T.focus.endAt - Date.now());

  function publish() {
    // Shared with the detachable pill window through main.
    const s = { mode, timer: { left: timerLeft(), running: T.timer.running, endAt: T.timer.endAt }, sw: { now: swNow(), running: T.sw.running, startAt: T.sw.startAt, base: T.sw.base }, focus: { phase: T.focus.phase, endAt: T.focus.endAt } };
    RA.invoke('timer.state', s);
  }

  function startFocus(phase) {
    T.focus.phase = phase;
    T.focus.endAt = Date.now() + (phase === 'focus' ? RA.S.focus.minutes : RA.S.focus.breakMin) * 60000;
    RA.focusActive = phase === 'focus';
    publish(); render(); RA.refresh();
  }
  function stopFocus() {
    const was = RA.focusActive;
    T.focus.phase = 'idle'; RA.focusActive = false;
    if (was) RA.releaseHeld(RA.t('focus.end'));
    publish(); render(); RA.refresh();
  }

  function act(a) {
    if (mode === 'timer' || a.startsWith('timer')) {
      if (a === 'timer.toggle') {
        if (T.timer.running) { T.timer.left = timerLeft(); T.timer.running = false; }
        else { if (T.timer.left <= 0) T.timer.left = T.timer.dur; T.timer.endAt = Date.now() + T.timer.left; T.timer.running = true; }
      }
      if (a === 'timer.reset') { T.timer.running = false; T.timer.left = T.timer.dur; }
    }
    if (a === 'sw.toggle') { if (T.sw.running) { T.sw.base = swNow(); T.sw.running = false; } else { T.sw.startAt = Date.now(); T.sw.running = true; } }
    if (a === 'sw.reset') { T.sw = { base: 0, startAt: 0, running: false, laps: [] }; }
    if (a === 'sw.lap' && T.sw.running) T.sw.laps.unshift(swNow());
    if (a === 'focus.toggle') { if (T.focus.phase === 'idle') startFocus('focus'); else stopFocus(); return; }
    publish(); render(); RA.refresh();
  }
  RA.timerAct = act;

  function render() {
    if (!pane) return;
    const seg = `<div class="seg" style="margin-bottom:10px">${[['timer', RA.t('timer.timer')], ['sw', RA.t('timer.stopwatch')], ['focus', RA.t('timer.focus')]].map(([k, l]) => `<button data-mode="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (mode === 'timer') {
      body = `<div class="big-time" data-live="timer">${fmt(timerLeft())}</div>
        <div class="row" style="justify-content:center;margin:6px 0">${[1, 5, 10, 15, 25, 45, 60].map((m) => `<button class="btn sm" data-preset="${m}">${m}m</button>`).join('')}</div>
        <div class="row" style="justify-content:center"><button class="btn pri" data-a="timer.toggle">${T.timer.running ? RA.t('timer.pause') : RA.t('timer.start')}</button><button class="btn" data-a="timer.reset">${RA.t('timer.reset')}</button><button class="btn" data-pill>${RA.icons.pin.replace('<svg', '<svg style="width:12px;height:12px;fill:currentColor;display:inline"')} ${RA.t('timer.detach')}</button></div>`;
    } else if (mode === 'sw') {
      body = `<div class="big-time" data-live="sw">${fmt(swNow()).replace(/:(\d\d)$/, ':$1')}<span style="font-size:20px;opacity:.6">.${String(Math.floor((swNow() % 1000) / 100))}</span></div>
        <div class="row" style="justify-content:center;margin:6px 0"><button class="btn pri" data-a="sw.toggle">${T.sw.running ? RA.t('timer.pause') : RA.t('timer.start')}</button><button class="btn" data-a="sw.lap">${RA.t('timer.lap')}</button><button class="btn" data-a="sw.reset">${RA.t('timer.reset')}</button><button class="btn" data-pill>${RA.t('timer.detach')}</button></div>
        <div class="list small" style="max-height:70px;overflow-y:auto">${T.sw.laps.map((l, i) => `<div class="it"><span class="muted">#${T.sw.laps.length - i}</span><span class="grow"></span>${fmt(l)}</div>`).join('')}</div>`;
    } else {
      const ph = T.focus.phase;
      body = `<div class="big-time" data-live="focus">${fmt(focusLeft())}</div>
        <div style="text-align:center" class="muted small">${ph === 'focus' ? '🎯 ' + RA.t('focus.on') + ' · ' + RA.held.length + ' ' + RA.t('focus.held') : ph === 'break' ? '☕ ' + RA.t('focus.break') : 'Pomodoro ' + RA.S.focus.minutes + '/' + RA.S.focus.breakMin + ' ' + RA.t('common.min')}</div>
        <div class="row" style="justify-content:center;margin-top:8px"><button class="btn pri" data-a="focus.toggle">${ph === 'idle' ? RA.t('timer.start') : RA.t('common.stop')}</button></div>`;
    }
    pane.innerHTML = seg + body;
  }

  // Live digits without full re-render.
  setInterval(() => {
    const now = Date.now();
    if (T.timer.running && timerLeft() <= 0) {
      T.timer.running = false; T.timer.left = 0;
      RA.toast({ title: '⏰ ' + RA.t('timer.done'), body: fmt(T.timer.dur), icon: 'timer', urgent: true, ms: 15000 });
      RA.chime(); publish(); render(); RA.refresh();
    }
    if (T.focus.phase !== 'idle' && T.focus.endAt <= now) {
      if (T.focus.phase === 'focus') { T.focus.cycles++; RA.focusActive = false; RA.releaseHeld(RA.t('focus.end')); RA.chime(); startFocus('break'); }
      else { RA.toast({ title: '🎯 ' + RA.L('Istirahat selesai', 'Break over'), body: '', icon: 'focus', force: true }); RA.chime(); T.focus.phase = 'idle'; publish(); render(); RA.refresh(); }
    }
    if (!pane || !RA.expanded || RA.tab !== 'timer') return;
    const el = pane.querySelector('[data-live]');
    if (!el) return;
    if (el.dataset.live === 'timer') el.textContent = fmt(timerLeft());
    else if (el.dataset.live === 'focus') el.textContent = fmt(focusLeft());
  }, 250);
  setInterval(() => { if (pane && RA.expanded && RA.tab === 'timer' && mode === 'sw' && T.sw.running) { const el = pane.querySelector('[data-live]'); if (el) el.innerHTML = fmt(swNow()) + `<span style="font-size:20px;opacity:.6">.${Math.floor((swNow() % 1000) / 100)}</span>`; } }, 100);

  // Soft chime (WebAudio, no asset needed).
  RA.chime = () => {
    try {
      const ac = new AudioContext(); const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(880, ac.currentTime); o.frequency.setValueAtTime(1320, ac.currentTime + 0.18);
      g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.95); o.onended = () => ac.close();
    } catch {}
  };

  RA.tab({
    id: 'timer', height: 240,
    render(p) {
      pane = p;
      p.addEventListener('click', (e) => {
        const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; render(); return; }
        const pr = e.target.closest('[data-preset]'); if (pr) { T.timer.dur = T.timer.left = +pr.dataset.preset * 60000; T.timer.running = false; act('timer.toggle'); return; }
        const a = e.target.closest('[data-a]'); if (a) { act(a.dataset.a); return; }
        if (e.target.closest('[data-pill]')) { publish(); RA.invoke('pill', true); }
      });
      render();
    },
    onShow: render
  });

  RA.on('cmd', (c) => {
    if (!c || Date.now() - c.at > 5000) return;
    if (c.cmd === 'focus') act('focus.toggle');
    if (c.cmd === 'timer') act(c.a);
  });

  RA.activity('timer', () => {
    const items = [];
    if (T.focus.phase !== 'idle') items.push({ pri: 50, w: 260, html: `<div class="act">${T.focus.phase === 'focus' ? '🎯' : '☕'}<span class="txt"><b>${fmt(focusLeft())}</b> <span class="sub">${T.focus.phase === 'focus' ? RA.t('focus.on') : RA.t('focus.break')}</span></span></div>` });
    if (T.timer.running) items.push({ pri: 52, w: 220, html: `<div class="act">⏳<span class="txt"><b>${fmt(timerLeft())}</b></span></div>` });
    if (T.sw.running) items.push({ pri: 48, w: 220, html: `<div class="act">⏱️<span class="txt"><b>${fmt(swNow())}</b></span></div>` });
    return items.sort((a, b) => b.pri - a.pri)[0] || null;
  });
})();

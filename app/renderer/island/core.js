/* RA Assistant island core. Plain DOM, no framework. */
(function () {
  const I = window.RAI18N;
  const P = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
  const icons = {
    play: P('M8 5v14l11-7z'), pause: P('M6 5h4v14H6zM14 5h4v14h-4z'),
    next: P('M6 6l8.5 6L6 18zM16 6h2v12h-2z'), prev: P('M18 6l-8.5 6L18 18zM6 6h2v12H6z'),
    music: P('M12 3v10.55A4 4 0 1 0 14 17V7h4V3z'),
    agents: P('M10 2l1.6 4.9L16.5 8.5l-4.9 1.6L10 15l-1.6-4.9L3.5 8.5l4.9-1.6zM18 12l.9 2.6 2.6.9-2.6.9L18 19l-.9-2.6-2.6-.9 2.6-.9z'),
    today: P('M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zM5 9h14v10H5zm2 2v3h3v-3z'),
    prayer: P('M14.5 2A9.5 9.5 0 1 0 22 16.6 7.5 7.5 0 0 1 14.5 2z'),
    shelf: P('M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm2.2 0H9a3 3 0 0 0 6 0h3.8l-2.2-6H7.4z'),
    timer: P('M9 1h6v2H9zM12 4a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 9.4V8h-2v6.2l4 2.4 1-1.7z'),
    reminders: P('M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1z'),
    drink: P('M12 2.5s-7 7.6-7 12.5a7 7 0 0 0 14 0c0-4.9-7-12.5-7-12.5z'),
    capture: P('M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z'),
    camera: P('M9 3L7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z'),
    mic: P('M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z'),
    micOff: P('M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11zM3.3 2.3L2 3.6l18.4 18.4 1.3-1.3z'),
    gear: P('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4.9v-1.8l-2.3-.6a7 7 0 0 0-.7-1.6l1.2-2.1-1.3-1.3-2.1 1.2a7 7 0 0 0-1.6-.7L13.9 3h-1.8l-.6 2.3a7 7 0 0 0-1.6.7L7.8 4.8 6.5 6.1l1.2 2.1a7 7 0 0 0-.7 1.6L4.7 10.4v1.8l2.3.6c.2.6.4 1.1.7 1.6l-1.2 2.1 1.3 1.3 2.1-1.2c.5.3 1 .5 1.6.7l.6 2.3h1.8l.6-2.3c.6-.2 1.1-.4 1.6-.7l2.1 1.2 1.3-1.3-1.2-2.1c.3-.5.5-1 .7-1.6z'),
    x: P('M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z'),
    plus: P('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'),
    volume: P('M4 9v6h4l5 4V5L8 9zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z'),
    sun: P('M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1l1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z'),
    caps: P('M12 4l-7 8h4v4h6v-4h4zM9 18h6v2H9z'),
    check: P('M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z'),
    open: P('M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'),
    record: P('M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z'),
    pin: P('M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z'),
    phone: P('M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 3v13h10V5z'),
    clip: P('M9 2h6v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm0 4H6v14h12V6h-3v2H9z'),
    download: P('M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16 6.3 10.3l1.4-1.4 3.3 3.3zM5 18h14v2H5z'),
    bt: P('M11 2h1l5 5-4.3 5 4.3 5-5 5h-1v-7.6L7.2 18 5.8 16.6 10.4 12 5.8 7.4 7.2 6 11 9.6zm2 3.4v4.2l2.1-2.1zm0 9v4.2l2.1-2.1z'),
    cloud: P('M6.5 19a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 17.7 9 5 5 0 0 1 17.5 19z'),
    net: P('M12 4C7.3 4 3.4 6 1 9l11 13L23 9c-2.4-3-6.3-5-11-5z'),
    trash: P('M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z'),
    focus: P('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z')
  };

  const RA = window.RA = {
    S: null, st: {}, icons, ver: '',
    t: (k, f) => I.t(k, f), L: (a, b) => I.L(a, b),
    tabs: [], activities: [], subs: {},
    expanded: false, tab: 'music', pins: 0, mode: 'normal',
    invoke: (...a) => window.ra.invoke(...a)
  };

  // ------------------------------------------------------------- helpers
  RA.$ = (s, r) => (r || document).querySelector(s);
  RA.el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  RA.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  RA.pad = (n) => String(n).padStart(2, '0');
  RA.hm = (d) => { d = d instanceof Date ? d : new Date(d); return RA.pad(d.getHours()) + '.' + RA.pad(d.getMinutes()); };
  RA.mmss = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return (h ? h + ':' + RA.pad(m) : m) + ':' + RA.pad(s % 60); };
  RA.ago = (ms) => {
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return s + ' ' + RA.t('common.sec');
    if (s < 3600) return Math.floor(s / 60) + ' ' + RA.t('common.min');
    return Math.floor(s / 3600) + 'j ' + (Math.floor(s / 60) % 60) + 'm';
  };
  RA.dur = (sec) => {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + ' ' + RA.t('common.sec');
    const m = Math.floor(sec / 60);
    if (m < 60) return m + ' ' + RA.t('common.min');
    return Math.floor(m / 60) + RA.L(' j ', ' h ') + (m % 60) + ' ' + RA.t('common.min');
  };
  RA.dayKey = (d = new Date()) => d.getFullYear() + '-' + RA.pad(d.getMonth() + 1) + '-' + RA.pad(d.getDate());

  // pub/sub for state keys pushed from main
  RA.on = (key, fn) => { (RA.subs[key] = RA.subs[key] || []).push(fn); };
  RA.emit = (key, val) => { for (const fn of RA.subs[key] || []) try { fn(val); } catch (e) { console.error(key, e); } };
  RA.set = (p, v) => RA.invoke('settings.set', p, v);
  RA.data = { get: (p) => RA.invoke('data.get', p), set: (p, v) => RA.invoke('data.set', p, v) };

  // ------------------------------------------------------------- tabs & activities
  RA.tab = (def) => { RA.tabs.push(def); };
  // provider() -> null | { pri, html | el, w }
  RA.activity = (id, provider) => { RA.activities.push({ id, provider }); };

  let compactQueued = false;
  RA.refresh = () => {
    if (compactQueued) return;
    compactQueued = true;
    requestAnimationFrame(() => { compactQueued = false; renderCompact(); });
  };

  function batteryHtml() {
    const b = RA.st.battery;
    if (!b) return '';
    const pct = Math.round(b.level * 100);
    const cls = (b.charging ? 'charging' : '') + (pct <= 20 && !b.charging ? ' low' : '');
    return `<div class="batt ${cls}"><span>${pct}%</span><div class="shell"><div class="lvl" style="width:${pct}%"></div></div></div>`;
  }

  let lastCompactKey = '';
  function renderCompact() {
    const S = RA.S; if (!S) return;
    const content = S.appearance.content;
    const acts = [];
    for (const a of RA.activities) {
      try { const r = a.provider(); if (r) acts.push({ id: a.id, ...r }); } catch (e) { console.error(a.id, e); }
    }
    acts.sort((a, b) => b.pri - a.pri);
    const top = acts[0];
    const now = new Date();
    const clock = `<span class="clock">${RA.hm(now)}</span>`;
    let left = '', right = '', center = '', w = 210;
    if (content === 'mascot') {
      left = top ? RA.mascotHtml() : '';
      center = top ? '' : RA.mascotHtml();
      w = top ? 0 : 120;
    } else {
      left = clock;
      right = content === 'clock-mascot' ? RA.mascotHtml() : batteryHtml();
    }
    if (top) { center = top.html; w = Math.max(w, top.w || 300); }
    const key = left + '|' + center + '|' + right;
    if (key !== lastCompactKey) {
      lastCompactKey = key;
      RA.$('#slotLeft').innerHTML = left;
      RA.$('#slotCenter').innerHTML = center;
      RA.$('#slotRight').innerHTML = right;
      RA.applyMascot && RA.applyMascot();
    }
    RA.compactW = w;
    RA.$('#shrinkClock') || RA.$('#island').appendChild(RA.el('<div id="shrinkClock"></div>'));
    const sc = S.behaviour.clockPill;
    RA.$('#shrinkClock').textContent = sc === 'timedate' ? RA.hm(now) + ' · ' + now.getDate() + '/' + (now.getMonth() + 1) : sc === 'time' ? RA.hm(now) : '';
    document.body.classList.toggle('clock-off', sc === 'off');
    RA.activityOn = acts.some((a) => a.counts !== false);
    sizeIsland();
  }

  // ------------------------------------------------------------- sizing
  RA.paneHeight = 330;
  let osdTimer = null, toastShowing = null;
  function sizeIsland() {
    const isl = RA.$('#island');
    let w, h;
    if (RA.expanded) { w = 620; h = RA.paneHeight; }
    else if (toastShowing) { w = toastShowing.w || 440; h = toastShowing.h || 64; }
    else if (document.body.classList.contains('osd')) { w = 300; h = 36; }
    else { w = RA.compactW || 210; h = 36; }
    isl.style.setProperty('--w', w + 'px');
    isl.style.setProperty('--h', h + 'px');
    isl.style.setProperty('--eh', RA.paneHeight + 'px');
    positionMicBtn(w);
    reportRects(w, h);
  }
  RA.size = sizeIsland;

  function positionMicBtn(w) {
    const b = RA.$('#micBtn');
    b.style.left = `calc(50% + ${w / 2 + 8}px)`;
  }

  // Tell main where the interactive regions are, so the rest of the window stays click-through.
  // Computed from the *target* size (not measured mid-animation) to avoid hover races.
  let lastRectKey = '';
  function reportRects(w, h) {
    const notch = document.body.classList.contains('notch');
    const top = notch ? 0 : 8;
    if ((RA.mode === 'shrink' || RA.mode === 'peek') && !toastShowing && !document.body.classList.contains('osd')) { w = 140; h = 30; }
    const W = document.documentElement.clientWidth;
    const z = RA.zoom || 1;
    const rects = [[(W - w) / 2 * z, 0, w * z, (top + h) * z]];
    if (document.body.classList.contains('meeting') && RA.S && RA.S.meetings.micButton) rects.push([((W + w) / 2 + 8) * z, top * z, 36 * z, 36 * z]);
    const key = JSON.stringify(rects);
    if (key === lastRectKey) return;
    lastRectKey = key;
    window.ra.invoke('rects', rects);
  }

  // ------------------------------------------------------------- expand / collapse
  let hoverT = null, leaveT = null;
  RA.pointerInside = false;
  RA.setPointer = (inside) => {
    RA.pointerInside = inside;
    clearTimeout(hoverT); clearTimeout(leaveT);
    if (inside) {
      if (RA.mode === 'shrink' || RA.mode === 'peek') return; // main switches mode first
      if (toastShowing && toastShowing.interactive) return; // let the user click the answer in place
      hoverT = setTimeout(() => RA.expand(true), 160);
    } else {
      leaveT = setTimeout(() => { if (!RA.pins && !RA.pointerInside) RA.expand(false); }, 450);
    }
  };
  RA.pin = (d) => { RA.pins = Math.max(0, RA.pins + d); if (!RA.pins && !RA.pointerInside) RA.setPointer(false); };

  RA.expand = (on, tab) => {
    if (tab) RA.showTab(tab);
    if (on === RA.expanded) return;
    RA.expanded = on;
    document.body.classList.toggle('expanded', on);
    if (!on) window.ra.focus(false);
    const cur = RA.tabs.find((t) => t.id === RA.tab);
    if (cur) (on ? cur.onShow : cur.onHide) && (on ? cur.onShow() : cur.onHide());
    sizeIsland();
    if (!on) setTimeout(() => RA.flushToasts(), 400);
    else if (toastShowing) { const t = toastShowing; queue.unshift(t); toastShowing = null; document.body.classList.remove('toasting'); }
  };

  RA.visibleTabs = () => {
    const order = (RA.S.behaviour.tabs || []).filter((t) => t.show).map((t) => t.id);
    return order.map((id) => RA.tabs.find((t) => t.id === id)).filter(Boolean);
  };

  RA.buildTabs = () => {
    const bar = RA.$('#tabbar'); const panes = RA.$('#panes');
    bar.innerHTML = ''; 
    const vis = RA.visibleTabs();
    for (const t of RA.tabs) {
      if (!t.pane) { t.pane = RA.el(`<div class="pane" data-tab="${t.id}"></div>`); panes.appendChild(t.pane); t.render(t.pane); }
    }
    for (const t of vis) {
      const b = RA.el(`<button data-tab="${t.id}" title="${RA.esc(RA.t('tab.' + t.id))}">${icons[t.id] || ''}<span>${RA.esc(RA.t('tab.' + t.id))}</span></button>`);
      b.onclick = () => RA.showTab(t.id);
      bar.appendChild(b);
    }
    bar.appendChild(RA.el('<div class="spacer"></div>'));
    const g = RA.el(`<button title="${RA.esc(RA.t('tray.settings'))}">${icons.gear}</button>`);
    g.onclick = () => { RA.invoke('openSettings'); RA.expand(false); };
    bar.appendChild(g);
    if (!vis.find((t) => t.id === RA.tab) && vis[0]) RA.tab = vis[0].id;
    RA.showTab(RA.tab, true);
  };

  RA.showTab = (id, force) => {
    if (id === RA.tab && !force) return;
    const prev = RA.tabs.find((t) => t.id === RA.tab);
    if (prev && prev.onHide && RA.expanded) prev.onHide();
    RA.tab = id;
    for (const b of document.querySelectorAll('#tabbar button[data-tab]')) b.classList.toggle('on', b.dataset.tab === id);
    for (const t of RA.tabs) if (t.pane) t.pane.classList.toggle('on', t.id === id);
    const cur = RA.tabs.find((t) => t.id === id);
    RA.paneHeight = (cur && cur.height) || 330;
    if (cur && cur.onShow && RA.expanded) cur.onShow();
    sizeIsland();
  };

  RA.cycleTab = (dir) => {
    const vis = RA.visibleTabs();
    const i = vis.findIndex((t) => t.id === RA.tab);
    const n = vis[(i + dir + vis.length) % vis.length];
    if (n) RA.showTab(n.id);
  };

  // ------------------------------------------------------------- OSD
  RA.osd = (iconName, value, label) => {
    if (RA.expanded) return;
    const o = RA.$('#osd');
    o.querySelector('.ico').innerHTML = icons[iconName] || '';
    o.querySelector('.bar').style.display = value == null ? 'none' : '';
    o.querySelector('.bar b').style.width = Math.round((value || 0) * 100) + '%';
    o.querySelector('.val').textContent = label != null ? label : Math.round((value || 0) * 100);
    document.body.classList.add('osd');
    sizeIsland();
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => { document.body.classList.remove('osd'); sizeIsland(); }, 1400);
  };

  // ------------------------------------------------------------- toasts (shown inside the island)
  const queue = [];
  RA.held = [];
  RA.holding = () => RA.focusActive || RA.meetingActive;
  RA.toast = (item) => {
    if (RA.holding() && !item.urgent && !item.otp && !item.force) { RA.held.push(item); RA.refresh(); return; }
    if (item.interactive) {
      // Questions jump the queue and replace a plain toast that is currently showing.
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].key && queue[i].key === item.key) queue.splice(i, 1);
      queue.unshift(item);
      if (toastShowing && !toastShowing.interactive) { queue.splice(1, 0, toastShowing); toastShowing._done(); return; }
    } else queue.push(item);
    if (!toastShowing && !RA.expanded) nextToast();
  };
  RA.toastShowing = () => toastShowing;
  // Drop a pending/visible question once the agent no longer waits for it.
  RA.dropToast = (key) => {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].key === key) queue.splice(i, 1);
    if (toastShowing && toastShowing.key === key) toastShowing._done();
  };
  // Toasts wait while the panel is open (they would cover it) and play once it collapses.
  RA.flushToasts = () => { if (!toastShowing && !RA.expanded && queue.length) nextToast(); };
  function nextToast() {
    const item = queue.shift();
    toastShowing = item || null;
    const box = RA.$('#toast');
    if (!item) { document.body.classList.remove('toasting'); sizeIsland(); return; }
    box.classList.toggle('q', !!item.html);
    if (item.html) {
      box.innerHTML = item.html;
    } else {
      const icon = item.image ? `<div class="ticon" style="background-image:url('${item.image}')"></div>` : `<div class="ticon">${item.emoji || icons[item.icon] || icons.reminders}</div>`;
      const acts = (item.actions || []).map((a, i) => `<button class="btn ${a.pri ? 'pri' : ''} sm" data-i="${i}">${RA.esc(a.label)}</button>`).join('');
      box.innerHTML = `${icon}<div class="tbody"><div class="ttitle">${RA.esc(item.title || '')}</div><div class="ttext">${RA.esc(item.body || '')}</div></div><div class="tact">${acts}</div>`;
      box.querySelector('.ticon svg') && (box.querySelector('.ticon svg').style.cssText = 'width:20px;height:20px;fill:var(--accent)');
    }
    box.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (b) { const a = item.actions[+b.dataset.i]; if (a.run) a.run(); if (a.keep) return; }
      else if (item.interactive) { if (!e.target.closest('[data-close]')) return; }
      else if (item.onClick) item.onClick();
      else if (item.tab) RA.expand(true, item.tab);
      done();
    };
    document.body.classList.add('toasting');
    sizeIsland();
    const ms = item.ms || (item.urgent ? 9000 : 5000);
    let t = setTimeout(done, ms);
    function done() { clearTimeout(t); if (toastShowing !== item) return; if (item.interactive) window.ra.focus(false); nextToast(); }
    item._done = done;
  }
  RA.dismissToast = () => toastShowing && toastShowing._done && toastShowing._done();
  RA.releaseHeld = (summaryTitle) => {
    const n = RA.held.length;
    if (!n) return;
    const items = RA.held.splice(0);
    RA.toast({ title: summaryTitle || RA.t('meeting.summary'), body: `${n} ${RA.t('meeting.held')}: ` + items.map((x) => x.title).slice(0, 4).join(', '), icon: 'reminders', ms: 8000, force: true });
  };
})();

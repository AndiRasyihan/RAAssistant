// Detached timer pill: renders the timer/stopwatch/focus state published by the island.
(async function () {
  const $ = (id) => document.getElementById(id);
  let s = null;
  const init = await window.ra.invoke('init');
  s = init.state.timer;
  window.ra.on('ra:state', (k, v) => { if (k === 'timer') s = v; });
  const fmt = (ms) => { const x = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60); return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x % 60).padStart(2, '0'); };
  function draw() {
    if (!s) return;
    let ms = 0, icon = '⏳';
    if (s.focus && s.focus.phase !== 'idle') { ms = s.focus.endAt - Date.now(); icon = s.focus.phase === 'focus' ? '🎯' : '☕'; }
    else if (s.mode === 'sw' || (s.sw && s.sw.running && !(s.timer && s.timer.running))) { ms = s.sw.base + (s.sw.running ? Date.now() - s.sw.startAt : 0); icon = '⏱️'; }
    else if (s.timer) { ms = s.timer.running ? s.timer.endAt - Date.now() : s.timer.left; }
    $('t').textContent = fmt(ms); $('k').textContent = icon;
  }
  setInterval(draw, 250);
  $('go').onclick = () => {
    const a = s && s.focus && s.focus.phase !== 'idle' ? 'focus.toggle' : (s && (s.mode === 'sw' || (s.sw && s.sw.running))) ? 'sw.toggle' : 'timer.toggle';
    window.ra.invoke('timer.cmd', a);
  };
  $('x').onclick = () => window.ra.invoke('pill', false);
  // Drag the whole pill (window is non-focusable, so move it manually).
  let drag = null;
  $('p').addEventListener('mousedown', (e) => { if (e.target.tagName === 'BUTTON') return; drag = { x: e.screenX, y: e.screenY }; });
  window.addEventListener('mousemove', (e) => { if (!drag) return; const dx = e.screenX - drag.x, dy = e.screenY - drag.y; if (dx || dy) { window.ra.pillMove(dx, dy); drag = { x: e.screenX, y: e.screenY }; } });
  window.addEventListener('mouseup', () => { drag = null; });
})();

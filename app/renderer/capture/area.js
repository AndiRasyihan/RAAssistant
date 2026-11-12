(function () {
  const img = new URLSearchParams(location.search).get('img');
  const bg = document.getElementById('bg'), sel = document.getElementById('sel'), shade = document.getElementById('shade');
  bg.style.backgroundImage = `url("${img}")`;
  window.ra.invoke('init').then((i) => { if (i.lang === 'en') document.getElementById('hint').textContent = 'Drag to select an area · Esc to cancel'; });
  let start = null, rect = null;
  window.addEventListener('mousedown', (e) => { start = { x: e.clientX, y: e.clientY }; sel.style.display = 'block'; shade.style.display = 'none'; draw(e); });
  window.addEventListener('mousemove', (e) => { if (start) draw(e); });
  window.addEventListener('mouseup', () => { if (!start) return; start = null; window.ra.invoke('capture.areaDone', rect); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.ra.invoke('capture.areaDone', null); });
  function draw(e) {
    const x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY), w = Math.abs(e.clientX - start.x), h = Math.abs(e.clientY - start.y);
    rect = { x, y, w, h };
    Object.assign(sel.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    sel.firstChild.textContent = `${Math.round(w * devicePixelRatio)} × ${Math.round(h * devicePixelRatio)}`;
  }
})();

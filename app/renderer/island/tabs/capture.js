/* Capture tab: area / full screenshot, screen recording with optional mic. */
(function () {
  const RA = window.RA;
  let pane = null, rec = { on: false }, last = null;

  function render() {
    if (!pane) return;
    const sc = (RA.S.capture.shortcut || '').replace('CommandOrControl', 'Ctrl') || RA.L('nonaktif', 'off');
    pane.innerHTML = `
      <div class="row" style="gap:10px;margin-bottom:10px">
        <button class="btn grow" data-c="area" style="padding:14px">${RA.icons.capture.replace('<svg', '<svg style="width:18px;height:18px;fill:currentColor;margin:0 auto 4px"')}${RA.t('capture.area')}</button>
        <button class="btn grow" data-c="full" style="padding:14px">🖥️<br>${RA.t('capture.full')}</button>
        <button class="btn grow ${rec.on ? 'pri' : ''}" data-c="rec" style="padding:14px">${rec.on ? '⏹️<br>' + RA.t('capture.stop') : '🔴<br>' + RA.t('capture.record')}</button>
      </div>
      <div class="row small" style="gap:8px"><label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" data-mic ${RA.S.capture.recordMic ? 'checked' : ''} style="accent-color:var(--accent)"> 🎙️ ${RA.L('Rekam mikrofon', 'Record microphone')}</label>
        <span class="grow"></span><span class="muted">${RA.L('Pintasan', 'Shortcut')}: <b>${RA.esc(sc)}</b></span></div>
      <div class="row small" style="margin-top:10px;gap:8px">
        ${last ? `<img src="${last.url}" style="height:54px;border-radius:8px;cursor:pointer" data-open="${RA.esc(last.file)}">` : ''}
        <span class="grow muted">${RA.L('Tangkapan → Gambar\\Screenshots (juga disalin). Rekaman → Video\\Captures.', 'Screenshots → Pictures\\Screenshots (also copied). Recordings → Videos\\Captures.')}</span>
        <button class="btn sm" data-folder="shots">📁</button><button class="btn sm" data-folder="rec">🎬</button></div>`;
  }

  RA.tab({
    id: 'capture', height: 220,
    render(p) {
      pane = p;
      p.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-c]');
        if (b) {
          const c = b.dataset.c;
          if (c === 'rec') { RA.invoke('capture.record', !rec.on); if (!rec.on) RA.expand(false); return; }
          RA.expand(false);
          RA.invoke(c === 'area' ? 'capture.area' : 'capture.full');
          return;
        }
        const f = e.target.closest('[data-folder]');
        if (f) { const ps = await RA.invoke('paths'); RA.invoke('openPath', f.dataset.folder === 'shots' ? ps.pictures + '\\Screenshots' : ps.videos + '\\Captures'); }
        const o = e.target.closest('[data-open]'); if (o) RA.invoke('showItem', o.dataset.open);
      });
      p.addEventListener('change', (e) => { if (e.target.matches('[data-mic]')) RA.set('capture.recordMic', e.target.checked); });
      render();
    },
    onShow: render
  });

  RA.on('recording', (r) => { rec = r || { on: false }; render(); RA.refresh(); });
  RA.on('lastCapture', (l) => { last = l; render(); });
  RA.on('cmd', (c) => { if (c && c.cmd === 'capture' && Date.now() - c.at < 5000) { RA.pin(1); RA.expand(true, 'capture'); setTimeout(() => RA.pin(-1), 4000); } });

  RA.activity('recording', () => {
    if (!rec.on) return null;
    return { pri: 85, w: 240, html: `<div class="act"><span class="dot rec"></span><span class="txt"><b>${RA.t('capture.recording')}</b> <span class="sub">${RA.mmss((Date.now() - rec.since) / 1000)}</span></span></div>` };
  });
})();

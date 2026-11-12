/* Shelf tab: hold dragged files, drag them out again; clipboard history; phone link. */
(function () {
  const RA = window.RA;
  let pane = null, files = [], clips = [], sub = 'files', qr = null;
  const ext = (n) => (n.split('.').pop() || '').slice(0, 4).toUpperCase();

  function filesHtml() {
    return `<div class="shelf-drop" data-drop>${files.length ? files.map((f) => `
      <div class="file" draggable="true" data-path="${RA.esc(f.path)}" data-id="${f.id}" title="${RA.esc(f.name)}">
        <div class="fi" style="${f.isImage ? `background-image:url('${encodeURI(f.url).replace(/'/g, '%27')}')` : ''}">${f.isImage ? '' : f.dir ? '📁' : RA.esc(ext(f.name))}</div>
        <div class="ell">${RA.esc(f.name)}</div>${f.from === 'phone' ? '<div class="small muted">📱</div>' : ''}
        <button class="icon-btn x" data-rm="${f.id}" style="width:20px;height:20px">${RA.icons.x}</button></div>`).join('') : `<div class="muted small" style="margin:auto">${RA.t('shelf.drop')}</div>`}</div>
      ${files.length ? `<div class="row" style="margin-top:6px"><span class="small muted grow">${RA.L('Seret keluar ke aplikasi lain · klik dua kali untuk membuka', 'Drag out to another app · double-click to open')}</span><button class="btn sm" data-clear>${RA.t('shelf.clear')}</button></div>` : ''}`;
  }
  function clipsHtml() {
    if (!RA.S.phone.clipboard) return `<div class="empty">${RA.L('Riwayat clipboard mati. Aktifkan di Pengaturan → Ponsel & Rak.', 'Clipboard history is off. Enable it in Settings → Phone & Shelf.')}<br><br><button class="btn sm pri" data-enable-clip>${RA.t('common.on')}</button></div>`;
    return `<div class="list">${clips.length ? clips.map((c) => `<div class="clip-it" data-clip="${c.id}">${c.type === 'image' ? `<img src="${c.img}">` : `<span class="grow ell">${RA.esc(c.text)}</span>`}<span class="grow"></span><button class="icon-btn x" data-rmclip="${c.id}" style="width:20px;height:20px">${RA.icons.x}</button></div>`).join('') : `<div class="small muted" style="padding:8px">${RA.L('Belum ada salinan.', 'Nothing copied yet.')}</div>`}</div>
      ${clips.length ? `<div class="row" style="margin-top:6px"><span class="small muted grow">${RA.L('Klik untuk menyalin lagi · terhapus saat laptop dimatikan', 'Click to copy again · wiped on shutdown')}</span><button class="btn sm" data-clearclip>${RA.t('shelf.clear')}</button></div>` : ''}`;
  }
  function phoneHtml() {
    return `<div class="row" style="align-items:flex-start;gap:14px">
      <div>${qr && qr.qr ? `<img class="qr" src="${qr.qr}">` : `<button class="btn pri" data-qr>${RA.t('shelf.showQr')}</button>`}</div>
      <div class="grow small">${qr && qr.error ? `<div style="color:#fbbf24">⚠️ ${RA.esc(qr.error)}</div>` : qr && qr.url ? `<div class="muted">${RA.L('Pindai sekali dengan kamera ponsel. Wi‑Fi yang sama, jaringan Pribadi.', 'Scan once with your phone camera. Same Wi‑Fi, Private network.')}</div><div style="margin:4px 0;word-break:break-all">${RA.esc(qr.url)}</div>` : `<div class="muted">${RA.L('Kirim file & teks laptop⇄ponsel lewat Wi‑Fi lokal.', 'Send files & text laptop⇄phone over local Wi‑Fi.')}</div>`}
        <div class="row" style="margin-top:8px"><input data-ptext class="grow" placeholder="${RA.t('shelf.sendText')}…"><button class="btn sm pri" data-psend>↗</button></div></div></div>`;
  }

  function render() {
    if (!pane) return;
    const a = document.activeElement;
    if (a && pane.contains(a) && a.tagName === 'INPUT') return;
    pane.innerHTML = `<div class="seg" style="margin-bottom:8px">${[['files', RA.t('tab.shelf')], ['clip', RA.t('shelf.clipboard')], ['phone', RA.t('shelf.phone')]].map(([k, l]) => `<button data-sub="${k}" class="${sub === k ? 'on' : ''}">${l}</button>`).join('')}</div>` +
      (sub === 'files' ? filesHtml() : sub === 'clip' ? clipsHtml() : phoneHtml());
  }

  RA.tab({
    id: 'shelf', height: 290,
    render(p) {
      pane = p;
      p.addEventListener('click', async (e) => {
        const s = e.target.closest('[data-sub]'); if (s) { sub = s.dataset.sub; render(); return; }
        const rm = e.target.closest('[data-rm]'); if (rm) { RA.invoke('shelf.remove', rm.dataset.rm); return; }
        if (e.target.closest('[data-clear]')) { RA.invoke('shelf.clear'); return; }
        const rc = e.target.closest('[data-rmclip]'); if (rc) { e.stopPropagation(); RA.invoke('clip.remove', rc.dataset.rmclip); return; }
        if (e.target.closest('[data-clearclip]')) { RA.invoke('clip.clear'); return; }
        if (e.target.closest('[data-enable-clip]')) { RA.set('phone.clipboard', true); setTimeout(render, 200); return; }
        const c = e.target.closest('[data-clip]'); if (c) { await RA.invoke('clip.copy', c.dataset.clip); RA.osd('check', null, RA.t('common.copied')); return; }
        if (e.target.closest('[data-qr]')) { qr = { url: '' }; render(); qr = await RA.invoke('phone.qr'); render(); return; }
        if (e.target.closest('[data-psend]')) {
          const i = p.querySelector('[data-ptext]'); const v = i.value.trim(); if (!v) return;
          await RA.invoke('phone.sendText', v); i.value = ''; i.blur(); RA.osd('phone', null, RA.L('Terkirim ke ponsel', 'Sent to phone'));
        }
      });
      p.addEventListener('dblclick', (e) => { const f = e.target.closest('.file'); if (f) RA.invoke('shelf.open', f.dataset.id); });
      p.addEventListener('dragstart', (e) => { const f = e.target.closest('.file'); if (!f) return; e.preventDefault(); window.ra.dragOut(f.dataset.path); });
      p.addEventListener('mousedown', (e) => { if (e.target.tagName === 'INPUT') window.ra.focus(true); });
      p.addEventListener('focusin', (e) => { if (e.target.tagName === 'INPUT') RA.pin(1); });
      p.addEventListener('focusout', (e) => { if (e.target.tagName === 'INPUT') RA.pin(-1); });
      p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-ptext]')) p.querySelector('[data-psend]').click(); });
      render();
    },
    onShow: render
  });
  RA.on('shelf', (f) => { files = f || []; render(); });
  RA.on('clipboard', (c) => { clips = c || []; if (sub === 'clip') render(); });

  // Dropping files anywhere on the island puts them on the shelf.
  const isl = RA.$('#island');
  let dragDepth = 0;
  isl.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); dragDepth++;
    if (!RA.S.phone.shelf) return;
    sub = 'files'; RA.pin(1); RA.expand(true, 'shelf'); render();
    const d = pane && pane.querySelector('[data-drop]'); if (d) d.classList.add('over');
  });
  isl.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  isl.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { RA.pin(-1); const d = pane && pane.querySelector('[data-drop]'); if (d) d.classList.remove('over'); } });
  isl.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; RA.pin(-1);
    if (!RA.S.phone.shelf) return;
    const paths = [...e.dataTransfer.files].map((f) => window.ra.filePath(f)).filter(Boolean);
    if (paths.length) RA.invoke('shelf.add', paths);
  });
})();

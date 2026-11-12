/* Listen tab: live speech-to-text from the microphone (offline Whisper) with copy to clipboard. */
(function () {
  const RA = window.RA;
  let pane = null, st = { on: false, status: 'off', text: '', partial: '' };

  function statusText() {
    switch (st.status) {
      case 'download': return RA.L('Mengunduh mesin transkripsi (sekali saja)…', 'Downloading the transcription engine (one time)…');
      case 'loading': return RA.L('Menyiapkan…', 'Preparing…');
      case 'model': return RA.L('Memuat model suara', 'Loading voice model') + (st.progress ? ' ' + Math.round(st.progress * 100) + '%' : '…');
      case 'listening': return (RA.S.listen.source === 'system' ? RA.L('Mendengarkan audio laptop', 'Listening to laptop audio') : RA.L('Mendengarkan — bicaralah', 'Listening — start talking'));
      case 'error': return RA.L('Gagal: ', 'Failed: ') + (st.error || '');
      default: return RA.L('Tekan Mulai untuk mentranskripsi suara dari mikrofon secara langsung. Diproses di laptop ini (offline).', 'Press Start to transcribe your microphone live. Processed on this laptop (offline).');
    }
  }

  function render() {
    if (!pane) return;
    const lang = RA.S.listen.lang;
    pane.innerHTML = `
      <div class="row" style="gap:8px;margin-bottom:8px">
        <button class="btn ${st.on ? '' : 'pri'}" data-l="toggle">${st.on ? '⏹ ' + RA.L('Berhenti', 'Stop') : '🎙️ ' + RA.L('Mulai', 'Start')}</button>
        <div class="seg sm">${[['id', 'ID'], ['en', 'EN']].map(([v, n]) => `<button data-lang="${v}" class="${lang === v ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="seg sm" title="${RA.L('Sumber suara', 'Audio source')}">${[['mic', '🎙️'], ['system', '🔊']].map(([v, n]) => `<button data-src="${v}" class="${(RA.S.listen.source || 'mic') === v ? 'on' : ''}" title="${v === 'mic' ? RA.L('Mikrofon', 'Microphone') : RA.L('Audio sistem (video/rapat di laptop)', 'System audio (videos/meetings on this laptop)')}">${n}</button>`).join('')}</div>
        <span class="grow small muted" style="min-width:0">${st.on && st.status === 'listening' ? `<span class="lvl" style="display:inline-block;vertical-align:middle;width:46px;height:6px;border-radius:3px;background:var(--card);margin-right:6px"><i style="display:block;height:100%;border-radius:3px;background:#ef4444;width:${Math.round((st.level || 0) * 100)}%"></i></span>` : ''}${RA.esc(statusText())}</span>
        <button class="btn sm" data-l="copy">📋 ${RA.L('Salin', 'Copy')}</button>
        <button class="btn sm" data-l="clear">${RA.L('Hapus', 'Clear')}</button>
      </div>
      ${st.on && (RA.S.listen.source || 'mic') === 'mic' && RA.st.mics && RA.st.mics.muted ? `<div class="row small" style="gap:8px;margin:-2px 0 8px;color:#fbbf24">⚠️ ${RA.L('Mikrofon sedang dibisukan di Windows, jadi tidak ada suara masuk.', 'The microphone is muted in Windows, so no sound comes in.')}<button class="btn sm" data-l="unmute">${RA.L('Aktifkan mik', 'Unmute')}</button></div>` : ''}
      <div class="ltext" style="height:190px;overflow-y:auto;background:var(--card);border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.5;user-select:text;white-space:pre-wrap">${RA.esc(st.text)}${st.partial ? ` <span class="muted">${RA.esc(st.partial)}</span>` : ''}${!st.text && !st.partial ? `<span class="muted">${RA.L('Teks akan muncul di sini…', 'Text will appear here…')}</span>` : ''}</div>`;
    const t = pane.querySelector('.ltext'); t.scrollTop = t.scrollHeight;
  }

  RA.tab({
    id: 'listen', height: 280,
    render(p) {
      pane = p;
      p.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-l]');
        if (b) {
          const a = b.dataset.l;
          if (a === 'toggle') RA.invoke(st.on ? 'listen.stop' : 'listen.start');
          if (a === 'clear') RA.invoke('listen.clear');
          if (a === 'unmute') RA.invoke('mics', false);
          if (a === 'copy' && await RA.invoke('listen.copy')) { b.textContent = '✓ ' + RA.L('Tersalin', 'Copied'); setTimeout(render, 1200); }
          return;
        }
        const l = e.target.closest('[data-lang]');
        if (l) { await RA.set('listen.lang', l.dataset.lang); if (st.on) { await RA.invoke('listen.stop'); RA.invoke('listen.start'); } render(); }
        const s = e.target.closest('[data-src]');
        if (s) { await RA.set('listen.source', s.dataset.src); if (st.on) { await RA.invoke('listen.stop'); RA.invoke('listen.start'); } render(); }
      });
      render();
    },
    onShow: render
  });

  RA.on('mics', () => { if (st.on && RA.tab === 'listen' && RA.expanded) render(); });
  RA.on('listen', (v) => {
    const onlyLevel = v && st && v.text === st.text && v.partial === st.partial && v.status === st.status && v.on === st.on;
    st = v || st;
    if (RA.tab === 'listen' && RA.expanded) {
      const bar = pane && pane.querySelector('.lvl i');
      if (onlyLevel && bar) bar.style.width = Math.round((st.level || 0) * 100) + '%'; else render();
    }
    if (!onlyLevel) RA.refresh();
  });

  // Compact island: live caption while listening.
  RA.activity('listen', () => {
    if (!st.on) return null;
    const txt = st.partial || (st.text ? st.text.split(/(?<=[.!?])\s+/).pop() : '') || statusText();
    return { pri: 70, w: Math.min(600, Math.max(320, Math.ceil((RA.textW(txt) + 120) / 40) * 40)), html: `<div class="act"><span class="dot rec"></span><span class="txt">${RA.esc(txt)}</span></div>` };
  });
})();

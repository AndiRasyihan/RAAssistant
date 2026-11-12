/* Music tab: now playing, controls, seekable progress, synced lyrics. */
(function () {
  const RA = window.RA;
  const I = RA.icons;
  let pane, media = null, lyrics = null, curIdx = -1, raf = 0, lastArt = '';

  RA.mediaPos = () => {
    if (!media) return 0;
    const p = media.pos + (media.status === 4 ? (Date.now() - media.at) / 1000 : 0);
    return media.dur ? Math.min(p, media.dur) : p;
  };
  RA.lyricOffset = () => (RA.S ? RA.S.music.lyricOffset : 0) + (lyrics && lyrics.offset ? lyrics.offset : 0);
  RA.lyricIndex = () => {
    if (!lyrics || !lyrics.lines || !lyrics.lines.length) return -1;
    const t = RA.mediaPos() - RA.lyricOffset();
    let lo = 0, hi = lyrics.lines.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (lyrics.lines[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  };
  RA.currentLyric = () => { const i = RA.lyricIndex(); return i >= 0 ? lyrics.lines[i].text : ''; };

  // Dominant colour of the album art for the cover-based themes.
  function coverColour(src) {
    if (!src || src === lastArt) return;
    lastArt = src;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 24;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data;
      let best = null, bestScore = -1, r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const sat = mx ? (mx - mn) / mx : 0, val = mx / 255;
        const score = sat * 0.7 + val * 0.3 - (val < 0.2 ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = [R, G, B]; }
        r += R; g += G; b += B; n++;
      }
      const col = best && bestScore > 0.35 ? best : [r / n, g / n, b / n];
      document.documentElement.style.setProperty('--cover', `rgb(${col.map(Math.round).join(',')})`);
    };
    img.src = src;
  }

  function fmtOff() { const o = lyrics && lyrics.offset ? lyrics.offset : 0; return (o > 0 ? '+' : '') + o.toFixed(1) + 's'; }

  function render() {
    if (!pane) return;
    if (!media) { pane.innerHTML = `<div class="empty">${RA.esc(RA.t('music.nothing'))}</div>`; return; }
    const playing = media.status === 4;
    pane.innerHTML = `<div class="music">
      <div class="left">
        <div class="row"><div class="art" style="${media.art ? `background-image:url('${media.art}')` : ''}"></div>
          <div class="meta grow"><div class="t ell" title="${RA.esc(media.title)}">${RA.esc(media.title)}</div><div class="a ell">${RA.esc(media.artist)}</div><div class="small muted">${RA.esc(media.app)}</div></div></div>
        <div><div class="prog"><div class="track"><div class="fill"></div><div class="knob"></div></div></div>
          <div class="times"><span class="cur">0:00</span><span>${RA.mmss(media.dur)}</span></div></div>
        <div class="ctrls">
          <button class="icon-btn" data-a="prev">${I.prev}</button>
          <button class="icon-btn big" data-a="toggle">${playing ? I.pause : I.play}</button>
          <button class="icon-btn" data-a="next">${I.next}</button>
        </div>
        <div class="lyrtools">${RA.t('music.offset')}
          <button class="btn sm" data-off="-0.5">−0,5</button><span class="off">${fmtOff()}</span><button class="btn sm" data-off="0.5">+0,5</button>
          <span class="grow"></span><button class="btn sm" data-wrong>${RA.t('music.wrong')}</button></div>
      </div>
      <div class="lyrics"><div class="inner"></div></div>
    </div>`;
    renderLyrics();
    tick(true);
  }

  function renderLyrics() {
    if (!pane) return;
    const box = pane.querySelector('.lyrics');
    if (!box) return;
    const inner = box.querySelector('.inner');
    curIdx = -1;
    const off = pane.querySelector('.off'); if (off) off.textContent = fmtOff();
    let note = box.querySelector('.note');
    if (!lyrics || lyrics.status !== 'ok') {
      const msg = !lyrics || lyrics.status === 'loading' ? RA.t('music.loadingLyrics') : lyrics.status === 'off' ? '' : RA.t('music.noLyrics');
      inner.innerHTML = '';
      if (!note) { note = document.createElement('div'); note.className = 'note'; box.appendChild(note); }
      note.textContent = msg;
      return;
    }
    if (note) note.remove();
    inner.innerHTML = lyrics.lines.map((l, i) => `<p data-i="${i}">${RA.esc(l.text || '♪')}</p>`).join('');
  }

  function tick(force) {
    if (!pane || !media) return;
    const pos = RA.mediaPos();
    const fill = pane.querySelector('.fill'), knob = pane.querySelector('.knob'), cur = pane.querySelector('.times .cur');
    if (fill && media.dur) { const pct = (pos / media.dur) * 100; fill.style.width = pct + '%'; knob.style.left = pct + '%'; }
    if (cur) cur.textContent = RA.mmss(pos);
    const i = RA.lyricIndex();
    if (i !== curIdx || force) {
      curIdx = i;
      const box = pane.querySelector('.lyrics');
      const inner = box && box.querySelector('.inner');
      if (inner && inner.children.length) {
        for (const p of inner.querySelectorAll('p.cur')) p.classList.remove('cur');
        const el = inner.children[Math.max(0, i)];
        if (el && i >= 0) el.classList.add('cur');
        if (el) inner.style.transform = `translateY(${box.clientHeight / 2 - el.offsetTop - el.offsetHeight / 2}px)`;
      }
    }
  }

  function loop() {
    raf = 0;
    if (!RA.expanded || RA.tab !== 'music') return;
    tick();
    raf = setTimeout(loop, 200);
  }

  RA.tab({
    id: 'music', height: 250,
    render(p) {
      pane = p;
      p.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (a) { RA.invoke('media', a.dataset.a); return; }
        const off = e.target.closest('[data-off]');
        if (off) { RA.invoke('lyrics.offset', +off.dataset.off); return; }
        if (e.target.closest('[data-wrong]')) { RA.invoke('lyrics.wrong'); return; }
        const line = e.target.closest('.lyrics p');
        if (line && lyrics && media && RA.S.music.gestures) {
          const l = lyrics.lines[+line.dataset.i];
          if (l) { const t = Math.max(0, l.t + RA.lyricOffset()); RA.invoke('media', 'seek', t); media.pos = t; media.at = Date.now(); tick(true); }
        }
      });
      // Click or drag on the progress bar to seek.
      let drag = false;
      const seekAt = (e, commit) => {
        const tr = p.querySelector('.prog .track'); if (!tr || !media || !media.dur) return;
        const r = tr.getBoundingClientRect();
        const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        p.querySelector('.fill').style.width = f * 100 + '%'; p.querySelector('.knob').style.left = f * 100 + '%';
        if (commit) { RA.invoke('media', 'seek', f * media.dur); media.pos = f * media.dur; media.at = Date.now(); }
      };
      p.addEventListener('mousedown', (e) => { if (e.target.closest('.prog') && RA.S.music.gestures) { drag = true; RA.pin(1); seekAt(e); } });
      window.addEventListener('mousemove', (e) => { if (drag) seekAt(e); });
      window.addEventListener('mouseup', (e) => { if (drag) { drag = false; RA.pin(-1); seekAt(e, true); } });
      render();
    },
    onShow() { render(); if (!raf) loop(); },
    onHide() { clearTimeout(raf); raf = 0; }
  });

  let artCache = { src: '', url: '' };
  function artUrl(src) {
    if (!src || !src.startsWith('data:')) return src;
    if (artCache.src === src) return artCache.url;
    const [head, b64] = src.split(',');
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (artCache.url) URL.revokeObjectURL(artCache.url);
    artCache = { src, url: URL.createObjectURL(new Blob([u8], { type: head.slice(5).split(';')[0] })) };
    return artCache.url;
  }

  RA.on('media', (m) => {
    if (m && m.art) m = { ...m, art: artUrl(m.art) };
    const trackChanged = !media || !m || m.title !== media.title || m.artist !== media.artist;
    const stateChanged = !media || !m || m.status !== media.status;
    media = m;
    RA.st.media = m;
    if (m && m.art) coverColour(m.art);
    if (RA.tab === 'music' && RA.expanded) { if (trackChanged || stateChanged) render(); else tick(true); }
    RA.refresh();
    RA.applyMascot();
  });
  RA.on('lyrics', (l) => { lyrics = l; if (RA.tab === 'music' && RA.expanded) { renderLyrics(); tick(true); } });

  // Compact island: art + current lyric (or title) + equalizer bars.
  RA.activity('music', () => {
    if (!media || !media.title || (media.status !== 4 && media.status !== 5)) return null;
    const playing = media.status === 4;
    const line = playing ? RA.currentLyric() : '';
    const txt = line || `${media.title}${media.artist ? ' · ' + media.artist : ''}`;
    const html = `<div class="act"><div class="art-mini" style="${media.art ? `background-image:url('${media.art}')` : ''}"></div><span class="txt">${RA.esc(txt)}</span><div class="bars ${playing ? '' : 'paused'}"><i></i><i></i><i></i><i></i></div></div>`;
    return { pri: playing ? 40 : 10, html, w: playing ? 360 : 300, counts: playing };
  });

  // Keep the compact lyric line fresh while playing (re-render only when the line changes).
  let lastLine = '';
  setInterval(() => {
    if (!media || media.status !== 4 || RA.expanded) return;
    const l = RA.currentLyric();
    if (l !== lastLine) { lastLine = l; RA.refresh(); }
  }, 300);
})();

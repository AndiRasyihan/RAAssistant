// Minimal lyric line renderer for the fullscreen overlay window.
(async function () {
  let media = null, lyrics = null, S = null;
  const el = document.getElementById('t');
  const init = await window.ra.invoke('init');
  S = init.settings; media = init.state.media; lyrics = init.state.lyrics;
  window.ra.on('ra:state', (k, v) => { if (k === 'media') media = v; if (k === 'lyrics') lyrics = v; });
  window.ra.on('ra:settings', (s) => { S = s; });
  function line() {
    if (!media || media.status !== 4) return '';
    const pos = media.pos + (Date.now() - media.at) / 1000 - ((S && S.music.lyricOffset) || 0) - ((lyrics && lyrics.offset) || 0);
    if (!lyrics || !lyrics.lines || !lyrics.lines.length) return `♪ ${media.title}${media.artist ? ' · ' + media.artist : ''}`;
    let cur = '';
    for (const l of lyrics.lines) { if (l.t <= pos) cur = l.text; else break; }
    return cur;
  }
  setInterval(() => { const t = line(); if (el.textContent !== t) el.textContent = t; }, 250);
})();

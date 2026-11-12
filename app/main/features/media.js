// Now playing (from the system helper's SMTC feed) + synced lyrics from LRCLIB.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { net } = require('electron');

const APP_NAMES = { 'spotify.exe': 'Spotify', 'chrome': 'Chrome', 'msedge': 'Edge', 'firefox': 'Firefox', 'zunemusic': 'Media Player', 'microsoft.zunemusic': 'Media Player', 'vlc': 'VLC', 'musicbee': 'MusicBee', 'foobar2000': 'foobar2000', 'applemusic': 'Apple Music', 'youtube': 'YouTube', 'brave': 'Brave', 'opera': 'Opera' };
function appName(aumid) {
  const a = String(aumid || '').toLowerCase();
  for (const k of Object.keys(APP_NAMES)) if (a.includes(k)) return APP_NAMES[k];
  return (aumid || '').split(/[!\\/]/).pop().replace(/\.exe$/i, '').replace(/_[a-z0-9]{10,}$/i, '');
}

function parseLrc(text) {
  const lines = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const txt = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) lines.push({ t: +m[1] * 60 + +m[2], text: txt });
  }
  return lines.sort((a, b) => a.t - b.t);
}

function clean(title) {
  return String(title || '')
    .replace(/\s*[([【].*?(remaster|live|version|feat\.|ft\.|official|lyric|lirik|audio|video|mv|m\/v|visuali[sz]er|hd|4k).*?[)\]】]/gi, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s+-\s+(remaster(ed)?|live|radio edit).*$/i, '')
    .replace(/\s+(ft|feat)\.?\s.*$/i, '')
    .replace(/[“”"]/g, '')
    .trim();
}

// Browsers (YouTube, SoundCloud…) report "Artist - Title (Official Video)" with the channel as artist.
function queries(m) {
  const out = [];
  const add = (artist, title) => { title = clean(title); artist = String(artist || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim(); if (title && !out.some((q) => q.t === title && q.a === artist)) out.push({ a: artist, t: title }); };
  add(m.artist, m.title);
  const split = String(m.title || '').match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (split) { add(split[1], split[2]); add(split[2], split[1]); }
  add('', m.title);
  return out.slice(0, 4);
}

exports.init = (ctx) => {
  const cacheDir = path.join(ctx.paths.cache, 'lyrics');
  fs.mkdirSync(cacheDir, { recursive: true });
  let media = null;
  let lyricsKey = '';

  function keyOf(m) { return `${(m.artist || '').toLowerCase()}|${(m.title || '').toLowerCase()}`; }

  async function getJson(url) {
    const r = await net.fetch(url, { headers: { 'User-Agent': 'RA Assistant 0.1 (local desktop app)' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function fetchLyrics(m, key) {
    const file = path.join(cacheDir, crypto.createHash('sha1').update(key).digest('hex') + '.json');
    const skip = ctx.data.get('lyricSkip')[key] || [];
    if (!skip.length) { try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c && c.lines) return c; } catch {} }
    const base = `track_name=${encodeURIComponent(m.title)}&artist_name=${encodeURIComponent(m.artist || '')}`;
    let candidates = [];
    try {
      if (!skip.length) {
        const g = await getJson(`https://lrclib.net/api/get?${base}&album_name=${encodeURIComponent(m.album || '')}${m.dur ? '&duration=' + Math.round(m.dur) : ''}`);
        if (g && g.syncedLyrics) candidates.push(g);
      }
      if (!candidates.length) {
        for (const q of queries(m)) {
          const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(q.t)}${q.a ? '&artist_name=' + encodeURIComponent(q.a) : ''}`;
          const found = ((await getJson(url)) || []).filter((x) => x.syncedLyrics && !skip.includes(x.id));
          candidates.push(...found);
          if (found.length) break;
        }
        if (m.dur) candidates.sort((a, b) => Math.abs((a.duration || 0) - m.dur) - Math.abs((b.duration || 0) - m.dur));
        // A browser's media duration can be off; reject matches that clearly belong to another song.
        if (m.dur) candidates = candidates.filter((x) => !x.duration || Math.abs(x.duration - m.dur) < 20);
      }
    } catch (e) { return { lines: [], error: String(e.message || e) }; }
    const best = candidates.find((x) => !skip.includes(x.id));
    const res = best ? { id: best.id, lines: parseLrc(best.syncedLyrics) } : { id: null, lines: [] };
    try { fs.writeFileSync(file, JSON.stringify(res)); } catch {}
    return res;
  }

  async function loadLyrics(force) {
    if (!media || !media.title) return;
    const key = keyOf(media);
    if (key === lyricsKey && !force) return;
    lyricsKey = key;
    if (!ctx.settings().music.lyrics) { ctx.state('lyrics', { key, status: 'off', lines: [] }); return; }
    ctx.state('lyrics', { key, status: 'loading', lines: [] });
    const r = await fetchLyrics(media, key);
    if (key !== lyricsKey) return;
    ctx.state('lyrics', { key, id: r.id, status: r.lines.length ? 'ok' : r.error ? 'error' : 'none', lines: r.lines, offset: ctx.data.get('lyricOffsets')[key] || 0 });
  }

  ctx.bus.on('media', (m) => {
    if (m.none) { media = null; ctx.state('media', null); ctx.bus.emit('lyricsOverlay'); return; }
    const prevArt = media && media.art;
    media = {
      app: appName(m.app), aumid: m.app, title: m.title || '', artist: m.artist || '', album: m.album || '',
      status: m.status, pos: m.pos || 0, dur: m.dur || 0, at: Date.now(),
      art: m.newTrack ? m.art || null : prevArt || null
    };
    ctx.state('media', media);
    ctx.bus.emit('lyricsOverlay');
    loadLyrics();
  });

  ctx.handle('lyrics.offset', (delta) => {
    const offs = { ...ctx.data.get('lyricOffsets') };
    offs[lyricsKey] = Math.round(((offs[lyricsKey] || 0) + delta) * 10) / 10;
    if (Math.abs(offs[lyricsKey]) < 0.05) delete offs[lyricsKey];
    ctx.data.set('lyricOffsets', offs);
    const cur = ctx.getState('lyrics');
    if (cur) ctx.state('lyrics', { ...cur, offset: offs[lyricsKey] || 0 });
    return offs[lyricsKey] || 0;
  });
  ctx.handle('lyrics.wrong', () => {
    const cur = ctx.getState('lyrics');
    if (!cur || !cur.id) return false;
    const sk = { ...ctx.data.get('lyricSkip') };
    sk[lyricsKey] = [...(sk[lyricsKey] || []), cur.id];
    ctx.data.set('lyricSkip', sk);
    loadLyrics(true);
    return true;
  });
  ctx.bus.on('settings', (p) => { if (p === 'music.lyrics') loadLyrics(true); });
  ctx.media = () => media;
};

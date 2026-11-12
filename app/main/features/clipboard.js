// Clipboard history (opt-in). Text & images survive closing RA but are wiped on shutdown/restart:
// the cache folder stores the boot time it was created under; a different boot time => delete everything.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { nativeImage } = require('electron');
const C = require('../clip');
const { pathToFileURL } = require('url');

const PASSWORD_APPS = ['1password.exe', 'bitwarden.exe', 'keepass.exe', 'keepassxc.exe', 'lastpass.exe', 'dashlane.exe', 'enpass.exe', 'nordpass.exe', 'roboform.exe', 'proton pass.exe', 'protonpass.exe', 'keeper.exe', 'passwordsafe.exe', 'pwsafe.exe'];
const EXCLUDE_FORMATS = ['ExcludeClipboardContentFromMonitorProcessing', 'Clipboard Viewer Ignore'];
const MAX = 60;

exports.init = (ctx) => {
  const S = () => ctx.settings();
  const dir = path.join(ctx.paths.cache, 'clipboard');
  const indexFile = path.join(dir, 'index.json');
  const bootFile = path.join(dir, 'boot.json');
  const bootTime = () => Math.round((Date.now() - os.uptime() * 1000) / 60000); // minutes since epoch
  let items = [];
  let skip = new Set();
  let ownWrite = 0;

  function wipe() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} items = []; }
  function load() {
    try {
      const b = JSON.parse(fs.readFileSync(bootFile, 'utf8'));
      // Allow ±2 min of jitter in the uptime-derived boot time.
      if (Math.abs(b.boot - bootTime()) > 2) { wipe(); return; }
      items = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    } catch { wipe(); }
  }
  function save() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(bootFile, JSON.stringify({ boot: bootTime() }));
      fs.writeFileSync(indexFile, JSON.stringify(items));
    } catch {}
  }
  function publish() {
    ctx.state('clipboard', S().phone.clipboard ? items.map((i) => ({ id: i.id, type: i.type, text: i.type === 'text' ? i.text.slice(0, 300) : '', img: i.type === 'image' ? pathToFileURL(i.file).href : '', at: i.at })) : []);
  }

  const looksLikeOtp = (t) => /^\s*[A-Z]?-?\d{4,8}\s*$/.test(t) || skip.has(t.trim());

  async function capture(m) {
    if (!S().phone.clipboard) return;
    if (Date.now() - ownWrite < 1500) return;
    const fg = (m && m.fg || '').toLowerCase();
    if (S().phone.skipPasswordManagers) {
      if (PASSWORD_APPS.includes(fg)) return;
      for (const f of EXCLUDE_FORMATS) if (await C.hasRaw(f)) return;
    }
    let data;
    try { data = await C.read(); } catch { return; }
    if (!data) return;
    const now = Date.now();
    if (data.type === 'image') {
      const png = data.mime === 'image/png' ? data.png : nativeImage.createFromBuffer(data.png).toPNG();
      if (!png || !png.length) return;
      const hash = crypto.createHash('sha1').update(png).digest('hex').slice(0, 16);
      items = items.filter((i) => i.hash !== hash);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, hash + '.png');
      if (!fs.existsSync(file)) fs.writeFileSync(file, png);
      items.unshift({ id: hash, type: 'image', file, hash, at: now });
    } else {
      const text = data.text;
      if (!text || !text.trim() || text.length > 100000) return;
      if (looksLikeOtp(text)) return;
      const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
      items = items.filter((i) => i.hash !== hash);
      items.unshift({ id: hash, type: 'text', text, hash, at: now });
    }
    for (const old of items.slice(MAX)) if (old.file) try { fs.unlinkSync(old.file); } catch {}
    items = items.slice(0, MAX);
    save(); publish();
  }

  load();
  publish();
  ctx.bus.on('clip', (m) => setTimeout(() => capture(m), 120));
  ctx.bus.on('clipboard:skipNext', (code) => { skip.add(String(code)); ownWrite = Date.now(); setTimeout(() => skip.delete(String(code)), 60000); });
  ctx.bus.on('settings', (p, v) => { if (p === 'phone.clipboard') { if (!v) { wipe(); } publish(); } });

  ctx.handle('clip.copy', async (id) => {
    const it = items.find((i) => i.id === id);
    if (!it) return false;
    ownWrite = Date.now();
    if (it.type === 'text') await C.writeText(it.text); else await C.writeImagePng(fs.readFileSync(it.file));
    items = [it, ...items.filter((i) => i.id !== id)]; save(); publish();
    return true;
  });
  ctx.handle('clip.remove', (id) => { const it = items.find((i) => i.id === id); if (it && it.file) try { fs.unlinkSync(it.file); } catch {} items = items.filter((i) => i.id !== id); save(); publish(); return true; });
  ctx.handle('clip.clear', () => { wipe(); save(); publish(); return true; });
};

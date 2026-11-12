// Screenshots (area / full screen) and screen recording (MP4 when supported, system audio + optional mic).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, desktopCapturer, screen, session, ipcMain } = require('electron');
const C = require('../clip');

exports.init = (ctx) => {
  const S = () => ctx.settings();
  const t = ctx.i18n.t;
  const shotsDir = () => path.join(app.getPath('pictures'), 'Screenshots');
  const recDir = () => path.join(app.getPath('videos'), 'Captures');
  const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; };
  const RENDER = path.join(__dirname, '..', '..', 'renderer', 'capture');
  const prefs = { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true };

  function displayForCursor() { return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()); }

  async function grab(display) {
    // Keep our own windows out of the shot without hiding them (hide/show breaks click delivery).
    const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
    const exclude = !S().capture.hideFromCapture;
    if (exclude) { for (const w of wins) w.setContentProtection(true); await new Promise((r) => setTimeout(r, 120)); }
    try {
      const size = { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) };
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      const src = sources.find((s) => s.display_id === String(display.id)) || sources[0];
      return src ? src.thumbnail : null;
    } finally { if (exclude) for (const w of wins) if (!w.isDestroyed()) w.setContentProtection(false); }
  }

  function saveImage(img) {
    fs.mkdirSync(shotsDir(), { recursive: true });
    const file = path.join(shotsDir(), `RA_${stamp()}.png`);
    fs.writeFileSync(file, img.toPNG());
    ctx.bus.emit('clipboard:skipNext', '__image__');
    C.writeImagePng(img.toPNG()).catch(() => {});
    ctx.toast({ kind: 'capture', title: t('capture.saved'), body: path.basename(file), image: pathToFileURL(file).href, file, ms: 6000 });
    ctx.state('lastCapture', { file, url: pathToFileURL(file).href, at: Date.now() });
    return file;
  }

  async function full() {
    const img = await grab(displayForCursor());
    if (img && !img.isEmpty()) return saveImage(img);
  }

  // Area: freeze the screen into a fullscreen overlay and let the user drag a rectangle.
  let overlay = null, frozen = null;
  async function area() {
    if (overlay) return;
    const d = displayForCursor();
    const img = await grab(d);
    if (!img || img.isEmpty()) return;
    frozen = { img, d };
    const tmp = path.join(ctx.paths.cache, 'area.png');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, img.toPNG());
    overlay = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, frame: false, resizable: false, movable: false,
      skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, show: false, backgroundColor: '#000000', webPreferences: prefs
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setContentProtection(true);
    overlay.loadFile(path.join(RENDER, 'area.html'), { query: { img: pathToFileURL(tmp).href } });
    overlay.once('ready-to-show', () => { overlay.show(); overlay.focus(); });
    overlay.on('closed', () => { overlay = null; frozen = null; try { fs.unlinkSync(tmp); } catch {} });
  }
  ctx.handle('capture.areaDone', (rect) => {
    if (!frozen || !overlay) return;
    const { img, d } = frozen;
    const k = d.scaleFactor;
    overlay.close();
    if (!rect || rect.w < 3 || rect.h < 3) return;
    const crop = img.crop({ x: Math.round(rect.x * k), y: Math.round(rect.y * k), width: Math.round(rect.w * k), height: Math.round(rect.h * k) });
    return saveImage(crop);
  });

  // ---- recording
  let recWin = null, recFile = null, recStream = null, recording = null;
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      const d = displayForCursor();
      const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
      cb({ video: src, audio: 'loopback' });
    }).catch(() => cb({}));
  });
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const url = (details && details.requestingUrl) || wc.getURL();
    cb(url.startsWith('file:') && ['media', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write'].includes(perm));
  });

  function startRecording() {
    if (recWin) return;
    recWin = new BrowserWindow({ show: false, width: 200, height: 100, webPreferences: { ...prefs, backgroundThrottling: false } });
    recWin.loadFile(path.join(RENDER, 'recorder.html'), { query: { mic: S().capture.recordMic ? '1' : '0' } });
    recWin.on('closed', () => { recWin = null; });
  }
  ctx.handle('capture.recStart', (ext) => {
    fs.mkdirSync(recDir(), { recursive: true });
    recFile = path.join(recDir(), `RA_${stamp()}.${ext === 'mp4' ? 'mp4' : 'webm'}`);
    recStream = fs.createWriteStream(recFile);
    recording = { on: true, since: Date.now(), file: recFile };
    ctx.state('recording', recording);
    return true;
  });
  ctx.handle('capture.recChunk', (buf) => { if (recStream) recStream.write(Buffer.from(buf)); return true; });
  ctx.handle('capture.recStop', () => new Promise((resolve) => {
    const file = recFile;
    const done = () => {
      recording = null; ctx.state('recording', { on: false });
      if (recWin) recWin.destroy();
      if (file) ctx.toast({ kind: 'capture', title: t('capture.recSaved'), body: path.basename(file), file, icon: 'record', ms: 8000 });
      recFile = null;
      resolve(true);
    };
    if (recStream) { recStream.end(done); recStream = null; } else done();
  }));
  ctx.handle('capture.recError', (msg) => { if (recWin) recWin.destroy(); recording = null; ctx.state('recording', { on: false }); ctx.toast({ title: t('capture.record'), body: String(msg), icon: 'record', force: true }); });
  function stopRecording() { if (recWin) recWin.webContents.send('ra:state', 'stopRecording', Date.now()); }

  ctx.handle('capture.full', () => setTimeout(full, 250));   // let the island collapse first
  ctx.handle('capture.area', () => setTimeout(() => area().catch(() => {}), 250));
  ctx.handle('capture.record', (on) => (on ? startRecording() : stopRecording()));
  ctx.bus.on('capture:shortcut', () => { if (recording) stopRecording(); else ctx.state('cmd', { cmd: 'capture', at: Date.now() }); });
  ctx.bus.on('capture:menu', () => ctx.state('cmd', { cmd: 'capture', at: Date.now() }));
  void ipcMain;
};

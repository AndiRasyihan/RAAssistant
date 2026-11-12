const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, Notification, globalShortcut, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { JsonStore } = require('./store');
const DEFAULTS = require('./defaults');
const i18n = require('../shared/i18n');
const { PSHelper } = require('./pshost');

app.setName('RAAssistant');
app.setAppUserModelId('RA.Assistant');
// Keep the footprint small: no GPU-heavy features we don't need.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService,SpareRendererForSitePerProcess,CalculateNativeWinOcclusion,Vulkan,WebGPU');
// SwiftShader (vk_swiftshader.dll) is unsigned and gets blocked by Smart App Control; never fall back to it.
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const DEBUG_LOG = process.env.RA_DEBUG ? require('path').join(require('os').tmpdir(), 'ra_debug.log') : null;
function dlog(...a) { if (DEBUG_LOG) try { require('fs').appendFileSync(DEBUG_LOG, new Date().toISOString().slice(11, 23) + ' ' + a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); } catch {} }
// Errors always go to %APPDATA%\RAAssistant\error.log (small, rotated) so problems can be diagnosed.
function errlog(where, e) {
  try {
    const f = require('path').join(app.getPath('userData'), 'error.log');
    const fs0 = require('fs');
    if (fs0.existsSync(f) && fs0.statSync(f).size > 512 * 1024) fs0.renameSync(f, f + '.old');
    fs0.appendFileSync(f, `${new Date().toISOString()} [${where}] ${e && e.stack || e}\n`);
  } catch {}
  dlog('ERR', where, String(e && e.stack || e));
}
process.on('uncaughtException', (e) => errlog('uncaught', e));
process.on('unhandledRejection', (e) => errlog('unhandled', e));

const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, '..');
const ASSETS = path.join(ROOT, 'assets');
const OFFICE = ['winword.exe', 'excel.exe', 'powerpnt.exe', 'outlook.exe', 'olk.exe', 'onenote.exe', 'msaccess.exe', 'mspub.exe', 'visio.exe'];
const SELF_EXES = ['electron.exe'];

const paths = {
  userData: app.getPath('userData'),
  cache: path.join(process.env.LOCALAPPDATA || app.getPath('temp'), 'RAAssistant', 'Cache')
};
const settings = new JsonStore(path.join(paths.userData, 'settings.json'), DEFAULTS);
const data = new JsonStore(path.join(paths.userData, 'data.json'), {
  todos: [], events: [], reminders: [], drink: {}, lyricOffsets: {}, lyricSkip: {}, shelf: [], stats: {}
});
i18n.setLang(settings.get('lang'));

const bus = new EventEmitter();
bus.setMaxListeners(50);
const stateCache = {};
const handlers = {};
let island = null, settingsWin = null, tray = null, lyricsWin = null, pillWin = null;
const view = { fg: { exe: '', full: false, top: false }, activity: false, forcedHidden: false, mode: 'normal', hovering: false };

const ctx = {
  app, bus, paths, settingsStore: settings, data, i18n, ASSETS, APP_DIR,
  settings: () => settings.data,
  state(key, value) {
    stateCache[key] = value;
    for (const w of [island, settingsWin, lyricsWin, pillWin]) if (w && !w.isDestroyed()) w.webContents.send('ra:state', key, value);
  },
  getState: (k) => stateCache[k],
  handle(name, fn) { handlers[name] = fn; },
  island: () => island,
  toast(item) { ctx.state('toast', { id: Date.now() + Math.random(), at: Date.now(), ...item }); },
  osNotify(title, body, onClick) {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, icon: path.join(ASSETS, 'icon.png'), silent: false });
    if (onClick) n.on('click', onClick);
    n.show();
  },
  sys: null
};

// ------------------------------------------------------------------ windows
function targetDisplay() {
  const m = settings.get('appearance.monitor');
  if (m && m !== 'primary') {
    const d = screen.getAllDisplays().find((x) => String(x.id) === String(m));
    if (d) return d;
  }
  return screen.getPrimaryDisplay();
}

function scale() {
  const s = settings.get('appearance.size');
  if (s === 'auto' || !s) {
    const d = targetDisplay();
    return d.workArea.width < 1400 ? 0.9 : 1;
  }
  return Number(s) / 100;
}

const BASE_W = 760, BASE_H = 560;
function placeIsland() {
  if (!island) return;
  const d = targetDisplay();
  const k = scale();
  const w = Math.round(BASE_W * k), h = Math.round(BASE_H * k);
  island.setBounds({ x: Math.round(d.bounds.x + (d.bounds.width - w) / 2), y: d.bounds.y, width: w, height: h });
  island.webContents.setZoomFactor(k);
  ctx.state('zoom', k);
}

function webPrefs(extra = {}) {
  return {
    preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
    sandbox: true, spellcheck: false, ...extra
  };
}

function createIsland() {
  island = new BrowserWindow({
    width: BASE_W, height: BASE_H, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, focusable: false, fullscreenable: false,
    minimizable: false, maximizable: false, backgroundColor: '#00000000', title: 'RA Assistant',
    webPreferences: webPrefs({ backgroundThrottling: false })
  });
  island.setAlwaysOnTop(true, 'screen-saver');
  island.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  island.setIgnoreMouseEvents(true, { forward: true });
  island.setContentProtection(!!settings.get('capture.hideFromCapture'));
  island.loadFile(path.join(ROOT, 'renderer', 'island', 'island.html'));
  island.once('ready-to-show', () => { placeIsland(); island.showInactive(); applyVisibility(true); });
  island.on('blur', () => island.webContents.send('ra:blur'));
  // Re-assert topmost occasionally; some fullscreen apps steal it.
  setInterval(() => { if (island && !softHidden) island.setAlwaysOnTop(true, 'screen-saver'); }, 15000);
}

function openSettings(section) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show(); settingsWin.focus();
    if (section) settingsWin.webContents.send('ra:section', section);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 1000, height: 720, minWidth: 820, minHeight: 560, show: false, title: i18n.t('set.title'),
    backgroundColor: '#111216', autoHideMenuBar: true, icon: path.join(ASSETS, 'icon.png'),
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#111216', symbolColor: '#d6d6e0', height: 36 },
    webPreferences: webPrefs()
  });
  settingsWin.loadFile(path.join(ROOT, 'renderer', 'settings', 'settings.html'), { query: section ? { section } : {} }).catch((e) => errlog('settings load', e));
  settingsWin.once('ready-to-show', () => { dlog('settings ready'); settingsWin.show(); });
  settingsWin.webContents.on('console-message', (e, level, msg, line, src) => { if (level >= 2) errlog('settings console', `${msg} @${src}:${line}`); });
  // Destroyed on close to free memory; recreated on demand.
  settingsWin.on('closed', () => { settingsWin = null; });
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('RA Assistant');
  tray.on('click', () => toggleForcedHidden());
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const t = i18n.t;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'RA Assistant', enabled: false },
    { type: 'separator' },
    { label: view.forcedHidden || settings.get('behaviour.visibility') === 'hidden' ? t('tray.show') : t('tray.hide'), click: () => toggleForcedHidden() },
    { label: t('tray.capture'), click: () => bus.emit('capture:menu') },
    { label: t('tray.focus'), click: () => ctx.state('cmd', { cmd: 'focus', at: Date.now() }) },
    { label: t('tray.settings'), click: () => openSettings() },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => quit() }
  ]));
}

function toggleForcedHidden() {
  if (settings.get('behaviour.visibility') === 'hidden') {
    view.forcedHidden = false;
    view.trayShown = !view.trayShown;
  } else {
    view.forcedHidden = !view.forcedHidden;
  }
  applyVisibility(true);
  rebuildTrayMenu();
}

// ------------------------------------------------------------------ visibility / fullscreen / shrink
function computeMode() {
  const b = settings.get('behaviour');
  const fg = view.fg;
  if (view.forcedHidden) return 'hidden';
  if (b.visibility === 'hidden' && !view.trayShown) return 'hidden';
  const exe = (fg.exe || '').toLowerCase();
  if (exe && b.hideApps.map((x) => x.toLowerCase()).includes(exe)) return 'hidden';
  if (fg.full && b.autoHideFullscreen) return 'fullscreen';
  if (b.visibility === 'activity' && !view.activity && !view.hovering && !view.trayShown) return 'peek';
  if (b.onTop === 'shrink' && fg.top && !view.hovering) {
    const noShrink = OFFICE.concat(b.noShrinkApps.map((x) => x.toLowerCase()));
    if (!noShrink.includes(exe)) return 'shrink';
  }
  return 'normal';
}

function applyVisibility(force) {
  if (!island) return;
  const mode = computeMode();
  if (mode === view.mode && !force) return;
  view.mode = mode;
  ctx.state('layout', { mode });
  const hide = mode === 'hidden' || mode === 'fullscreen';
  softHide(hide);
  updateLyricsOverlay();
}

// hide()/show() on this transparent window breaks click delivery afterwards, so "hiding" is done by
// making it fully transparent and click-through instead.
let softHidden = false;
function softHide(on) {
  if (!island || on === softHidden) return;
  softHidden = on;
  island.setOpacity(on ? 0 : 1);
  if (on) { pointerInside = false; island.setIgnoreMouseEvents(true); }
  else { island.setAlwaysOnTop(true, 'screen-saver'); island.setIgnoreMouseEvents(true, { forward: true }); }
}
ctx.islandHidden = () => softHidden;

// Lyrics stay on top over borderless-fullscreen games (click-through window).
function updateLyricsOverlay() {
  const want = view.mode === 'fullscreen' && settings.get('behaviour.musicFullscreen') && !!(stateCache.media && stateCache.media.status === 4);
  if (want && !lyricsWin) {
    const d = targetDisplay();
    lyricsWin = new BrowserWindow({
      width: 700, height: 64, x: Math.round(d.bounds.x + (d.bounds.width - 700) / 2), y: d.bounds.y + 6,
      frame: false, transparent: true, resizable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true,
      hasShadow: false, show: false, backgroundColor: '#00000000', webPreferences: webPrefs()
    });
    lyricsWin.setAlwaysOnTop(true, 'screen-saver');
    lyricsWin.setIgnoreMouseEvents(true);
    lyricsWin.setContentProtection(!!settings.get('capture.hideFromCapture'));
    lyricsWin.loadFile(path.join(ROOT, 'renderer', 'island', 'lyrics-overlay.html'));
    lyricsWin.once('ready-to-show', () => lyricsWin && lyricsWin.showInactive());
    lyricsWin.on('closed', () => { lyricsWin = null; });
  } else if (!want && lyricsWin) {
    lyricsWin.destroy(); lyricsWin = null;
  }
}

// Detachable, draggable timer pill.
function openPill(open) {
  if (!open) { if (pillWin) { pillWin.destroy(); pillWin = null; } return; }
  if (pillWin) return;
  const d = targetDisplay();
  pillWin = new BrowserWindow({
    width: 190, height: 54, x: d.workArea.x + d.workArea.width - 230, y: d.workArea.y + 90, frame: false, transparent: true,
    resizable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: false, backgroundColor: '#00000000',
    webPreferences: webPrefs()
  });
  pillWin.setAlwaysOnTop(true, 'screen-saver');
  pillWin.setContentProtection(!!settings.get('capture.hideFromCapture'));
  pillWin.loadFile(path.join(ROOT, 'renderer', 'island', 'pill.html'));
  pillWin.on('closed', () => { pillWin = null; ctx.state('pillOpen', false); });
  ctx.state('pillOpen', true);
}

// ------------------------------------------------------------------ shortcuts / autostart
function shortcutPaths() {
  const programs = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  return { start: path.join(programs, 'RA Assistant.lnk'), startup: path.join(programs, 'Startup', 'RA Assistant.lnk') };
}
function shortcutSpec() {
  return {
    target: process.execPath, args: `"${APP_DIR}"`, cwd: APP_DIR, description: 'RA Assistant',
    icon: path.join(ASSETS, 'icon.ico'), iconIndex: 0, appUserModelId: 'RA.Assistant'
  };
}
function ensureShortcuts() {
  const p = shortcutPaths();
  try { shell.writeShortcutLink(p.start, fs.existsSync(p.start) ? 'replace' : 'create', shortcutSpec()); } catch (e) { errlog('shortcut', e); }
  setAutostart(settings.get('autostart'));
}
function setAutostart(on) {
  const p = shortcutPaths();
  try {
    if (on) shell.writeShortcutLink(p.startup, fs.existsSync(p.startup) ? 'replace' : 'create', shortcutSpec());
    else if (fs.existsSync(p.startup)) fs.unlinkSync(p.startup);
  } catch (e) { errlog('autostart', e); }
}

let captureAccel = null;
function registerCaptureShortcut() {
  if (captureAccel) { try { globalShortcut.unregister(captureAccel); } catch {} captureAccel = null; }
  const acc = settings.get('capture.shortcut');
  if (!acc) return;
  try { if (globalShortcut.register(acc, () => bus.emit('capture:shortcut'))) captureAccel = acc; } catch {}
}

// ------------------------------------------------------------------ IPC
ipcMain.handle('ra', async (e, cmd, args) => {
  const fn = handlers[cmd];
  if (!fn) return { error: 'unknown ' + cmd };
  try { return await fn(...(args || []), e.sender); } catch (err) { return { error: String(err && err.message || err) }; }
});
ipcMain.on('ra:ignore', (e, ignore) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setIgnoreMouseEvents(!!ignore, { forward: true });
});
ipcMain.on('ra:hover', (e, on) => {
  view.hovering = !!on;
  applyVisibility();
});
ipcMain.on('ra:focus', (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (w === island) {
    // The island is normally non-focusable so clicking it never steals focus; text inputs opt in.
    if (on) { island.setFocusable(true); island.focus(); } else if (island.isFocusable()) { island.setFocusable(false); }
    applyIgnore();
    return;
  }
  if (on) w.focus(); else w.blur();
});

// Interactive regions reported by the island renderer; everything else is click-through.
let hitRects = [];
let pointerInside = false;
let lastCursor = null;
ctx.handle('log', (...a) => { dlog('[renderer]', ...a.slice(0, -1)); });
ctx.handle('rects', (rects) => { hitRects = Array.isArray(rects) ? rects : []; return true; });
// setFocusable() rewrites the window's extended style, so re-assert click-through state afterwards.
function applyIgnore() {
  if (!island) return;
  if (pointerInside) island.setIgnoreMouseEvents(false); else island.setIgnoreMouseEvents(true, { forward: true });
}
function pollCursor() {
  if (!island || !island.isVisible() || softHidden) return;
  const p = screen.getCursorScreenPoint();
  const b = island.getBounds();
  const x = p.x - b.x, y = p.y - b.y;
  const inside = hitRects.some(([l, t, w, h]) => x >= l - 2 && x <= l + w + 2 && y >= t - 2 && y <= t + h + 2);
  if (inside !== pointerInside) {
    pointerInside = inside;
    if (inside) island.setIgnoreMouseEvents(false); else island.setIgnoreMouseEvents(true, { forward: true });
    view.hovering = inside;
    applyVisibility();
    ctx.state('pointer', { inside });
  }
  if (settings.get('mascot.eyeMotion') === 'follow' && (!lastCursor || lastCursor.x !== p.x || lastCursor.y !== p.y)) {
    lastCursor = p;
    island.webContents.send('ra:state', 'cursor', { x: x / b.width, y: y / b.height });
  }
}
setInterval(pollCursor, 120);
ipcMain.on('ra:drag-out', (e, file) => {
  try { e.sender.startDrag({ file, icon: nativeImage.createFromPath(path.join(ASSETS, 'tray.png')) }); } catch {}
});
ipcMain.on('ra:pill-move', (e, dx, dy) => {
  if (!pillWin) return;
  const b = pillWin.getBounds();
  pillWin.setPosition(b.x + dx, b.y + dy);
});

ctx.handle('init', () => ({ settings: settings.data, state: stateCache, lang: i18n.getLang(), platform: process.platform, version: require('../../package.json').version }));
ctx.handle('settings.set', (p, v) => {
  settings.set(p, v);
  return true;
});
ctx.handle('settings.get', () => settings.data);
ctx.handle('data.get', (p) => data.get(p));
ctx.handle('data.set', (p, v) => { data.set(p, v); return true; });
ctx.handle('openSettings', (section) => openSettings(section));
ctx.handle('activity', (on) => { view.activity = !!on; applyVisibility(); });
ctx.handle('pill', (open) => openPill(open));
ctx.handle('timer.state', (s) => { ctx.state('timer', s); return true; });
ctx.handle('timer.cmd', (a) => { ctx.state('cmd', { cmd: 'timer', a, at: Date.now() }); return true; });
ctx.handle('openPath', (p) => shell.openPath(p));
ctx.handle('showItem', (p) => shell.showItemInFolder(p));
ctx.handle('openExternal', (u) => { if (/^(https?|ms-settings|zoommtg|msteams):/i.test(u)) shell.openExternal(u); });
ctx.handle('displays', () => screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: `${i + 1}: ${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' (utama)' : ''}` })));
ctx.handle('paths', () => ({ ...paths, pictures: app.getPath('pictures'), videos: app.getPath('videos'), downloads: app.getPath('downloads'), appDir: APP_DIR }));
ctx.handle('quit', () => quit());

settings.onChange((p, v) => {
  if (p === 'lang') { i18n.setLang(v); rebuildTrayMenu(); }
  if (p.startsWith('appearance.size') || p.startsWith('appearance.monitor')) placeIsland();
  if (p === 'capture.hideFromCapture') for (const w of [island, lyricsWin, pillWin]) if (w) w.setContentProtection(!!v);
  if (p === 'capture.shortcut') registerCaptureShortcut();
  if (p === 'autostart') setAutostart(v);
  if (p.startsWith('behaviour')) { applyVisibility(true); rebuildTrayMenu(); }
  for (const w of [island, settingsWin, lyricsWin, pillWin]) if (w && !w.isDestroyed()) w.webContents.send('ra:settings', settings.data, p);
  bus.emit('settings', p, v);
});

// ------------------------------------------------------------------ system helper
function startSystemHelper() {
  const sys = new PSHelper(path.join(ROOT, 'ps', 'sys.ps1'));
  ctx.sys = sys;
  sys.on('fg', (m) => {
    if (SELF_EXES.includes(m.exe)) return; // our own windows got focus; keep previous decision
    view.fg = m;
    applyVisibility();
  });
  sys.on('vol', (m) => { const first = !stateCache.volume; ctx.state('volume', { v: m.v, muted: m.muted, osd: !first, at: Date.now() }); });
  sys.on('caps', (m) => ctx.state('caps', { on: m.on, at: Date.now() }));
  sys.on('bri', (m) => ctx.state('brightness', { v: m.v, at: Date.now() }));
  sys.on('media', (m) => { bus.emit('media', m); });
  sys.on('privacy', (m) => bus.emit('privacy', m));
  sys.on('mics', (m) => bus.emit('mics', m));
  sys.on('netcat', (m) => bus.emit('netcat', m));
  sys.on('bt', (m) => bus.emit('bt', m));
  sys.on('clip', (m) => bus.emit('clip', m));
  sys.on('stderr', (s) => { dlog('[sys]', s); });
  sys.start();
  ctx.handle('media', (a, v) => sys.send({ c: 'media', a, v }));
  ctx.handle('volume', (v) => sys.send({ c: 'vol', v }));
  ctx.handle('volumeDelta', (d) => {
    const cur = stateCache.volume ? stateCache.volume.v : 0.5;
    sys.send({ c: 'vol', v: Math.max(0, Math.min(1, Math.round((cur + d) * 100) / 100)) });
  });
  ctx.handle('mics', (mute) => sys.send({ c: 'mics', v: !!mute }));
  ctx.focusApp = (exe, title) => { sys.send({ c: 'focus', exe: exe.toLowerCase(), title: title || '' }); return { ok: true }; };
  ctx.uia = (req) => new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 20000);
    sys.once('uia', (m) => { clearTimeout(t); resolve((m.data && m.data[0]) || { ok: false }); });
    sys.send({ c: 'uia', exe: req.exe, a: req.action, v: req.value });
  });
}

function loadFeatures() {
  const dir = path.join(__dirname, 'features');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    try { require(path.join(dir, f)).init(ctx); } catch (e) { errlog('feature ' + f, e); }
  }
}

function quit() {
  bus.emit('quit');
  settings.flush(); data.flush();
  if (ctx.sys) ctx.sys.stop();
  if (agents) agents.stop();
  globalShortcut.unregisterAll();
  setTimeout(() => app.exit(0), 300);
}

let agents = null;
app.on('second-instance', () => { dlog('second-instance'); try { openSettings(); } catch (e) { errlog('openSettings', e); } });
app.on('window-all-closed', (e) => { /* keep running in tray */ });

app.whenReady().then(() => {
  if (process.argv.includes('--install-shortcuts')) { ensureShortcuts(); }
  createIsland();
  createTray();
  startSystemHelper();
  const { Agents } = require('./agents');
  agents = new Agents(ctx);
  agents.start();
  ctx.agents = agents;
  ctx.handle('agents.ext', () => agents.extensionStatus());
  ctx.handle('agents.act', (key, a) => agents.act(key, a || {}));
  const ext = require('./agents/install');
  ctx.handle('agents.extInfo', () => ext.info(agents.extensionStatus()));
  ctx.handle('agents.installExt', () => ext.install());
  loadFeatures();
  registerCaptureShortcut();
  if (settings.get('firstRun')) {
    ensureShortcuts();
    settings.set('firstRun', false);
    openSettings('today');
  }
  screen.on('display-metrics-changed', placeIsland);
  screen.on('display-added', placeIsland);
  screen.on('display-removed', placeIsland);
  powerMonitor.on('lock-screen', () => bus.emit('lock', true));
  powerMonitor.on('unlock-screen', () => bus.emit('lock', false));
  powerMonitor.on('suspend', () => bus.emit('lock', true));
  powerMonitor.on('resume', () => bus.emit('lock', false));
  bus.on('agent:done', (s) => {
    if (!settings.get('agents.notifyDone')) return;
    ctx.toast({ kind: 'agent', title: `${s.sourceLabel} · ${i18n.t('agents.doneNotif')}`, body: s.title, tab: 'agents' });
    if (view.mode === 'fullscreen' || view.mode === 'hidden') ctx.osNotify(i18n.t('agents.doneNotif'), `${s.sourceLabel}: ${s.title}`);
  });
  bus.on('agent:waiting', (s) => {
    ctx.toast({ kind: 'agent', title: `${s.sourceLabel} · ${i18n.t('agents.waitNotif')}`, body: s.question || s.title, tab: 'agents', urgent: true });
    if (view.mode === 'fullscreen' || view.mode === 'hidden') ctx.osNotify(i18n.t('agents.waitNotif'), `${s.sourceLabel}: ${s.question || s.title}`);
  });
  bus.on('activity', (on) => { view.activity = on; applyVisibility(); });
  bus.on('openSettings', openSettings);
  bus.on('lyricsOverlay', updateLyricsOverlay);
});

module.exports = { ctx };

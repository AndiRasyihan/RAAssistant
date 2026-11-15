const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, Notification, globalShortcut, powerMonitor, dialog } = require('electron');
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
// The island is mostly static UI; software compositing saves a whole GPU process (~100 MB).
if (!process.argv.includes('--gpu')) app.disableHardwareAcceleration();
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
const PACKAGED = app.isPackaged;
// Files that other programs (PowerShell, Windows shell) must open live outside app.asar.
const unpacked = (p) => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const ASSETS = unpacked(path.join(ROOT, 'assets'));
const PS_DIR = unpacked(path.join(ROOT, 'ps'));
const OFFICE = ['winword.exe', 'excel.exe', 'powerpnt.exe', 'outlook.exe', 'olk.exe', 'onenote.exe', 'msaccess.exe', 'mspub.exe', 'visio.exe'];
const SELF_EXES = [...new Set(['electron.exe', 'ra assistant.exe', path.basename(process.execPath).toLowerCase()])];

const paths = {
  userData: app.getPath('userData'),
  cache: path.join(process.env.LOCALAPPDATA || app.getPath('temp'), 'RAAssistant', 'Cache')
};
const settings = new JsonStore(path.join(paths.userData, 'settings.json'), DEFAULTS);
// Tabs added in later versions are appended to a saved tab list.
for (const t of DEFAULTS.behaviour.tabs) if (!settings.data.behaviour.tabs.some((x) => x.id === t.id)) settings.data.behaviour.tabs.push({ ...t });
const data = new JsonStore(path.join(paths.userData, 'data.json'), {
  todos: [], events: [], reminders: [], drink: {}, lyricOffsets: {}, lyricSkip: {}, shelf: [], stats: {}
});
i18n.setLang(settings.get('lang'));

const bus = new EventEmitter();
bus.setMaxListeners(50);
const stateCache = {};
const handlers = {};
let island = null, settingsWin = null, tray = null, lyricsWin = null, pillWin = null;
let focusRequestedAt = 0;
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
  if (!islandAlive()) return;
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

// Lifecycle events (close attempts, crashes, recreation) go to %APPDATA%\RAAssistant\events.log.
function evlog(msg) {
  try {
    const f = path.join(app.getPath('userData'), 'events.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 256 * 1024) fs.renameSync(f, f + '.old');
    fs.appendFileSync(f, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
  dlog('EV', msg);
}
ctx.evlog = evlog;

let quitting = false;
const islandAlive = () => !!island && !island.isDestroyed();
let recreateT = null, recreateCount = 0, recreateWindowStart = 0;
// Bring the island back after it was destroyed or its renderer died. Backs off if it keeps failing.
function recreateIsland(reason) {
  if (quitting || recreateT) return;
  const now = Date.now();
  if (now - recreateWindowStart > 60000) { recreateWindowStart = now; recreateCount = 0; }
  recreateCount++;
  const delay = recreateCount <= 3 ? 500 : 15000;
  evlog(`island recreate (${reason}) #${recreateCount} in ${delay}ms`);
  recreateT = setTimeout(() => {
    recreateT = null;
    if (quitting) return;
    const old = island;
    island = null; softHidden = false; pointerInside = false; hitRects = [];
    try { if (old && !old.isDestroyed()) old.destroy(); } catch {}
    try { createIsland(); } catch (e) { errlog('createIsland', e); recreateIsland('create failed'); }
  }, delay);
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
  const win = island;
  win.once('ready-to-show', () => { if (win !== island) return; placeIsland(); island.showInactive(); applyVisibility(true); evlog('island shown'); });
  win.on('blur', () => {
    if (win !== island) return;
    if (Date.now() - focusRequestedAt < 1000) return; // spurious blur while we are taking focus
    island.webContents.send('ra:blur');
    if (island.isFocusable()) { setIslandFocusable(false); applyIgnore(); }
  });
  // The island is not a normal window: Alt+F4, "End task" or WM_CLOSE must never remove it.
  // Only the tray's "Quit" ends RA Assistant.
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); evlog('island close blocked'); } });
  win.on('closed', () => { if (win === island) { island = null; if (!quitting) recreateIsland('closed'); } });
  win.webContents.on('render-process-gone', (e, d) => { evlog(`island renderer gone: ${d.reason} (${d.exitCode})`); if (win === island) recreateIsland('renderer ' + d.reason); });
  win.on('unresponsive', () => {
    evlog('island unresponsive');
    setTimeout(() => { if (win === island && !quitting) { evlog('island still unresponsive -> reload'); recreateIsland('unresponsive'); } }, 8000);
  });
  win.on('responsive', () => evlog('island responsive again'));
  win.webContents.on('did-fail-load', (e, code, desc) => { evlog(`island load failed ${code} ${desc}`); if (win === island) recreateIsland('load failed'); });
}
// Re-assert topmost occasionally; some fullscreen apps steal it. Also a watchdog: the island must exist.
setInterval(() => {
  if (quitting) return;
  if (!islandAlive()) { if (app.isReady()) recreateIsland('watchdog'); return; }
  if (!softHidden) island.setAlwaysOnTop(true, 'screen-saver');
}, 15000);

// Make the island visible again (second launch, tray, after Explorer restarts…).
function restoreIsland(reason) {
  evlog('restore island: ' + reason);
  if (!islandAlive()) { recreateIsland(reason); return; }
  view.forcedHidden = false; view.trayShown = true;
  island.setAlwaysOnTop(true, 'screen-saver');
  if (!island.isVisible()) island.showInactive();
  placeIsland();
  applyVisibility(true);
  rebuildTrayMenu();
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
    { label: t('tray.quit'), click: () => quit('tray') }
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
  if (isBrowserFg() && !view.hovering && !revealed()) return 'browser';
  if (b.onTop === 'shrink' && fg.top && !view.hovering && !revealed()) {
    const noShrink = OFFICE.concat(b.noShrinkApps.map((x) => x.toLowerCase()));
    if (!noShrink.includes(exe)) return 'shrink';
  }
  return 'normal';
}

// Keyboard-triggered panels (e.g. the capture shortcut) unfold a tucked island for a moment.
let revealUntil = 0, revealTimer = null;
function revealed() { return Date.now() < revealUntil; }
ctx.reveal = (ms = 4500) => {
  revealUntil = Date.now() + ms;
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => applyVisibility(), ms + 50);
  applyVisibility();
};

function isBrowserFg() {
  const b = settings.get('behaviour');
  const exe = (view.fg.exe || '').toLowerCase();
  return !!(b.browserNotch && exe && (b.browserApps || []).map((x) => x.toLowerCase()).includes(exe));
}

function applyVisibility(force) {
  if (!islandAlive()) return;
  const mode = computeMode();
  const notch = isBrowserFg();
  if (mode === view.mode && notch === view.notch && !force) return;
  view.mode = mode; view.notch = notch;
  ctx.state('layout', { mode, notch });
  const hide = mode === 'hidden' || mode === 'fullscreen';
  softHide(hide);
  updateLyricsOverlay();
}

// hide()/show() on this transparent window breaks click delivery afterwards, so "hiding" is done by
// making it fully transparent and click-through instead.
let softHidden = false;
function softHide(on) {
  if (!islandAlive() || on === softHidden) return;
  softHidden = on;
  island.setOpacity(on ? 0 : 1);
  if (on) { pointerInside = false; island.setIgnoreMouseEvents(true); }
  else { island.setAlwaysOnTop(true, 'screen-saver'); island.setIgnoreMouseEvents(true, { forward: true }); }
}
ctx.islandHidden = () => softHidden;
ctx.overlays = () => [island, lyricsWin, pillWin];
ctx.fg = () => view.fg;

// Lyrics stay on top over borderless-fullscreen games (click-through window).
function updateLyricsOverlay() {
  const want = view.mode === 'fullscreen' && settings.get('behaviour.musicFullscreen') && !!(stateCache.media && stateCache.media.status === 4);
  if (want && !lyricsWin) {
    const d = targetDisplay();
    lyricsWin = new BrowserWindow({
      width: 900, height: 100, x: Math.round(d.bounds.x + (d.bounds.width - 900) / 2), y: d.bounds.y + 6,
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
  // Installed build: the shortcut runs "RA Assistant.exe" directly. Dev copy: stock electron.exe + app folder.
  if (PACKAGED) {
    return { target: process.execPath, args: '', cwd: path.dirname(process.execPath), description: 'RA Assistant', icon: process.execPath, iconIndex: 0, appUserModelId: 'RA.Assistant' };
  }
  return {
    target: process.execPath, args: `"${APP_DIR}"`, cwd: APP_DIR, description: 'RA Assistant',
    icon: path.join(ASSETS, 'icon.ico'), iconIndex: 0, appUserModelId: 'RA.Assistant'
  };
}
// A shortcut is stale when it launches another copy of RA (e.g. the old dev copy after installing the .exe).
function shortcutStale(file) {
  try {
    const l = shell.readShortcutLink(file), s = shortcutSpec();
    return path.resolve(l.target).toLowerCase() !== path.resolve(s.target).toLowerCase() || (l.args || '') !== s.args;
  } catch { return true; }
}
// Installed build owns the shortcuts: repoint any that still start the dev copy, so only one RA starts.
function healShortcuts() {
  const p = shortcutPaths();
  if (fs.existsSync(p.start) && shortcutStale(p.start)) { evlog('repoint Start Menu shortcut'); ensureShortcuts(); return; }
  // The autostart shortcut must match the setting (it can go missing, or still start the dev copy).
  const want = !!settings.get('autostart'), has = fs.existsSync(p.startup);
  if (want !== has || (has && shortcutStale(p.startup))) { evlog(`sync autostart shortcut (want ${want}, had ${has})`); setAutostart(want); }
  cleanStrayShortcut();
}
function ensureShortcuts() {
  const p = shortcutPaths();
  try { shell.writeShortcutLink(p.start, fs.existsSync(p.start) ? 'replace' : 'create', shortcutSpec()); } catch (e) { errlog('shortcut', e); }
  cleanStrayShortcut();
  setAutostart(settings.get('autostart'));
}
// Electron may add a bare "Electron.lnk" for our AUMID; it shadows "RA Assistant" in Start search.
function cleanStrayShortcut() {
  try {
    const stray = path.join(path.dirname(shortcutPaths().start), 'Electron.lnk');
    if (!fs.existsSync(stray)) return;
    const l = shell.readShortcutLink(stray);
    const t = path.resolve(l.target).toLowerCase();
    const ours = t === path.resolve(process.execPath).toLowerCase() || /raassistant[\\/]node_modules[\\/]electron[\\/]/.test(t);
    if (ours && !l.args) fs.unlinkSync(stray);
  } catch (e) { errlog('shortcut-cleanup', e); }
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
  if (islandAlive() && w === island) {
    // The island is normally non-focusable so clicking it never steals focus; text inputs opt in.
    if (on) {
      focusRequestedAt = Date.now();
      setIslandFocusable(true);
      // Windows' foreground lock blocks focus() from a background app (and isFocused() may still
      // report true), so ask the helper to bring the island to the foreground.
      if (ctx.sys) {
        const hb = island.getNativeWindowHandle();
        ctx.sys.send({ c: 'focusHwnd', h: hb.length >= 8 ? Number(hb.readBigUInt64LE(0)) : hb.readUInt32LE(0) });
      }
    } else if (island.isFocusable()) { setIslandFocusable(false); }
    applyIgnore();
    return;
  }
  if (on) w.focus(); else w.blur();
});

// Interactive regions reported by the island renderer; everything else is click-through.
let hitRects = [];
let pointerInside = false;
let lastCursor = null;
let dwellSince = 0;
const TUCKED = ['shrink', 'peek', 'browser'];
ctx.handle('log', (...a) => { dlog('[renderer]', ...a.slice(0, -1)); });
ctx.handle('rects', (rects) => { hitRects = Array.isArray(rects) ? rects : []; return true; });
// setFocusable() rewrites the window's extended style (dropping WS_EX_TOOLWINDOW), which made the
// island appear in the taskbar where "Close window" could target it. Re-assert skipTaskbar every time.
function setIslandFocusable(on) {
  if (!islandAlive()) return;
  island.setFocusable(on);
  island.setSkipTaskbar(true);
}
// setFocusable() rewrites the window's extended style, so re-assert click-through state afterwards.
function applyIgnore() {
  if (!islandAlive()) return;
  if (pointerInside) island.setIgnoreMouseEvents(false); else island.setIgnoreMouseEvents(true, { forward: true });
}
function pollCursor() {
  if (!islandAlive() || !island.isVisible() || softHidden) return;
  const p = screen.getCursorScreenPoint();
  const b = island.getBounds();
  const x = p.x - b.x, y = p.y - b.y;
  const raw = hitRects.some(([l, t, w, h]) => x >= l - 2 && x <= l + w + 2 && y >= t - 2 && y <= t + h + 2);
  // A tucked-away island only opens once the cursor rests on it, so passing by doesn't pop it open.
  let inside = raw;
  if (!raw) dwellSince = 0;
  else if (!pointerInside && TUCKED.includes(view.mode)) {
    if (!dwellSince) dwellSince = Date.now();
    if (Date.now() - dwellSince < (settings.get('behaviour.hoverDelay') || 0)) inside = false;
  }
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
// Settings' "Quit" button: confirm first so a stray click never ends RA Assistant.
ctx.handle('quit', async () => {
  const id = settings.get('lang') !== 'en';
  const opts = {
    type: 'question', buttons: id ? ['Keluar', 'Batal'] : ['Quit', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true,
    title: 'RA Assistant', message: id ? 'Keluar dari RA Assistant?' : 'Quit RA Assistant?',
    detail: id ? 'Island akan hilang sampai RA Assistant dibuka lagi.' : 'The island will be gone until RA Assistant is started again.'
  };
  const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : undefined;
  const r = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts);
  if (r.response === 0) quit('settings'); else evlog('quit cancelled (settings)');
});

settings.onChange((p, v) => {
  if (p === 'lang') { i18n.setLang(v); rebuildTrayMenu(); }
  if (p.startsWith('appearance.size') || p.startsWith('appearance.monitor')) placeIsland();
  if (p === 'capture.hideFromCapture') for (const w of [island, lyricsWin, pillWin]) if (w && !w.isDestroyed()) w.setContentProtection(!!v);
  if (p === 'capture.shortcut') registerCaptureShortcut();
  if (p === 'autostart') setAutostart(v);
  if (p.startsWith('behaviour')) { applyVisibility(true); rebuildTrayMenu(); }
  for (const w of [island, settingsWin, lyricsWin, pillWin]) if (w && !w.isDestroyed()) w.webContents.send('ra:settings', settings.data, p);
  bus.emit('settings', p, v);
});

// ------------------------------------------------------------------ system helper
function startSystemHelper() {
  const sys = new PSHelper(path.join(PS_DIR, 'sys.ps1'));
  ctx.sys = sys;
  sys.on('fg', (m) => {
    if (SELF_EXES.includes(m.exe)) return; // our own windows got focus; keep previous decision
    view.fg = m;
    bus.emit('fg', m);
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
  sys.on('focusAck', (m) => dlog('focusAck', m));
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
    const { spawn } = require('child_process');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(PS_DIR, 'uia.ps1')], { windowsHide: true });
    let out = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} resolve({ ok: false, error: 'timeout' }); }, 20000);
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => {
      clearTimeout(t);
      const line = out.split(/\r?\n/).find((l) => l.startsWith('{'));
      try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: 'no result' }); }
    });
    p.stdin.end(JSON.stringify(req));
  });
}

function loadFeatures() {
  const dir = path.join(__dirname, 'features');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    try { require(path.join(dir, f)).init(ctx); } catch (e) { errlog('feature ' + f, e); }
  }
}

function quit(src) {
  if (quitting) return;
  quitting = true;
  evlog('quit (' + (src || 'unknown') + ')');
  bus.emit('quit');
  settings.flush(); data.flush();
  if (ctx.sys) ctx.sys.stop();
  if (agents) agents.stop();
  globalShortcut.unregisterAll();
  setTimeout(() => app.exit(0), 300);
}

let agents = null;
// QA: `electron.exe <app> --qa-stress` (second launch) floods the island with events and logs memory/listener counts.
async function qaStress() {
  const snap = (label) => {
    const m = app.getAppMetrics();
    const ws = m.reduce((a, x) => a + (x.memory ? x.memory.workingSetSize : 0), 0);
    const rend = m.filter((x) => x.type === 'Tab').map((x) => Math.round(x.memory.workingSetSize / 1024)).join('/');
    const bl = bus.eventNames().reduce((a, n) => a + bus.listenerCount(n), 0);
    evlog(`qa ${label}: total WS ${Math.round(ws / 1024)} MB, renderers ${rend} MB, main heap ${Math.round(process.memoryUsage().heapUsed / 1048576)} MB, bus listeners ${bl}, ipc handlers ${Object.keys(handlers).length}`);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  snap('before');
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 150; i++) {
      ctx.toast({ kind: 'notif', title: `QA ${round}-${i}`, body: 'x'.repeat(i % 200), ms: 50 });
      ctx.state('volume', { v: (i % 100) / 100, muted: false, osd: true, at: Date.now() });
      if (i % 10 === 0) ctx.state('agents', { list: [{ key: 'qa', source: 'copilot', sourceLabel: 'QA', title: 'QA ' + i, status: i % 20 ? 'busy' : 'waiting', question: 'Q?', choices: ['A', 'B'], startedAt: Date.now() }] });
      await wait(10);
    }
    ctx.state('agents', { list: [] });
    await wait(4000);
    snap('round ' + round);
  }
  await wait(8000);
  for (const w of BrowserWindow.getAllWindows()) try { w.webContents.executeJavaScript('window.gc && gc()'); } catch {}
  snap('after');
  // Language switch reloads the island renderer (leak-free re-translation); make sure it comes back.
  const lang = settings.get('lang');
  settings.set('lang', lang === 'en' ? 'id' : 'en'); await wait(3000);
  settings.set('lang', lang); await wait(3000);
  snap('after lang switch x2');
}

// Launching RA again while it runs brings the island back (and opens Settings, like before).
app.on('second-instance', (e, argv) => {
  dlog('second-instance');
  if ((argv || []).some((a) => a.startsWith('--listen-test='))) return;
  if ((argv || []).includes('--qa-stress')) { qaStress().catch((err) => errlog('qa', err)); return; }
  restoreIsland('second launch');
  try { openSettings(); } catch (err) { errlog('openSettings', err); }
});
app.on('window-all-closed', (e) => { /* keep running in tray */ });
// Only quit() (tray / confirmed Settings button) may end RA; any other app.quit() path is refused.
// Windows logoff/shutdown is allowed through via 'session-end'.
app.on('session-end', () => { evlog('session end'); quitting = true; });
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  evlog('before-quit blocked (not from tray)');
  restoreIsland('blocked quit');
});
app.on('render-process-gone', (e, wc, d) => { if (!islandAlive() || wc !== island.webContents) evlog(`renderer gone (${d.reason})`); });
app.on('child-process-gone', (e, d) => evlog(`child process gone: ${d.type} ${d.reason}`));

app.whenReady().then(() => {
  if (process.argv.includes('--install-shortcuts')) { ensureShortcuts(); }
  // Self-heal: keep the Start Menu entry present and named "RA Assistant".
  else if (PACKAGED) healShortcuts();
  else if (!settings.get('firstRun')) { if (!fs.existsSync(shortcutPaths().start)) ensureShortcuts(); else cleanStrayShortcut(); }
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
    ctx.toast({
      kind: 'agentq', key: s.key, source: s.source, product: s.product, sourceLabel: s.sourceLabel, title: s.title,
      workspace: s.workspace, question: s.question || s.step || s.title, choices: s.choices || null, permission: !!s.permission, urgent: true
    });
    if (view.mode === 'fullscreen' || view.mode === 'hidden') ctx.osNotify(i18n.t('agents.waitNotif'), `${s.sourceLabel}: ${s.question || s.title}`);
  });
  bus.on('activity', (on) => { view.activity = on; applyVisibility(); });
  bus.on('openSettings', openSettings);
  bus.on('lyricsOverlay', updateLyricsOverlay);
});

module.exports = { ctx };

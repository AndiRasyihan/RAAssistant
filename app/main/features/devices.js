// Device & connection notices: Wi-Fi/LAN, Bluetooth (type + battery), USB/ports (mouse, keyboard,
// drives, phones…), external displays (HDMI / DisplayPort / USB-C). The charger animation lives in the
// renderer (Battery API). Everything is event-driven: the PowerShell helper debounces WM_DEVICECHANGE /
// NetworkAddressChanged and runs a background scan; this module diffs scans and coalesces flapping.
const { powerMonitor } = require('electron');

// ---------------------------------------------------------------- pure helpers (unit-tested)
const TWS_RE = /(buds?|pods)(?=\d|\b|\s)|\b(tws|earbuds?|freebuds|airdots|earphones?|in-?ear)\b|\bt\d{2,3}[a-z]{0,2}\b/i;

// Bluetooth device type from Class-of-Device, the container category and (for earbuds) the name.
function btKind(d) {
  const name = String((d && d.name) || '');
  const cat = String((d && d.cat) || '').toLowerCase();
  const cod = Number(d && d.cod) || 0;
  const major = (cod >> 8) & 0x1f, minor = (cod >> 2) & 0x3f;
  if (major === 4 || /audio|headset|headphone|speaker|handsfree/.test(cat)) {
    if (minor === 5 || /speaker/.test(cat)) return 'speaker';
    if (minor === 8) return 'car';
    return TWS_RE.test(name) ? 'tws' : 'headphones';
  }
  if (major === 5 || /^input|mouse|keyboard|gaming/.test(cat)) {
    const kb = (cod >> 6) & 3, sub = (cod >> 2) & 0xf;
    if ((major === 5 && (sub === 1 || sub === 2)) || /gaming|gamepad|joystick/.test(cat)) return 'gamepad';
    if (kb === 2 || /mouse/.test(cat)) return 'mouse';
    if (kb === 1 || kb === 3 || /keyboard/.test(cat)) return 'keyboard';
    return 'input';
  }
  if (major === 2 || /phone/.test(cat)) return 'phone';
  if (major === 1 || /computer/.test(cat)) return 'laptop';
  if (major === 7 || /watch|wearable/.test(cat)) return 'watch';
  if (TWS_RE.test(name)) return 'tws';
  return 'generic';
}

const GENERIC_USB = /root hub|generic (usb )?hub|usb hub|host controller|card reader|composite device|input configuration|mass storage/i;
// Kind of a plug-and-play entry; null = not worth a notice.
function pnpKind(e) {
  if (!e) return null;
  if (e.k === 'vol') return 'drive';
  if (e.k === 'mon') return 'display';
  const id = String(e.id || ''), name = String(e.name || '');
  // Bluetooth HID (classic 1124 / LE 1812) is reported by the Bluetooth path instead.
  if (/^HID\\\{0000(1124|1812)/i.test(id)) return null;
  switch (e.cls) {
    case 'Mouse': return 'mouse';
    case 'Keyboard': return 'keyboard';
    case 'WPD': return /^[A-Z]:\\?$/i.test(name.trim()) ? null : 'phone';
    case 'DiskDrive': return /^(USBSTOR|SCSI|STORAGE)/i.test(id) ? 'drive' : null;
    case 'Camera': case 'Image': return 'camera';
    case 'Net': return /^USB/i.test(id) ? (/rndis|remote ndis|internet sharing|tether|android|iphone|apple mobile|ncm/i.test(name) ? 'tether' : 'ethernet') : null;
    case 'MEDIA': return /^USB/i.test(id) ? 'audio' : null;
    case 'Printer': return 'printer';
    case 'Ports': return 'serial';
    case 'Biometric': return 'finger';
    case 'SmartCardReader': return 'card';
    case 'USB': return GENERIC_USB.test(name) ? 'usb-generic' : 'usb';
    default: return null;
  }
}
const KIND_PRI = { phone: 9, drive: 8, display: 8, tether: 7, camera: 6, audio: 6, mouse: 5, keyboard: 5, printer: 5, ethernet: 4, finger: 3, card: 3, serial: 3, usb: 2, 'usb-generic': 1 };

const keyOf = (e) => `${e.k}|${e.id}`;
// Entries present in `cur` but not in `prev` (added) and vice versa (removed).
function diffDevices(prev, cur) {
  const p = new Map((prev || []).map((e) => [keyOf(e), e]));
  const c = new Map((cur || []).map((e) => [keyOf(e), e]));
  return {
    added: [...c.values()].filter((e) => !p.has(keyOf(e))),
    removed: [...p.values()].filter((e) => !c.has(keyOf(e)))
  };
}

// One notice per plug: pick the most specific entry of a batch; drive letters enrich drive names.
function summarize(list) {
  const items = (list || []).map((e) => ({ e, kind: pnpKind(e) })).filter((x) => x.kind);
  if (!items.length) return null;
  items.sort((a, b) => (KIND_PRI[b.kind] || 0) - (KIND_PRI[a.kind] || 0));
  const top = items[0];
  const vol = items.find((x) => x.e.k === 'vol');
  const disk = items.find((x) => x.e.cls === 'DiskDrive');
  let name = String(top.e.name || '').trim();
  let extra = '';
  if (top.kind === 'drive') {
    name = String((disk && disk.e.name) || (vol && vol.e.name) || name).replace(/\s+USB Device$/i, '').trim();
    if (vol) extra = vol.e.id;
  }
  if (top.kind === 'display') extra = monTech(top.e.tech);
  // "+N": other distinct device kinds plugged at once (helper nodes of the same device don't count).
  const others = new Set(items.filter((x) => !['usb', 'usb-generic', top.kind].includes(x.kind) && x !== vol && x !== disk).map((x) => x.kind));
  return { kind: top.kind === 'usb-generic' ? 'usb' : top.kind, name: top.kind === 'usb-generic' ? '' : name, extra, more: others.size };
}

// D3DKMDT_VIDEO_OUTPUT_TECHNOLOGY → label. USB-C alt mode reports as DisplayPort.
function monTech(t) {
  const n = Number(t);
  if (n === 5) return 'HDMI';
  if (n === 10) return 'DisplayPort / USB-C';
  if (n === 11) return 'DisplayPort';
  if (n === 4) return 'DVI';
  if (n === 0) return 'VGA';
  if (n === 15) return 'Miracast';
  if (n === 16) return 'USB';
  if (n >= 0x80000000 || n < 0) return 'internal';
  return '';
}

// `netsh wlan show interfaces` → { connected, ssid, signal }. Labels "SSID" and "%" are not localized.
function parseWlan(raw, profile) {
  const s = String(raw || '');
  const m = s.match(/^\s*SSID\s*:\s*(.+?)\s*$/m);
  const sig = s.match(/:\s*(\d{1,3})\s*%\s*$/m);
  const ssid = m ? m[1] : (profile || '');
  return { connected: !!ssid, ssid, signal: sig ? Math.min(100, +sig[1]) : null };
}

// ---------------------------------------------------------------- runtime
function init(ctx) {
  const S = () => ctx.settings().devices || {};
  const quietUntil = { v: Date.now() + 15000 }; // startup: take baselines silently
  const quiet = () => Date.now() < quietUntil.v;
  const notify = (dev) => { ctx.dlog && ctx.dlog('device', dev, quiet() ? '(quiet)' : ''); if (!quiet()) ctx.toast({ kind: 'device', dev, title: dev.name || dev.type, ms: dev.on === false ? 3500 : 4500 }); };

  // ---- plug & play
  let snap = null;
  const pendingOff = new Map(); // name/kind → timer; a removal that is re-added quickly (re-enumeration) is dropped
  ctx.bus.on('pnp', (m) => {
    const cur = (m.data || []).filter((e) => e && e.id);
    ctx.dlog && ctx.dlog('pnp scan', cur.length);
    if (!snap || quiet()) { snap = cur; return; }
    const { added, removed } = diffDevices(snap, cur);
    snap = cur;
    const on = summarize(added), off = summarize(removed);
    if (on && on.kind !== 'display') {
      const k = on.kind + '|' + on.name;
      if (pendingOff.has(k)) { clearTimeout(pendingOff.get(k)); pendingOff.delete(k); }
      else if (S().usb !== false) notify({ type: 'usb', ...on, on: true });
    }
    if (on && on.kind === 'display' && S().display !== false && on.extra !== 'internal') notify({ type: 'display', ...on, on: true });
    if (off && off.kind === 'display' && S().display !== false && off.extra !== 'internal') notify({ type: 'display', ...off, on: false });
    if (off && off.kind !== 'display') {
      const k = off.kind + '|' + off.name;
      clearTimeout(pendingOff.get(k));
      pendingOff.set(k, setTimeout(() => { pendingOff.delete(k); if (S().usb !== false) notify({ type: 'usb', ...off, on: false }); }, 2500));
    }
  });

  // ---- Bluetooth
  let btPrev = null, btPoll = true;
  ctx.bus.on('bt', (m) => {
    const list = (m.data || []).filter((d) => d && d.name && d.id);
    // Audio devices raise device events (audio endpoints appear/vanish); only paired input devices need polling.
    btPoll = list.some((d) => ['mouse', 'keyboard', 'gamepad', 'input'].includes(btKind(d)));
    const conn = list.filter((d) => d.connected).map((d) => ({ id: d.id, name: d.name, kind: btKind(d), battery: d.battery == null ? null : d.battery }));
    ctx.dlog && ctx.dlog('bt scan', list.length, JSON.stringify(conn));
    if (btPrev && !quiet() && S().bluetooth !== false) {
      for (const d of conn) if (!btPrev.find((p) => p.id === d.id)) notify({ type: 'bt', kind: d.kind, name: d.name, battery: d.battery, on: true });
      for (const p of btPrev) if (!conn.find((d) => d.id === p.id)) notify({ type: 'bt', kind: p.kind, name: p.name, on: false });
    }
    btPrev = conn;
    ctx.state('bluetooth', conn);
  });
  // Connection-only changes (e.g. a BLE mouse waking up) do not always raise a device event: slow safety poll.
  let btT = setTimeout(function btLoop() { if (btPoll && S().bluetooth !== false && ctx.sys) ctx.sys.send({ c: 'bt' }); btT = setTimeout(btLoop, 60000); }, 3000);

  // ---- Wi-Fi / LAN
  let net = null;
  ctx.bus.on('wifi', (m) => {
    const r = (m.data || [])[0] || {};
    const cur = { ...parseWlan(r.raw, r.profile), lan: !!r.lan };
    ctx.dlog && ctx.dlog('wifi scan', JSON.stringify(cur));
    const prev = net; net = cur;
    if (!prev || quiet() || S().wifi === false) return;
    if (cur.connected && (!prev.connected || prev.ssid !== cur.ssid)) { ctx.state('netchange', { at: Date.now() }); notify({ type: 'wifi', name: cur.ssid, signal: cur.signal, on: true }); }
    else if (!cur.connected && prev.connected) { ctx.state('netchange', { at: Date.now() }); notify({ type: 'wifi', name: prev.ssid, on: false }); }
    if (cur.lan !== prev.lan) notify({ type: 'lan', name: 'Ethernet', on: cur.lan });
  });

  // Baselines; after sleep/resume devices re-enumerate, so re-baseline quietly.
  const baseline = () => { if (ctx.sys) { ctx.sys.send({ c: 'pnp' }); ctx.sys.send({ c: 'wifi' }); ctx.sys.send({ c: 'bt' }); } };
  setTimeout(baseline, 2500);
  powerMonitor.on('resume', () => { quietUntil.v = Date.now() + 12000; snap = null; setTimeout(baseline, 4000); });
  ctx.bus.on('quit', () => { clearTimeout(btT); for (const t of pendingOff.values()) clearTimeout(t); });

  // Preview of every animation (Settings button / `--qa-devices` second launch).
  const DEMO = [
    { type: 'charger', level: 0.64, charging: true, on: true },
    { type: 'wifi', name: 'Rumah', signal: 82, on: true },
    { type: 'bt', kind: 'tws', name: 'Earbuds', battery: 80, on: true },
    { type: 'bt', kind: 'headphones', name: 'Headphone', battery: 45, on: true },
    { type: 'bt', kind: 'speaker', name: 'Speaker', battery: null, on: true },
    { type: 'usb', kind: 'mouse', name: 'USB Mouse', on: true },
    { type: 'usb', kind: 'drive', name: 'Flashdisk', extra: 'E:', on: true },
    { type: 'usb', kind: 'phone', name: 'Ponsel', on: true },
    { type: 'display', kind: 'display', name: 'Monitor', extra: 'HDMI', on: true },
    { type: 'bt', kind: 'tws', name: 'Earbuds', on: false },
    { type: 'charger', level: 0.64, charging: false, on: false }
  ];
  const demo = () => DEMO.forEach((dev, i) => setTimeout(() => ctx.toast({ kind: 'device', dev, title: dev.name || dev.type, ms: 2600, force: true }), i * 50));
  ctx.handle('devices.demo', demo);
  ctx.bus.on('devices:demo', demo);
}

module.exports = { init, btKind, pnpKind, diffDevices, summarize, monTech, parseWlan };

// Screen time: how long the screen was in use, idle, locked or asleep, and which apps were in front.
// Cheap by design: it reuses the foreground-window events the system helper already sends, Electron's
// power events and one 30 s timer. Data stays local in data.json (last 14 days).
const { powerMonitor } = require('electron');

const IDLE_S = 5 * 60;            // no input for 5 min = idle
const TICK_MS = 30 * 1000;
const KEEP_DAYS = 14;
const NAMES = {
  'chrome.exe': 'Chrome', 'msedge.exe': 'Edge', 'firefox.exe': 'Firefox', 'brave.exe': 'Brave', 'opera.exe': 'Opera',
  'code.exe': 'VS Code', 'antigravity.exe': 'Antigravity', 'antigravity ide.exe': 'Antigravity IDE', 'github.exe': 'GitHub Copilot',
  'explorer.exe': 'File Explorer', 'windowsterminal.exe': 'Terminal', 'powershell.exe': 'PowerShell', 'cmd.exe': 'Command Prompt',
  'winword.exe': 'Word', 'excel.exe': 'Excel', 'powerpnt.exe': 'PowerPoint', 'onenote.exe': 'OneNote', 'outlook.exe': 'Outlook', 'olk.exe': 'Outlook',
  'spotify.exe': 'Spotify', 'whatsapp.exe': 'WhatsApp', 'whatsapp.root.exe': 'WhatsApp', 'telegram.exe': 'Telegram', 'discord.exe': 'Discord',
  'zoom.exe': 'Zoom', 'ms-teams.exe': 'Teams', 'teams.exe': 'Teams', 'notepad.exe': 'Notepad', 'applicationframehost.exe': 'Windows app',
  'systemsettings.exe': 'Settings', 'snippingtool.exe': 'Snipping Tool', 'obs64.exe': 'OBS', 'vlc.exe': 'VLC', 'acrobat.exe': 'Acrobat',
  'shellexperiencehost.exe': 'Windows', 'searchhost.exe': 'Windows Search', 'startmenuexperiencehost.exe': 'Start'
};
const nice = (exe) => NAMES[exe] || exe.replace(/\.exe$/i, '').replace(/^./, (c) => c.toUpperCase());
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

exports.init = (ctx) => {
  const on = () => ctx.settings().screen.track;
  const all = ctx.data.get('screentime') || {};
  let exe = String((ctx.fg && ctx.fg().exe) || '').toLowerCase(), state = 'active', last = Date.now(), dirty = false, saveT = null;

  function bucket(t) {
    const k = dayKey(t);
    return all[k] || (all[k] = { active: 0, idle: 0, locked: 0, sleep: 0, apps: {}, first: t, last: t });
  }
  // Credit the time since the previous call to the current state (split at midnight).
  function flush(now = Date.now()) {
    let from = last; last = now;
    if (!on() || now <= from) return;
    while (from < now) {
      const mid = new Date(from); mid.setHours(24, 0, 0, 0);
      const to = Math.min(now, mid.getTime());
      const d = bucket(from), dt = to - from;
      d[state] += dt;
      if (state === 'active' && exe) d.apps[exe] = (d.apps[exe] || 0) + dt;
      if (state === 'active' || state === 'idle') { d.first = Math.min(d.first, from); d.last = Math.max(d.last, to); }
      from = to;
    }
    dirty = true;
  }
  function setState(s) { flush(); state = s; publish(); }
  function save() {
    if (!dirty) return;
    dirty = false;
    const keys = Object.keys(all).sort();
    while (keys.length > KEEP_DAYS) delete all[keys.shift()];
    ctx.data.set('screentime', all);
  }

  ctx.bus.on('fg', (m) => { flush(); if (state === 'idle') state = 'active'; exe = String(m.exe || '').toLowerCase(); });
  powerMonitor.on('lock-screen', () => setState('locked'));
  powerMonitor.on('unlock-screen', () => setState('active'));
  powerMonitor.on('suspend', () => { setState('sleep'); save(); });
  powerMonitor.on('resume', () => setState('active'));
  powerMonitor.on('shutdown', () => { flush(); save(); });

  setInterval(() => {
    const now = Date.now();
    // A long gap between ticks means the machine slept without telling us.
    if (now - last > TICK_MS * 3 && state !== 'locked') { const s = state; state = 'sleep'; flush(now); state = s; }
    if (state === 'active' || state === 'idle') {
      const idle = powerMonitor.getSystemIdleTime() >= IDLE_S;
      if (idle !== (state === 'idle')) { flush(now); state = idle ? 'idle' : 'active'; }
    }
    flush(now);
    if (!saveT) saveT = setTimeout(() => { saveT = null; save(); }, 2 * 60 * 1000);
  }, TICK_MS);

  function summary(k) {
    const d = all[k];
    if (!d) return null;
    const apps = Object.entries(d.apps).map(([e, ms]) => ({ exe: e, name: nice(e), ms })).sort((a, b) => b.ms - a.ms);
    const merged = [];
    for (const a of apps) { const m = merged.find((x) => x.name === a.name); if (m) m.ms += a.ms; else merged.push({ ...a }); }
    return { day: k, active: d.active, idle: d.idle, locked: d.locked, sleep: d.sleep, first: d.first, last: d.last, apps: merged.slice(0, 12) };
  }
  function publish() { ctx.state('screentime', { state, today: summary(dayKey(Date.now())) }); }
  ctx.handle('screentime.get', () => {
    flush();
    const days = [];
    for (let i = 6; i >= 0; i--) { const t = new Date(); t.setDate(t.getDate() - i); const k = dayKey(t); const d = all[k]; days.push({ day: k, active: d ? d.active : 0, idle: d ? d.idle : 0 }); }
    return { state, enabled: on(), today: summary(dayKey(Date.now())), days };
  });
  ctx.bus.on('quit', () => { flush(); save(); });
  ctx.handle('screentime.clear', () => { for (const k of Object.keys(all)) delete all[k]; dirty = true; save(); return true; });
};

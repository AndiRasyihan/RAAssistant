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
// Pure aggregation: add the span [from, to) in `state` (and app `exe` when active) to `all`, split at local midnight.
function credit(all, from, to, state, exe) {
  while (from < to) {
    const mid = new Date(from); mid.setHours(24, 0, 0, 0);
    const end = Math.min(to, mid.getTime());
    const k = dayKey(from);
    const d = all[k] || (all[k] = { active: 0, idle: 0, locked: 0, sleep: 0, apps: {}, first: 0, last: 0 });
    const dt = end - from;
    d[state] = (d[state] || 0) + dt;
    if (state === 'active' && exe) d.apps[exe] = (d.apps[exe] || 0) + dt;
    // First/last use only count time the screen was actually in use.
    if (state === 'active' || state === 'idle') { d.first = d.first ? Math.min(d.first, from) : from; d.last = Math.max(d.last || 0, end); }
    from = end;
  }
  return all;
}

function summarize(all, k) {
  const d = all[k];
  if (!d) return null;
  const merged = [];
  for (const [e, ms] of Object.entries(d.apps || {})) {
    const name = nice(e);
    const m = merged.find((x) => x.name === name);
    if (m) m.ms += ms; else merged.push({ exe: e, name, ms });
  }
  merged.sort((a, b) => b.ms - a.ms);
  return { day: k, active: d.active, idle: d.idle, locked: d.locked, sleep: d.sleep, first: d.first || 0, last: d.last || 0, apps: merged.slice(0, 12) };
}

function prune(all, keep) {
  const keys = Object.keys(all).sort();
  while (keys.length > keep) delete all[keys.shift()];
  return all;
}

exports.credit = credit;
exports.summarize = summarize;
exports.prune = prune;
exports.dayKey = dayKey;
exports.nice = nice;

exports.init = (ctx) => {
  const on = () => ctx.settings().screen.track;
  const all = ctx.data.get('screentime') || {};
  let exe = String((ctx.fg && ctx.fg().exe) || '').toLowerCase(), state = 'active', last = Date.now(), dirty = false, saveT = null;
  let locked = false; // the lock screen survives sleep, so "resume" alone doesn't mean the screen is in use

  // Credit the time since the previous call to the current state.
  function flush(now = Date.now()) {
    const from = last; last = now;
    if (!on() || now <= from) return;
    credit(all, from, now, state, exe);
    dirty = true;
  }
  function setState(s) { flush(); state = s; publish(); }
  function save() {
    if (!dirty) return;
    dirty = false;
    prune(all, KEEP_DAYS);
    ctx.data.set('screentime', all);
  }

  ctx.bus.on('fg', (m) => { flush(); if (state === 'idle') state = 'active'; exe = String(m.exe || '').toLowerCase(); });
  powerMonitor.on('lock-screen', () => { locked = true; setState('locked'); });
  powerMonitor.on('unlock-screen', () => { locked = false; setState('active'); });
  powerMonitor.on('suspend', () => { setState('sleep'); save(); });
  powerMonitor.on('resume', () => setState(locked ? 'locked' : 'active'));
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

  const summary = (k) => summarize(all, k);
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
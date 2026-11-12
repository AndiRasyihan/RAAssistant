// Windows notifications mirrored into the island, read from the local notification database
// (read-only). Works for unpackaged apps without needing package identity.
const path = require('path');
const { shell, clipboard } = require('electron');
const { execFile } = require('child_process');

const OTP_WORDS = /(otp|kode|code|verif|pin\b|token|passcode|sandi|one[- ]time|auth|masuk|login|2fa|keamanan|security)/i;
const NAMES = {
  'com.squirrel.whatsapp': 'WhatsApp', 'whatsapp': 'WhatsApp', 'telegram': 'Telegram', 'com.github.githubapp': 'GitHub Copilot',
  'microsoft.windows.explorer': 'File Explorer', 'windows.defender': 'Windows Security', 'screensketch': 'Snipping Tool',
  'microsoftteams': 'Teams', 'ms-teams': 'Teams', 'chrome': 'Chrome', 'msedge': 'Edge', 'firefox': 'Firefox', 'outlook': 'Outlook',
  'discord': 'Discord', 'spotify': 'Spotify', 'zoom': 'Zoom', 'slack': 'Slack', 'yourphone': 'Phone Link', 'windows.systemtoast': 'Windows'
};
function niceName(aumid) {
  const a = String(aumid || '').toLowerCase();
  for (const k of Object.keys(NAMES)) if (a.includes(k)) return NAMES[k];
  let n = String(aumid || '').split('!')[0].split(/[\\/]/).pop();
  n = n.replace(/_[a-z0-9]{10,}$/i, '').split('.').filter((x) => !/^(com|microsoft|windows|app)$/i.test(x)).pop() || n;
  return n.replace(/\.exe$/i, '');
}
function decode(s) { return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
function parseToast(xml) {
  const texts = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decode(m[1]).trim()).filter(Boolean);
  const launch = (xml.match(/<toast[^>]*\slaunch="([^"]*)"/) || [])[1];
  const img = (xml.match(/<image[^>]*placement="appLogoOverride"[^>]*src="([^"]+)"/) || xml.match(/<image[^>]*src="(file:[^"]+)"/) || [])[1];
  return { title: texts[0] || '', body: texts.slice(1).join(' · '), launch: launch ? decode(launch) : '', image: img && img.startsWith('file:') ? decode(img) : '' };
}
function findOtp(text) {
  if (!OTP_WORDS.test(text)) return null;
  const m = text.match(/(?:^|[^\d])([A-Z]-)?(\d{4,8})(?!\d)/);
  if (!m) return null;
  // Avoid matching years / times / currency.
  if (/^(19|20)\d\d$/.test(m[2]) && !/\d{5,}/.test(m[2])) return null;
  return m[2];
}

exports.init = (ctx) => {
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); } catch { return; }
  const file = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db');
  let db = null, lastId = null, timer = null;

  function open() {
    try { db = new DatabaseSync(file, { readOnly: true }); } catch { db = null; }
    return db;
  }
  function poll() {
    if (!ctx.settings().meetings.notifications) return;
    try {
      if (!db && !open()) return;
      if (lastId == null) { lastId = db.prepare('select max(Id) m from Notification').get().m || 0; return; }
      const rows = db.prepare(`select n.Id id, h.PrimaryId aumid, n.Payload payload from Notification n join NotificationHandler h on h.RecordId = n.HandlerId where n.Id > ? and n.Type = 'toast' order by n.Id limit 10`).all(lastId);
      for (const r of rows) {
        lastId = Math.max(lastId, r.id);
        if (/^RA\.Assistant$/i.test(r.aumid)) continue;
        const t = parseToast(Buffer.from(r.payload).toString('utf8'));
        if (!t.title && !t.body) continue;
        // Electron's own SAC warning for the optional SwiftShader DLL is not useful to show twice.
        if (/swiftshader/i.test(t.body)) continue;
        const otp = findOtp(t.title + ' ' + t.body);
        ctx.toast({
          kind: 'notif', app: niceName(r.aumid), aumid: r.aumid, title: `${niceName(r.aumid)} · ${t.title}`, body: t.body,
          image: t.image, launch: t.launch, otp, icon: 'reminders'
        });
        ctx.bus.emit('notification', { app: niceName(r.aumid), otp });
      }
    } catch (e) { try { db && db.close(); } catch {} db = null; }
  }
  timer = setInterval(poll, 1500);
  poll();

  // Clicking a mirrored notification opens the sender (protocol launch if present, else the app).
  ctx.handle('notif.open', (aumid, launch) => {
    if (launch && /^[a-z][a-z0-9+.-]*:/i.test(launch) && !/^(file|javascript):/i.test(launch)) return shell.openExternal(launch).catch(() => {});
    if (aumid) execFile('explorer.exe', ['shell:AppsFolder\\' + aumid], { windowsHide: true }, () => {});
  });
  ctx.handle('copyOtp', (code) => {
    ctx.bus.emit('clipboard:skipNext', code);
    clipboard.writeText(String(code));
    return true;
  });
  ctx.bus.on('quit', () => { clearInterval(timer); try { db && db.close(); } catch {} });
};

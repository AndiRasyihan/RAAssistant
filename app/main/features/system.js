// Small system notices: internet lost/restored, downloads, Bluetooth earbuds, resume-after-lock, CPU heat, idle.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { net, powerMonitor, app } = require('electron');

exports.init = (ctx) => {
  const t = ctx.i18n.t, L = ctx.i18n.L;
  const S = () => ctx.settings();

  // ---- internet
  let online = true, lostAt = 0;
  async function checkNet() {
    let ok = net.isOnline();
    if (ok) {
      try { const r = await net.fetch('http://www.msftconnecttest.com/connecttest.txt', { cache: 'no-store' }); ok = r.ok; } catch { ok = false; }
    }
    if (ok === online) return;
    online = ok;
    if (!S().meetings.internet) return;
    if (!ok) { lostAt = Date.now(); ctx.toast({ title: t('net.lost'), body: '', icon: 'net', urgent: true }); }
    else ctx.toast({ title: t('net.back'), body: lostAt ? `${t('net.after')} ${Math.max(1, Math.round((Date.now() - lostAt) / 1000))} ${t('common.sec')}` : '', icon: 'net' });
    ctx.state('online', ok);
  }
  // Cheap: OS connectivity flag every 4 s; a tiny HTTP probe only every 30 s or when the flag changes.
  let probeTick = 0, lastFlag = true;
  setInterval(() => {
    const flag = net.isOnline();
    if (flag !== lastFlag || ++probeTick % 8 === 0) { lastFlag = flag; checkNet(); }
  }, 4000);

  // ---- downloads (Chrome/Edge .crdownload, Firefox .part)
  const dlDir = app.getPath('downloads');
  const active = new Map(); // tmpName -> { name, size, at, speed, started }
  let dlTimer = null;
  const finalName = (n) => n.replace(/\.(crdownload|part)$/i, '').replace(/^Unconfirmed \d+$/i, '');
  function scanDownloads() {
    let files = [];
    try { files = fs.readdirSync(dlDir); } catch { return; }
    const temps = files.filter((f) => /\.(crdownload|part)$/i.test(f));
    const now = Date.now();
    for (const f of temps) {
      let st; try { st = fs.statSync(path.join(dlDir, f)); } catch { continue; }
      const prev = active.get(f);
      if (!prev) active.set(f, { name: finalName(f), size: st.size, at: now, speed: 0, started: now });
      else { const dt = (now - prev.at) / 1000; if (dt > 0.5) { prev.speed = Math.max(0, (st.size - prev.size) / dt); prev.size = st.size; prev.at = now; } }
    }
    for (const [f, d] of active) {
      if (temps.includes(f)) continue;
      active.delete(f);
      // Finished if the final file now exists.
      const done = d.name && files.find((x) => x === d.name);
      if (done && S().meetings.downloads) {
        let size = 0; try { size = fs.statSync(path.join(dlDir, done)).size; } catch {}
        ctx.toast({ kind: 'download', title: t('dl.done'), body: `${done} · ${(size / 1048576).toFixed(1)} MB`, icon: 'download', file: path.join(dlDir, done) });
      }
    }
    const list = [...active.values()].map((d) => ({ name: d.name || '…', size: d.size, speed: d.speed }));
    ctx.state('downloads', S().meetings.downloads ? list : []);
    if (!active.size && dlTimer) { clearInterval(dlTimer); dlTimer = null; }
    else if (active.size && !dlTimer) dlTimer = setInterval(scanDownloads, 1000);
  }
  try { fs.watch(dlDir, () => { if (!dlTimer) scanDownloads(); }); } catch {}
  ctx.handle('showItem', (p) => require('electron').shell.showItemInFolder(p));

  // ---- Bluetooth earbuds (battery via PnP; polled slowly, only when enabled)
  let btPrev = null;
  ctx.bus.on('bt', (m) => {
    const list = (m.data || []).filter((d) => d && d.name);
    const connected = list.filter((d) => d.connected);
    if (btPrev) {
      for (const d of connected) if (!btPrev.find((p) => p.name === d.name && p.connected)) {
        ctx.toast({ title: `${d.name} ${t('bt.connected')}`, body: d.battery != null ? `🔋 ${d.battery}%` : '', icon: 'bt' });
      }
    }
    btPrev = list;
    ctx.state('bluetooth', connected);
  });
  setTimeout(function btLoop() { if (S().meetings.bluetooth && ctx.sys) ctx.sys.send({ c: 'bt' }); setTimeout(btLoop, 45000); }, 8000);

  // ---- resume music after lock / sleep ≥ 5 min
  let lockedAt = 0, wasPlaying = false;
  ctx.bus.on('lock', (locked) => {
    const media = ctx.media && ctx.media();
    if (locked) { lockedAt = Date.now(); wasPlaying = !!(media && media.status === 4); return; }
    if (!lockedAt) return;
    const away = Date.now() - lockedAt; lockedAt = 0;
    setTimeout(() => {
      const m = ctx.media && ctx.media();
      if (S().meetings.resumeAfterLock && wasPlaying && away >= 5 * 60000 && m && m.status !== 4) {
        ctx.toast({ kind: 'resume', title: t('resume.music'), body: `${m.title}${m.artist ? ' · ' + m.artist : ''}`, icon: 'music', ms: 15000, actions: 'resume' });
      }
    }, 2500);
  });

  // ---- CPU load (proxy for heat; real temperatures need admin) + idle detection for the mascot
  let prev = os.cpus().map((c) => c.times), hotCount = 0, idleShown = false;
  setInterval(() => {
    const cur = os.cpus().map((c) => c.times);
    let idle = 0, total = 0;
    cur.forEach((c, i) => { const p = prev[i]; for (const k of Object.keys(c)) total += c[k] - p[k]; idle += c.idle - p.idle; });
    prev = cur;
    const load = total ? 1 - idle / total : 0;
    hotCount = load > 0.85 ? hotCount + 1 : 0;
    const hot = hotCount >= 3;
    const old = ctx.getState('cpu');
    if (!old || old.hot !== hot) ctx.state('cpu', { load, hot });
    const m = S().mascot;
    const isIdle = m.idleShow && powerMonitor.getSystemIdleTime() >= m.idleAfter;
    if (isIdle !== idleShown) { idleShown = isIdle; ctx.state('idle', { on: isIdle }); }
  }, 5000);
  void L;
};

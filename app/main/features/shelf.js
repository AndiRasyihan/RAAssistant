// Shelf (hold dragged files temporarily, drag them out again) + phone link over local Wi-Fi.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { app, clipboard, nativeImage, ipcMain } = require('electron');

exports.init = (ctx) => {
  const S = () => ctx.settings();
  const t = ctx.i18n.t;
  const inbox = path.join(ctx.paths.cache, 'phone-inbox');
  const PHONE_DIR = path.join(__dirname, '..', '..', 'renderer', 'phone');

  // ------------------------------------------------------------- shelf
  const list = () => (ctx.data.get('shelf') || []).filter((f) => fs.existsSync(f.path));
  function publish() {
    const items = list().map((f) => ({ ...f, url: pathToFileURL(f.path).href, isImage: /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.path) }));
    ctx.state('shelf', items);
    return items;
  }
  function add(paths, from) {
    const cur = list();
    for (const p of paths) {
      if (!p || cur.some((f) => f.path === p)) continue;
      let st; try { st = fs.statSync(p); } catch { continue; }
      cur.unshift({ id: crypto.randomBytes(5).toString('hex'), path: p, name: path.basename(p), size: st.isDirectory() ? 0 : st.size, dir: st.isDirectory(), at: Date.now(), from: from || 'pc' });
    }
    ctx.data.set('shelf', cur.slice(0, 40));
    return publish();
  }
  ctx.handle('shelf.add', (paths) => add(paths || []));
  ctx.handle('shelf.remove', (id) => {
    const f = list().find((x) => x.id === id);
    if (f && f.from === 'phone' && f.path.startsWith(inbox)) try { fs.unlinkSync(f.path); } catch {}
    ctx.data.set('shelf', list().filter((x) => x.id !== id)); return publish();
  });
  ctx.handle('shelf.clear', () => { for (const f of list()) if (f.from === 'phone' && f.path.startsWith(inbox)) try { fs.unlinkSync(f.path); } catch {} ctx.data.set('shelf', []); return publish(); });
  ctx.handle('shelf.open', (id) => { const f = list().find((x) => x.id === id); if (f) require('electron').shell.openPath(f.path); });
  ctx.handle('shelf.copyPath', (id) => { const f = list().find((x) => x.id === id); if (f) clipboard.writeText(f.path); });

  // Drag a shelf file out into another app (must start synchronously from the renderer's dragstart).
  const icons = new Map();
  ipcMain.removeAllListeners('ra:drag-out');
  ipcMain.on('ra:drag-out', (e, file) => {
    if (!list().some((f) => f.path === file)) return;
    const icon = icons.get(file) || nativeImage.createFromPath(path.join(ctx.ASSETS, 'tray.png'));
    try { e.sender.startDrag({ file, icon }); } catch {}
  });
  ctx.bus.on('shelf:prefetchIcons', async () => {
    for (const f of list()) if (!icons.has(f.path)) try { icons.set(f.path, await app.getFileIcon(f.path, { size: 'normal' })); } catch {}
  });
  setTimeout(() => { publish(); ctx.bus.emit('shelf:prefetchIcons'); }, 800);

  // ------------------------------------------------------------- phone link
  let server = null, token = null, port = 0;
  const texts = []; // laptop -> phone
  function lanIp() {
    const nets = os.networkInterfaces();
    const all = [];
    for (const [name, arr] of Object.entries(nets)) for (const n of arr || []) if (n.family === 'IPv4' && !n.internal && !/^169\.254/.test(n.address)) all.push({ name, ip: n.address });
    const wifi = all.find((x) => /wi-?fi|wlan|wireless/i.test(x.name));
    return (wifi || all.find((x) => !/vethernet|virtual|vmware|vbox|wsl|hyper-v|tailscale|zerotier/i.test(x.name)) || all[0] || {}).ip;
  }
  const netcat = () => new Promise((resolve) => {
    if (!ctx.sys) return resolve({});
    const tm = setTimeout(() => resolve({}), 5000);
    ctx.sys.once('netcat', (m) => { clearTimeout(tm); resolve(m); });
    ctx.sys.send({ c: 'netcat' });
  });

  function serve(req, res) {
    const u = new URL(req.url, 'http://x');
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] !== 't' || parts[1] !== token) { res.writeHead(404); return res.end(); }
    const route = '/' + parts.slice(2).join('/');
    const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (req.method === 'GET' && (route === '/' || route === '/index.html')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return fs.createReadStream(path.join(PHONE_DIR, 'index.html')).pipe(res); }
    if (req.method === 'GET' && route === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return fs.createReadStream(path.join(PHONE_DIR, 'app.js')).pipe(res); }
    if (req.method === 'GET' && route === '/api/state') return json({ shelf: S().phone.shelf ? list().filter((f) => !f.dir).map((f) => ({ id: f.id, name: f.name, size: f.size })) : [], texts, lang: S().lang });
    if (req.method === 'GET' && route.startsWith('/api/file/')) {
      const f = list().find((x) => x.id === parts[parts.length - 1]);
      if (!f || f.dir) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': f.size, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}` });
      return fs.createReadStream(f.path).pipe(res);
    }
    if (req.method === 'POST' && route === '/api/upload') {
      const name = path.basename(String(u.searchParams.get('name') || 'file')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 150) || 'file';
      fs.mkdirSync(inbox, { recursive: true });
      let dest = path.join(inbox, name);
      if (fs.existsSync(dest)) dest = path.join(inbox, Date.now() + '-' + name);
      const out = fs.createWriteStream(dest);
      let size = 0;
      req.on('data', (c) => { size += c.length; if (size > 2 * 1024 * 1024 * 1024) req.destroy(); });
      req.pipe(out);
      out.on('finish', () => {
        add([dest], 'phone');
        ctx.toast({ kind: 'shelf', title: '📱 ' + t('shelf.phone'), body: `${name} · ${(size / 1048576).toFixed(1)} MB`, icon: 'phone', tab: 'shelf' });
        json({ ok: true });
      });
      out.on('error', () => json({ ok: false }, 500));
      return;
    }
    if (req.method === 'POST' && route === '/api/text') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 100000) req.destroy(); });
      req.on('end', () => {
        const text = String(body).trim();
        if (text) ctx.toast({ kind: 'phonetext', title: '📱 ' + t('shelf.phone'), body: text, text, icon: 'phone', ms: 20000 });
        json({ ok: true });
      });
      return;
    }
    res.writeHead(404); res.end();
  }

  async function startServer() {
    if (server) return true;
    token = token || crypto.randomBytes(12).toString('base64url');
    server = http.createServer(serve);
    await new Promise((resolve) => {
      server.once('error', () => { server.listen(0, '0.0.0.0'); });
      server.listen(47830, '0.0.0.0', resolve);
      server.once('listening', resolve);
    });
    port = server.address().port;
    return true;
  }
  function stopServer() { if (server) { server.close(); server = null; } }

  ctx.handle('phone.qr', async () => {
    const nc = await netcat();
    if (nc.category && nc.category !== 'Private') {
      return { error: ctx.i18n.L(`Jaringan "${nc.name}" disetel Publik. Ubah ke Pribadi (Pengaturan Windows → Jaringan & Internet → Wi‑Fi → Properti → Jenis profil jaringan: Pribadi), lalu coba lagi.`, `Network "${nc.name}" is Public. Set it to Private (Windows Settings → Network & internet → Wi‑Fi → Properties → Network profile type: Private) and try again.`) };
    }
    if (!S().phone.enabled) ctx.settingsStore.set('phone.enabled', true);
    await startServer();
    const ip = lanIp();
    if (!ip) return { error: 'No LAN IP' };
    const url = `http://${ip}:${port}/t/${token}/`;
    const qr = await require('qrcode').toDataURL(url, { margin: 1, width: 260 });
    return { url, qr, network: nc.name, category: nc.category };
  });
  ctx.handle('phone.sendText', (text) => { texts.unshift({ id: Date.now(), text: String(text).slice(0, 20000), at: Date.now() }); texts.splice(20); return true; });
  ctx.handle('copyText', (text) => { clipboard.writeText(String(text)); return true; });
  ctx.bus.on('settings', (p, v) => { if (p === 'phone.enabled') { if (!v) stopServer(); } });
  if (S().phone.enabled) netcat().then((nc) => { if (!nc.category || nc.category === 'Private') startServer(); });
  ctx.bus.on('quit', stopServer);
};

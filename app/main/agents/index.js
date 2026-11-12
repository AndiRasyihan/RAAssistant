// Live AI-agent activity: Copilot CLI/app sessions, VS Code Copilot Chat, Antigravity.
// Event driven (fs.watch) with incremental reads; no polling of idle sessions.
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const P = require('../../../extension/ra-agent-bridge/parsers.js');

const HOME = os.homedir();
const RECENT_MS = 6 * 3600 * 1000;      // sessions touched in the last 6 h are tracked
const SHOW_DONE_MS = 30 * 60 * 1000;    // finished sessions stay listed for 30 min
let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch { /* Antigravity reader disabled */ }

function readTail(file, from) {
  const st = fs.statSync(file);
  if (st.size < from) return { reset: true, size: st.size, text: '' };
  if (st.size === from) return { size: st.size, text: '', mtime: st.mtimeMs };
  const fd = fs.openSync(file, 'r');
  try {
    const len = st.size - from;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, from);
    return { size: st.size, text: buf.toString('utf8'), mtime: st.mtimeMs };
  } finally { fs.closeSync(fd); }
}

class Agents {
  constructor(ctx) {
    this.ctx = ctx;
    this.sessions = new Map();   // key -> summary
    this.logs = new Map();       // file -> { log, offset, key }
    this.timers = new Map();
    this.watchers = [];
    this.ext = new Map();        // key -> { at, summary }
    this.extClients = new Map(); // source:workspace -> { at, appName }
    this.prevStatus = new Map();
    this.emitTimer = null;
  }

  start() {
    const s = this.ctx.settings();
    if (s.agents.copilot) this.watchCopilot();
    if (s.agents.vscode) this.watchVSCode();
    if (s.agents.antigravity && DatabaseSync) this.watchAntigravity();
    this.startBridge();
    // Re-evaluate only time-dependent states (busy freshness / stale) every 5 s.
    this.tick = setInterval(() => this.reevaluate(), 5000);
  }

  stop() {
    for (const w of this.watchers) try { w.close(); } catch {}
    this.watchers = [];
    clearInterval(this.tick);
    if (this.server) this.server.close();
  }

  watch(dir, opts, fn) {
    try {
      if (!fs.existsSync(dir)) return;
      const w = fs.watch(dir, opts, fn);
      w.on('error', () => {});
      this.watchers.push(w);
    } catch { /* ignore */ }
  }

  debounce(id, ms, fn) {
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); fn(); }, ms));
  }

  // ---------------------------------------------------- Copilot
  watchCopilot() {
    const dir = path.join(HOME, '.copilot', 'session-state');
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    for (const d of fs.readdirSync(dir)) {
      const f = path.join(dir, d, 'events.jsonl');
      try { if (now - fs.statSync(f).mtimeMs < RECENT_MS) this.readCopilot(d, f); } catch {}
    }
    this.watch(dir, { recursive: true }, (ev, name) => {
      if (!name || !name.endsWith('events.jsonl')) return;
      const id = name.split(/[\\/]/)[0];
      this.debounce('c:' + id, 250, () => this.readCopilot(id, path.join(dir, name)));
    });
    this.emit();
  }

  copilotMeta(id, file) {
    const meta = { title: '', workspace: '' };
    try {
      const y = fs.readFileSync(path.join(path.dirname(file), 'workspace.yaml'), 'utf8');
      const get = (k) => { const m = y.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };
      meta.title = get('name') || get('summary');
      const cwd = get('cwd');
      meta.workspace = cwd ? path.basename(cwd) : '';
      meta.client = get('client_name');
    } catch {}
    return meta;
  }

  readCopilot(id, file) {
    let entry = this.logs.get(file);
    if (!entry) { entry = { log: new P.CopilotLog(), offset: 0, key: 'copilot:' + id }; this.logs.set(file, entry); }
    try {
      const r = readTail(file, entry.offset);
      if (r.reset) { entry.log = new P.CopilotLog(); entry.offset = 0; return this.readCopilot(id, file); }
      if (r.text) { entry.log.feed(r.text); entry.offset = r.size; }
      const meta = entry.meta || (entry.meta = this.copilotMeta(id, file));
      if (!meta.title || !meta.client) entry.meta = this.copilotMeta(id, file);
      const sum = entry.log.summary(r.mtime || fs.statSync(file).mtimeMs);
      const c = (entry.meta.client || '').toLowerCase();
      // VS Code ≥1.143 runs its agent on the Copilot harness, so its sessions live here too.
      const isVSCode = c.includes('vscode');
      const label = isVSCode ? 'VS Code' : c.includes('autopilot') || c.includes('github') ? 'Copilot app' : 'Copilot CLI';
      this.update(entry.key, { source: isVSCode ? 'vscode' : 'copilot', sourceLabel: label, id, title: entry.meta.title || sum.prompt || 'Copilot', workspace: entry.meta.workspace, ...sum });
    } catch { /* file vanished */ }
  }

  // ---------------------------------------------------- VS Code (Copilot Chat agent mode)
  vscodeRoots() {
    const appData = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
    return ['Code', 'Code - Insiders'].map((n) => path.join(appData, n, 'User', 'workspaceStorage')).filter((d) => fs.existsSync(d));
  }

  watchVSCode() {
    const now = Date.now();
    for (const root of this.vscodeRoots()) {
      for (const h of fs.readdirSync(root)) {
        const cd = path.join(root, h, 'chatSessions');
        if (!fs.existsSync(cd)) continue;
        for (const f of fs.readdirSync(cd)) {
          const full = path.join(cd, f);
          try { if (f.endsWith('.jsonl') && now - fs.statSync(full).mtimeMs < RECENT_MS) this.readVSCode(full); } catch {}
        }
      }
      this.watch(root, { recursive: true }, (ev, name) => {
        if (!name || !/chatSessions[\\/][^\\/]+\.jsonl$/.test(name)) return;
        const full = path.join(root, name);
        this.debounce('v:' + full, 400, () => this.readVSCode(full));
      });
    }
    this.emit();
  }

  vscodeWorkspace(file) {
    try {
      const w = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(file)), 'workspace.json'), 'utf8'));
      const u = w.folder || w.workspace || '';
      return decodeURIComponent(u.split('/').pop() || '').replace(/\.code-workspace$/, '');
    } catch { return ''; }
  }

  readVSCode(file) {
    const id = path.basename(file, '.jsonl');
    const key = 'vscode:' + id;
    let entry = this.logs.get(file);
    if (!entry) { entry = { log: new P.VSCodeChatLog(), offset: 0, key, workspace: this.vscodeWorkspace(file) }; this.logs.set(file, entry); }
    try {
      const r = readTail(file, entry.offset);
      if (r.reset) { entry.log = new P.VSCodeChatLog(); entry.offset = 0; return this.readVSCode(file); }
      if (r.text) { entry.log.feed(r.text); entry.offset = r.size; }
      const sum = P.summarizeVSCode(entry.log.root, r.mtime || fs.statSync(file).mtimeMs);
      if (!sum) return;
      const ext = this.ext.get(key);
      if (ext && Date.now() - ext.at < 20000) return; // the extension is reporting this one
      this.update(key, { source: 'vscode', sourceLabel: 'VS Code', id, workspace: entry.workspace, ...sum });
    } catch {}
  }

  // ---------------------------------------------------- Antigravity (agent app + IDE keep separate stores)
  watchAntigravity() {
    this.agDirs = {};
    for (const [product, sub] of [['app', 'antigravity'], ['ide', 'antigravity-ide']]) {
      const dir = path.join(HOME, '.gemini', sub, 'conversations');
      if (!fs.existsSync(dir)) continue;
      this.agDirs[product] = dir;
      const now = Date.now();
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.db')) continue;
        try { if (now - fs.statSync(path.join(dir, f)).mtimeMs < RECENT_MS) this.readAntigravity(product, f.replace(/\.db$/, '')); } catch {}
      }
      this.watch(dir, {}, (ev, name) => {
        if (!name) return;
        const id = name.replace(/\.db(-wal|-shm|-journal)?$/, '');
        if (!/^[0-9a-f-]{36}$/.test(id)) return;
        this.debounce('a:' + product + id, 700, () => this.readAntigravity(product, id));
      });
    }
    this.emit();
  }

  readAntigravity(product, id) {
    const db = path.join(this.agDirs[product], id + '.db');
    let mtime = 0;
    for (const sfx of ['', '-wal']) { try { mtime = Math.max(mtime, fs.statSync(db + sfx).mtimeMs); } catch {} }
    if (!mtime) return;
    const sum = P.summarizeAntigravity(DatabaseSync, db, mtime);
    if (!sum) return;
    const client = product === 'ide' ? this.pickClient('antigravity') : null;
    this.update('antigravity:' + product + ':' + id, {
      source: 'antigravity', product, sourceLabel: product === 'ide' ? 'Antigravity IDE' : 'Antigravity', id,
      workspace: client ? client.workspace : '', ...sum
    });
  }

  // ---------------------------------------------------- Bridge server for the editor extension
  startBridge() {
    const token = crypto.randomBytes(18).toString('hex');
    const file = path.join(this.ctx.paths.userData, 'bridge.json');
    const srv = http.createServer((req, res) => {
      if (req.headers['x-ra-token'] !== token) { res.writeHead(401); return res.end(); }
      if (req.method === 'GET' && req.url === '/v1/ping') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"app":"RA Assistant"}'); }
      const u = new URL(req.url, 'http://x');
      if (req.method === 'GET' && u.pathname === '/v1/commands') return this.longPoll(u.searchParams.get('client'), u.searchParams.get('source'), res);
      if (req.method === 'POST' && u.pathname === '/v1/result') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => { try { const m = JSON.parse(body); const w = this.waiters.get(m.id); if (w) { this.waiters.delete(m.id); w(m); } } catch {} res.writeHead(204); res.end(); });
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/agents') {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
        req.on('end', () => {
          try { this.onExtensionReport(JSON.parse(body)); res.writeHead(204); } catch { res.writeHead(400); }
          res.end();
        });
        return;
      }
      res.writeHead(404); res.end();
    });
    srv.on('error', () => { if (!this.bridgeRetry) { this.bridgeRetry = true; srv.listen(0, '127.0.0.1'); } });
    srv.listen(47821, '127.0.0.1', () => {});
    srv.on('listening', () => {
      const port = srv.address().port;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ port, token, pid: process.pid }));
    });
    this.server = srv;
  }

  onExtensionReport(m) {
    const source = m.source === 'antigravity' ? 'antigravity' : 'vscode';
    this.extClients.set(m.client || (source + ':' + (m.workspace || '')), {
      at: Date.now(), source, workspace: m.workspace || '', appName: m.appName || '', focused: !!m.focused,
      focusedAt: m.focused ? Date.now() : ((this.extClients.get(m.client) || {}).focusedAt || 0), client: m.client
    });
    for (const s of m.sessions || []) {
      if (!s || !s.id) continue;
      const key = source + ':' + s.id;
      this.ext.set(key, { at: Date.now(), client: m.client });
      this.update(key, {
        ...s, source, sourceLabel: source === 'antigravity' ? 'Antigravity IDE' : (m.appName || 'VS Code'),
        workspace: s.workspace || m.workspace || '', viaExtension: true, client: m.client
      });
    }
    this.emit();
  }

  // Choose the editor window to act on: explicit client, same workspace, else most recently focused.
  pickClient(source, workspace, clientId) {
    const live = [...this.extClients.values()].filter((c) => c.source === source && Date.now() - c.at < 60000);
    if (clientId) { const c = live.find((x) => x.client === clientId); if (c) return c; }
    if (workspace) { const c = live.find((x) => x.workspace === workspace); if (c) return c; }
    return live.sort((a, b) => (b.focusedAt - a.focusedAt) || (b.at - a.at))[0] || null;
  }

  longPoll(client, source, res) {
    if (!this.queues) this.queues = new Map();
    const q = this.queues.get(client) || [];
    const c = this.extClients.get(client);
    if (c) c.at = Date.now();
    if (q.length) { this.queues.set(client, []); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ commands: q })); }
    if (!this.pollers) this.pollers = new Map();
    const done = (cmds) => { clearTimeout(t); this.pollers.delete(client); try { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ commands: cmds })); } catch {} };
    const t = setTimeout(() => done([]), 25000);
    this.pollers.set(client, done);
    res.on('close', () => { clearTimeout(t); if (this.pollers.get(client) === done) this.pollers.delete(client); });
  }

  sendToClient(client, cmd) {
    if (!this.waiters) this.waiters = new Map();
    cmd.id = crypto.randomBytes(6).toString('hex');
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.waiters.delete(cmd.id); resolve({ ok: false, timeout: true }); }, 10000);
      this.waiters.set(cmd.id, (r) => { clearTimeout(t); resolve(r); });
      const poller = this.pollers && this.pollers.get(client);
      if (poller) poller([cmd]);
      else { if (!this.queues) this.queues = new Map(); this.queues.set(client, [...(this.queues.get(client) || []), cmd]); }
    });
  }

  // Answer / approve / reply from the island.
  async act(key, a) {
    const s = this.sessions.get(key);
    if (!s) return { error: 'session not found' };
    const L = (id, en) => this.ctx.i18n.L(id, en);
    if (s.source === 'vscode' || (s.source === 'antigravity' && s.product === 'ide')) {
      const c = this.pickClient(s.source, s.workspace, s.client);
      if (!c) {
        if (a.type === 'open') return this.ctx.focusApp(s.source === 'vscode' ? 'code.exe' : 'antigravity ide.exe', s.workspace);
        return { error: L('Ekstensi RA Agent Bridge belum tersambung di editor ini. Pasang dari Pengaturan → Agen AI.', 'RA Agent Bridge is not connected in this editor. Install it from Settings → AI Agents.') };
      }
      if (a.type === 'open') this.ctx.focusApp(s.source === 'vscode' ? 'code.exe' : 'antigravity ide.exe', c.workspace);
      const r = await this.sendToClient(c.client, { type: a.type, value: a.value, sessionId: s.id });
      if (!r.ok && a.type !== 'open') return { error: r.timeout ? L('Editor tidak merespons.', 'The editor did not respond.') : L('Perintah tidak tersedia di versi editor ini.', 'Command not available in this editor version.') };
      return { ok: true };
    }
    if (s.source === 'antigravity') {
      if (a.type === 'open') return this.ctx.focusApp('antigravity.exe', '');
      return { error: L('Aplikasi Antigravity (non-IDE) belum bisa dijawab dari luar. Gunakan Buka.', 'The Antigravity agent app cannot be answered externally yet. Use Open.') };
    }
    if (s.source === 'copilot') {
      if (a.type === 'open') return this.ctx.focusApp('github.exe', '');
      // Copilot app has no public API: drive its UI via UI Automation (experimental).
      const r = await this.ctx.uia({ exe: 'github.exe', action: a.type, value: a.value || '' });
      if (!r || !r.ok) return { error: (r && r.error) || L('Tombol tidak ditemukan. Buka sesi tersebut di aplikasi Copilot lalu coba lagi.', 'Button not found. Open that session in the Copilot app and try again.') };
      return { ok: true };
    }
    return { error: 'unsupported' };
  }

  extensionStatus() {
    const out = { vscode: false, antigravity: false };
    for (const c of this.extClients.values()) if (Date.now() - c.at < 90000) out[c.source] = true;
    return out;
  }

  // ---------------------------------------------------- state
  update(key, s) {
    this.sessions.set(key, { key, ...s });
    const prev = this.prevStatus.get(key);
    if (prev && prev !== s.status) {
      if ((prev === 'busy' || prev === 'waiting') && s.status === 'done') this.ctx.bus.emit('agent:done', { key, ...s });
      if (s.status === 'waiting') this.ctx.bus.emit('agent:waiting', { key, ...s });
    }
    this.prevStatus.set(key, s.status);
    this.emit();
  }

  reevaluate() {
    let any = false;
    for (const [file, e] of this.logs) {
      const s = this.sessions.get(e.key);
      if (s && (s.status === 'busy' || s.status === 'waiting')) {
        any = true;
        if (e.key.startsWith('copilot:')) this.readCopilot(e.key.slice(8), file);
        else this.readVSCode(file);
      }
    }
    for (const s of this.sessions.values()) {
      if (s.source === 'antigravity' && (s.status === 'busy' || s.status === 'waiting')) { any = true; this.readAntigravity(s.product, s.id); }
    }
    if (any) this.emit();
  }

  list() {
    const now = Date.now();
    const order = { waiting: 0, busy: 1, error: 2, done: 3, idle: 4 };
    const ext = this.extensionStatus();
    return [...this.sessions.values()]
      .filter((s) => s.status === 'busy' || s.status === 'waiting' || now - (s.endedAt || s.updatedAt || 0) < SHOW_DONE_MS)
      .sort((a, b) => (order[a.status] - order[b.status]) || (b.updatedAt - a.updatedAt))
      .slice(0, 12)
      .map((s) => {
        let actions = {};
        if (s.source === 'vscode') actions = { approve: s.status === 'waiting', reply: ext.vscode };
        else if (s.source === 'antigravity' && s.product === 'ide') actions = { approve: s.status === 'waiting' && ext.antigravity, reply: ext.antigravity };
        else if (s.source === 'copilot') actions = { approve: s.status === 'waiting' && !s.choices, reply: s.status === 'waiting' && !s.permission };
        const { client, ...rest } = s;
        return { ...rest, actions };
      });
  }

  emit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.ctx.state('agents', { list: this.list(), ext: this.extensionStatus() });
    }, 150);
  }
}

module.exports = { Agents };

// RA Agent Bridge — plain JS, works in VS Code and VS Code forks (Antigravity IDE).
// Talks only to 127.0.0.1 using the token RA Assistant writes to %APPDATA%\RAAssistant\bridge.json.
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const P = require('./parsers.js');

const BRIDGE_FILE = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'RAAssistant', 'bridge.json');
const CLIENT_ID = crypto.randomBytes(6).toString('hex');
let bridge = null;
let out = null;
let disposed = false;
const logs = new Map(); // file -> { log, offset }
let sendTimer = null;
let lastOk = 0;

function isAntigravity() { return /antigravity/i.test(vscode.env.appName || ''); }
function source() { return isAntigravity() ? 'antigravity' : 'vscode'; }
function log(m) { if (out) out.appendLine(new Date().toISOString().slice(11, 19) + ' ' + m); }

function readBridge() {
  try { bridge = JSON.parse(fs.readFileSync(BRIDGE_FILE, 'utf8')); } catch { bridge = null; }
  return bridge;
}

function request(method, url, body, timeout = 4000) {
  return new Promise((resolve) => {
    if (!bridge && !readBridge()) return resolve(null);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      host: '127.0.0.1', port: bridge.port, path: url, method, timeout,
      headers: { 'x-ra-token': bridge.token, 'content-type': 'application/json', ...(data ? { 'content-length': data.length } : {}) }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        if (res.statusCode === 401) { readBridge(); return resolve(null); }
        lastOk = Date.now();
        try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); }
      });
    });
    req.on('error', () => { readBridge(); resolve(null); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    if (data) req.write(data);
    req.end();
  });
}

// ------------------------------------------------------------- VS Code chat session files
function chatDirs(ctx) {
  const dirs = [];
  if (ctx.storageUri) dirs.push(path.join(path.dirname(ctx.storageUri.fsPath), 'chatSessions'));
  if (ctx.globalStorageUri) dirs.push(path.join(path.dirname(ctx.globalStorageUri.fsPath), 'emptyWindowChatSessions'));
  return dirs;
}

function readFile(file) {
  let e = logs.get(file);
  if (!e) { e = { log: new P.VSCodeChatLog(), offset: 0 }; logs.set(file, e); }
  try {
    const st = fs.statSync(file);
    if (st.size < e.offset) { e.log = new P.VSCodeChatLog(); e.offset = 0; }
    if (st.size > e.offset) {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(st.size - e.offset);
      fs.readSync(fd, buf, 0, buf.length, e.offset);
      fs.closeSync(fd);
      e.log.feed(buf.toString('utf8'));
      e.offset = st.size;
    }
    e.mtime = st.mtimeMs;
  } catch { logs.delete(file); }
}

function sessions() {
  const list = [];
  for (const [file, e] of logs) {
    if (Date.now() - (e.mtime || 0) > 6 * 3600 * 1000) continue;
    const s = P.summarizeVSCode(e.log.root, e.mtime);
    if (!s) continue;
    list.push({ id: path.basename(file, '.jsonl'), ...s, actions: { approve: s.status === 'waiting', reply: true } });
  }
  return list;
}

function scheduleSend() {
  clearTimeout(sendTimer);
  sendTimer = setTimeout(send, 400);
}

async function send() {
  if (disposed) return;
  const body = {
    source: source(), appName: vscode.env.appName, client: CLIENT_ID,
    workspace: vscode.workspace.name || '', focused: vscode.window.state.focused,
    capabilities: { approve: true, reply: true },
    sessions: source() === 'vscode' ? sessions() : []
  };
  await request('POST', '/v1/agents', body);
}

function watchChats(ctx) {
  for (const dir of chatDirs(ctx)) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) {
        const full = path.join(dir, f);
        if (Date.now() - fs.statSync(full).mtimeMs < 6 * 3600 * 1000) readFile(full);
      }
      const w = fs.watch(dir, (ev, name) => {
        if (!name || !name.endsWith('.jsonl')) return;
        readFile(path.join(dir, name));
        scheduleSend();
      });
      ctx.subscriptions.push({ dispose: () => w.close() });
    } catch (e) { log('watch failed ' + e.message); }
  }
}

// ------------------------------------------------------------- actions from the island
async function tryCommands(list) {
  for (const [cmd, ...args] of list) {
    try { await vscode.commands.executeCommand(cmd, ...args); log('ran ' + cmd); return cmd; } catch (e) { log('fail ' + cmd + ': ' + e.message); }
  }
  return null;
}

async function runAction(a) {
  const ag = isAntigravity();
  switch (a.type) {
    case 'allow':
      return ag
        ? tryCommands([['antigravity.command.accept'], ['antigravity.terminalCommand.accept'], ['antigravity.terminalCommand.run']])
        : tryCommands([['workbench.action.chat.acceptTool'], ['workbench.action.chat.acceptElicitation'], ['workbench.action.chat.acceptToolPostExecution']]);
    case 'deny':
      return ag
        ? tryCommands([['antigravity.command.reject'], ['antigravity.terminalCommand.reject']])
        : tryCommands([['workbench.action.chat.skipTool'], ['workbench.action.chat.skipToolPostExecution']]);
    case 'choice':
    case 'reply': {
      const text = String(a.value || '').slice(0, 4000);
      if (!text) return null;
      return ag
        ? tryCommands([['antigravity.sendPromptToAgentPanel', text], ['antigravity.sendPromptToAgentPanel', { prompt: text }]])
        : tryCommands([['workbench.action.chat.open', { query: text, isPartialQuery: false }]]);
    }
    case 'open':
      return ag ? tryCommands([['antigravity.openAgent'], ['workbench.action.chat.open']]) : tryCommands([['workbench.action.chat.open']]);
    default: return null;
  }
}

// Long-poll RA for actions addressed to this window.
async function pollLoop() {
  while (!disposed) {
    const r = await request('GET', `/v1/commands?client=${CLIENT_ID}&source=${source()}`, null, 30000);
    if (!r) { await new Promise((res) => setTimeout(res, 5000)); continue; }
    for (const a of r.commands || []) {
      const ran = await runAction(a);
      await request('POST', '/v1/result', { id: a.id, client: CLIENT_ID, ok: !!ran, command: ran });
    }
  }
}

function activate(ctx) {
  out = vscode.window.createOutputChannel('RA Agent Bridge');
  ctx.subscriptions.push(out);
  readBridge();
  log(`active in ${vscode.env.appName} (${source()}), workspace=${vscode.workspace.name || '-'}`);
  if (source() === 'vscode') watchChats(ctx);
  send();
  const hb = setInterval(send, 20000);
  ctx.subscriptions.push({ dispose: () => clearInterval(hb) });
  ctx.subscriptions.push(vscode.window.onDidChangeWindowState(() => scheduleSend()));
  ctx.subscriptions.push(vscode.commands.registerCommand('raBridge.status', () => {
    const ok = Date.now() - lastOk < 60000;
    vscode.window.showInformationMessage(ok ? 'RA Agent Bridge: connected to RA Assistant.' : 'RA Agent Bridge: RA Assistant is not running (bridge.json not found or not reachable).');
    out.show(true);
  }));
  pollLoop();
}

function deactivate() { disposed = true; }

module.exports = { activate, deactivate };

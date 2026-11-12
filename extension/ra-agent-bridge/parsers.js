// Agent activity parsers shared by RA Assistant (main process) and the editor bridge extension.
// Plain CommonJS, no dependencies.
'use strict';

const STALE_MS = 15 * 60 * 1000;

function clip(s, n) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// "[](file:///c%3A/x/y.md)" -> "y.md"
function cleanMarkdown(v) {
  if (!v) return '';
  return String(v)
    .replace(/\[([^\]]*)\]\(([^)]+)\)/g, (m, t, u) => t || decodeURIComponent(u).split(/[\\/]/).pop())
    .replace(/[`*_#>]/g, '');
}

// ---------------------------------------------------------------- VS Code chat sessions
// chatSessions/<id>.jsonl is an append-only op log: kind 0 = snapshot, 1 = set at path k,
// 2 = push items v onto array at path k (optionally truncating at i), 3 = delete at path k.
class VSCodeChatLog {
  constructor() { this.root = {}; this.offset = 0; this.rest = ''; }
  applyLine(line) {
    let o;
    try { o = JSON.parse(line); } catch { return; }
    if (o.kind === 0) { this.root = o.v || {}; return; }
    const k = o.k || [];
    if (!k.length) return;
    let p = this.root;
    for (let i = 0; i < k.length - 1; i++) {
      if (p[k[i]] == null || typeof p[k[i]] !== 'object') p[k[i]] = typeof k[i + 1] === 'number' ? [] : {};
      p = p[k[i]];
    }
    const last = k[k.length - 1];
    if (o.kind === 1) p[last] = o.v;
    else if (o.kind === 2) {
      if (!Array.isArray(p[last])) p[last] = [];
      if (typeof o.i === 'number') p[last].length = Math.min(p[last].length, o.i);
      if (Array.isArray(o.v)) for (const it of o.v) p[last].push(it);
    } else if (o.kind === 3) {
      if (Array.isArray(p)) p.splice(last, 1); else delete p[last];
    }
  }
  // Feed newly appended text.
  feed(text) {
    const data = this.rest + text;
    const lines = data.split('\n');
    this.rest = lines.pop();
    for (const l of lines) if (l.trim()) this.applyLine(l);
    this.prune();
  }
  // Drop response bodies of old requests to keep memory small.
  prune() {
    const reqs = this.root.requests;
    if (!Array.isArray(reqs)) return;
    for (let i = 0; i < reqs.length - 2; i++) if (reqs[i] && reqs[i].response && reqs[i].response.length) reqs[i].response = [];
  }
}

function summarizeVSCode(root, mtimeMs) {
  const reqs = Array.isArray(root.requests) ? root.requests : [];
  const r = reqs[reqs.length - 1];
  if (!r) return null;
  const items = Array.isArray(r.response) ? r.response : [];
  const ms = r.modelState && typeof r.modelState.value === 'number' ? r.modelState.value : (r.result ? 1 : 0);
  let status = ms === 0 ? 'busy' : ms === 1 ? 'done' : ms === 3 ? 'error' : ms === 4 ? 'waiting' : 'idle';
  let step = '';
  let lastMessage = '';
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i] || {};
    if (!step) {
      if (it.kind === 'thinking' && i === items.length - 1) step = '__thinking';
      else if (it.invocationMessage) step = cleanMarkdown(it.invocationMessage.value || it.invocationMessage);
      else if (it.kind === 'progressMessage' && it.content) step = cleanMarkdown(it.content.value);
    }
    if (!lastMessage && it.kind === 'markdownContent' && it.content) lastMessage = cleanMarkdown(it.content.value);
    if (!lastMessage && !it.kind && it.value && typeof it.value === 'string') lastMessage = cleanMarkdown(it.value);
    if (status === 'busy' && i === items.length - 1) {
      const needsConfirm = (it.kind === 'toolInvocation' && it.isConfirmed === undefined && it.confirmationMessages) ||
        it.kind === 'confirmation' || it.kind === 'elicitation' || it.kind === 'questionCarousel';
      if (needsConfirm) status = 'waiting';
    }
    if (step && lastMessage) break;
  }
  // Collect the trailing streamed markdown text as the "last message".
  if (!lastMessage) {
    const md = items.filter((x) => x && (x.kind === 'markdownContent' || (!x.kind && typeof x.value === 'string')));
    lastMessage = cleanMarkdown(md.map((x) => (x.content ? x.content.value : x.value)).join('').slice(-400));
  }
  if (status === 'busy' && mtimeMs && Date.now() - mtimeMs > STALE_MS) status = 'idle';
  const firstMsg = reqs[0] && reqs[0].message ? reqs[0].message.text : '';
  return {
    title: clip(root.customTitle || firstMsg || 'Chat', 70),
    prompt: clip(r.message && r.message.text, 140),
    status,
    step: step === '__thinking' ? '__thinking' : clip(step, 120),
    lastMessage: clip(lastMessage, 180),
    startedAt: r.timestamp || 0,
    endedAt: r.modelState && r.modelState.completedAt ? r.modelState.completedAt : 0,
    updatedAt: mtimeMs || Date.now()
  };
}

// ---------------------------------------------------------------- Copilot CLI / Copilot app
// ~/.copilot/session-state/<id>/events.jsonl, one event per line.
class CopilotLog {
  constructor() {
    this.offset = 0; this.rest = '';
    this.s = { status: 'idle', step: '', lastMessage: '', prompt: '', startedAt: 0, endedAt: 0, tools: {}, pending: {}, lastHadTools: false };
  }
  feed(text) {
    const data = this.rest + text;
    const lines = data.split('\n');
    this.rest = lines.pop();
    for (const l of lines) {
      if (!l.trim()) continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      this.apply(o);
    }
  }
  apply(o) {
    const s = this.s; const d = o.data || {};
    const ts = Date.parse(o.timestamp) || Date.now();
    switch (o.type) {
      case 'user.message':
        s.prompt = clip(d.content, 140); s.status = 'busy'; s.startedAt = ts; s.endedAt = 0; s.step = '__thinking';
        s.tools = {}; s.pending = {};
        break;
      case 'assistant.turn_start':
        if (s.status !== 'waiting') s.status = 'busy';
        if (!s.startedAt || s.endedAt) { s.startedAt = ts; s.endedAt = 0; }
        s.step = '__thinking';
        break;
      case 'assistant.message': {
        const reqs = d.toolRequests || [];
        s.lastHadTools = reqs.length > 0;
        if (d.content) s.lastMessage = clip(cleanMarkdown(d.content), 180);
        break;
      }
      case 'tool.execution_start': {
        const a = d.arguments || {};
        let label = a.description || a.intent || '';
        if (!label) {
          if (d.toolName === 'ask_user') label = a.question || 'ask_user';
          else if (a.path) label = d.toolName + ' ' + String(a.path).split(/[\\/]/).pop();
          else if (a.pattern) label = d.toolName + ' ' + a.pattern;
          else label = d.toolName;
        }
        s.tools[d.toolCallId] = label;
        s.step = clip(label, 120);
        if (d.toolName === 'ask_user') {
          s.status = 'waiting'; s.question = clip(a.question, 160);
          s.choices = Array.isArray(a.choices) ? a.choices.map((c) => String(c)).slice(0, 6) : null;
          s.askId = d.toolCallId;
        }
        break;
      }
      case 'tool.execution_complete':
        delete s.tools[d.toolCallId];
        if (d.toolCallId === s.askId) { s.choices = null; s.askId = null; }
        if (s.status === 'waiting' && !Object.keys(s.pending).length) s.status = 'busy';
        break;
      case 'permission.requested': {
        const pr = d.permissionRequest || {};
        s.pending[d.requestId] = 1;
        s.status = 'waiting';
        s.question = clip(pr.intention || pr.fullCommandText || pr.kind || 'permission', 160);
        break;
      }
      case 'permission.completed':
        delete s.pending[d.requestId];
        if (!Object.keys(s.pending).length && s.status === 'waiting') s.status = 'busy';
        break;
      case 'assistant.turn_end':
        if (!s.lastHadTools && !Object.keys(s.pending).length) { s.status = 'done'; s.endedAt = ts; s.step = ''; }
        break;
      case 'session.task_complete':
        s.status = 'done'; s.endedAt = ts; s.step = '';
        if (d.summary) s.lastMessage = clip(cleanMarkdown(d.summary), 180);
        break;
      case 'abort':
        s.status = 'idle'; s.endedAt = ts; s.step = ''; s.pending = {};
        break;
      case 'session.error':
        s.status = 'error'; s.endedAt = ts; s.step = clip(d.message || d.errorType || 'error', 120);
        break;
      case 'session.shutdown':
        if (s.status === 'busy' || s.status === 'waiting') s.status = 'idle';
        s.endedAt = s.endedAt || ts; s.pending = {};
        break;
      default: break;
    }
    s.updatedAt = ts;
  }
  summary(mtimeMs) {
    const s = this.s;
    let status = s.status;
    if ((status === 'busy') && mtimeMs && Date.now() - mtimeMs > STALE_MS) status = 'idle';
    return {
      prompt: s.prompt, status, step: s.step, lastMessage: s.lastMessage, question: status === 'waiting' ? s.question : '',
      choices: status === 'waiting' ? s.choices || null : null, permission: status === 'waiting' && Object.keys(s.pending).length > 0,
      startedAt: s.startedAt, endedAt: s.endedAt, updatedAt: mtimeMs || s.updatedAt
    };
  }
}

// ---------------------------------------------------------------- Antigravity
// ~/.gemini/antigravity/conversations/<cascade>.db (SQLite). Payloads are protobuf, but tool calls
// embed JSON with "toolAction"/"toolSummary" fields that we can read as text.
const AG_TYPES = { USER: 14, PLANNER: 15, TASK: 23, ASK: 138 };
function printable(buf) {
  if (!buf) return '';
  return Buffer.from(buf).toString('utf8').replace(/[^\x20-\x7e\u00a0-\uffff\n]+/g, ' | ');
}
function agJsonField(text, field) {
  const re = new RegExp('"' + field + '":"((?:[^"\\\\]|\\\\.)*)"', 'g');
  let m, last = '';
  while ((m = re.exec(text))) last = m[1];
  try { return last ? JSON.parse('"' + last + '"') : ''; } catch { return last; }
}
function longestChunk(text) {
  return text.split(' | ').map((x) => x.trim())
    .filter((x) => x.length > 3 && !/^[\w-]{30,}$/.test(x) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(x) && !/[A-Za-z]:[\\/]|\.gemini|PNG|JFIF/.test(x))
    .filter((x) => (x.match(/[A-Za-z\u00c0-\uffff ]/g) || []).length / x.length > 0.7)
    .sort((a, b) => b.length - a.length)[0] || '';
}
function summarizeAntigravity(DatabaseSync, dbPath, mtimeMs) {
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare('select idx, step_type, status, permissions is not null as perm, step_payload from steps order by idx desc limit 40').all();
    if (!rows.length) return null;
    let title = '', prompt = '', step = '', lastMessage = '', status = 'done', startedAt = 0;
    const last = rows[0];
    const running = rows.slice(0, 4).some((r) => r.status === 1 || r.status === 2);
    for (const r of rows) {
      const txt = printable(r.step_payload);
      if (!step && r.step_type !== AG_TYPES.USER && r.step_type !== AG_TYPES.PLANNER) {
        step = agJsonField(txt, 'toolSummary') || agJsonField(txt, 'toolAction');
      }
      if (!title && r.step_type === AG_TYPES.TASK) title = agJsonField(txt, 'TaskName') || longestChunk(txt);
      if (!lastMessage && r.step_type === AG_TYPES.PLANNER) {
        const bold = txt.match(/\*\*([^*]{4,120})\*\*/);
        lastMessage = bold ? bold[1] : '';
      }
      if (!prompt && r.step_type === AG_TYPES.USER) { prompt = longestChunk(txt); startedAt = startedAt || 0; }
      if (title && step && lastMessage && prompt) break;
    }
    const waiting = rows.slice(0, 3).some((r) => (r.step_type === AG_TYPES.ASK || r.perm) && r.status !== 3 && r.status !== 6 && r.status !== 7);
    const fresh = mtimeMs && Date.now() - mtimeMs < 8000;
    if (waiting) status = 'waiting';
    else if (running || (fresh && !(last.step_type === AG_TYPES.PLANNER && last.status === 3))) status = 'busy';
    else if (last.status === 6) status = 'error';
    if ((status === 'busy') && mtimeMs && Date.now() - mtimeMs > STALE_MS) status = 'idle';
    return {
      title: clip(title || prompt || 'Antigravity', 70), prompt: clip(prompt, 140), status,
      step: clip(step, 120), lastMessage: clip(lastMessage, 180), startedAt, endedAt: status === 'done' ? mtimeMs : 0,
      updatedAt: mtimeMs || Date.now()
    };
  } catch (e) {
    return null;
  } finally {
    try { db && db.close(); } catch {}
  }
}

module.exports = { VSCodeChatLog, summarizeVSCode, CopilotLog, summarizeAntigravity, cleanMarkdown, clip };

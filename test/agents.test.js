const test = require('node:test');
const assert = require('node:assert');
const { CopilotLog } = require('../extension/ra-agent-bridge/parsers.js');

const ev = (type, data, t = '2026-11-15T09:00:00Z') => JSON.stringify({ type, timestamp: t, data }) + '\n';

test('Copilot session: ask_user -> waiting with choices, answered -> busy', () => {
  const l = new CopilotLog();
  l.feed(ev('user.message', { content: 'Bangun fitur' }) + ev('assistant.turn_start', {}));
  assert.strictEqual(l.summary(Date.now()).status, 'busy');
  l.feed(ev('tool.execution_start', { toolCallId: 'a', toolName: 'ask_user', arguments: { question: 'Database mana?', choices: ['PostgreSQL', 'SQLite'] } }));
  let s = l.summary(Date.now());
  assert.strictEqual(s.status, 'waiting');
  assert.strictEqual(s.question, 'Database mana?');
  assert.deepStrictEqual(s.choices, ['PostgreSQL', 'SQLite']);
  l.feed(ev('tool.execution_complete', { toolCallId: 'a' }));
  s = l.summary(Date.now());
  assert.strictEqual(s.status, 'busy');
  assert.strictEqual(s.choices, null);
});

test('Copilot session: permission request waits, partial lines are buffered', () => {
  const l = new CopilotLog();
  const line = ev('permission.requested', { requestId: 'p', permissionRequest: { intention: 'Run npm test' } });
  l.feed(ev('user.message', { content: 'x' }) + line.slice(0, 20));
  assert.notStrictEqual(l.summary(Date.now()).status, 'waiting');
  l.feed(line.slice(20));
  const s = l.summary(Date.now());
  assert.strictEqual(s.status, 'waiting');
  assert.ok(s.permission);
  assert.strictEqual(s.question, 'Run npm test');
});

test('Copilot session: malformed lines are ignored', () => {
  const l = new CopilotLog();
  assert.doesNotThrow(() => l.feed('{not json}\n\n' + ev('user.message', { content: 'ok' })));
  assert.strictEqual(l.summary(Date.now()).prompt, 'ok');
});

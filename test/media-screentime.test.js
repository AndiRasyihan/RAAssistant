const test = require('node:test');
const assert = require('node:assert');
const { parseLrc, clean, queries } = require('../app/main/features/media.js');
const ST = require('../app/main/features/screentime.js');

test('LRC parsing: sorted, multi-timestamp lines, metadata ignored', () => {
  const l = parseLrc('[ar:Raim Laode]\n[00:12.50]Satu\n[00:05.00][01:00.25]Ulang\n[00:20]Dua\nno tag');
  assert.deepStrictEqual(l.map((x) => [x.t, x.text]), [[5, 'Ulang'], [12.5, 'Satu'], [20, 'Dua'], [60.25, 'Ulang']]);
});

test('YouTube titles are cleaned for lyric lookup', () => {
  assert.strictEqual(clean('Menari-nari Lirik Video'), 'Menari-nari');
  assert.strictEqual(clean('the cure (Official Music Video)'), 'the cure');
  assert.strictEqual(clean('Mengapa (Official Music Video) | 4K'), 'Mengapa');
  assert.strictEqual(clean('Kebutuhan Hati (Official Lyric Video)'), 'Kebutuhan Hati');
  assert.strictEqual(clean('Song ft. Someone'), 'Song');
});

test('lyric queries split "Artist - Title" and strip channel suffixes', () => {
  const q = queries({ title: 'Raim Laode - Menari-nari Lirik Video', artist: 'Raim Laode' });
  assert.ok(q.some((x) => x.a === 'Raim Laode' && x.t === 'Menari-nari'));
  assert.ok(q.some((x) => x.q && /Raim Laode Menari-nari/.test(x.q)), 'free-text fallback');
  const v = queries({ title: 'Olivia Rodrigo - the cure (Official Music Video)', artist: 'OliviaRodrigoVEVO' });
  assert.ok(v.some((x) => x.a === 'Olivia Rodrigo' && x.t === 'the cure'));
  const t = queries({ title: 'Song', artist: 'Band - Topic' });
  assert.strictEqual(t[0].a, 'Band');
});

test('screen time: split at midnight, apps only while active', () => {
  const all = {};
  const t0 = new Date(2026, 10, 15, 23, 50).getTime();
  ST.credit(all, t0, t0 + 20 * 60000, 'active', 'chrome.exe');
  ST.credit(all, t0 + 20 * 60000, t0 + 30 * 60000, 'locked', 'chrome.exe');
  const a = all['2026-11-15'], b = all['2026-11-16'];
  assert.strictEqual(a.active, 10 * 60000);
  assert.strictEqual(b.active, 10 * 60000);
  assert.strictEqual(b.locked, 10 * 60000);
  assert.strictEqual(b.apps['chrome.exe'], 10 * 60000, 'locked time is not app time');
  assert.strictEqual(b.first, new Date(2026, 10, 16, 0, 0).getTime());
});

test('screen time: first use ignores time spent locked/asleep', () => {
  const all = {};
  const d = (h, m) => new Date(2026, 10, 15, h, m).getTime();
  ST.credit(all, d(0, 0), d(6, 0), 'sleep', '');
  ST.credit(all, d(6, 0), d(6, 5), 'locked', '');
  ST.credit(all, d(6, 5), d(7, 0), 'active', 'code.exe');
  const s = ST.summarize(all, '2026-11-15');
  assert.strictEqual(s.first, d(6, 5));
  assert.strictEqual(s.sleep, 6 * 3600000);
  assert.deepStrictEqual(s.apps.map((x) => x.name), ['VS Code']);
});

test('screen time: apps with the same name merge and sort; old days pruned', () => {
  const all = {};
  const d = (m) => new Date(2026, 10, 15, 9, m).getTime();
  ST.credit(all, d(0), d(5), 'active', 'whatsapp.exe');
  ST.credit(all, d(5), d(15), 'active', 'chrome.exe');
  ST.credit(all, d(15), d(22), 'active', 'whatsapp.root.exe');
  const s = ST.summarize(all, '2026-11-15');
  assert.deepStrictEqual(s.apps.map((x) => [x.name, x.ms / 60000]), [['WhatsApp', 12], ['Chrome', 10]]);
  for (let i = 1; i <= 20; i++) all[`2026-10-${String(i).padStart(2, '0')}`] = { active: 1 };
  ST.prune(all, 14);
  assert.strictEqual(Object.keys(all).length, 14);
  assert.ok(all['2026-11-15'], 'newest day kept');
});

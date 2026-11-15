// Prayer times vs the official Kemenag RI schedule (bimasislam, via api.myquran.com), fetched 2026-11-15.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../app/shared/prayer.js');
const CITIES = require('../app/shared/cities.js');

const REF = {
  'Jakarta 2026-01-15': '04:17 04:27 05:45 06:14 12:05 15:30 18:18 19:33',
  'Jakarta 2026-04-15': '04:28 04:38 05:50 06:18 11:56 15:14 17:55 19:04',
  'Jakarta 2026-07-15': '04:35 04:45 06:02 06:30 12:02 15:23 17:56 19:09',
  'Jakarta 2026-11-15': '03:56 04:06 05:22 05:50 11:41 15:01 17:52 19:05',
  'Makassar 2026-01-15': '04:29 04:39 05:57 06:25 12:15 15:39 18:26 19:40',
  'Makassar 2026-04-15': '04:37 04:47 05:59 06:27 12:06 15:23 18:05 19:14',
  'Makassar 2026-07-15': '04:43 04:53 06:10 06:38 12:12 15:34 18:07 19:20',
  'Makassar 2026-11-15': '04:07 04:17 05:33 06:02 11:50 15:11 18:01 19:13'
};
const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const local = (d, tz) => mins(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d));

for (const [k, v] of Object.entries(REF)) {
  test(`Kemenag ${k} within 1 minute`, () => {
    const [city, date] = k.split(' ');
    const [y, m, d] = date.split('-').map(Number);
    const loc = CITIES.find((c) => c.name === city);
    const t = P.compute(loc, y, m, d);
    const exp = v.split(' ').map(mins);
    P.ORDER.forEach((name, i) => {
      const diff = local(t[name], loc.tz) - exp[i];
      assert.ok(Math.abs(diff) <= 1, `${name}: ${diff} min off`);
      if (name === 'maghrib') assert.ok(diff >= 0, 'maghrib must never be earlier than Kemenag (iftar)');
    });
  });
}

test('times are ordered and imsak = subuh - 10 min', () => {
  for (const loc of CITIES.filter((_, i) => i % 7 === 0)) {
    const t = P.compute(loc, 2026, 3, 1);
    for (let i = 1; i < P.ORDER.length; i++) assert.ok(t[P.ORDER[i]] > t[P.ORDER[i - 1]], `${loc.name}: ${P.ORDER[i]} after ${P.ORDER[i - 1]}`);
    assert.strictEqual(t.subuh - t.imsak, 10 * 60000);
  }
});

test('every built-in city has a valid zone and coordinates', () => {
  for (const c of CITIES) {
    assert.ok(Math.abs(c.lat) <= 12 && c.lon > 94 && c.lon < 142, c.name);
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: c.tz }), c.name);
  }
});

test('Hijri date (Umm al-Qura) is available', () => {
  const h = P.hijri(new Date(Date.UTC(2026, 2, 20, 5)), 'Asia/Jakarta');
  assert.ok(h && h.m === 10 && h.d >= 1 && h.d <= 2, JSON.stringify(h)); // 1 Syawal 1447 ≈ 20 Mar 2026
});

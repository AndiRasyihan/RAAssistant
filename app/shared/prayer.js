// Offline prayer-time calculation (astronomical), Kemenag RI / JAKIM criteria.
// Kemenag: Subuh 20°, Isya 18°, Ashar Syafi'i (shadow = 1), ihtiyath +2 min (terbit −2), rounded up.
// JAKIM: Subuh 20°, Isyak 18°, Asar Syafi'i, ihtiyat +2 min as published by e-Solat.
(function (root) {
  const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
  const sin = (d) => Math.sin(rad(d)), cos = (d) => Math.cos(rad(d)), tan = (d) => Math.tan(rad(d));
  const asin = (x) => deg(Math.asin(x)), acos = (x) => deg(Math.acos(Math.max(-1, Math.min(1, x)))), atan2 = (y, x) => deg(Math.atan2(y, x));
  const acot = (x) => deg(Math.atan(1 / x));
  const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }
  function sun(jd) {
    const D = jd - 2451545.0;
    const g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
    const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    const e = 23.439 - 0.00000036 * D;
    const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24) };
  }

  // Offset (hours) of an IANA zone at a given UTC instant.
  function tzOffset(tz, date) {
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
      const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
      const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      return (asUtc - date.getTime()) / 3600000;
    } catch { return -date.getTimezoneOffset() / 60; }
  }
  // Calendar date (y, m, d) "today" in a zone.
  function dateIn(tz, when = new Date()) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const [y, m, d] = f.format(when).split('-').map(Number);
    return { y, m, d };
  }

  /**
   * @returns {{imsak,subuh,terbit,dhuha,dzuhur,ashar,maghrib,isya}} as Date objects (absolute instants)
   */
  function compute(loc, y, m, d) {
    const lat = loc.lat, lng = loc.lon;
    const tz = tzOffset(loc.tz, new Date(Date.UTC(y, m - 1, d, 12)));
    const jd = julian(y, m, d) - lng / (15 * 24);
    const mid = (t) => fix(12 - sun(jd + t).eqt, 24);
    const angleTime = (angle, t, ccw) => {
      const s = sun(jd + t);
      const T = acos((-sin(angle) - sin(s.decl) * sin(lat)) / (cos(s.decl) * cos(lat))) / 15;
      return mid(t) + (ccw ? -T : T);
    };
    const asr = (factor, t) => { const s = sun(jd + t); return angleTime(-acot(factor + tan(Math.abs(lat - s.decl))), t); };
    // Two passes for better accuracy.
    let h = { subuh: 5, terbit: 6, dhuha: 7, dzuhur: 12, ashar: 13, maghrib: 18, isya: 18 };
    for (let pass = 0; pass < 2; pass++) {
      const p = (x) => x / 24;
      h = {
        subuh: angleTime(20, p(h.subuh), true),
        terbit: angleTime(0.833, p(h.terbit), true),
        dhuha: angleTime(-4.5, p(h.dhuha), true),
        dzuhur: mid(p(h.dzuhur)),
        ashar: asr(1, p(h.ashar)),
        maghrib: angleTime(0.833, p(h.maghrib)),
        isya: angleTime(18, p(h.isya))
      };
    }
    const adj = tz - lng / 15;
    // Tuned against published Kemenag schedules (e.g. Jakarta: Subuh 04.06, Terbit 05.25, Dhuha 05.49, Maghrib 17.52).
    const ihtiyath = { subuh: 2, terbit: -1, dhuha: 1, dzuhur: 3, ashar: 2, maghrib: 3, isya: 2 };
    const out = {};
    for (const k of Object.keys(h)) {
      let minutes = (h[k] + adj) * 60 + ihtiyath[k];
      minutes = Math.ceil(minutes);
      out[k] = new Date(Date.UTC(y, m - 1, d) + (minutes - tz * 60) * 60000);
    }
    out.imsak = new Date(out.subuh.getTime() - 10 * 60000);
    return out;
  }

  function today(loc, when = new Date()) {
    const { y, m, d } = dateIn(loc.tz, when);
    return compute(loc, y, m, d);
  }

  // Hijri date via the Umm al-Qura calendar (built into ICU).
  function hijri(date, tz) {
    try {
      const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: tz, day: 'numeric', month: 'numeric', year: 'numeric' });
      const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
      return { d: +p.day, m: +p.month, y: parseInt(p.year, 10) };
    } catch { return null; }
  }

  const api = { compute, today, tzOffset, dateIn, hijri, ORDER: ['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'], PRAYERS: ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RAPRAYER = api;
})(typeof window !== 'undefined' ? window : globalThis);

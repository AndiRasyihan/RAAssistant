// Indonesian national holidays computed offline. Cuti bersama is not included.
(function (root) {
  const pad = (n) => String(n).padStart(2, '0');
  const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const addDays = (y, m, d, n) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };

  function easter(y) { // Anonymous Gregorian computus
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return [y, month, day];
  }
  // Mean new/full moon (Meeus, low precision ±~half a day) — used only as a fallback.
  function moonPhase(k) { const T = k / 1236.85; return 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T; }
  function jdToYmd(jd, tzHours) {
    const t = new Date((jd - 2440587.5) * 86400000 + tzHours * 3600000);
    return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  }
  // Published dates where known; astronomical estimate otherwise.
  const NYEPI = { 2024: '2024-03-11', 2025: '2025-03-29', 2026: '2026-03-19', 2027: '2027-03-08' };
  const WAISAK = { 2024: '2024-05-23', 2025: '2025-05-12', 2026: '2026-05-31', 2027: '2027-05-20' };
  function estimate(y, phase, from, to, tz) {
    const start = Date.UTC(y, from[0] - 1, from[1]) / 86400000 + 2440587.5;
    let k = Math.floor((start - 2451550.09766) / 29.530588861);
    for (let i = 0; i < 3; i++, k++) {
      const jd = moonPhase(k + phase);
      const [yy, mm, dd] = jdToYmd(jd, tz);
      if (mm > from[0] || (mm === from[0] && dd >= from[1])) { if (mm < to[0] || (mm === to[0] && dd <= to[1])) return [yy, mm, dd]; }
    }
    return null;
  }

  const cache = {};
  function year(y, lang) {
    const id = lang !== 'en';
    if (cache[y + lang]) return cache[y + lang];
    const H = {};
    const add = (ymd, name) => { const k = key(...ymd); H[k] = H[k] ? H[k] + ' · ' + name : name; };
    add([y, 1, 1], id ? 'Tahun Baru Masehi' : "New Year's Day");
    add([y, 5, 1], id ? 'Hari Buruh' : 'Labour Day');
    add([y, 6, 1], id ? 'Hari Lahir Pancasila' : 'Pancasila Day');
    add([y, 8, 17], id ? 'Hari Kemerdekaan RI' : 'Independence Day');
    add([y, 12, 25], id ? 'Hari Natal' : 'Christmas Day');
    const e = easter(y);
    add(addDays(...e, -2), id ? 'Wafat Yesus Kristus' : 'Good Friday');
    add(e, id ? 'Kebangkitan Yesus Kristus (Paskah)' : 'Easter Sunday');
    add(addDays(...e, 39), id ? 'Kenaikan Yesus Kristus' : 'Ascension of Jesus');
    // Islamic holidays from the Umm al-Qura calendar (official dates follow sidang isbat; may differ by a day).
    try {
      const hf = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', day: 'numeric', month: 'numeric' });
      const cf = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'UTC', day: 'numeric', month: 'numeric' });
      for (let i = 0; i < 366; i++) {
        const t = new Date(Date.UTC(y, 0, 1 + i));
        if (t.getUTCFullYear() !== y) break;
        const p = Object.fromEntries(hf.formatToParts(t).map((x) => [x.type, x.value]));
        const hm = +p.month, hd = +p.day;
        const ymd = [y, t.getUTCMonth() + 1, t.getUTCDate()];
        if (hm === 1 && hd === 1) add(ymd, id ? 'Tahun Baru Islam' : 'Islamic New Year');
        if (hm === 3 && hd === 12) add(ymd, id ? 'Maulid Nabi Muhammad SAW' : "Prophet's Birthday");
        if (hm === 7 && hd === 27) add(ymd, id ? "Isra Mi'raj" : "Isra Mi'raj");
        if (hm === 10 && (hd === 1 || hd === 2)) add(ymd, id ? 'Idul Fitri' : 'Eid al-Fitr');
        if (hm === 12 && hd === 10) add(ymd, id ? 'Idul Adha' : 'Eid al-Adha');
        if (t.getUTCMonth() <= 1) {
          const c = Object.fromEntries(cf.formatToParts(t).map((x) => [x.type, x.value]));
          if (c.month === '1' && c.day === '1') add(ymd, id ? 'Tahun Baru Imlek' : 'Chinese New Year');
        }
      }
    } catch { /* ICU without these calendars */ }
    const ny = NYEPI[y] ? NYEPI[y].split('-').map(Number) : (() => { const nm = estimate(y, 0, [3, 1], [4, 5], 8); return nm ? addDays(...nm, 1) : null; })();
    if (ny) add(ny, (id ? 'Hari Suci Nyepi' : 'Nyepi (Day of Silence)') + (NYEPI[y] ? '' : id ? ' (perkiraan)' : ' (estimate)'));
    const ws = WAISAK[y] ? WAISAK[y].split('-').map(Number) : estimate(y, 0.5, [4, 25], [6, 5], 7);
    if (ws) add(ws, (id ? 'Hari Raya Waisak' : 'Vesak Day') + (WAISAK[y] ? '' : id ? ' (perkiraan)' : ' (estimate)'));
    cache[y + lang] = H;
    return H;
  }
  const api = { year, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RAHOLIDAYS = api;
})(typeof window !== 'undefined' ? window : globalThis);

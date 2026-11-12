// Weather + "rain within the next hour" alert from Open-Meteo (only the city coordinates are sent).
const { net } = require('electron');

const WMO = {
  0: ['☀️', 'Cerah', 'Clear'], 1: ['🌤️', 'Cerah berawan', 'Mostly clear'], 2: ['⛅', 'Berawan sebagian', 'Partly cloudy'], 3: ['☁️', 'Berawan', 'Overcast'],
  45: ['🌫️', 'Berkabut', 'Fog'], 48: ['🌫️', 'Kabut beku', 'Rime fog'], 51: ['🌦️', 'Gerimis ringan', 'Light drizzle'], 53: ['🌦️', 'Gerimis', 'Drizzle'],
  55: ['🌧️', 'Gerimis lebat', 'Dense drizzle'], 61: ['🌦️', 'Hujan ringan', 'Light rain'], 63: ['🌧️', 'Hujan', 'Rain'], 65: ['🌧️', 'Hujan lebat', 'Heavy rain'],
  80: ['🌦️', 'Hujan lokal', 'Rain showers'], 81: ['🌧️', 'Hujan deras lokal', 'Heavy showers'], 82: ['⛈️', 'Hujan sangat lebat', 'Violent showers'],
  95: ['⛈️', 'Badai petir', 'Thunderstorm'], 96: ['⛈️', 'Badai petir + es', 'Thunderstorm, hail'], 99: ['⛈️', 'Badai petir + es', 'Thunderstorm, hail']
};

exports.init = (ctx) => {
  const S = () => ctx.settings();
  let raining = false, timer = null;

  async function update() {
    const T = S().today;
    if (!T.weather) { ctx.state('weather', null); return; }
    const { lat, lon } = T.location;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m&minutely_15=precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&forecast_minutely_15=8&timezone=auto`;
      const r = await net.fetch(url);
      const j = await r.json();
      const c = j.current || {};
      const w = WMO[c.weather_code] || WMO[3];
      const lang = S().lang;
      // Next hour = next four 15-minute slots.
      const now = Date.now();
      const slots = (j.minutely_15 && j.minutely_15.time || []).map((tm, i) => ({ at: Date.parse(tm + (j.utc_offset_seconds != null ? '' : '')), mm: j.minutely_15.precipitation[i] }));
      const soon = slots.filter((s) => s.mm >= 0.1).length > 0;
      const st = {
        temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), humidity: c.relative_humidity_2m,
        code: c.weather_code, emoji: w[0], desc: lang === 'en' ? w[2] : w[1], isDay: !!c.is_day,
        max: j.daily ? Math.round(j.daily.temperature_2m_max[0]) : null, min: j.daily ? Math.round(j.daily.temperature_2m_min[0]) : null,
        pop: j.daily ? j.daily.precipitation_probability_max[0] : null, rainSoon: soon, at: now
      };
      ctx.state('weather', st);
      if (T.rain && soon && !raining && (c.weather_code || 0) < 51) {
        ctx.toast({ title: ctx.i18n.t('today.rainSoon') + ' 🌧️', body: `${T.location.name} · ${st.temp}°C`, icon: 'cloud', urgent: true, ms: 10000 });
      }
      raining = soon;
    } catch { /* offline: keep last state */ }
  }
  timer = setInterval(update, 20 * 60000);
  setTimeout(update, 3000);
  ctx.bus.on('settings', (p) => { if (p.startsWith('today.location') || p === 'today.weather' || p === 'lang') update(); });
  ctx.bus.on('quit', () => clearInterval(timer));
};

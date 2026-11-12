// Health: drink-water reminders and eye breaks (Rara demonstrates the exercises in the island).
const { powerMonitor } = require('electron');

exports.init = (ctx) => {
  const S = () => ctx.settings();
  const t = ctx.i18n.t;
  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  let lastDrink = Date.now();
  let activeSinceEye = 0;
  let lastTick = Date.now();

  function drinkState() {
    const D = S().health.drink;
    const log = ctx.data.get('drink') || {};
    const count = log[dayKey()] || 0;
    ctx.state('drink', { count, glassMl: D.glassMl, targetMl: D.targetMl, target: Math.ceil(D.targetMl / D.glassMl), enabled: D.enabled, intervalMin: D.intervalMin, last: lastDrink });
  }
  ctx.handle('drink.add', (n = 1) => {
    const log = { ...(ctx.data.get('drink') || {}) };
    const k = dayKey();
    log[k] = Math.max(0, (log[k] || 0) + n);
    // keep two weeks of history
    for (const old of Object.keys(log).slice(0, -14)) delete log[old];
    ctx.data.set('drink', log);
    if (n > 0) lastDrink = Date.now();
    drinkState();
    return log[k];
  });

  const inHours = (start, end) => {
    const now = new Date(); const m = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number);
    return m >= sh * 60 + sm && m <= eh * 60 + em;
  };

  setInterval(() => {
    const H = S().health;
    const now = Date.now();
    const idle = powerMonitor.getSystemIdleTime();
    // Drink
    if (H.drink.enabled && inHours(H.drink.start, H.drink.end) && now - lastDrink >= H.drink.intervalMin * 60000 && idle < 300) {
      const st = ctx.getState('drink');
      if (!st || st.count < st.target) {
        lastDrink = now;
        ctx.toast({ kind: 'drink', title: t('drink.remind'), body: st ? `${st.count}/${st.target} ${t('drink.glass')}` : '', emoji: '💧', ms: 15000 });
      }
    }
    // Eye break: count only active (non-idle) time; skip during meetings and fullscreen apps.
    const dt = now - lastTick; lastTick = now;
    if (idle < 120) activeSinceEye += dt; else if (idle > 300) activeSinceEye = 0;
    const fullscreen = (ctx.getState('layout') || {}).mode === 'fullscreen';
    if (H.eye.enabled && activeSinceEye >= H.eye.intervalMin * 60000 && !(ctx.inMeeting && ctx.inMeeting()) && !fullscreen) {
      activeSinceEye = 0;
      ctx.state('eyeBreak', { at: now });
    }
  }, 30000);

  ctx.bus.on('settings', (p) => { if (p.startsWith('health')) drinkState(); });
  setTimeout(drinkState, 1000);
  setInterval(() => { const st = ctx.getState('drink'); if (st && st.day !== dayKey()) drinkState(); }, 10 * 60000);
};

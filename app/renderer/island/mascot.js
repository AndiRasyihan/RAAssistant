/* "Rara" — RA Assistant's mascot, drawn as expressive eyes only so it stays readable at notch size. */
(function () {
  const RA = window.RA;
  const RED = '#ef4444', GREEN = '#22c55e', PINK = '#f472b6';
  const L = [19, 14], R = [37, 14];

  // Shapes are drawn around (0,0) for one eye; s = -1 left eye, +1 right eye.
  const rectEye = (h = 11, w = 6.4) => `<rect class="ey bl" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}"/><circle class="hl" cx="1" cy="${-h / 2 + 2.6}" r="1"/>`;
  const SHAPES = {
    normal: () => rectEye(),
    blinkfast: () => rectEye().replace('ey bl', 'ey blf'),
    far: () => `<g transform="scale(.72)">${rectEye()}</g>`,
    happy: () => '<path class="ln" d="M-4.5 2.5 Q0 -5 4.5 2.5"/>',
    full: () => '<path class="ln" d="M-4.5 2.5 Q0 -5 4.5 2.5"/>',
    sleepy: () => '<rect class="ey" x="-3.6" y="-.2" width="7.2" height="3.6" rx="1.8"/><path class="ln" d="M-4.8 -1 L4.8 -1"/>',
    sleep: () => '<path class="ln" d="M-4.5 -1 Q0 4 4.5 -1"/>',
    dizzy: () => '<path class="ln spn" d="M0 0 m0 -1 a1 1 0 1 1 -1 1 a2 2 0 1 1 2 2 a3 3 0 1 1 -3 -3 a4.2 4.2 0 1 1 4.2 4.2"/>',
    angry: (s) => `${rectEye(9)}<path class="ln" d="${s < 0 ? 'M-5 -8.5 L4 -5.5' : 'M5 -8.5 L-4 -5.5'}"/>`,
    critical: () => '<path class="ln blx" d="M-3.6 -3.6 L3.6 3.6 M3.6 -3.6 L-3.6 3.6"/>',
    love: () => '<path class="ey pulse" d="M0 5 C-6.5 .5 -5 -6 0 -2.6 C5 -6 6.5 .5 0 5Z"/>',
    surprised: () => '<circle class="ln" r="5"/><circle class="ey" r="1.9"/>',
    wink: (s) => (s < 0 ? rectEye() : '<path class="ln" d="M-4.5 1 Q0 -3.5 4.5 1"/>'),
    focus: (s) => `<rect class="ey" x="-4" y="-2" width="8" height="4.6" rx="2.3"/><path class="ln" d="${s < 0 ? 'M-5 -6.5 L4 -5' : 'M5 -6.5 L-4 -5'}"/>`,
    thinking: () => `<g transform="translate(1.6 -2)">${rectEye(9)}</g>`,
    worried: (s) => `${rectEye(9)}<path class="ln" d="${s < 0 ? 'M-5 -6 L4 -9' : 'M5 -6 L-4 -9'}"/>`,
    sad: (s) => `<path class="ln" d="M-4.2 1.8 Q0 -2.2 4.2 1.8"/><path class="ln" d="${s < 0 ? 'M-5 -4 L4 -7' : 'M5 -4 L-4 -7'}"/>${s < 0 ? '<path class="tear" d="M-2 4.5 c1.1 1.7 1.6 2.6 1.6 3.3a1.6 1.6 0 0 1-3.2 0c0-.7.5-1.6 1.6-3.3z"/>' : ''}`,
    music: () => rectEye(),
    hot: (s) => `<path class="ln" d="${s < 0 ? 'M-4 -4 L3 0 L-4 4' : 'M4 -4 L-3 0 L4 4'}"/>`
  };
  const COLOR = { angry: RED, critical: RED, full: GREEN, love: PINK };
  const EXTRA = {
    sleepy: '<text class="zz" x="46" y="8" font-size="7" font-weight="700">z</text>',
    sleep: '<text class="zz" x="45" y="9" font-size="8" font-weight="700">z</text><text class="zz z2" x="50" y="5" font-size="6" font-weight="700">z</text>',
    thinking: '<g class="dots"><circle cx="46" cy="5" r="1.1"/><circle cx="49.5" cy="5" r="1.1"/><circle cx="53" cy="5" r="1.1"/></g>',
    worried: '<text class="qm" x="47" y="9" font-size="9" font-weight="800">?</text>',
    music: '<text class="note" x="47" y="10" font-size="9">♪</text>',
    hot: '<path class="sweat" d="M48 3c1.6 2.5 2.4 3.8 2.4 4.9a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.4 2.4-4.9z"/>',
    dizzy: '<g class="stars"><path d="M28 2l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z"/></g>',
    love: '', critical: ''
  };
  const ACC = {
    glasses: `<g class="acc" fill="none" stroke-width="1.6"><circle cx="${L[0]}" cy="${L[1]}" r="7.2"/><circle cx="${R[0]}" cy="${R[1]}" r="7.2"/><path d="M26.2 13h3.6"/></g>`,
    hat: '<g class="acc2"><path d="M18 6.5c1-6 19-6 20 0z"/><rect x="15" y="5.5" width="26" height="2.6" rx="1.3"/></g>',
    headphones: '<g><path class="acc" fill="none" stroke-width="2" d="M8 15a20 13 0 0 1 40 0"/><rect class="acc2" x="5" y="11" width="5" height="9" rx="2.4"/><rect class="acc2" x="46" y="11" width="5" height="9" rx="2.4"/></g>'
  };
  const BADGE = {
    camera: '<g transform="translate(46 18)"><rect width="8" height="6" rx="1.4" fill="#334155"/><circle cx="4" cy="3" r="1.6" fill="#22c55e"/></g>',
    mic: '<g transform="translate(48 16)"><rect width="3.6" height="6" rx="1.8" fill="#f59e0b"/><path d="M1.8 6v2.4" stroke="#94a3b8" stroke-width="1.2"/></g>',
    charger: '<g transform="translate(47 17)"><rect width="6" height="5" rx="1.2" fill="#e5e7eb"/><path d="M1.6 0v-2M4.4 0v-2" stroke="#e5e7eb" stroke-width="1.1"/><path d="M3 5v3" stroke="#94a3b8" stroke-width="1.3"/></g>'
  };

  // Names shown in Settings (id, en).
  RA.EXPRESSIONS = {
    normal: ['Biasa', 'Normal'], happy: ['Senang', 'Happy'], wink: ['Mengedip', 'Wink'], love: ['Suka', 'Love'],
    surprised: ['Kaget', 'Surprised'], thinking: ['Berpikir', 'Thinking'], worried: ['Bingung', 'Puzzled'], focus: ['Fokus', 'Focused'],
    music: ['Bergoyang', 'Grooving'], sleepy: ['Mengantuk', 'Sleepy'], sleep: ['Tidur', 'Asleep'], dizzy: ['Pusing', 'Dizzy'],
    hot: ['Kepanasan', 'Overheated'], sad: ['Sedih', 'Sad'], angry: ['Marah', 'Angry'], critical: ['Lemas', 'Drained'], full: ['Puas', 'Content']
  };

  const svg = (cls) => `<svg class="rae ${cls || ''}" viewBox="0 0 56 26" aria-hidden="true"></svg>`;
  RA.mascotHtml = (extra) => svg(extra);
  RA.mascot = { override: null, look: [0, 0], plugAt: 0, flashUntil: 0, flashExpr: null };
  RA.mascot.flash = (expr, ms = 1500) => { RA.mascot.flashExpr = expr; RA.mascot.flashUntil = Date.now() + ms; RA.applyMascot(); setTimeout(RA.applyMascot, ms + 30); };

  const OVERRIDE = { 'm-ex': 'normal', 'm-blinkfast': 'blinkfast', 'm-far': 'far' };
  function mood() {
    const S = RA.S, st = RA.st;
    if (!S) return { e: 'normal' };
    const m = S.mascot;
    if (RA.mascot.override) return { e: OVERRIDE[RA.mascot.override] || RA.mascot.override };
    if (Date.now() < RA.mascot.flashUntil && RA.mascot.flashExpr) return { e: RA.mascot.flashExpr };
    const b = st.battery;
    const h = new Date().getHours();
    let badge = null;
    if (m.holdItems) {
      if (st.privacy && st.privacy.cam) badge = 'camera';
      else if (st.privacy && st.privacy.mic) badge = 'mic';
      else if (b && !b.charging && b.level <= 0.2) badge = 'charger';
    }
    const agents = (st.agents && st.agents.list) || [];
    const playing = st.media && st.media.status === 4;
    let e = 'normal';
    if (m.battery && b && !b.charging && b.level <= 0.1) e = 'critical';
    else if (m.battery && b && !b.charging && b.level <= 0.2) e = 'angry';
    else if (m.reactions && Date.now() - RA.mascot.plugAt < 2500) e = 'wink';
    else if (agents.some((a) => a.status === 'waiting')) e = 'worried';
    else if (m.reactions && st.cpu && st.cpu.hot) e = 'hot';
    else if (st.online === false) e = 'sad';
    else if (RA.focusActive) e = 'focus';
    else if (m.reactions && playing) e = 'music';
    else if (agents.some((a) => a.status === 'busy')) e = 'thinking';
    else if (st.idle && st.idle.on) e = h >= 22 || h < 5 ? 'sleep' : 'sleepy';
    else if (m.reactions && (h >= 23 || h < 5)) e = 'sleepy';
    else if (m.battery && b && b.charging && b.level >= 0.99) e = 'full';
    return { e, badge };
  }

  function build(e, badge, acc) {
    const eye = (c, s) => `<g transform="translate(${c[0]} ${c[1]})">${(SHAPES[e] || SHAPES.normal)(s)}</g>`;
    return `${acc === 'headphones' ? ACC.headphones : ''}<g class="eyes-g ${e === 'music' ? 'bob' : ''}">${eye(L, -1)}${eye(R, 1)}</g>` +
      `${acc === 'glasses' ? ACC.glasses : ''}${acc === 'hat' ? ACC.hat : ''}${EXTRA[e] || ''}${badge ? BADGE[badge] : ''}`;
  }

  RA.applyMascot = () => {
    const { e, badge } = mood();
    const acc = RA.S ? RA.S.mascot.accessory : 'none';
    const key = e + '|' + badge + '|' + acc;
    const [lx, ly] = RA.mascot.look;
    for (const s of document.querySelectorAll('svg.rae')) {
      const fe = s.dataset.fixed;
      const k = fe ? fe + '||' + acc : key;
      if (s.dataset.k !== k) { s.innerHTML = fe ? build(fe, null, acc) : build(e, badge, acc); s.dataset.k = k; }
      s.style.setProperty('--ec', COLOR[fe || e] || (RA.S ? RA.S.mascot.eye : '#5eead4'));
      if (fe) continue;
      const g = s.querySelector('.eyes-g');
      if (g) g.setAttribute('transform', `translate(${lx} ${ly})`);
    }
  };

  // Eye motion: relaxed glances, or follow the cursor (main sends normalized cursor position).
  function glance() {
    if (RA.S && RA.S.mascot.eyeMotion === 'relaxed' && !RA.mascot.override) {
      const r = Math.random();
      RA.mascot.look = r < 0.5 ? [0, 0] : [(Math.random() * 2 - 1) * 2.2, (Math.random() * 2 - 1) * 1.4];
      RA.applyMascot();
    }
    setTimeout(glance, 3500 + Math.random() * 5500);
  }
  setTimeout(glance, 3000);
  RA.on('cursor', (c) => {
    if (!RA.S || RA.S.mascot.eyeMotion !== 'follow' || RA.mascot.override) return;
    // Island sits top-center; map cursor offset to a small eye translation.
    const dx = Math.max(-1, Math.min(1, (c.x - 0.5) * 3));
    const dy = Math.max(-1, Math.min(1, (c.y - 0.05) * 2));
    RA.mascot.look = [dx * 2.4, dy * 1.6];
    RA.applyMascot();
  });
  // Re-evaluate time/state-based moods now and then (cheap: only rebuilds when the expression changes).
  setInterval(() => RA.applyMascot(), 15000);
  for (const k of ['agents', 'online', 'idle', 'battery', 'media', 'cpu', 'privacy']) RA.on(k, () => RA.applyMascot && RA.applyMascot());
})();

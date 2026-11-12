/* "Rara" — RA Assistant's original mascot: a soft bean with a little sprout. */
(function () {
  const RA = window.RA;
  const svg = (cls) => `
<svg class="mascot ${cls || ''}" viewBox="0 0 64 64" aria-hidden="true">
  <g class="m-sprout"><path d="M32 13c0-4 2.5-7.5 7-8.5-1 4.5-3.5 7-7 8.5z"/><path d="M32 13c-.3-3.2-2.6-5.8-5.6-6.2.3 3.1 2.4 5.3 5.6 6.2z"/></g>
  <g class="m-acc acc-hat"><path d="M15 23c1-11 33-11 34 0z" fill="var(--accent)"/><circle cx="32" cy="10" r="3.2" fill="#fff"/><rect x="14" y="21" width="36" height="4" rx="2" fill="color-mix(in srgb, var(--accent) 70%, #000)"/></g>
  <path class="m-body" d="M32 13c12 0 21 8.5 21 20.5C53 46 44 54 32 54S11 46 11 33.5C11 21.5 20 13 32 13z"/>
  <g class="m-acc acc-headphones"><path d="M12 33a20 20 0 0 1 40 0" fill="none" stroke="#2b2440" stroke-width="3"/><rect x="7" y="29" width="7" height="12" rx="3" fill="var(--accent)"/><rect x="50" y="29" width="7" height="12" rx="3" fill="var(--accent)"/></g>
  <circle class="m-cheek" cx="19.5" cy="39" r="3.2"/><circle class="m-cheek" cx="44.5" cy="39" r="3.2"/>
  <g class="m-eyes">
    <rect class="m-eye" x="22.5" y="26" width="6" height="9.5" rx="3"/><rect class="m-eye" x="35.5" y="26" width="6" height="9.5" rx="3"/>
    <circle cx="27" cy="28.3" r="1.2" fill="#fff" opacity=".85"/><circle cx="40" cy="28.3" r="1.2" fill="#fff" opacity=".85"/>
  </g>
  <g class="m-acc acc-glasses" fill="none" stroke="#2b2440" stroke-width="1.6"><circle cx="25.5" cy="30.5" r="6"/><circle cx="38.5" cy="30.5" r="6"/><path d="M31.5 30h1"/></g>
  <g class="m-brow" stroke="#2b2440" stroke-width="2" stroke-linecap="round"><path d="M21 22.5l8 2.6"/><path d="M43 22.5l-8 2.6"/></g>
  <path class="m-mouth" d="M28.5 41q3.5 3 7 0"/>
  <text class="m-zz" x="47" y="16" font-size="9" font-weight="700" fill="var(--muted)">z</text>
  <path class="m-sweat" d="M51 21c1.5 2.5 2.5 3.8 2.5 5a2.5 2.5 0 0 1-5 0c0-1.2 1-2.5 2.5-5z" fill="#7dd3fc"/>
  <g class="m-hold hold-camera"><rect x="45" y="46" width="15" height="11" rx="2.5" fill="#334155"/><circle cx="52.5" cy="51.5" r="3.2" fill="#22c55e"/></g>
  <g class="m-hold hold-mic"><rect x="5" y="44" width="6" height="10" rx="3" fill="#f59e0b"/><path d="M8 54v4" stroke="#334155" stroke-width="2"/></g>
  <g class="m-hold hold-charger"><rect x="46" y="44" width="9" height="9" rx="2" fill="#e5e7eb"/><path d="M48.5 44v-3M52.5 44v-3" stroke="#e5e7eb" stroke-width="1.6"/><path d="M50.5 53v5" stroke="#94a3b8" stroke-width="2"/></g>
</svg>`;

  RA.mascotHtml = (extra) => svg(extra);
  RA.mascot = { override: null, look: [0, 0], plugAt: 0 };

  function moods() {
    const S = RA.S, st = RA.st, out = [];
    if (!S) return out;
    const m = S.mascot;
    out.push('acc-' + m.accessory);
    if (RA.mascot.override) { out.push(RA.mascot.override); return out; }
    const b = st.battery;
    const h = new Date().getHours();
    if (m.battery && b) {
      if (!b.charging && b.level <= 0.1) out.push('m-critical');
      else if (!b.charging && b.level <= 0.2) out.push('m-angry');
      else if (b.charging && b.level >= 0.99) out.push('m-full');
    }
    if (m.reactions) {
      if (Date.now() - RA.mascot.plugAt < 2500) out.push('m-plug');
      if (st.cpu && st.cpu.hot) out.push('m-hot');
      else if (st.media && st.media.status === 4) out.push('m-dance');
      else if (h >= 23 || h < 5) out.push('m-sleepy');
    }
    if (m.holdItems) {
      if (st.privacy && st.privacy.cam) out.push('hold-camera');
      else if (st.privacy && st.privacy.mic) out.push('hold-mic');
      else if (b && !b.charging && b.level <= 0.2) out.push('hold-charger');
    }
    return out;
  }

  RA.applyMascot = () => {
    const cls = moods();
    const [lx, ly] = RA.mascot.look;
    for (const s of document.querySelectorAll('svg.mascot')) {
      const big = s.classList.contains('big');
      s.setAttribute('class', 'mascot ' + (big ? 'big ' : '') + cls.join(' '));
      s.style.setProperty('--eye', RA.S ? RA.S.mascot.eye : '#5eead4');
      const eyes = s.querySelector('.m-eyes');
      if (eyes) eyes.style.transform = `translate(${lx}px, ${ly}px)`;
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
    // Island sits top-center; map cursor offset to a small pupil translation.
    const dx = Math.max(-1, Math.min(1, (c.x - 0.5) * 3));
    const dy = Math.max(-1, Math.min(1, (c.y - 0.05) * 2));
    RA.mascot.look = [dx * 2.4, dy * 1.6];
    RA.applyMascot();
  });
})();

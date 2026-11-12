/* Drink tab + eye-break routine (Rara demonstrates). */
(function () {
  const RA = window.RA;
  let pane = null, st = null;

  function render() {
    if (!pane || !st) return;
    const glasses = Array.from({ length: Math.max(st.target, st.count) }, (_, i) => `<i class="${i < st.count ? 'f' : ''}"></i>`).join('');
    const ml = st.count * st.glassMl;
    pane.innerHTML = `
      <div class="row"><div class="grow"><div class="h" style="margin:0">💧 ${RA.t('drink.title')}</div>
        <div class="muted small">${ml} / ${st.targetMl} ml · ${st.count}/${st.target} ${RA.t('drink.glass')}</div></div>
        <button class="btn" data-d="-1">−1</button><button class="btn pri" data-d="1">${RA.t('drink.add')}</button></div>
      <div class="card" style="margin:10px 0"><div class="drink-glasses">${glasses}</div></div>
      <div class="row small"><span class="muted" style="width:110px">${RA.t('drink.target')}</span>
        <input type="range" min="1000" max="4000" step="250" value="${st.targetMl}" data-s="health.drink.targetMl" class="grow" style="accent-color:var(--accent)"><span style="width:60px;text-align:right">${st.targetMl} ml</span></div>
      <div class="row small" style="margin-top:6px"><span class="muted" style="width:110px">${RA.t('drink.every')}</span>
        <input type="range" min="20" max="180" step="10" value="${st.intervalMin}" data-s="health.drink.intervalMin" class="grow" style="accent-color:var(--accent)"><span style="width:60px;text-align:right">${st.intervalMin} ${RA.t('common.min')}</span></div>
      <div class="row small" style="margin-top:6px"><span class="muted" style="width:110px">${RA.L('Pengingat', 'Reminders')}</span>
        <button class="btn sm ${st.enabled ? 'pri' : ''}" data-toggle>${st.enabled ? RA.t('common.on') : RA.t('common.off')}</button>
        <span class="grow"></span><button class="btn sm" data-eye>👀 ${RA.t('eye.title')}</button></div>`;
  }

  RA.tab({
    id: 'drink', height: 250,
    render(p) {
      pane = p;
      p.addEventListener('click', (e) => {
        const d = e.target.closest('[data-d]'); if (d) RA.invoke('drink.add', +d.dataset.d);
        if (e.target.closest('[data-toggle]')) RA.set('health.drink.enabled', !st.enabled);
        if (e.target.closest('[data-eye]')) RA.eyeBreak();
      });
      p.addEventListener('change', (e) => { const s = e.target.dataset.s; if (s) RA.set(s, +e.target.value); });
      let held = false;
      p.addEventListener('mousedown', (e) => { if (e.target.type === 'range') { held = true; RA.pin(1); } });
      window.addEventListener('mouseup', () => { if (held) { held = false; RA.pin(-1); } });
      render();
    },
    onShow: render
  });
  RA.on('drink', (v) => { st = v; render(); });

  // ---------------------------------------------------------- eye break
  const steps = [['eye.step1', [-2.6, 0], 5], ['eye.step2', [2.6, 0], 5], ['eye.step3', [0, -1.8], 5], ['eye.step4', [0, 1.8], 5], ['eye.step5', [0, 0], 6, 'm-blinkfast'], ['eye.step6', [0, 0], 20, 'm-far']];
  let ebPane = null, running = null;
  RA.tab({ id: 'eyebreak', height: 230, render(p) { ebPane = p; } });

  RA.eyeBreak = () => {
    if (running || !ebPane) return;
    let i = 0, left = steps[0][2];
    const prevTab = RA.tab;
    RA.pin(1);
    RA.expand(true, 'eyebreak');
    const stop = () => {
      clearInterval(running); running = null;
      RA.mascot.override = null; RA.mascot.look = [0, 0]; RA.applyMascot();
      RA.pin(-1); RA.expand(false); RA.showTab(prevTab !== 'eyebreak' ? prevTab : 'music');
    };
    const draw = () => {
      const [k, look, , cls] = steps[i];
      RA.mascot.override = cls || 'm-ex';
      RA.mascot.look = look;
      ebPane.innerHTML = `<div class="stage-mascot">${RA.mascotHtml('big')}<div class="h" style="margin:0">${RA.t(k)}</div>
        <div class="muted small">${RA.t('eye.title')} · ${left}s</div><button class="btn sm" data-skip>${RA.t('eye.skip')}</button></div>`;
      ebPane.querySelector('[data-skip]').onclick = stop;
      RA.applyMascot();
    };
    draw();
    running = setInterval(() => {
      left--;
      if (left <= 0) { i++; if (i >= steps.length) return stop(); left = steps[i][2]; }
      draw();
    }, 1000);
  };
  RA.on('eyeBreak', (v) => { if (v && Date.now() - v.at < 60000) RA.eyeBreak(); });
})();

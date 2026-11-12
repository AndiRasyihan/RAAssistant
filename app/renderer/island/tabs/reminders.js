/* Reminders tab: one-off / daily / weekly reminders. */
(function () {
  const RA = window.RA;
  let pane = null, list = [];

  function render() {
    if (!pane) return;
    const a = document.activeElement;
    if (a && pane.contains(a) && a.matches('input, select')) return;
    const loc = RA.S.lang === 'en' ? 'en-GB' : 'id-ID';
    const rep = { none: '', daily: RA.L('setiap hari', 'daily'), weekly: RA.L('setiap minggu', 'weekly') };
    const items = list.filter((r) => !r.done).sort((x, y) => x.at - y.at);
    const done = list.filter((r) => r.done).slice(-3);
    const def = new Date(Date.now() + 30 * 60000); def.setSeconds(0, 0);
    const iso = new Date(def.getTime() - def.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    pane.innerHTML = `<div class="h">${RA.t('reminders.title')}</div>
      <div class="list">${items.length ? items.map((r) => `<div class="it"><span>⏰</span><div class="grow"><div class="ell">${RA.esc(r.title)}</div><div class="small muted">${new Date(r.at).toLocaleString(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${rep[r.repeat] ? ' · ' + rep[r.repeat] : ''}</div></div><button class="icon-btn x" data-rm="${r.id}" style="width:24px;height:24px">${RA.icons.x}</button></div>`).join('') : `<div class="small muted" style="padding:6px 8px">${RA.t('reminders.empty')}</div>`}
      ${done.map((r) => `<div class="it" style="opacity:.45"><span>✓</span><span class="grow ell" style="text-decoration:line-through">${RA.esc(r.title)}</span><button class="icon-btn x" data-rm="${r.id}" style="width:24px;height:24px">${RA.icons.x}</button></div>`).join('')}</div>
      <div class="row" style="margin-top:8px;gap:4px"><input data-t class="grow" placeholder="${RA.t('reminders.add')}…"><input type="datetime-local" data-at value="${iso}">
        <select data-rep><option value="none">1×</option><option value="daily">${rep.daily}</option><option value="weekly">${rep.weekly}</option></select><button class="btn sm pri" data-add>+</button></div>`;
  }

  RA.tab({
    id: 'reminders', height: 260,
    render(p) {
      pane = p;
      p.addEventListener('mousedown', (e) => { if (e.target.matches('input, select')) window.ra.focus(true); });
      p.addEventListener('focusin', (e) => { if (e.target.matches('input, select')) RA.pin(1); });
      p.addEventListener('focusout', (e) => { if (e.target.matches('input, select')) { RA.pin(-1); setTimeout(render, 50); } });
      p.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-rm]'); if (rm) { RA.invoke('reminders.remove', rm.dataset.rm); return; }
        if (e.target.closest('[data-add]')) {
          const t = p.querySelector('[data-t]').value.trim(); const at = new Date(p.querySelector('[data-at]').value).getTime();
          if (!t || !at) return;
          RA.invoke('reminders.add', t, at, p.querySelector('[data-rep]').value);
          p.querySelector('[data-t]').value = '';
          document.activeElement && document.activeElement.blur();
        }
      });
      p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-t]')) p.querySelector('[data-add]').click(); });
      render();
    },
    onShow: render
  });
  RA.on('reminders', (r) => { list = r || []; render(); });
})();

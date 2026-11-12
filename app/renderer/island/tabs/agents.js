/* Agents tab: live AI agent activity + answering from the island. */
(function () {
  const RA = window.RA;
  const short = { copilot: 'CP', vscode: 'VS', antigravity: 'AG' };
  let pane = null;
  let list = [];
  let ext = {};
  const drafts = {};

  function statusLabel(s) { return RA.t('agents.' + s); }
  function stepText(s) {
    if (s.step === '__thinking') return RA.t('agents.thinking');
    return s.step || '';
  }

  function card(s) {
    const elapsed = s.startedAt ? (s.status === 'busy' || s.status === 'waiting' ? RA.ago(s.startedAt) : RA.dur(((s.endedAt || s.updatedAt) - s.startedAt) / 1000)) : '';
    const step = stepText(s);
    const canAct = s.actions || {};
    let actions = '';
    if (s.status === 'waiting') {
      const q = s.question ? `<div class="msg" style="-webkit-line-clamp:3;color:var(--fg)">❓ ${RA.esc(s.question)}</div>` : '';
      let btns = '';
      if (s.choices && s.choices.length) btns = s.choices.map((c, i) => `<button class="btn sm ${i === 0 ? 'pri' : ''}" data-act="choice" data-v="${RA.esc(c)}">${RA.esc(c)}</button>`).join('');
      else if (canAct.approve) btns = `<button class="btn sm pri" data-act="allow">${RA.L('Izinkan', 'Allow')}</button><button class="btn sm" data-act="deny">${RA.L('Tolak', 'Deny')}</button>`;
      actions = q + (btns ? `<div class="row" style="flex-wrap:wrap;gap:5px;margin-top:6px">${btns}</div>` : '');
    }
    const reply = canAct.reply ? `<div class="row" style="margin-top:6px"><input class="grow reply" data-key="${RA.esc(s.key)}" placeholder="${RA.L('Balas agen…', 'Reply to agent…')}" value="${RA.esc(drafts[s.key] || '')}"><button class="btn sm pri" data-act="reply">↵</button></div>` : '';
    return `<div class="agent" data-key="${RA.esc(s.key)}">
      <div class="src ${s.source}">${short[s.source] || '?'}</div>
      <div class="body">
        <div class="top"><div class="title">${RA.esc(s.title || s.prompt || '—')}</div><span class="badge ${s.status}">${statusLabel(s.status)}</span></div>
        ${step && (s.status === 'busy' || s.status === 'waiting') ? `<div class="step">${s.status === 'busy' ? '<span class="spin"></span>' : ''}<span class="ell">${RA.esc(step)}</span></div>` : ''}
        ${s.lastMessage ? `<div class="msg">${RA.esc(s.lastMessage)}</div>` : ''}
        ${actions}${reply}
        <div class="meta">${RA.esc(s.sourceLabel || s.source)}${s.workspace ? ' · ' + RA.esc(s.workspace) : ''}${elapsed ? ' · ' + elapsed : ''}
          · <a href="#" data-act="open" style="color:var(--accent)">${RA.L('Buka', 'Open')}</a>${s.actionNote ? ' · <span style="color:#fbbf24">' + RA.esc(s.actionNote) + '</span>' : ''}</div>
      </div></div>`;
  }

  function render() {
    if (!pane) return;
    // Don't clobber an input the user is typing in.
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('reply') && pane.contains(active)) { RA.agentsDirty = true; return; }
    const extNote = `<div class="small muted" style="margin:2px 0 8px">${RA.t('agents.ext')}: VS Code ${ext.vscode ? '✅' : '—'} · Antigravity IDE ${ext.antigravity ? '✅' : '—'}</div>`;
    pane.innerHTML = list.length ? extNote + list.map(card).join('') : `<div class="empty">${RA.t('agents.empty')}</div>${extNote}`;
  }

  async function act(key, type, value, btn) {
    if (btn) { btn.disabled = true; btn.style.opacity = 0.5; }
    const r = await RA.invoke('agents.act', key, { type, value });
    if (r && r.error) RA.toast({ title: RA.L('Gagal mengirim ke agen', 'Could not reach agent'), body: r.error, icon: 'agents', force: true });
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }

  RA.tab({
    id: 'agents', height: 340,
    render(p) {
      pane = p;
      p.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        e.preventDefault();
        const key = b.closest('.agent').dataset.key;
        const type = b.dataset.act;
        if (type === 'reply') {
          const inp = b.parentElement.querySelector('input');
          const v = inp.value.trim(); if (!v) return;
          inp.value = ''; delete drafts[key];
          act(key, 'reply', v, b);
        } else act(key, type, b.dataset.v, b);
      });
      p.addEventListener('mousedown', (e) => { if (e.target.tagName === 'INPUT') window.ra.focus(true); });
      p.addEventListener('focusin', (e) => { if (e.target.tagName === 'INPUT') RA.pin(1); });
      p.addEventListener('focusout', (e) => { if (e.target.tagName === 'INPUT') { RA.pin(-1); if (RA.agentsDirty) { RA.agentsDirty = false; setTimeout(render, 50); } } });
      p.addEventListener('input', (e) => { if (e.target.classList.contains('reply')) drafts[e.target.dataset.key] = e.target.value; });
      p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('reply')) e.target.parentElement.querySelector('[data-act=reply]').click(); });
      render();
    },
    onShow: render
  });

  RA.on('agents', (v) => { list = v.list || []; ext = v.ext || {}; render(); RA.refresh(); });

  // Island pill while an agent works or needs input.
  RA.activity('agents', () => {
    if (!RA.S.agents.pill) return null;
    const w = list.find((s) => s.status === 'waiting');
    const b = list.find((s) => s.status === 'busy');
    const s = w || b;
    if (!s) return null;
    const busyCount = list.filter((x) => x.status === 'busy').length;
    const label = w ? (w.question || RA.t('agents.waiting')) : stepText(s) || RA.t('agents.busy');
    const html = `<div class="act">${w ? '<span class="dot wait"></span>' : '<span class="spin"></span>'}<span class="txt"><b>${RA.esc(s.sourceLabel || s.source)}</b> <span class="sub">${RA.esc(label)}</span></span>${busyCount > 1 ? `<span class="chip">${busyCount}</span>` : ''}</div>`;
    return { pri: w ? 90 : 55, html, w: 380 };
  });
})();

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
    // Don't clobber an input the user is typing in — unless an agent now needs an answer.
    const active = document.activeElement;
    const typing = active && active.classList && active.classList.contains('reply') && pane.contains(active);
    if (typing && !list.some((s) => s.status === 'waiting' && !pane.querySelector(`.agent[data-key="${CSS.escape(s.key)}"] [data-act=allow], .agent[data-key="${CSS.escape(s.key)}"] [data-act=choice]`))) { RA.agentsDirty = true; return; }
    const focusKey = typing ? active.dataset.key : null;
    const extNote = `<div class="small muted" style="margin:2px 0 8px">${RA.t('agents.ext')}: VS Code ${ext.vscode ? '✅' : '—'} · Antigravity IDE ${ext.antigravity ? '✅' : '—'}</div>`;
    pane.innerHTML = list.length ? extNote + list.map(card).join('') : `<div class="empty">${RA.t('agents.empty')}</div>${extNote}`;
    if (focusKey) { const i = pane.querySelector(`input.reply[data-key="${CSS.escape(focusKey)}"]`); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
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
          inp.blur(); window.ra.focus(false);
          act(key, 'reply', v, b);
          setTimeout(render, 50);
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

  RA.on('agents', (v) => {
    list = v.list || []; ext = v.ext || {}; render(); RA.refresh();
    // Close question pop-ups that were answered elsewhere (or here).
    const t = RA.toastShowing && RA.toastShowing();
    if (t && t.kind === 'agentq') { const s = list.find((x) => x.key === t.key); if (!s || s.status !== 'waiting') RA.dropToast(t.key); }
  });

  // Agent question shown as a drop-down card right under the notch: answer without opening the panel.
  RA.questionToast = (q) => {
    const letters = 'ABCDEFGHIJ';
    const ext2 = ext || {};
    const canApprove = q.permission || (q.source === 'vscode' && ext2.vscode) || (q.source === 'antigravity' && q.product === 'ide' && ext2.antigravity);
    const choices = q.choices && q.choices.length ? q.choices : null;
    const actions = [];
    let body = '';
    if (choices) {
      body = `<div class="qopts">${choices.map((c, i) => { actions.push({ run: () => answer('choice', c) }); return `<button class="qopt" data-i="${i}"><b>${letters[i] || '•'}</b><span>${RA.esc(c)}</span></button>`; }).join('')}</div>`;
    } else if (canApprove) {
      actions.push({ run: () => answer('allow') }, { run: () => answer('deny') });
      body = `<div class="row" style="gap:6px;margin-top:8px"><button class="btn pri" data-i="0">✓ ${RA.L('Izinkan', 'Allow')}</button><button class="btn" data-i="1">✕ ${RA.L('Tolak', 'Deny')}</button></div>`;
    }
    const replyIdx = actions.length;
    actions.push({ keep: true, run: () => { const i = RA.$('#toast .qreply input'); const v = i && i.value.trim(); if (v) { answer('reply', v); RA.dismissToast(); } } });
    const openIdx = actions.length;
    actions.push({ run: () => RA.invoke('agents.act', q.key, { type: 'open' }) });
    const reply = `<div class="row qreply" style="margin-top:8px"><input class="grow" placeholder="${RA.L('Jawaban lain…', 'Other answer…')}"><button class="btn sm pri" data-i="${replyIdx}">↵</button></div>`;
    const html = `<div class="qhead"><div class="src ${q.source}">${short[q.source] || '?'}</div>
        <div class="grow" style="min-width:0"><div class="ttitle ell">${RA.esc(q.sourceLabel)} · ${RA.esc(RA.t('agents.waitNotif'))}</div><div class="small muted ell">${RA.esc(q.title || '')}${q.workspace ? ' · ' + RA.esc(q.workspace) : ''}</div></div>
        <button class="btn sm" data-i="${openIdx}">${RA.L('Buka', 'Open')}</button><button class="icon-btn" data-close style="width:24px;height:24px">${RA.icons.x}</button></div>
      <div class="qtext">${RA.esc(q.question || '')}</div>${q.error ? `<div class="small" style="color:#ff8a80;margin-top:4px">${RA.esc(RA.L('Gagal: ', 'Failed: ') + q.error)}</div>` : ''}${body}${reply}`;
    const n = choices ? choices.length : 0;
    const qlines = Math.min(3, Math.ceil((q.question || '').length / 60));
    const h = 62 + qlines * 18 + (q.error ? 34 : 0) + (choices ? n * 34 + 6 : canApprove ? 42 : 0) + 40;
    async function answer(type, value) {
      const r = await RA.invoke('agents.act', q.key, { type, value });
      if (r && r.error) RA.questionToast({ ...q, error: r.error });
      else RA.mascot.flash && RA.mascot.flash('happy', 1500);
    }
    RA.toast({ ...q, kind: 'agentq', interactive: true, html, actions, w: 460, h: Math.min(h, 360), ms: 10 * 60000 });
    setTimeout(() => {
      const i = RA.$('#toast .qreply input');
      if (!i) return;
      i.addEventListener('mousedown', () => window.ra.focus(true));
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); actions[replyIdx].run(); } });
    }, 0);
  };

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

/* Today tab: month calendar with Indonesian holidays, agenda (local + iCal) with quick-add, to-dos, weather. */
(function () {
  const RA = window.RA;
  let pane = null, agenda = { events: [] }, todos = [], weather = null;
  let viewMonth = null; // Date (1st of the month)
  let selDay = null;

  const loc = () => (RA.S.lang === 'en' ? 'en-GB' : 'id-ID');
  const dayKeyOf = (d) => RA.dayKey(d);
  const holidays = (y) => window.RAHOLIDAYS.year(y, RA.S.lang);

  function evDays() {
    const s = new Set();
    for (const e of agenda.events) s.add(dayKeyOf(new Date(e.start)));
    return s;
  }

  function calendarHtml() {
    const m = viewMonth;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday first
    const hol = holidays(m.getFullYear());
    const evs = evDays();
    const today = dayKeyOf(new Date());
    const names = RA.L('Sn,Sl,Rb,Km,Jm,Sb,Mg', 'Mo,Tu,We,Th,Fr,Sa,Su').split(',');
    let cells = names.map((n) => `<b>${n}</b>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = dayKeyOf(d);
      const cls = [d.getMonth() !== m.getMonth() ? 'out' : '', k === today ? 'today' : '', hol[k] || d.getDay() === 0 ? 'hol' : '', evs.has(k) ? 'ev' : ''].join(' ');
      cells += `<span class="${cls}" data-day="${k}" title="${RA.esc(hol[k] || '')}" style="cursor:pointer;${selDay === k ? 'outline:1px solid var(--accent)' : ''}">${d.getDate()}</span>`;
    }
    const title = first.toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
    return `<div class="row" style="margin-bottom:4px"><button class="btn sm" data-mon="-1">‹</button><div class="grow" style="text-align:center;font-weight:600">${title}</div><button class="btn sm" data-mon="1">›</button></div><div class="cal">${cells}</div>`;
  }

  function agendaHtml() {
    const now = Date.now();
    const sel = selDay || dayKeyOf(new Date());
    const [y, mo, d] = sel.split('-').map(Number);
    const dayStart = new Date(y, mo - 1, d).getTime(), dayEnd = dayStart + 86400000;
    const hol = holidays(y)[sel];
    const items = agenda.events.filter((e) => e.start < dayEnd && e.end > dayStart);
    const upcoming = !selDay ? agenda.events.filter((e) => e.start >= dayEnd).slice(0, 3) : [];
    const row = (e, showDate) => `<div class="it"><span class="dot" style="background:${e.source === 'ical' ? 'var(--accent)' : '#fbbf24'}"></span>
      <div class="grow"><div class="ell">${RA.esc(e.title)}</div><div class="small muted">${showDate ? new Date(e.start).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' : ''}${e.allDay ? RA.L('Sepanjang hari', 'All day') : RA.hm(e.start) + '–' + RA.hm(e.end)}</div></div>
      ${e.link && e.end > now ? `<button class="btn sm pri" data-join="${RA.esc(e.link)}">${RA.t('common.join')}</button>` : ''}
      ${e.source === 'local' ? `<button class="icon-btn x" data-rmev="${e.id}" style="width:22px;height:22px">${RA.icons.x}</button>` : ''}</div>`;
    const dayLabel = new Date(dayStart).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
    return `<div class="h" style="margin:0 0 4px">${RA.esc(dayLabel)}</div>
      ${hol ? `<div class="small" style="color:#fb7185;margin-bottom:4px">🎌 ${RA.esc(hol)}</div>` : ''}
      <div class="list">${items.length ? items.map((e) => row(e)).join('') : `<div class="small muted" style="padding:4px 8px">${RA.t('today.noAgenda')}</div>`}
      ${upcoming.length ? `<div class="small muted" style="margin:6px 8px 2px">${RA.L('Berikutnya', 'Upcoming')}</div>` + upcoming.map((e) => row(e, true)).join('') : ''}</div>
      <div class="row" style="margin-top:6px;gap:4px"><input type="time" data-q="time" style="width:86px"><input data-q="title" class="grow" placeholder="${RA.t('today.title')}…">
        <select data-q="day"><option value="0">${RA.t('common.today')}</option><option value="1">${RA.t('common.tomorrow')}</option>${[2, 3, 4, 5, 6].map((n) => { const dd = new Date(); dd.setDate(dd.getDate() + n); return `<option value="${n}">${dd.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric' })}</option>`; }).join('')}</select>
        <button class="btn sm pri" data-addev>+</button></div>
      ${agenda.error ? `<div class="small" style="color:#fbbf24;margin-top:4px">iCal: ${RA.esc(agenda.error)}</div>` : ''}`;
  }

  function todosHtml() {
    return `<div class="h" style="margin:10px 0 4px">${RA.t('today.todo')}</div><div class="list">${todos.map((t, i) => `<div class="it"><input type="checkbox" data-td="${i}" ${t.done ? 'checked' : ''} style="accent-color:var(--accent)"><span class="grow ell" style="${t.done ? 'text-decoration:line-through;opacity:.5' : ''}">${RA.esc(t.text)}</span><button class="icon-btn x" data-rmtd="${i}" style="width:22px;height:22px">${RA.icons.x}</button></div>`).join('')}</div>
      <input data-newtodo placeholder="${RA.t('today.addTodo')}" style="width:100%;margin-top:4px">`;
  }

  function weatherHtml() {
    if (!weather) return '';
    return `<div class="weather card" style="padding:6px 10px;margin-bottom:6px"><span style="font-size:22px">${weather.emoji}</span><span class="temp">${weather.temp}°</span>
      <div class="grow small"><div>${RA.esc(weather.desc)} · ${RA.esc(RA.S.today.location.name)}</div><div class="muted">${weather.min != null ? weather.min + '°/' + weather.max + '°' : ''}${weather.pop != null ? ' · ☔ ' + weather.pop + '%' : ''}${weather.rainSoon ? ' · <b style="color:#38bdf8">' + RA.t('today.rainSoon') + '</b>' : ''}</div></div></div>`;
  }

  function render() {
    if (!pane) return;
    if (!viewMonth) { const n = new Date(); viewMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    const active = document.activeElement;
    if (active && pane.contains(active) && active.tagName === 'INPUT' && active.type !== 'checkbox') return; // don't clobber typing
    pane.innerHTML = `<div class="cols"><div>${weatherHtml()}${calendarHtml()}</div><div style="overflow-y:auto">${agendaHtml()}${todosHtml()}</div></div>`;
  }

  function saveTodos() { RA.invoke('todos.set', todos); render(); }

  RA.tab({
    id: 'today', height: 330,
    render(p) {
      pane = p;
      p.addEventListener('mousedown', (e) => { if (e.target.matches('input:not([type=checkbox]), select')) window.ra.focus(true); });
      p.addEventListener('focusin', (e) => { if (e.target.matches('input:not([type=checkbox]), select')) RA.pin(1); });
      p.addEventListener('focusout', (e) => { if (e.target.matches('input:not([type=checkbox]), select')) RA.pin(-1); });
      p.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mon]'); if (b) { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + +b.dataset.mon, 1); render(); return; }
        const day = e.target.closest('[data-day]'); if (day) { selDay = selDay === day.dataset.day ? null : day.dataset.day; render(); return; }
        const j = e.target.closest('[data-join]'); if (j) { RA.invoke('openExternal', j.dataset.join); return; }
        const rm = e.target.closest('[data-rmev]'); if (rm) { RA.invoke('events.remove', rm.dataset.rmev); return; }
        const rt = e.target.closest('[data-rmtd]'); if (rt) { todos.splice(+rt.dataset.rmtd, 1); saveTodos(); return; }
        if (e.target.closest('[data-addev]')) {
          const tm = p.querySelector('[data-q=time]').value, ti = p.querySelector('[data-q=title]').value.trim(), dd = +p.querySelector('[data-q=day]').value;
          if (!ti || !tm) return;
          const [hh, mm] = tm.split(':').map(Number);
          const at = new Date(); at.setDate(at.getDate() + dd); at.setHours(hh, mm, 0, 0);
          RA.invoke('events.add', ti, at.getTime(), 3600000);
          document.activeElement && document.activeElement.blur();
        }
      });
      p.addEventListener('change', (e) => { const c = e.target.closest('[data-td]'); if (c) { todos[+c.dataset.td].done = c.checked; saveTodos(); } });
      p.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (e.target.matches('[data-newtodo]') && e.target.value.trim()) { todos.push({ text: e.target.value.trim(), done: false }); e.target.value = ''; e.target.blur(); saveTodos(); }
        if (e.target.matches('[data-q=title]')) p.querySelector('[data-addev]').click();
      });
      render();
    },
    onShow: render
  });
  RA.on('agenda', (a) => { agenda = a || { events: [] }; if (RA.tab === 'today' && RA.expanded) render(); RA.refresh(); });
  RA.on('todos', (t) => { todos = t || []; if (RA.tab === 'today' && RA.expanded) render(); });
  RA.on('weather', (w) => { weather = w; if (RA.tab === 'today' && RA.expanded) render(); });

  // Event countdown in the island 10 min before (with Join in the Today tab / toast).
  RA.activity('event', () => {
    if (!RA.S.today.eventCountdown) return null;
    const now = Date.now();
    const e = agenda.events.find((x) => !x.allDay && x.start > now && x.start - now <= 10 * 60000);
    if (!e) return null;
    const mins = Math.ceil((e.start - now) / 60000);
    return { pri: 62, w: 340, html: `<div class="act">📅<span class="txt"><b>${RA.esc(e.title)}</b> <span class="sub">· ${mins} ${RA.t('common.min')} ${RA.t('common.later')}</span></span>${e.link ? `<span class="chip">${RA.t('common.join')}</span>` : ''}</div>` };
  });
})();

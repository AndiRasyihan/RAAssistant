/* Settings window: declarative sections, live save, Ctrl+F search. */
(function () {
  const RA = window.RA;
  const L = (a, b) => RA.L(a, b);
  const $ = (s, r) => (r || document).querySelector(s);
  let S = null;
  let current = 'general';

  const get = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), S);
  const set = (p, v) => {
    const keys = p.split('.'); let o = S;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = v;
    return RA.set(p, v);
  };

  const ACCENTS = ['#8b7cff', '#38bdf8', '#2dd4bf', '#a3e635', '#fbbf24', '#fb7185', '#e5e7eb'];
  const EYES = ['#5eead4', '#38bdf8', '#8b7cff', '#f472b6', '#fbbf24', '#2b2440', '#ffffff'];
  const THEMES = [
    { id: 'graphite', n: () => L('Grafit', 'Graphite'), bg: '#0b0b0e', fg: '#f3f3f6' },
    { id: 'frost', n: () => L('Embun', 'Frost'), bg: '#f6f7fb', fg: '#17181d' },
    { id: 'lagoon', n: () => L('Laguna', 'Lagoon'), bg: 'linear-gradient(135deg,#0a2230,#11454a)', fg: '#e9fbff' },
    { id: 'covertint', n: () => L('Warna Sampul', 'Cover Tint'), bg: 'linear-gradient(135deg,#5b3a7a,#1c1424)', fg: '#fff' },
    { id: 'coverglow', n: () => L('Pendar Sampul', 'Cover Glow'), bg: '#0b0b0e', fg: '#fff', glow: true }
  ];
  const TAB_NAMES = () => ({ music: RA.t('tab.music'), agents: RA.t('tab.agents'), today: RA.t('tab.today'), prayer: RA.t('tab.prayer'), shelf: RA.t('tab.shelf'), timer: RA.t('tab.timer'), reminders: RA.t('tab.reminders'), drink: RA.t('tab.drink'), capture: RA.t('tab.capture') });
  const DAYS = () => L('Minggu,Senin,Selasa,Rabu,Kamis,Jumat,Sabtu', 'Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday').split(',');

  // ------------------------------------------------------------- control builders
  function item(label, desc, control, opts = {}) {
    const d = document.createElement('div');
    d.className = 'item' + (opts.col ? ' col' : '');
    d.dataset.search = (label + ' ' + (desc || '') + ' ' + (opts.keywords || '')).toLowerCase();
    d.innerHTML = `<div class="lbl"><b>${RA.esc(label)}</b>${desc ? `<small>${desc}</small>` : ''}</div>`;
    if (control) d.appendChild(control);
    return d;
  }
  function toggle(path, onChange) {
    const l = document.createElement('label'); l.className = 'sw';
    l.innerHTML = '<input type="checkbox"><span></span>';
    const i = l.querySelector('input'); i.checked = !!get(path);
    i.onchange = () => { set(path, i.checked); onChange && onChange(i.checked); };
    return l;
  }
  function seg(path, options, onChange) {
    const d = document.createElement('div'); d.className = 'seg';
    for (const [v, label] of options) {
      const b = document.createElement('button'); b.textContent = label;
      b.classList.toggle('on', String(get(path)) === String(v));
      b.onclick = () => { set(path, v); for (const x of d.children) x.classList.remove('on'); b.classList.add('on'); onChange && onChange(v); };
      d.appendChild(b);
    }
    return d;
  }
  function slider(path, min, max, step, fmt, onChange) {
    const d = document.createElement('div'); d.className = 'slider';
    d.innerHTML = `<input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const i = d.querySelector('input'), o = d.querySelector('output');
    i.value = get(path); o.textContent = fmt(+i.value);
    i.oninput = () => { o.textContent = fmt(+i.value); };
    i.onchange = () => { set(path, +i.value); onChange && onChange(+i.value); };
    return d;
  }
  function text(path, placeholder, type = 'text') {
    const i = document.createElement('input'); i.type = type; i.placeholder = placeholder || ''; i.value = get(path) == null ? '' : get(path);
    i.style.minWidth = '260px';
    i.onchange = () => set(path, type === 'number' ? +i.value : i.value.trim());
    return i;
  }
  function button(label, fn, pri) {
    const b = document.createElement('button'); b.className = 'btn' + (pri ? ' pri' : ''); b.textContent = label; b.onclick = fn; return b;
  }
  function row(...els) { const d = document.createElement('div'); d.className = 'row'; for (const e of els) d.appendChild(e); return d; }
  function swatches(path, colors, onChange) {
    const d = document.createElement('div'); d.className = 'swatches';
    const paint = () => { for (const b of d.querySelectorAll('button')) b.classList.toggle('on', b.dataset.c === get(path)); };
    for (const c of colors) {
      const b = document.createElement('button'); b.style.background = c; b.dataset.c = c;
      b.onclick = () => { set(path, c); paint(); onChange && onChange(c); };
      d.appendChild(b);
    }
    const custom = document.createElement('input'); custom.type = 'color'; custom.value = get(path); custom.title = L('Warna lain', 'Custom');
    custom.style.cssText = 'width:30px;height:26px;padding:0;border:0;background:none';
    custom.onchange = () => { set(path, custom.value); paint(); onChange && onChange(custom.value); };
    d.appendChild(custom);
    paint();
    return d;
  }
  // Editable list of strings (exe names etc.)
  function strList(path, placeholder, normalize) {
    const d = document.createElement('div'); d.className = 'lst'; d.style.width = '100%';
    const draw = () => {
      d.innerHTML = '';
      for (const v of get(path)) {
        const r = document.createElement('div'); r.className = 'r';
        r.innerHTML = `<span class="n">${RA.esc(v)}</span>`;
        r.appendChild(button(RA.t('common.remove'), () => { set(path, get(path).filter((x) => x !== v)); draw(); }));
        d.appendChild(r);
      }
      const i = document.createElement('input'); i.placeholder = placeholder; i.style.flex = '1';
      const add = () => { let v = i.value.trim(); if (!v) return; v = normalize ? normalize(v) : v; if (!get(path).includes(v)) set(path, [...get(path), v]); draw(); };
      i.onkeydown = (e) => { if (e.key === 'Enter') add(); };
      d.appendChild(row(i, button(RA.t('common.add'), add)));
    };
    draw();
    return d;
  }
  const exeNorm = (v) => { v = v.toLowerCase().split(/[\\/]/).pop(); return v.endsWith('.exe') ? v : v + '.exe'; };
  function group(title, ...items) {
    const g = document.createElement('div'); g.className = 'group';
    if (title) g.innerHTML = `<h3>${RA.esc(title)}</h3>`;
    for (const i of items) if (i) g.appendChild(i);
    return g;
  }

  // ------------------------------------------------------------- sections
  const sections = [
    { id: 'general', icon: 'gear', t: 'sec.general', build: general },
    { id: 'appearance', icon: 'sun', t: 'sec.appearance', build: appearance },
    { id: 'behaviour', icon: 'focus', t: 'sec.behaviour', build: behaviour },
    { id: 'mascot', icon: 'agents', t: 'sec.mascot', build: mascot },
    { id: 'agents', icon: 'agents', t: 'sec.agents', build: agents },
    { id: 'music', icon: 'music', t: 'sec.music', build: music },
    { id: 'meetings', icon: 'mic', t: 'sec.meetings', build: meetings },
    { id: 'today', icon: 'today', t: 'sec.today', build: today },
    { id: 'health', icon: 'drink', t: 'sec.health', build: health },
    { id: 'worship', icon: 'prayer', t: 'sec.worship', build: worship },
    { id: 'capture', icon: 'capture', t: 'sec.capture', build: capture },
    { id: 'phone', icon: 'phone', t: 'sec.phone', build: phone },
    { id: 'about', icon: 'reminders', t: 'sec.about', build: about }
  ];

  function general() {
    return [
      group('', 
        item(L('Bahasa', 'Language'), L('Berganti langsung tanpa restart.', 'Switches instantly, no restart.'), seg('lang', [['id', 'Bahasa Indonesia'], ['en', 'English']], () => setTimeout(renderAll, 50))),
        item(L('Jalankan saat Windows mulai', 'Start with Windows'), L('Membuat pintasan di folder Startup yang menjalankan electron.exe bawaan (aman untuk Smart App Control).', 'Creates a Startup-folder shortcut to the stock electron.exe (Smart App Control friendly).'), toggle('autostart')),
        item(L('Data lokal', 'Local data'), L('Semua data disimpan di laptop ini. Tanpa akun, tanpa cloud.', 'Everything stays on this laptop. No account, no cloud.'), row(
          button(L('Buka folder data', 'Open data folder'), async () => { const p = await RA.invoke('paths'); RA.invoke('openPath', p.userData); }))),
        item(L('Keluar dari RA Assistant', 'Quit RA Assistant'), '', button(RA.t('tray.quit'), () => RA.invoke('quit')))
      )
    ];
  }

  function preview() {
    const wrap = document.createElement('div'); wrap.className = 'preview';
    const draw = () => {
      const th = THEMES.find((t) => t.id === S.appearance.theme) || THEMES[0];
      wrap.classList.toggle('notch', S.appearance.style === 'notch');
      const c = S.appearance.content;
      const clock = `<span>${RA.hm(new Date())}</span>`;
      const right = c === 'clock-battery' ? '<span style="opacity:.7;font-size:12px">87%</span>' : RA.mascotHtml();
      const inner = c === 'mascot' ? `<span style="flex:1"></span>${RA.mascotHtml()}<span style="flex:1"></span>` : `${clock}<span style="flex:1"></span><span class="bars"><i></i><i></i><i></i><i></i></span><span style="flex:1"></span>${right}`;
      const k = S.appearance.size === 'auto' ? 1 : S.appearance.size / 100;
      wrap.innerHTML = `<div class="pv" style="background:${th.bg};color:${th.fg};transform:scale(${k});transform-origin:top center;${th.glow ? 'box-shadow:0 0 0 1.5px #f472b6,0 0 22px #f472b6aa' : ''}">${inner}</div>`;
      RA.applyMascot();
    };
    draw();
    wrap.redraw = draw;
    return wrap;
  }

  function appearance() {
    const pv = preview();
    const re = () => pv.redraw();
    const themes = document.createElement('div'); themes.className = 'themes';
    for (const th of THEMES) {
      const d = document.createElement('div'); d.className = 'theme' + (S.appearance.theme === th.id ? ' on' : '');
      d.innerHTML = `<div class="tp" style="background:${th.bg};${th.glow ? 'box-shadow:0 0 12px #f472b6' : ''}"></div>${RA.esc(th.n())}`;
      d.onclick = () => { set('appearance.theme', th.id); for (const x of themes.children) x.classList.remove('on'); d.classList.add('on'); re(); };
      themes.appendChild(d);
    }
    const mon = document.createElement('select');
    RA.invoke('displays').then((ds) => {
      mon.innerHTML = `<option value="primary">${L('Layar utama', 'Primary display')}</option>` + ds.map((d) => `<option value="${d.id}">${RA.esc(d.label)}</option>`).join('');
      mon.value = S.appearance.monitor;
    });
    mon.onchange = () => set('appearance.monitor', mon.value);
    return [
      group(L('Pratinjau', 'Preview'), item('', '', pv, { col: true })),
      group(L('Bentuk', 'Shape'),
        item(L('Gaya island', 'Island style'), L('Pil mengambang, atau notch yang menempel di tepi atas layar.', 'Floating pill, or a notch attached to the top edge.'), seg('appearance.style', [['pill', L('Pil mengambang', 'Floating pill')], ['notch', 'Notch']], re)),
        item(L('Isi island', 'Island content'), L('Yang tampil saat island diam.', 'What the resting island shows.'), seg('appearance.content', [['clock-battery', L('Jam + Baterai', 'Clock + Battery')], ['clock-mascot', L('Jam + Maskot', 'Clock + Mascot')], ['mascot', L('Maskot saja', 'Mascot only')]], re)),
        item(L('Ukuran', 'Size'), '', seg('appearance.size', [['auto', 'Auto'], [75, '75%'], [90, '90%'], [100, '100%'], [115, '115%'], [130, '130%']], re)),
        item(L('Monitor', 'Monitor'), L('Tempat island muncul.', 'Where the island appears.'), mon)
      ),
      group(L('Warna', 'Colour'),
        item(L('Tema', 'Theme'), L('“Warna Sampul” mewarnai island dari sampul album; “Pendar Sampul” memberi tepi bercahaya dari warna sampul.', '“Cover Tint” tints the island from the album art; “Cover Glow” adds a glowing edge in the cover colour.'), null),
        item('', '', themes, { col: true }),
        item(L('Warna aksen', 'Accent colour'), L('Dipakai untuk tab aktif, progres, dan penanda.', 'Used for the active tab, progress and markers.'), swatches('appearance.accent', ACCENTS, (c) => document.documentElement.style.setProperty('--accent', c)))
      )
    ];
  }

  function tabsEditor() {
    const d = document.createElement('div'); d.className = 'lst'; d.style.width = '100%';
    const names = TAB_NAMES();
    const draw = () => {
      d.innerHTML = '';
      const tabs = S.behaviour.tabs;
      tabs.forEach((t, i) => {
        const r = document.createElement('div'); r.className = 'r';
        r.innerHTML = `<span style="width:18px;display:inline-block">${RA.icons[t.id] || ''}</span><span class="n">${RA.esc(names[t.id] || t.id)}</span>`;
        r.firstChild.querySelector('svg') && (r.firstChild.querySelector('svg').style.cssText = 'width:16px;height:16px;fill:currentColor');
        const sw = document.createElement('label'); sw.className = 'sw'; sw.innerHTML = '<input type="checkbox"><span></span>';
        sw.querySelector('input').checked = t.show;
        sw.querySelector('input').onchange = (e) => { const n = tabs.map((x) => ({ ...x })); n[i].show = e.target.checked; set('behaviour.tabs', n); };
        const up = button('↑', () => { if (!i) return; const n = tabs.map((x) => ({ ...x })); [n[i - 1], n[i]] = [n[i], n[i - 1]]; set('behaviour.tabs', n); draw(); });
        const dn = button('↓', () => { if (i === tabs.length - 1) return; const n = tabs.map((x) => ({ ...x })); [n[i + 1], n[i]] = [n[i], n[i + 1]]; set('behaviour.tabs', n); draw(); });
        r.append(up, dn, sw);
        d.appendChild(r);
      });
    };
    draw();
    return d;
  }

  function behaviour() {
    return [
      group(L('Kapan island tampil', 'When the island shows'),
        item(L('Tampilkan island', 'Show island'), L('“Saat ada aktivitas”: hanya garis tipis sampai ada musik, timer, notifikasi, atau agen bekerja. “Sembunyi”: buka lagi lewat ikon tray.', '“On activity”: a thin line until music, a timer, a notification or an agent is active. “Hidden”: reopen from the tray icon.'),
          seg('behaviour.visibility', [['always', L('Selalu', 'Always')], ['activity', L('Saat ada aktivitas', 'On activity')], ['hidden', L('Sembunyi', 'Hidden')]])),
        item(L('Musik saat layar penuh', 'Music while fullscreen'), L('Di game borderless/fullscreen, lirik tetap tampil di atas dan bisa diklik-tembus.', 'In borderless/fullscreen games, lyrics stay on top and are click-through.'), toggle('behaviour.musicFullscreen')),
        item(L('Sembunyikan saat aplikasi layar penuh', 'Hide on fullscreen apps'), '', toggle('behaviour.autoHideFullscreen'))
      ),
      group(L('Di atas aplikasi lain', 'On top of other apps'),
        item(L('Mode', 'Mode'), L('“Mengecil otomatis” membuat island jadi pil kecil saat jendela maksimal ada di bawahnya, sehingga tombol aplikasi tetap bisa diklik.', '“Auto-shrink” turns the island into a tiny pill over maximised windows so their buttons stay clickable.'),
          seg('behaviour.onTop', [['full', L('Selalu penuh', 'Always full')], ['shrink', L('Mengecil otomatis', 'Auto-shrink')]])),
        item(L('Pil jam saat mengecil', 'Clock pill when shrunk'), '', seg('behaviour.clockPill', [['off', L('Mati', 'Off')], ['time', L('Jam', 'Time')], ['timedate', L('Jam + Tanggal', 'Time + Date')]])),
        item(L('Jangan mengecil di aplikasi ini', "Don't shrink in these apps"), L('Aplikasi Office otomatis termasuk.', 'Office apps are included automatically.'), null),
        item('', '', strList('behaviour.noShrinkApps', 'contoh: chrome.exe', exeNorm), { col: true })
      ),
      group(L('Sembunyikan saat aplikasi ini aktif', 'Hide when these apps are active'),
        item('', '', strList('behaviour.hideApps', 'contoh: obs64.exe', exeNorm), { col: true, keywords: 'hide exe' })
      ),
      group(L('Tab', 'Tabs'), item(L('Urutan & tampil', 'Order & visibility'), L('Geser naik/turun dan nyalakan tab yang ingin tampil.', 'Move up/down and toggle the tabs you want.'), null), item('', '', tabsEditor(), { col: true }))
    ];
  }

  function mascot() {
    const pv = document.createElement('div'); pv.className = 'mascot-preview';
    pv.innerHTML = RA.mascotHtml('big') + `<div class="note">${L('Rara kini tampil sebagai sepasang mata agar ekspresinya tetap jelas di notch yang kecil. Ekspresi berganti otomatis: bergoyang saat musik, berpikir saat agen AI bekerja, bingung saat agen butuh jawaban, kaget saat notifikasi, mengantuk/tidur saat laptop diam atau larut malam, pusing/kepanasan saat CPU sibuk, sedih saat internet putus, marah saat baterai 10–20%, lemas (X merah) di bawah 10%, puas (hijau) saat penuh, fokus saat Pomodoro. Ikon kecil = kamera/mik dipakai atau baterai lemah.', 'Rara is now a pair of eyes so expressions stay readable in the small notch. Expressions change automatically: grooving with music, thinking while an AI agent works, puzzled when an agent needs an answer, surprised on notifications, sleepy/asleep when idle or late at night, overheated on high CPU, sad when offline, angry at 10–20% battery, drained (red X) below 10%, content (green) when full, focused during Pomodoro. Small icon = camera/mic in use or low battery.')}</div>`;
    const gal = document.createElement('div'); gal.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:4px 16px 16px';
    gal.innerHTML = Object.entries(RA.EXPRESSIONS).map(([k, n]) => `<div style="text-align:center;background:#0b0b0e;border-radius:12px;padding:10px 4px" title="${k}"><svg class="rae" data-fixed="${k}" viewBox="0 0 56 26" style="width:70px;height:33px"></svg><div class="note" style="margin-top:4px">${RA.esc(L(n[0], n[1]))}</div></div>`).join('');
    setTimeout(() => RA.applyMascot(), 0);
    return [
      group(L('Pratinjau', 'Preview'), item('', '', pv, { col: true })),
      group(L('Ekspresi', 'Expressions'), item('', '', gal, { col: true, keywords: 'ekspresi expression mata eyes' })),
      group(L('Tampilan', 'Look'),
        item(L('Warna mata', 'Eye colour'), L('Merah & hijau dipakai untuk ekspresi baterai.', 'Red & green are reserved for battery expressions.'), swatches('mascot.eye', EYES, () => RA.applyMascot())),
        item(L('Aksesori', 'Accessory'), '', seg('mascot.accessory', [['none', L('Tanpa', 'None')], ['glasses', L('Kacamata', 'Glasses')], ['hat', L('Topi', 'Hat')], ['headphones', 'Headphone']], () => RA.applyMascot())),
        item(L('Gerak mata', 'Eye motion'), '', seg('mascot.eyeMotion', [['relaxed', L('Santai (sesekali melirik)', 'Relaxed (glances)')], ['follow', L('Ikuti kursor', 'Follow cursor')]]))
      ),
      group(L('Perilaku', 'Behaviour'),
        item(L('Tampilkan maskot saat laptop diam', 'Show mascot when idle'), '', toggle('mascot.idleShow')),
        item(L('Muncul setelah', 'Appear after'), '', slider('mascot.idleAfter', 10, 300, 10, (v) => v + ' ' + RA.t('common.sec'))),
        item(L('Ekspresi baterai', 'Battery expressions'), L('Marah 10–20%, merah berkedip <10%, senyum hijau saat penuh.', 'Angry 10–20%, blinking red <10%, green smile when full.'), toggle('mascot.battery')),
        item(L('Maskot memegang barang', 'Mascot holds items'), L('Kamera saat webcam aktif, mic saat mikrofon dipakai, charger saat baterai lemah.', 'Camera when the webcam is on, mic when the mic is in use, charger on low battery.'), toggle('mascot.holdItems')),
        item(L('Reaksi', 'Reactions'), L('Panas CPU, charger dicolok, mengantuk malam hari, menari dengan musik.', 'CPU heat, charger plugged, sleepy at night, dancing to music.'), toggle('mascot.reactions'))
      )
    ];
  }

  function agents() {
    const st = document.createElement('div'); st.className = 'note';
    const refresh = async () => {
      const r = await RA.invoke('agents.extInfo');
      if (!r || r.error) { st.textContent = r && r.error || ''; return; }
      st.innerHTML = r.editors.map((e) => `• <b>${RA.esc(e.name)}</b>: ${e.installed ? (e.extInstalled ? '✅ ' + L('ekstensi terpasang', 'extension installed') : '⚠️ ' + L('ekstensi belum terpasang', 'extension not installed')) : L('tidak ditemukan', 'not found')}${e.connected ? ' · 🔗 ' + L('tersambung', 'connected') : ''}`).join('<br>');
    };
    refresh();
    return [
      group(L('Sumber', 'Sources'),
        item('GitHub Copilot (app & CLI)', L('Membaca ~/.copilot/session-state secara lokal. Menjawab pilihan/izin dari island memakai UI Automation (eksperimental; sesi harus sedang tampil di aplikasi Copilot).', 'Reads ~/.copilot/session-state locally. Answering choices/permissions from the island uses UI Automation (experimental; the session must be visible in the Copilot app).'), toggle('agents.copilot')),
        item('VS Code (Copilot Chat agent)', L('Status dari file sesi chat + ekstensi RA Agent Bridge (izinkan/lewati tool, balas pesan).', 'Status from chat session files + the RA Agent Bridge extension (allow/skip tools, reply).'), toggle('agents.vscode')),
        item('Antigravity / Antigravity IDE', L('Status dari database percakapan lokal + ekstensi RA Agent Bridge di Antigravity IDE (terima/tolak perintah, balas).', 'Status from the local conversation database + the RA Agent Bridge extension in Antigravity IDE (accept/reject commands, reply).'), toggle('agents.antigravity'))
      ),
      group(L('Ekstensi editor', 'Editor extension'),
        item(L('RA Agent Bridge', 'RA Agent Bridge'), L('Pasang ke VS Code dan Antigravity IDE. Setelah dipasang, muat ulang jendela editor.', 'Install into VS Code and Antigravity IDE. Reload the editor window afterwards.'),
          button(L('Pasang / perbarui', 'Install / update'), async (e) => { e.target.disabled = true; const r = await RA.invoke('agents.installExt'); e.target.disabled = false; st.innerHTML = RA.esc(r && (r.error || r.message) || ''); setTimeout(refresh, 1500); }, true)),
        item('', '', st, { col: true })
      ),
      group(L('Pemberitahuan', 'Alerts'),
        item(L('Pil di island saat agen bekerja / butuh input', 'Island pill while working / needing input'), '', toggle('agents.pill')),
        item(L('Beri tahu saat agen selesai', 'Notify when an agent finishes'), L('Juga notifikasi Windows saat island tersembunyi atau layar penuh.', 'Also a Windows notification when the island is hidden or fullscreen.'), toggle('agents.notifyDone'))
      )
    ];
  }

  function music() {
    return [
      group(L('Lirik', 'Lyrics'),
        item(L('Lirik tersinkron', 'Synced lyrics'), L('Dari LRCLIB (gratis, tanpa akun). Disimpan di cache lokal.', 'From LRCLIB (free, no account). Cached locally.'), toggle('music.lyrics')),
        item(L('Geser waktu lirik (semua lagu)', 'Lyric time offset (all songs)'), L('Negatif = lirik lebih awal, positif = lebih lambat. Offset per lagu bisa diatur di tab Musik.', 'Negative = earlier, positive = later. Per-song offsets live in the Music tab.'),
          slider('music.lyricOffset', -5, 5, 0.1, (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' ' + RA.t('common.sec')))
      ),
      group(L('Gestur', 'Gestures'),
        item(L('Aktifkan gestur', 'Enable gestures'), L('Gulir di island = volume · Klik dua kali = putar/jeda · Klik/seret bilah progres = lompat · Klik baris lirik = lompat ke baris itu · Geser horizontal (touchpad) = ganti tab.', 'Scroll on island = volume · Double-click = play/pause · Click/drag the progress bar = seek · Click a lyric line = jump to it · Horizontal swipe = switch tab.'), toggle('music.gestures'))
      )
    ];
  }

  function meetings() {
    return [
      group(L('Notifikasi', 'Notifications'),
        item(L('Tampilkan notifikasi Windows di island', 'Show Windows notifications in the island'), L('Versi ringkas; klik untuk membuka aplikasi pengirim. Kode OTP bisa disalin sekali klik (tidak masuk riwayat clipboard).', 'Compact; click opens the sender app. OTP codes can be copied in one click (never saved to clipboard history).'), toggle('meetings.notifications'))
      ),
      group(L('Rapat', 'Meetings'),
        item(L('Mode rapat otomatis', 'Automatic meeting mode'), L('Saat mic dipakai aplikasi rapat: musik dijeda & notifikasi ditahan, lalu dilanjutkan + diringkas setelahnya. OTP tetap tampil. Panggilan WhatsApp tidak dihitung. Meet/Zoom/Teams/lainnya dihitung rapat jika kamera/mic dipakai >6 detik.', 'When a meeting app uses the mic: music pauses & notifications are held, then resumed + summarised. OTPs still show. WhatsApp calls do not count. Meet/Zoom/Teams/others count if cam/mic is used >6 s.'), toggle('meetings.auto')),
        item(L('Tombol bisukan mic di samping island', 'Mic mute button beside the island'), L('Membisukan SEMUA mikrofon aktif sekaligus.', 'Mutes ALL active microphones at once.'), toggle('meetings.micButton')),
        item(L('Abaikan aplikasi ini', 'Ignore these apps'), '', null),
        item('', '', strList('meetings.ignoreApps', 'contoh: discord.exe', exeNorm), { col: true })
      ),
      group(L('Kabar di island', 'Island notices'),
        item(L('Earbuds Bluetooth tersambung (dengan baterai)', 'Bluetooth earbuds connected (with battery)'), '', toggle('meetings.bluetooth')),
        item(L('Unduhan di island', 'Downloads in the island'), L('Nama, ukuran, kecepatan dari Chrome/Edge/Firefox. Klik untuk membuka folder.', 'Name, size, speed from Chrome/Edge/Firefox. Click to open the folder.'), toggle('meetings.downloads')),
        item(L('Internet terputus / tersambung', 'Internet lost / restored'), L('Dengan lama putusnya.', 'With outage duration.'), toggle('meetings.internet')),
        item(L('Tawarkan lanjutkan musik setelah kunci/tidur ≥5 menit', 'Offer to resume music after lock/sleep ≥5 min'), '', toggle('meetings.resumeAfterLock'))
      )
    ];
  }

  function locationPicker() {
    const d = document.createElement('div'); d.className = 'lst'; d.style.width = '100%';
    const cur = document.createElement('div'); cur.className = 'note';
    const paint = () => { const l = S.today.location; cur.innerHTML = `📍 <b>${RA.esc(l.name)}</b>, ${RA.esc(l.region || '')} (${RA.esc(l.tzLabel || l.tz)}) · ${l.lat.toFixed(3)}, ${l.lon.toFixed(3)}`; };
    paint();
    const q = document.createElement('input'); q.placeholder = L('Cari kota/kabupaten… (mis. Makassar)', 'Search city… (e.g. Makassar)'); q.style.flex = '1';
    const res = document.createElement('div'); res.className = 'lst results';
    const choose = (c) => { set('today.location', c); paint(); res.innerHTML = ''; q.value = ''; };
    const show = (list) => {
      res.innerHTML = '';
      for (const c of list.slice(0, 30)) {
        const r = document.createElement('div'); r.className = 'r';
        r.innerHTML = `<span class="n">${RA.esc(c.name)}, ${RA.esc(c.region || '')} <span class="muted">(${RA.esc(c.tzLabel || c.tz)})</span></span><span class="muted small">${c.country}</span>`;
        r.onclick = () => choose(c);
        res.appendChild(r);
      }
    };
    let t = null;
    q.oninput = () => {
      const s = q.value.trim().toLowerCase();
      if (!s) { res.innerHTML = ''; return; }
      const local = window.RACITIES.filter((c) => (c.name + ' ' + c.region).toLowerCase().includes(s));
      show(local);
      clearTimeout(t);
      t = setTimeout(async () => {
        try {
          const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.value.trim())}&count=15&language=id&format=json`);
          const j = await r.json();
          const tzLabel = (tz) => ({ 'Asia/Jakarta': 'WIB', 'Asia/Pontianak': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT', 'Asia/Kuala_Lumpur': 'MYT', 'Asia/Kuching': 'MYT' }[tz] || tz);
          const online = (j.results || []).filter((x) => ['ID', 'MY'].includes(x.country_code)).map((x) => ({ name: x.name, region: [x.admin2, x.admin1].filter(Boolean).join(', '), country: x.country_code, lat: x.latitude, lon: x.longitude, tz: x.timezone, tzLabel: tzLabel(x.timezone) }));
          show(local.concat(online.filter((o) => !local.some((l) => Math.abs(l.lat - o.lat) < 0.05 && Math.abs(l.lon - o.lon) < 0.05))));
        } catch { /* offline: local list only */ }
      }, 400);
    };
    const loc = button(L('📍 Deteksi lokasi', '📍 Locate me'), async (e) => {
      e.target.disabled = true; e.target.textContent = '…';
      const r = await RA.invoke('locate');
      e.target.disabled = false; e.target.textContent = L('📍 Deteksi lokasi', '📍 Locate me');
      if (r && r.lat) {
        // Snap to the nearest built-in city for a friendly name.
        let best = null, bd = 1e9;
        for (const c of window.RACITIES) { const dd = (c.lat - r.lat) ** 2 + (c.lon - r.lon) ** 2; if (dd < bd) { bd = dd; best = c; } }
        choose(best && bd < 0.15 ? { ...best, lat: r.lat, lon: r.lon } : { name: r.name || L('Lokasi saya', 'My location'), region: '', country: r.country || 'ID', lat: r.lat, lon: r.lon, tz: r.tz || Intl.DateTimeFormat().resolvedOptions().timeZone, tzLabel: '' });
      } else cur.innerHTML += ' · ⚠️ ' + RA.esc((r && r.error) || L('Gagal mendeteksi lokasi', 'Could not locate'));
    });
    d.append(cur, row(q, loc), res);
    return d;
  }

  function today() {
    return [
      group(L('Lokasi', 'Location'), item(L('Kota & zona waktu', 'City & time zone'), L('Dipakai untuk cuaca dan jadwal sholat. Daftar bawaan berfungsi offline; pencarian online memakai Open-Meteo.', 'Used for weather and prayer times. The built-in list works offline; online search uses Open-Meteo.'), null), item('', '', locationPicker(), { col: true, keywords: 'lokasi kota location city' })),
      group(L('Cuaca', 'Weather'),
        item(L('Tampilkan cuaca', 'Show weather'), L('Dari open-meteo.com — hanya koordinat kota yang dikirim.', 'From open-meteo.com — only the city coordinates are sent.'), toggle('today.weather')),
        item(L('Peringatan hujan dalam 1 jam', 'Rain within 1 hour alert'), L('Butuh cuaca aktif.', 'Requires weather.'), toggle('today.rain'))
      ),
      group(L('Kalender & agenda', 'Calendar & agenda'),
        item(L('Libur nasional Indonesia', 'Indonesian national holidays'), L('Dihitung offline (Hijriah Umm al-Qura, Imlek, Paskah, Nyepi & Waisak astronomis). Cuti bersama tidak termasuk.', 'Computed offline (Umm al-Qura Hijri, Chinese New Year, Easter, astronomical Nyepi & Vesak). Collective leave days are not included.'), null),
        item(L('URL iCal', 'iCal URL'), L('Alamat iCal rahasia dari Google/Outlook/iCloud untuk mengisi agenda.', 'Secret iCal address from Google/Outlook/iCloud to feed the agenda.'), text('today.ical', 'https://…/basic.ics')),
        item(L('Hitung mundur 10 menit sebelum acara', 'Countdown 10 min before events'), L('Dengan tombol Gabung untuk tautan Meet/Zoom/Teams.', 'With a Join button for Meet/Zoom/Teams links.'), toggle('today.eventCountdown')),
        item(L('Tambah agenda cepat', 'Quick-add events'), L('Di tab Hari ini: jam, judul, dan hari.', 'In the Today tab: time, title and day.'), null)
      )
    ];
  }

  function health() {
    return [
      group(L('Minum air', 'Drink water'),
        item(L('Pengingat minum', 'Drink reminders'), L('Target & catatan juga bisa diatur dari tab Minum di island.', 'Target & log can also be set from the Drink tab.'), toggle('health.drink.enabled')),
        item(L('Target harian', 'Daily target'), '', slider('health.drink.targetMl', 1000, 4000, 250, (v) => v + ' ml')),
        item(L('Ukuran gelas', 'Glass size'), '', slider('health.drink.glassMl', 150, 600, 50, (v) => v + ' ml')),
        item(L('Ingatkan tiap', 'Remind every'), '', slider('health.drink.intervalMin', 20, 180, 10, (v) => v + ' ' + RA.t('common.min'))),
        item(L('Jam aktif', 'Active hours'), '', row(text('health.drink.start', '07:00', 'time'), text('health.drink.end', '22:00', 'time')))
      ),
      group(L('Istirahat mata', 'Eye breaks'),
        item(L('Pengingat istirahat mata', 'Eye-break reminder'), L('Rara memperagakan senam mata (lihat kiri/kanan/atas/bawah, kedip, lihat jauh).', 'Rara demonstrates eye exercises (left/right/up/down, blink, look far).'), toggle('health.eye.enabled')),
        item(L('Setiap', 'Every'), '', slider('health.eye.intervalMin', 20, 60, 5, (v) => v + ' ' + RA.t('common.min')))
      ),
      group(L('Fokus', 'Focus'),
        item(L('Durasi Pomodoro', 'Pomodoro length'), L('Selama fokus, notifikasi lain ditahan.', 'Other notifications are held during focus.'), slider('focus.minutes', 15, 60, 5, (v) => v + ' ' + RA.t('common.min'))),
        item(L('Istirahat', 'Break'), '', slider('focus.breakMin', 3, 20, 1, (v) => v + ' ' + RA.t('common.min')))
      )
    ];
  }

  function customWorship() {
    const d = document.createElement('div'); d.className = 'lst'; d.style.width = '100%';
    const draw = () => {
      d.innerHTML = '';
      const days = DAYS();
      for (const [i, c] of S.worship.custom.entries()) {
        const r = document.createElement('div'); r.className = 'r';
        r.innerHTML = `<span class="n">${days[c.day]} · ${RA.esc(c.time)} · ${RA.esc(c.title)}</span>`;
        r.appendChild(button(RA.t('common.remove'), () => { set('worship.custom', S.worship.custom.filter((_, j) => j !== i)); draw(); }));
        d.appendChild(r);
      }
      const day = document.createElement('select'); day.innerHTML = days.map((n, i) => `<option value="${i}">${n}</option>`).join('');
      const tm = document.createElement('input'); tm.type = 'time'; tm.value = '07:00';
      const ti = document.createElement('input'); ti.placeholder = L('Misa, kebaktian, puja…', 'Mass, service, puja…'); ti.style.flex = '1';
      d.appendChild(row(day, tm, ti, button(RA.t('common.add'), () => { if (!ti.value.trim()) return; set('worship.custom', [...S.worship.custom, { day: +day.value, time: tm.value, title: ti.value.trim() }]); draw(); })));
    };
    draw();
    return d;
  }

  function worship() {
    const audioRow = row(
      button(L('Pilih file…', 'Pick file…'), async () => { const r = await RA.invoke('adzan.pick'); if (r && r.path) { S.worship.adzanFile = r.path; fileLbl.textContent = r.path.split(/[\\/]/).pop(); } }),
      button(L('Bawaan', 'Default'), () => { set('worship.adzanFile', ''); fileLbl.textContent = L('Bawaan', 'Default'); }),
      button(RA.t('common.test'), () => RA.invoke('adzan.test', true), true),
      button(RA.t('common.stop'), () => RA.invoke('adzan.test', false))
    );
    const fileLbl = document.createElement('span'); fileLbl.className = 'note';
    fileLbl.textContent = S.worship.adzanFile ? S.worship.adzanFile.split(/[\\/]/).pop() : L('Bawaan', 'Default');
    audioRow.prepend(fileLbl);
    return [
      group(L('Widget', 'Widget'),
        item(L('Mode', 'Mode'), L('Sholat (5 waktu, adzan, Ramadan) · Jadwal ibadah mingguan kustom · Mati.', 'Prayer (5 times, adhan, Ramadan) · Custom weekly worship schedule · Off.'), seg('worship.mode', [['prayer', L('Sholat', 'Prayer')], ['custom', L('Jadwal kustom', 'Custom schedule')], ['off', L('Mati', 'Off')]])),
        item(L('Lokasi', 'Location'), L('Sama dengan lokasi di bagian Hari ini.', 'Same as the location in Today.'), button(L('Ubah lokasi', 'Change location'), () => go('today'))),
        item(L('Metode', 'Method'), L('Dihitung offline: kriteria Kemenag RI (Subuh 20°, Isya 18°, ihtiyath 2 menit) untuk Indonesia, JAKIM untuk Malaysia. Imsak = Subuh − 10 menit. Awal Ramadan mengikuti kalender Umm al-Qura.', 'Computed offline: Kemenag RI criteria (Fajr 20°, Isha 18°, 2-minute ihtiyath) for Indonesia, JAKIM for Malaysia. Imsak = Fajr − 10 min. Ramadan start follows the Umm al-Qura calendar.'), null)
      ),
      group(L('Pengingat', 'Reminders'),
        item(L('Ingatkan saat waktu sholat', 'Remind at prayer time'), '', toggle('worship.remind')),
        item(L('Hitung mundur 10 menit sebelumnya', 'Countdown 10 minutes before'), L('Contoh: “Ashar 15.12 · 9 menit lagi”.', 'E.g. “Asr 15.12 · 9 min left”.'), toggle('worship.countdown')),
        item(L('Jeda musik saat waktu sholat', 'Pause music at prayer time'), L('Menawarkan lanjut saat kembali.', 'Offers to resume when you return.'), toggle('worship.pauseMusic')),
        item(L('Hitung mundur Imsak & berbuka (Ramadan)', 'Imsak & iftar countdown (Ramadan)'), L('30 menit sebelumnya.', '30 minutes before.'), toggle('worship.ramadan'))
      ),
      group(L('Adzan', 'Adhan'),
        item(L('Putar suara adzan', 'Play adhan sound'), '', toggle('worship.adzan')),
        item(L('Suara', 'Sound'), '', audioRow),
        item(L('Volume', 'Volume'), '', slider('worship.adzanVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')),
        item(L('Adzan Subuh', 'Fajr adhan'), '', toggle('worship.subuhAdzan')),
        item(L('Jangan putar adzan saat rapat/panggilan', 'Never play during meetings/calls'), '', toggle('worship.noAdzanInMeeting'))
      ),
      group(L('Jadwal ibadah kustom', 'Custom worship schedule'), item('', '', customWorship(), { col: true, keywords: 'custom ibadah gereja misa' }))
    ];
  }

  function shortcutRecorder() {
    const k = document.createElement('div'); k.className = 'kbd'; k.tabIndex = 0;
    const show = () => { k.textContent = S.capture.shortcut ? S.capture.shortcut.replace('CommandOrControl', 'Ctrl') : L('Nonaktif', 'Disabled'); };
    show();
    k.onclick = () => { k.classList.add('rec'); k.textContent = L('Tekan kombinasi…', 'Press keys…'); k.focus(); };
    k.onkeydown = (e) => {
      if (!k.classList.contains('rec')) return;
      e.preventDefault();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const parts = [];
      if (e.ctrlKey) parts.push('CommandOrControl'); if (e.altKey) parts.push('Alt'); if (e.shiftKey) parts.push('Shift');
      let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (/^F\d+$/.test(e.key)) key = e.key;
      if (!parts.length) return;
      parts.push(key);
      set('capture.shortcut', parts.join('+')); k.classList.remove('rec'); show();
    };
    k.onblur = () => { k.classList.remove('rec'); show(); };
    return row(k, button(RA.t('common.reset'), () => { set('capture.shortcut', 'CommandOrControl+Shift+S'); show(); }), button(L('Nonaktifkan', 'Disable'), () => { set('capture.shortcut', ''); show(); }));
  }

  function capture() {
    return [
      group(L('Pintasan', 'Shortcut'),
        item(L('Pintasan global', 'Global shortcut'), L('Membuka menu tangkap layar, atau menghentikan rekaman yang berjalan.', 'Opens the capture menu, or stops a running recording.'), shortcutRecorder())
      ),
      group(L('Privasi', 'Privacy'),
        item(L('Sembunyikan island dari tangkapan & rekaman', 'Hide the island from screenshots & recordings'), L('Juga dari Snipping Tool, OBS, dan aplikasi lain.', 'Also from Snipping Tool, OBS and other tools.'), toggle('capture.hideFromCapture')),
        item(L('Rekam mikrofon', 'Record microphone'), L('Audio sistem selalu ikut direkam.', 'System audio is always recorded.'), toggle('capture.recordMic'))
      ),
      group(L('Lokasi file', 'File locations'),
        item(L('Tangkapan layar', 'Screenshots'), L('Gambar\\Screenshots — juga disalin ke clipboard.', 'Pictures\\Screenshots — also copied to the clipboard.'), button(RA.t('common.open'), async () => { const p = await RA.invoke('paths'); RA.invoke('openPath', p.pictures + '\\Screenshots'); })),
        item(L('Rekaman', 'Recordings'), 'Videos\\Captures (MP4)', button(RA.t('common.open'), async () => { const p = await RA.invoke('paths'); RA.invoke('openPath', p.videos + '\\Captures'); }))
      )
    ];
  }

  function phone() {
    const qrBox = document.createElement('div'); qrBox.className = 'row'; qrBox.style.alignItems = 'flex-start';
    const showQr = async () => {
      const r = await RA.invoke('phone.qr');
      if (!r || r.error) { qrBox.innerHTML = `<div class="note">⚠️ ${RA.esc((r && r.error) || '')}</div>`; return; }
      qrBox.innerHTML = `<img class="qr" src="${r.qr}"><div class="note">${L('Pindai dengan kamera ponsel (satu kali). Ponsel & laptop harus di Wi‑Fi yang sama dan jaringan disetel <b>Pribadi (Private)</b>.', 'Scan with your phone camera (once). Phone & laptop must share Wi‑Fi set to <b>Private</b>.')}<br><br>${RA.esc(r.url)}<br>${L('Jaringan', 'Network')}: ${RA.esc(r.network || '?')} (${RA.esc(r.category || '?')})</div>`;
    };
    return [
      group(L('Clipboard', 'Clipboard'),
        item(L('Riwayat clipboard', 'Clipboard history'), L('Teks & gambar. Tetap ada saat RA ditutup/dibuka, tetapi dihapus total saat laptop dimatikan/restart. Disimpan di %LOCALAPPDATA%\\RAAssistant\\Cache. Kode OTP tidak disimpan.', 'Text & images. Survives closing RA, wiped completely on shutdown/restart. Stored in %LOCALAPPDATA%\\RAAssistant\\Cache. OTP codes are never stored.'), toggle('phone.clipboard')),
        item(L('Lewati salinan dari pengelola kata sandi', 'Skip copies from password managers'), L('1Password, Bitwarden, KeePass, dll. serta salinan yang ditandai “jangan simpan riwayat”.', '1Password, Bitwarden, KeePass, etc. plus copies flagged “exclude from history”.'), toggle('phone.skipPasswordManagers'))
      ),
      group(L('Rak', 'Shelf'),
        item(L('Rak file', 'File shelf'), L('Seret file ke island untuk disimpan sementara, lalu seret keluar ke aplikasi lain.', 'Drag files onto the island to hold them, then drag them out to other apps.'), toggle('phone.shelf'))
      ),
      group(L('Ponsel', 'Phone'),
        item(L('Sambungan ponsel', 'Phone connection'), L('Kirim file & teks laptop⇄ponsel lewat Wi‑Fi lokal. File rak tampil di ponsel; file dari ponsel masuk ke rak. Hanya di jaringan Pribadi.', 'Send files & text laptop⇄phone over local Wi‑Fi. Shelf files appear on the phone; phone files land in the shelf. Private networks only.'), toggle('phone.enabled')),
        item(L('Kode QR', 'QR code'), '', button(L('Tampilkan QR', 'Show QR'), showQr, true)),
        item('', '', qrBox, { col: true })
      )
    ];
  }

  function about() {
    const d = document.createElement('div'); d.className = 'about';
    d.innerHTML = `<img src="../../assets/icon.png"><div><h2 style="margin:0">RA Assistant</h2><div class="note">v${RA.esc(RA.ver)} · ${L('Island desktop untuk Windows 11 dengan maskot Rara.', 'A desktop island for Windows 11 with Rara the mascot.')}</div></div>`;
    return [
      group('', item('', '', d, { col: true })),
      group(L('Kredit & data', 'Credits & data'),
        item(L('Lirik', 'Lyrics'), 'LRCLIB (lrclib.net)', null),
        item(L('Cuaca & geocoding', 'Weather & geocoding'), 'Open-Meteo (open-meteo.com), CC BY 4.0', null),
        item(L('Suara adzan bawaan', 'Default adhan sound'), RA.esc(S._adzanCredit || L('Lihat app/assets/adzan/CREDITS.txt', 'See app/assets/adzan/CREDITS.txt')), null),
        item(L('Privasi', 'Privacy'), L('Tanpa akun. Semua data lokal. Koneksi keluar hanya ke LRCLIB, Open-Meteo, dan URL iCal Anda.', 'No account. All data is local. Outbound connections only to LRCLIB, Open-Meteo and your iCal URL.'), null)
      )
    ];
  }

  // ------------------------------------------------------------- layout
  function nav() {
    const n = $('#nav'); n.innerHTML = '';
    for (const s of sections) {
      const b = document.createElement('button'); b.dataset.id = s.id;
      b.innerHTML = `${RA.icons[s.icon] || ''}<span>${RA.esc(RA.t(s.t))}</span>`;
      b.classList.toggle('on', s.id === current);
      b.onclick = () => go(s.id);
      n.appendChild(b);
    }
  }
  function go(id) {
    current = id;
    $('#q').value = '';
    renderAll();
    $('#main').scrollTop = 0;
  }
  function renderAll() {
    window.RAI18N.setLang(S.lang);
    $('#q').placeholder = RA.t('set.search');
    $('#ttl').textContent = RA.t('set.title');
    document.title = RA.t('set.title');
    nav();
    const m = $('#main'); m.innerHTML = '';
    const s = sections.find((x) => x.id === current);
    const h = document.createElement('h1'); h.textContent = RA.t(s.t); m.appendChild(h);
    for (const g of s.build()) m.appendChild(g);
    RA.applyMascot();
  }

  // Search across every section.
  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return renderAll();
    const m = $('#main'); m.innerHTML = '';
    let hits = 0;
    for (const s of sections) {
      const groups = s.build();
      const keep = [];
      for (const g of groups) {
        const its = [...g.querySelectorAll('.item')];
        let any = false;
        for (const it of its) { const ok = (it.dataset.search || '').includes(q) || RA.t(s.t).toLowerCase().includes(q); it.classList.toggle('hidden', !ok); if (ok) any = true; }
        if (any) keep.push(g);
      }
      if (keep.length) {
        const h = document.createElement('h1'); h.textContent = RA.t(s.t); h.style.fontSize = '16px'; m.appendChild(h);
        for (const g of keep) { m.appendChild(g); hits++; }
      }
    }
    if (!hits) m.innerHTML = `<div class="empty">${L('Tidak ada hasil', 'No results')}</div>`;
    RA.applyMascot();
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && e.key.toLowerCase() === 'f')) { e.preventDefault(); $('#q').focus(); $('#q').select(); }
  });
  $('#q').addEventListener('input', (e) => search(e.target.value));

  window.ra.on('ra:settings', (ns, changed) => { S = ns; RA.S = ns; if (changed === 'lang') renderAll(); });
  window.ra.on('ra:section', (id) => go(id));

  (async () => {
    const init = await RA.invoke('init');
    S = init.settings; RA.S = S; RA.ver = init.version;
    document.documentElement.style.setProperty('--accent', S.appearance.accent);
    const q = new URLSearchParams(location.search).get('section');
    if (q && sections.some((s) => s.id === q)) current = q;
    renderAll();
  })();
})();

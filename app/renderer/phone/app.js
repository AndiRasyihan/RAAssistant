(function () {
  const base = location.pathname.replace(/\/(index\.html)?$/, '/');
  const $ = (id) => document.getElementById(id);
  let lang = 'id';
  const L = (a, b) => (lang === 'en' ? b : a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  function toast(m) { const t = $('toast'); t.textContent = m; t.style.opacity = 1; setTimeout(() => (t.style.opacity = 0), 1800); }

  async function refresh() {
    try {
      const r = await fetch(base + 'api/state', { cache: 'no-store' });
      const s = await r.json();
      if (s.lang !== lang) { lang = s.lang; labels(); }
      $('shelf').innerHTML = s.shelf.length ? s.shelf.map((f) => `<div class="item"><span>📄</span><span class="n">${esc(f.name)}<br><span class="muted">${size(f.size)}</span></span><a href="${base}api/file/${f.id}" download>${L('Unduh', 'Download')}</a></div>`).join('') : L('Rak kosong. Seret file ke island di laptop.', 'Shelf is empty. Drag files onto the island.');
      $('texts').innerHTML = s.texts.length ? s.texts.map((t) => `<div class="item"><span class="txt">${esc(t.text)}</span><a href="#" data-copy="${esc(t.text)}">${L('Salin', 'Copy')}</a></div>`).join('') : L('Belum ada teks.', 'No texts yet.');
      $('sub').textContent = L('Tersambung ke laptop lewat Wi‑Fi lokal', 'Connected to your laptop over local Wi‑Fi');
    } catch { $('sub').textContent = L('Laptop tidak terjangkau. Pastikan RA Assistant berjalan.', 'Laptop unreachable. Make sure RA Assistant is running.'); }
  }
  function labels() {
    $('hSend').textContent = L('Kirim ke laptop', 'Send to laptop');
    $('pick').textContent = '📎 ' + L('Pilih file', 'Choose files');
    $('text').placeholder = L('Ketik atau tempel teks…', 'Type or paste text…');
    $('sendText').textContent = '✉️ ' + L('Kirim teks', 'Send text');
    $('hShelf').textContent = L('File di rak laptop', 'Files on the laptop shelf');
    $('hTexts').textContent = L('Teks dari laptop', 'Text from the laptop');
  }

  $('pick').onclick = () => $('file').click();
  $('file').onchange = async () => {
    const files = [...$('file').files];
    for (const f of files) {
      $('bar').style.display = 'block';
      await new Promise((resolve) => {
        const x = new XMLHttpRequest();
        x.open('POST', base + 'api/upload?name=' + encodeURIComponent(f.name));
        x.upload.onprogress = (e) => { if (e.lengthComputable) $('bar').firstChild.style.width = (e.loaded / e.total) * 100 + '%'; };
        x.onload = x.onerror = resolve;
        x.send(f);
      });
    }
    $('bar').style.display = 'none'; $('file').value = '';
    toast(L('Terkirim ✓', 'Sent ✓')); refresh();
  };
  $('sendText').onclick = async () => {
    const v = $('text').value.trim(); if (!v) return;
    await fetch(base + 'api/text', { method: 'POST', body: v });
    $('text').value = ''; toast(L('Terkirim ✓', 'Sent ✓'));
  };
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-copy]'); if (!a) return;
    e.preventDefault();
    try { await navigator.clipboard.writeText(a.dataset.copy); toast(L('Disalin', 'Copied')); }
    catch { const ta = document.createElement('textarea'); ta.value = a.dataset.copy; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(L('Disalin', 'Copied')); }
  });
  refresh();
  setInterval(refresh, 4000);
})();

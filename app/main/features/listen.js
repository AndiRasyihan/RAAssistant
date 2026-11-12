// Live speech-to-text ("Dengar" tab): offline Whisper running in a hidden window that only exists while
// listening, so it costs nothing when unused. The runtime (transformers.js + ONNX WASM, ~30 MB) and the
// model (~80 MB) are downloaded once on first use into the local cache; afterwards it works offline.
const fs = require('fs');
const path = require('path');
const { BrowserWindow, net } = require('electron');
const { pathToFileURL } = require('url');

const TJS = '4.3.2';
const ORT = '1.31.0-dev.20260914-8d85527a0';
const FILES = [
  [`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TJS}/dist/transformers.min.js`, 'transformers.min.js'],
  [`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT}/dist/ort-wasm-simd-threaded.asyncify.mjs`, 'ort-wasm-simd-threaded.asyncify.mjs'],
  [`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT}/dist/ort-wasm-simd-threaded.asyncify.wasm`, 'ort-wasm-simd-threaded.asyncify.wasm']
];
const MODELS = { tiny: 'Xenova/whisper-tiny', base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small' };

exports.init = (ctx) => {
  const libDir = path.join(ctx.paths.cache, 'whisper', `tjs-${TJS}`);
  let win = null, st = { on: false, status: 'off', text: '', partial: '', progress: 0, error: '' };
  const pub = (p) => { st = { ...st, ...p }; ctx.state('listen', st); };

  async function ensureLib() {
    fs.mkdirSync(libDir, { recursive: true });
    for (const [url, name] of FILES) {
      const f = path.join(libDir, name);
      if (fs.existsSync(f) && fs.statSync(f).size > 1000) continue;
      pub({ status: 'download', progress: 0 });
      const r = await net.fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${name}`);
      fs.writeFileSync(f + '.part', Buffer.from(await r.arrayBuffer()));
      fs.renameSync(f + '.part', f);
    }
  }

  async function start(opts = {}) {
    if (win) return true;
    pub({ on: true, status: 'loading', error: '', partial: '' });
    try { await ensureLib(); } catch (e) { pub({ on: false, status: 'error', error: String(e.message || e) }); return false; }
    const S = ctx.settings().listen;
    if ((S.source || 'mic') === 'mic' && ctx.sys) ctx.sys.send({ c: 'micsState' });
    win = new BrowserWindow({
      show: false, width: 300, height: 200,
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false }
    });
    win.on('closed', () => { win = null; if (st.on) pub({ on: false, status: 'off', partial: '' }); });
    win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'listen', 'listen.html'), {
      query: { lib: pathToFileURL(libDir).href + '/', model: MODELS[S.model] || MODELS.base, lang: S.lang || 'id', src: S.source || 'mic', file: opts.file || '', off: opts.off || 0 }
    });
    return true;
  }
  function stop() { if (win) win.close(); pub({ on: false, status: 'off', partial: '' }); }

  ctx.handle('listen.start', (o) => start(o));
  ctx.handle('listen.stop', () => stop());
  ctx.handle('listen.clear', () => pub({ text: '', partial: '' }));
  // Messages from the worker window.
  ctx.handle('listen.status', (s) => {
    pub(s);
    if (s.status === 'tested' || (testOut && s.status === 'error')) { try { fs.writeFileSync(testOut, JSON.stringify({ ...s, text: st.text })); } catch {} testOut = null; stop(); }
    return true;
  });
  ctx.handle('listen.final', (t) => { t = String(t || '').trim(); if (t) pub({ text: (st.text ? st.text + ' ' : '') + t, partial: '' }); return true; });
  ctx.handle('listen.partial', (t) => { pub({ partial: String(t || '').trim() }); return true; });
  ctx.handle('listen.copy', async () => {
    const t = [st.text, st.partial].filter(Boolean).join(' ').trim();
    if (!t) return false;
    ctx.bus.emit('clipboard:skipNext', t);
    await require('../clip').writeText(t);
    return true;
  });
  ctx.bus.on('quit', stop);
  // Self-test: `electron.exe <app> --listen-test=<audio file>` transcribes the file and writes
  // %TEMP%\ra_listen_test.json (used to verify the model without a microphone).
  let testOut = null;
  require('electron').app.on('second-instance', (e, argv) => {
    const a = argv.find((x) => x.startsWith('--listen-test='));
    if (!a) return;
    testOut = path.join(require('os').tmpdir(), 'ra_listen_test.json');
    stop(); pub({ text: '' });
    const off = argv.find((x) => x.startsWith('--listen-off='));
    start({ file: pathToFileURL(a.slice('--listen-test='.length)).href, off: off ? +off.split('=')[1] : 0 });
  });
};

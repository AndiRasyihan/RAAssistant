// Worker window for live speech-to-text. Captures the mic at 16 kHz, cuts speech into utterances with a
// simple energy-based voice detector and transcribes them with Whisper (transformers.js, WASM, offline).
const q = new URLSearchParams(location.search);
const invoke = (c, ...a) => window.ra.invoke(c, ...a);
const status = (s) => invoke('listen.status', s);
const LANG = { id: 'indonesian', en: 'english' };

const SR = 16000;
const PARTIAL_EVERY = 2.5;   // s of new speech between live (partial) updates
const SILENCE_END = 0.8;     // s of silence that ends an utterance
const MAX_UTT = 20;          // s, force-cut long utterances
const IDLE_STOP = 120;       // s without speech before listening stops by itself
let lastSpeech = performance.now();

let asr = null, busy = false;
let buf = [], len = 0, speechSeen = false, silence = 0, sinceUpdate = 0, floor = 0.004;

async function load() {
  const lib = q.get('lib');
  const { pipeline, env } = await import(lib + 'transformers.min.js');
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm.wasmPaths = lib;
  env.backends.onnx.wasm.numThreads = 1;
  const seen = {};
  asr = await pipeline('automatic-speech-recognition', q.get('model'), {
    device: 'wasm', dtype: 'q8',
    // Keep memory flat: no ever-growing CPU arena / pre-planned buffers.
    session_options: { enableCpuMemArena: false, enableMemPattern: false },
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) { seen[p.file] = [p.loaded, p.total]; const v = Object.values(seen); status({ status: 'model', progress: v.reduce((a, x) => a + x[0], 0) / v.reduce((a, x) => a + x[1], 0) }); }
    }
  });
}

function concat() {
  const out = new Float32Array(len); let o = 0;
  for (const b of buf) { out.set(b, o); o += b.length; }
  return out;
}

async function transcribe(audio) {
  const secs = audio.length / SR;
  const r = await asr(audio, {
    language: LANG[q.get('lang')] || null, task: 'transcribe',
    // ~4 tokens per second of speech is plenty; caps runaway repetition loops.
    max_new_tokens: Math.min(220, Math.ceil(secs * 5) + 12), no_repeat_ngram_size: 4, repetition_penalty: 1.15
  });
  let t = String((r && r.text) || '').trim();
  t = t.replace(/(\b[\w'’-]+\b[\s,]*)\1{2,}/giu, '$1').replace(/((?:\b[\w'’-]+\b[\s,]+){2,6}?)\1{2,}/giu, '$1').trim();
  // Whisper invents filler on near-silence; drop the usual suspects.
  return /^(\[.*\]|\(.*\)|terima kasih\.?|thank you\.?|you|\.+)$/i.test(t) ? '' : t;
}

async function finish() {
  const audio = concat();
  buf = []; len = 0; speechSeen = false; silence = 0; sinceUpdate = 0;
  if (audio.length < SR * 0.4) return;
  busy = true;
  try { await invoke('listen.final', await transcribe(audio)); } finally { busy = false; }
}

async function partial() {
  busy = true;
  try { await invoke('listen.partial', await transcribe(concat())); } finally { busy = false; }
}

let lvlT = 0, lvlMax = 0;
function feed(chunk) {
  let e = 0; for (let i = 0; i < chunk.length; i++) e += chunk[i] * chunk[i];
  const rms = Math.sqrt(e / chunk.length);
  lvlMax = Math.max(lvlMax, rms);
  if (performance.now() - lvlT > 400) { lvlT = performance.now(); invoke('listen.status', { level: Math.min(1, lvlMax * 12) }); lvlMax = 0; }
  const dt = chunk.length / SR;
  const speaking = rms > Math.max(0.012, floor * 3);
  if (!speaking) floor = floor * 0.97 + rms * 0.03;
  if (speaking) { speechSeen = true; silence = 0; lastSpeech = performance.now(); } else silence += dt;
  // Free the engine's memory when nobody has spoken for a while.
  if (performance.now() - lastSpeech > IDLE_STOP * 1000) { lastSpeech = Infinity; invoke('listen.stop'); return; }
  if (!speechSeen) { buf = [chunk]; len = chunk.length; return; } // keep a little lead-in only
  buf.push(chunk); len += chunk.length; sinceUpdate += dt;
  if (busy) return;
  if (silence >= SILENCE_END || len / SR >= MAX_UTT) finish();
  else if (sinceUpdate >= PARTIAL_EVERY) { sinceUpdate = 0; partial(); }
}

async function fromMic() {
  let stream;
  if (q.get('src') === 'system') {
    // System audio via the loopback display-media handler (video track is dropped right away).
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    for (const t of stream.getVideoTracks()) { t.stop(); stream.removeTrack(t); }
    if (!stream.getAudioTracks().length) throw new Error('no system audio');
  } else {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  }
  const ac = new AudioContext({ sampleRate: SR });
  const src = ac.createMediaStreamSource(stream);
  const node = ac.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (ev) => feed(new Float32Array(ev.inputBuffer.getChannelData(0)));
  src.connect(node); node.connect(ac.destination);
  lastSpeech = performance.now();
}

// Test hook: transcribe a file instead of the mic (?file=file:///...).
async function fromFile(url) {
  const ac = new AudioContext({ sampleRate: SR });
  const off = +(q.get('off') || 0) * SR;
  const audio = (await ac.decodeAudioData(await (await fetch(url)).arrayBuffer())).getChannelData(0).subarray(off, off + SR * 20);
  const t0 = performance.now();
  const text = await transcribe(audio);
  await invoke('listen.final', text);
  status({ status: 'tested', ms: Math.round(performance.now() - t0), seconds: +(audio.length / SR).toFixed(1) });
}

(async () => {
  try {
    await load();
    status({ status: 'listening', progress: 1 });
    if (q.get('file')) await fromFile(q.get('file')); else await fromMic();
  } catch (e) {
    status({ status: 'error', error: String((e && e.message) || e), on: false });
  }
})();

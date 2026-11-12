// Hidden recorder: display (+ system audio loopback) and optional microphone, streamed to disk in chunks.
(async function () {
  const wantMic = new URLSearchParams(location.search).get('mic') === '1';
  let rec = null, ac = null;
  const streams = [];
  try {
    const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    streams.push(display);
    let audioTracks = display.getAudioTracks();
    if (wantMic) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        streams.push(mic);
        // Mix system audio + mic into one track.
        ac = new AudioContext();
        const dest = ac.createMediaStreamDestination();
        for (const s of [display, mic]) if (s.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dest);
        audioTracks = dest.stream.getAudioTracks();
      } catch { /* no mic permission: keep system audio only */ }
    }
    const out = new MediaStream([...display.getVideoTracks(), ...audioTracks]);
    const candidates = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 8000000 });
    await window.ra.invoke('capture.recStart', mime.startsWith('video/mp4') ? 'mp4' : 'webm');
    let pending = Promise.resolve();
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      pending = pending.then(async () => window.ra.invoke('capture.recChunk', new Uint8Array(await e.data.arrayBuffer())));
    };
    rec.onstop = async () => {
      await pending;
      for (const s of streams) for (const tr of s.getTracks()) tr.stop();
      if (ac) ac.close();
      await window.ra.invoke('capture.recStop');
    };
    rec.start(1000);
    // If sharing ends from elsewhere.
    display.getVideoTracks()[0].addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); });
  } catch (e) {
    window.ra.invoke('capture.recError', (e && e.message) || String(e));
  }
  window.ra.on('ra:state', (k) => { if (k === 'stopRecording' && rec && rec.state !== 'inactive') rec.stop(); });
})();

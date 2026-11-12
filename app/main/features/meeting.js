// Camera/mic indicators + automatic meeting mode.
exports.init = (ctx) => {
  const t = ctx.i18n.t;
  let meeting = null;        // { since, apps, pausedMusic }
  let pendingSince = 0;
  let lastPrivacy = { cam: [], mic: [] };

  const parse = (s) => String(s || '').split('|').filter(Boolean).map((x) => { const i = x.lastIndexOf(':'); return { app: x.slice(0, i), since: +x.slice(i + 1) || Date.now() }; });
  const label = (a) => a.split(/[\\/]/).pop().replace(/\.exe$/i, '').replace(/^microsoft\./, '').replace(/_[a-z0-9]{10,}$/i, '');

  function evaluate() {
    const S = ctx.settings().meetings;
    const ignore = (S.ignoreApps || []).map((x) => x.toLowerCase());
    const isIgnored = (a) => ignore.includes(a.split(/[\\/]/).pop()) || /whatsapp/i.test(a);
    const users = [...lastPrivacy.mic, ...lastPrivacy.cam].filter((u) => !isIgnored(u.app));
    const now = Date.now();
    // Counts as a meeting once a non-ignored app has used the cam/mic for more than 6 s.
    const long = users.filter((u) => now - u.since > 6000);
    if (S.auto && long.length && !meeting) {
      const media = ctx.media && ctx.media();
      meeting = { since: now, apps: [...new Set(long.map((u) => label(u.app)))], pausedMusic: false };
      if (media && media.status === 4) { ctx.sys.send({ c: 'media', a: 'pause' }); meeting.pausedMusic = true; }
      ctx.sys.send({ c: 'micsState' });
      ctx.state('meeting', { on: true, apps: meeting.apps, since: now });
    } else if (meeting && !users.length) {
      const was = meeting;
      meeting = null;
      ctx.state('meeting', { on: false, ended: now, duration: now - was.since });
      if (was.pausedMusic) ctx.sys.send({ c: 'media', a: 'play' });
    } else if (!meeting && users.length && !pendingSince) {
      pendingSince = now;
      setTimeout(() => { pendingSince = 0; evaluate(); }, 6500);
    }
  }

  ctx.bus.on('privacy', (m) => {
    lastPrivacy = { cam: parse(m.cam), mic: parse(m.mic) };
    ctx.state('privacy', { cam: lastPrivacy.cam.length > 0, mic: lastPrivacy.mic.length > 0, camApps: lastPrivacy.cam.map((u) => label(u.app)), micApps: lastPrivacy.mic.map((u) => label(u.app)) });
    evaluate();
  });
  ctx.bus.on('mics', (m) => ctx.state('mics', { muted: m.muted === 1 }));
  ctx.inMeeting = () => !!meeting || (lastPrivacy.mic.length > 0);
  ctx.handle('mics.toggle', () => {
    const cur = ctx.getState('mics');
    ctx.sys.send({ c: 'mics', v: !(cur && cur.muted) });
  });
  void t;
};

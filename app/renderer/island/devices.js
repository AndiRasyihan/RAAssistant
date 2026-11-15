// Animated device & connection notices (charger, Wi‑Fi, Bluetooth, USB/ports, displays).
// Original line art, drawn in the island's accent colour. Data comes from main (devices.js) or,
// for the charger, from the Battery API below.
(() => {
  const L = (id, en) => RA.L(id, en);
  const SV = (body, cls = '') => `<svg class="dvsvg ${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

  const ART = {
    battery: (lvl) => SV(`<rect x="6" y="15" width="32" height="18" rx="4.5"/><path d="M41 21v6"/><rect class="dvfill" x="9.5" y="18.5" width="${Math.max(2, 25 * lvl)}" height="11" rx="2" fill="currentColor" stroke="none"/><path class="dvbolt" d="M24 17.5l-5 7.2h4.4l-1.6 5.8 5.6-7.6h-4.5z" fill="var(--dvbg)" stroke="none"/>`),
    wifi: () => SV(`<path class="a3" d="M7 19a24.5 24.5 0 0134 0"/><path class="a2" d="M12.5 25a16.5 16.5 0 0123 0"/><path class="a1" d="M18 31a8.6 8.6 0 0112 0"/><circle class="a0" cx="24" cy="36.5" r="2" fill="currentColor" stroke="none"/>`, 'wf'),
    lan: () => SV(`<rect x="12" y="10" width="24" height="18" rx="2.5"/><path d="M18 28v5h12v-5M24 33v6M17 16v4M21 16v4M25 16v4M29 16v4"/>`),
    headphones: () => SV(`<path d="M10 30v-5a14 14 0 0128 0v5"/><rect x="7" y="28" width="8" height="12" rx="3"/><rect x="33" y="28" width="8" height="12" rx="3"/>`),
    tws: () => SV(`<g class="budL"><circle cx="14" cy="16" r="5.6"/><path d="M11.5 21.2v10.3a2.5 2.5 0 005 0V21.2"/></g><g class="budR"><circle cx="34" cy="16" r="5.6"/><path d="M31.5 21.2v10.3a2.5 2.5 0 005 0V21.2"/></g><rect class="case" x="15" y="36" width="18" height="8" rx="4"/>`),
    speaker: () => SV(`<rect x="12" y="6" width="24" height="36" rx="5"/><circle cx="24" cy="29" r="6.5"/><circle cx="24" cy="15" r="2.6"/><path class="wv" d="M42 22c2 2.2 2 5.8 0 8M6 22c-2 2.2-2 5.8 0 8"/>`),
    mouse: () => SV(`<rect x="14" y="7" width="20" height="34" rx="10"/><path d="M24 7v11M24 13v3"/>`),
    keyboard: () => SV(`<rect x="5" y="14" width="38" height="21" rx="3.5"/><path d="M11 21h.01M17 21h.01M23 21h.01M29 21h.01M35 21h.01M11 27h.01M35 27h.01M17 28h14"/>`),
    phone: () => SV(`<rect x="14" y="5" width="20" height="38" rx="4.5"/><path d="M21 9h6M22 38.5h4"/>`),
    gamepad: () => SV(`<path d="M15 15h18a9 9 0 019 9l1.5 8.5a4.4 4.4 0 01-7.7 3.5L31 31H17l-4.8 5a4.4 4.4 0 01-7.7-3.5L6 24a9 9 0 019-9z"/><path d="M15 21v6M12 24h6M32.5 22h.01M35.5 26h.01"/>`),
    drive: () => SV(`<rect x="13" y="18" width="22" height="25" rx="4"/><path d="M17 18V7h14v11M21 11h1.5M25.5 11H27"/><path d="M19 30h10"/>`),
    display: () => SV(`<rect x="5" y="8" width="38" height="25" rx="3"/><path d="M18 41h12M24 33v8"/><path class="glow" d="M10 13h28v15H10z" fill="currentColor" stroke="none" opacity=".18"/>`),
    camera: () => SV(`<rect x="6" y="14" width="27" height="20" rx="4"/><path d="M33 21l9-5v16l-9-5"/>`),
    audio: () => SV(`<path d="M12 28v-4a12 12 0 0124 0v4"/><rect x="9" y="27" width="7" height="11" rx="3"/><rect x="32" y="27" width="7" height="11" rx="3"/><path d="M16 38c0 3 3 4 6 4"/>`),
    printer: () => SV(`<path d="M14 18V7h20v11"/><rect x="7" y="18" width="34" height="15" rx="3"/><path d="M14 28h20v13H14z"/>`),
    tether: () => SV(`<rect x="15" y="9" width="18" height="32" rx="4"/><path d="M8 15a9 9 0 000 12M40 15a9 9 0 010 12"/>`),
    watch: () => SV(`<rect x="13" y="13" width="22" height="22" rx="6"/><path d="M18 13l2-7h8l2 7M18 35l2 7h8l2-7M24 19v5l3 2"/>`),
    laptop: () => SV(`<rect x="10" y="10" width="28" height="20" rx="2.5"/><path d="M5 37h38l-4-7H9z"/>`),
    car: () => SV(`<path d="M8 30l3.5-10a4 4 0 013.8-2.7h17.4a4 4 0 013.8 2.7L40 30v7H8z"/><circle cx="15" cy="31" r="2"/><circle cx="33" cy="31" r="2"/>`),
    bt: () => SV(`<path d="M15 15.5l18 17-9 8v-33l9 8-18 17"/>`),
    usb: () => SV(`<path d="M24 42V8M24 8l-4 5M24 8l4 5M24 32l-8-6v-6M24 27l8-6v-4"/><circle cx="16" cy="18" r="2.4"/><rect x="29.5" y="13" width="5" height="4.5" rx="1"/>`)
  };
  ART.input = ART.mouse; ART.generic = ART.bt; ART.ethernet = ART.lan; ART.serial = ART.usb; ART.finger = ART.usb; ART.card = ART.usb;

  const KIND = {
    headphones: ['Headphone', 'Headphones'], tws: ['Earbuds TWS', 'Earbuds'], speaker: ['Speaker', 'Speaker'], mouse: ['Mouse', 'Mouse'],
    keyboard: ['Keyboard', 'Keyboard'], phone: ['Ponsel', 'Phone'], gamepad: ['Stik game', 'Controller'], drive: ['Penyimpanan', 'Storage'],
    display: ['Monitor', 'Display'], camera: ['Kamera', 'Camera'], audio: ['Audio USB', 'USB audio'], printer: ['Printer', 'Printer'],
    tether: ['Tethering', 'Tethering'], ethernet: ['Adaptor LAN', 'LAN adapter'], serial: ['Port serial', 'Serial port'], finger: ['Sidik jari', 'Fingerprint'],
    card: ['Pembaca kartu', 'Card reader'], watch: ['Jam pintar', 'Smartwatch'], laptop: ['Komputer', 'Computer'], car: ['Audio mobil', 'Car audio'],
    input: ['Perangkat input', 'Input device'], generic: ['Perangkat', 'Device'], usb: ['Perangkat USB', 'USB device']
  };
  const kindLabel = (k) => { const v = KIND[k] || KIND.generic; return L(v[0], v[1]); };

  function chip(pct) {
    if (pct == null) return '';
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const low = p <= 20 ? ' low' : '';
    return `<div class="dvchip${low}"><span class="dvbat"><b style="--p:${p}%"></b></span><span><span class="dvnum" data-to="${p}">0</span>%</span></div>`;
  }
  function bars(sig) {
    if (sig == null) return '';
    const n = sig >= 75 ? 4 : sig >= 50 ? 3 : sig >= 25 ? 2 : 1;
    return `<div class="dvchip"><span class="dvbars">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}" style="--i:${i}"></i>`).join('')}</span><span><span class="dvnum" data-to="${sig}">0</span>%</span></div>`;
  }

  // dev → { html, w, h }
  RA.deviceView = (dev) => {
    const on = dev.on !== false;
    let art, title, sub, right = '', anim = on ? 'in' : 'out', cls = '';
    switch (dev.type) {
      case 'charger': {
        const pct = Math.round((dev.level || 0) * 100);
        art = ART.battery(dev.level || 0); cls = 'chg';
        title = on ? L('Mengisi daya', 'Charging') : L('Charger dicabut', 'Charger unplugged');
        sub = on ? L('Charger tersambung', 'Charger connected') : L('Pakai baterai', 'On battery');
        right = chip(pct); anim = on ? 'charge' : 'out';
        break;
      }
      case 'wifi':
        art = ART.wifi(); cls = 'wifi';
        title = dev.name || 'Wi‑Fi';
        sub = on ? L('Wi‑Fi tersambung', 'Wi‑Fi connected') : L('Wi‑Fi terputus', 'Wi‑Fi disconnected');
        right = on ? bars(dev.signal) : '';
        anim = on ? 'wave' : 'out';
        break;
      case 'lan':
        art = ART.lan(); title = L('Kabel LAN', 'LAN cable');
        sub = on ? L('Tersambung', 'Connected') : L('Dicabut', 'Unplugged');
        break;
      case 'bt':
        art = (ART[dev.kind] || ART.bt)(); cls = 'bt k-' + (dev.kind || 'generic');
        title = dev.name || kindLabel(dev.kind);
        sub = `${kindLabel(dev.kind)} · ${on ? L('Bluetooth tersambung', 'Bluetooth connected') : L('Terputus', 'Disconnected')}`;
        right = on ? chip(dev.battery) : '';
        anim = on ? 'pair' : 'out';
        break;
      case 'display':
        art = ART.display(); cls = 'disp';
        title = dev.name || kindLabel('display');
        sub = `${on ? L('Monitor tersambung', 'Display connected') : L('Monitor dilepas', 'Display disconnected')}${dev.extra ? ' · ' + dev.extra : ''}`;
        anim = on ? 'glow' : 'out';
        break;
      default: { // usb & ports
        const k = dev.kind || 'usb';
        art = (ART[k] || ART.usb)(); cls = 'usb k-' + k;
        title = dev.name || kindLabel(k);
        sub = `${kindLabel(k)} · ${on ? L('dicolok', 'plugged in') : L('dicabut', 'unplugged')}${dev.extra ? ' · ' + dev.extra : ''}${dev.more ? ' · +' + dev.more : ''}`;
        anim = on ? 'plug' : 'out';
      }
    }
    const badge = dev.type === 'bt' ? `<span class="dvbadge">${ART.bt()}</span>` : dev.type === 'usb' ? `<span class="dvbadge">${ART.usb()}</span>` : '';
    const html = `<div class="dv ${cls} a-${anim}"><div class="dvart"><span class="ring"></span>${art}${badge}</div><div class="dvtxt"><div class="dvtitle">${RA.esc(title)}</div><div class="dvsub">${RA.esc(sub)}</div></div>${right}</div>`;
    return { html, w: right ? 400 : 360, h: 64 };
  };

  // Count numbers up once the notice is on screen.
  RA.deviceAfter = (box) => {
    for (const n of box.querySelectorAll('.dvnum[data-to]')) {
      const to = +n.dataset.to, t0 = performance.now(), dur = 900;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur); n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  };

  // Charger plug/unplug from the Battery API (instant, no helper needed).
  RA.on('battery', (b) => {
    const prev = RA._lastBat; RA._lastBat = { ...b };
    if (!prev || prev.charging === b.charging) return;
    if (!RA.S.devices || RA.S.devices.charger === false) return;
    RA.emit('toast', { kind: 'device', dev: { type: 'charger', level: b.level, on: b.charging }, title: 'charger', ms: b.charging ? 4500 : 3500 });
  });
})();

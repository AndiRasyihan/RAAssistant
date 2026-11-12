// Generates app/assets/icon.png, icon.ico and tray.png from the mascot SVG.
// Run: node_modules\electron\dist\electron.exe scripts\make-icons.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'app', 'assets');
const face = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  ${bg ? '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7cff"/><stop offset="1" stop-color="#3fc8c0"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/>' : ''}
  <g transform="${bg ? 'translate(5 5) scale(.84)' : ''}">
  <path d="M32 13c0-4 2.5-7.5 7-8.5-1 4.5-3.5 7-7 8.5z" fill="#7ee2a8"/><path d="M32 13c-.3-3.2-2.6-5.8-5.6-6.2.3 3.1 2.4 5.3 5.6 6.2z" fill="#7ee2a8"/>
  <path d="M32 13c12 0 21 8.5 21 20.5C53 46 44 54 32 54S11 46 11 33.5C11 21.5 20 13 32 13z" fill="#f2efff"/>
  <circle cx="19.5" cy="39" r="3.2" fill="#ffb4c8"/><circle cx="44.5" cy="39" r="3.2" fill="#ffb4c8"/>
  <rect x="22.5" y="26" width="6" height="9.5" rx="3" fill="#2b2440"/><rect x="35.5" y="26" width="6" height="9.5" rx="3" fill="#2b2440"/>
  <circle cx="27" cy="28.3" r="1.2" fill="#fff"/><circle cx="40" cy="28.3" r="1.2" fill="#fff"/>
  <path d="M28.5 41q3.5 3 7 0" fill="none" stroke="#2b2440" stroke-width="1.8" stroke-linecap="round"/></g>
</svg>`;

function ico(pngs) {
  // ICO container with embedded PNG images.
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3); dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<html><body></body></html>');
  const render = (svg, size) => w.webContents.executeJavaScript(`new Promise(r=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=c.height=${size};const x=c.getContext('2d');x.drawImage(i,0,0,${size},${size});r(c.toDataURL('image/png'))};i.src='data:image/svg+xml;base64,'+${JSON.stringify(Buffer.from(svg).toString('base64'))}.toString()})`);
  const png = async (svg, size) => Buffer.from((await render(svg, size)).split(',')[1], 'base64');
  fs.mkdirSync(OUT, { recursive: true });
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const imgs = [];
  for (const s of sizes) imgs.push({ size: s, buf: await png(face(true), s) });
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(imgs));
  fs.writeFileSync(path.join(OUT, 'icon.png'), imgs.find((x) => x.size === 256).buf);
  fs.writeFileSync(path.join(OUT, 'tray.png'), await png(face(false), 32));
  fs.writeFileSync(path.join(OUT, 'tray@2x.png'), await png(face(false), 64));
  console.log('icons written');
  app.quit();
});

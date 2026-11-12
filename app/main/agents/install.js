// Packs extension/ra-agent-bridge into a .vsix (zip, stored) and installs it with each editor's CLI.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const EXT_DIR = path.join(__dirname, '..', '..', '..', 'extension', 'ra-agent-bridge');
const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const EDITORS = [
  { id: 'vscode', name: 'VS Code', cli: path.join(LOCAL, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'), extDir: path.join(os.homedir(), '.vscode', 'extensions') },
  { id: 'vscode-insiders', name: 'VS Code Insiders', cli: path.join(LOCAL, 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'), extDir: path.join(os.homedir(), '.vscode-insiders', 'extensions') },
  { id: 'antigravity', name: 'Antigravity IDE', cli: path.join(LOCAL, 'Programs', 'Antigravity IDE', 'bin', 'antigravity-ide.cmd'), extDir: path.join(os.homedir(), '.antigravity-ide', 'extensions') }
];

// --- minimal zip writer (store, no compression)
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, n, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

function buildVsix() {
  const pkg = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'package.json'), 'utf8'));
  const files = fs.readdirSync(EXT_DIR).filter((f) => /\.(js|json|md)$/.test(f));
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"/>
    <DisplayName>${pkg.displayName}</DisplayName>
    <Description xml:space="preserve">${pkg.description}</Description>
    <Categories>Other</Categories>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${pkg.engines.vscode}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui"/></Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>`;
  const types = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".md" ContentType="text/markdown"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>';
  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from(types) },
    { name: 'extension.vsixmanifest', data: Buffer.from(manifest) },
    ...files.map((f) => ({ name: 'extension/' + f, data: fs.readFileSync(path.join(EXT_DIR, f)) }))
  ];
  const out = path.join(os.tmpdir(), `${pkg.name}-${pkg.version}.vsix`);
  fs.writeFileSync(out, zip(entries));
  return { file: out, pkg };
}

function run(cli, args) {
  return new Promise((resolve) => {
    const line = '"' + [cli, ...args].map((a) => '"' + a + '"').join(' ') + '"';
    execFile('cmd.exe', ['/d', '/s', '/c', line], { windowsHide: true, timeout: 120000, windowsVerbatimArguments: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || '') + String(stderr || '') });
    });
  });
}

function extInstalled(e) {
  try { return fs.readdirSync(e.extDir).some((d) => d.startsWith('ra-assistant.ra-agent-bridge')); } catch { return false; }
}

function info(status) {
  return {
    editors: EDITORS.filter((e) => e.id !== 'vscode-insiders' || fs.existsSync(e.cli)).map((e) => ({
      id: e.id, name: e.name, installed: fs.existsSync(e.cli), extInstalled: extInstalled(e),
      connected: e.id === 'antigravity' ? !!status.antigravity : !!status.vscode
    }))
  };
}

async function install() {
  const { file, pkg } = buildVsix();
  const results = [];
  for (const e of EDITORS) {
    if (!fs.existsSync(e.cli)) continue;
    const r = await run(e.cli, ['--install-extension', file, '--force']);
    results.push(`${e.name}: ${r.ok && /success|installed/i.test(r.out) ? 'OK' : 'gagal/failed — ' + r.out.trim().split('\n').pop()}`);
  }
  if (!results.length) return { message: 'VS Code / Antigravity IDE tidak ditemukan.' };
  return { message: `${pkg.displayName} ${pkg.version} → ` + results.join(' · ') + ' — muat ulang jendela editor (Developer: Reload Window).' };
}

module.exports = { info, install, buildVsix };

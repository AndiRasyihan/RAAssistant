// Thin wrapper over Electron 45's async, W3C-style clipboard API.
const { clipboard, ClipboardItem } = require('electron');

async function writeText(text) { await clipboard.writeText(String(text)); }

async function writeImagePng(png) {
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
}

// Returns { type: 'image', png } | { type: 'text', text } | null
async function read() {
  const items = await clipboard.read();
  const it = items && items[0];
  if (!it) return null;
  const types = it.types || [];
  const img = types.find((t) => t.startsWith('image/'));
  if (img) {
    const b = await it.getType(img);
    return { type: 'image', png: Buffer.from(await b.arrayBuffer()), mime: img };
  }
  if (types.includes('text/plain')) {
    const b = await it.getType('text/plain');
    return { type: 'text', text: typeof b === 'string' ? b : await b.text() };
  }
  return null;
}

// Raw Windows clipboard formats such as "ExcludeClipboardContentFromMonitorProcessing".
async function hasRaw(format) {
  try { return await clipboard.has(`electron application/osclipboard;format="${format}"`); } catch { return false; }
}

module.exports = { writeText, writeImagePng, read, hasRaw };

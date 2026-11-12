const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ra', {
  invoke: (cmd, ...args) => ipcRenderer.invoke('ra', cmd, args),
  on: (channel, cb) => {
    const ok = ['ra:state', 'ra:settings', 'ra:blur', 'ra:section'];
    if (!ok.includes(channel)) return;
    ipcRenderer.on(channel, (e, ...a) => cb(...a));
  },
  ignore: (v) => ipcRenderer.send('ra:ignore', v),
  hover: (v) => ipcRenderer.send('ra:hover', v),
  focus: (v) => ipcRenderer.send('ra:focus', v),
  dragOut: (file) => ipcRenderer.send('ra:drag-out', file),
  pillMove: (dx, dy) => ipcRenderer.send('ra:pill-move', dx, dy),
  filePath: (f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }
});

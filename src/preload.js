// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pm2Api', {
  list: () => ipcRenderer.invoke('pm2-list'),
  start: (script, options) => ipcRenderer.invoke('pm2-start', script, options),
  stop: (id) => ipcRenderer.invoke('pm2-stop', id),
  restart: (id) => ipcRenderer.invoke('pm2-restart', id),
  delete: (id) => ipcRenderer.invoke('pm2-delete', id),
  logs: (id) => ipcRenderer.invoke('pm2-logs', id),
  getConfig: (id) => ipcRenderer.invoke('pm2-get-config', id),
  setConfig: (id, config) => ipcRenderer.invoke('pm2-set-config', id, config)
});

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close')
});

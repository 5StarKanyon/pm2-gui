// preload.js - Electron preload script for PM2 GUI
//
// Exposes secure APIs to the renderer process using contextBridge.
// Only safe, whitelisted methods are available to the frontend.
//
// NOTE: Never expose Node.js or Electron internals directly to the renderer!
// If you add new features, add new APIs here and handle them in index.js.

const { contextBridge, ipcRenderer } = require('electron');

// PM2 API: all process management actions
contextBridge.exposeInMainWorld('pm2Api', {
  list: () => ipcRenderer.invoke('pm2-list'),
  start: (script, options) => ipcRenderer.invoke('pm2-start', script, options),
  stop: (id) => ipcRenderer.invoke('pm2-stop', id),
  restart: (id) => ipcRenderer.invoke('pm2-restart', id),
  delete: (id) => ipcRenderer.invoke('pm2-delete', id),
  logs: (id) => ipcRenderer.invoke('pm2-logs', id), // Accepts id or {id, offset, lines}
  getConfig: (id) => ipcRenderer.invoke('pm2-get-config', id),
  setConfig: (id, config) => ipcRenderer.invoke('pm2-set-config', id, config),
});

// Window controls for custom title bar
contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});

// --- FUTURE IDEAS ---
// - Add more granular PM2 APIs (logs for err, out, etc)
// - Add app settings API
// - Add file dialogs or notifications if needed

// preload.js - Electron preload script for PM2 GUI
//
// Exposes secure APIs to the renderer process using contextBridge.
// Only safe, whitelisted methods are available to the frontend.
//
// NOTE: Never expose Node.js or Electron internals directly to the renderer!
// If you add new features, add new APIs here and handle them in index.js.

const { contextBridge, ipcRenderer } = require('electron');

// Defensive: Ensure contextBridge and ipcRenderer are available
if (contextBridge && ipcRenderer) {
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
    // --- New APIs for advanced features ---
    getServiceStatus: () => ipcRenderer.invoke('pm2-get-service-status'),
    installService: () => ipcRenderer.invoke('pm2-install-service'),
    uninstallService: () => ipcRenderer.invoke('pm2-uninstall-service'),
    getDependencies: () => ipcRenderer.invoke('pm2-get-dependencies'),
    getGlobalEnv: () => ipcRenderer.invoke('pm2-get-global-env'),
    setGlobalEnv: (env) => ipcRenderer.invoke('pm2-set-global-env', env),
    getProcessHistory: (id) => ipcRenderer.invoke('pm2-get-process-history', id),
  });

  // Window controls for custom title bar
  contextBridge.exposeInMainWorld('windowControls', {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
  });
} else {
  // Fallback: Expose no-ops to prevent renderer errors
  window.pm2Api = {
    list: async () => [],
    start: async () => {},
    stop: async () => {},
    restart: async () => {},
    delete: async () => {},
    logs: async () => ({}),
    getConfig: async () => ({}),
    setConfig: async () => ({}),
  };
  window.windowControls = {
    minimize: () => {},
    maximize: () => {},
    close: () => {},
  };
}

// --- FUTURE IDEAS ---
// - Add more granular PM2 APIs (logs for err, out, etc)
// - Add app settings API
// - Add file dialogs or notifications if needed

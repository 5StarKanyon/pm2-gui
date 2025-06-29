// index.js - Main Electron process for PM2 GUI
//
// Handles window creation, secure IPC, and all backend logic for PM2 process management.
//
// NOTE: Keep all Node.js/PM2 logic here. Only expose safe APIs to renderer via preload.js.

const { Buffer } = require('buffer'); // Fix: Ensure Buffer is defined for Node.js
const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const pm2 = require('pm2');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Create the main browser window (frameless, dark themed)
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: true, // Show the default OS window bar
    // Remove custom titleBarStyle for native controls
    backgroundColor: '#181a1b', // Dark background
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Secure contextBridge
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  // mainWindow.webContents.openDevTools(); // Uncomment for debugging
};

// App ready: create window, handle macOS dock behavior

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  return null; // ESLint: then() should return a value
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- PM2 IPC HANDLERS ---
// Helper to promisify pm2 methods
function pm2Promise(method, ...args) {
  return new Promise((resolve, reject) => {
    pm2[method](...args, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}
// Ensure PM2 is connected before any action
function ensurePM2Connected() {
  return new Promise((resolve, reject) => {
    pm2.connect((err) => {
      if (err && err.message !== 'PM2 is already connected') {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// List all PM2 processes
ipcMain.handle('pm2-list', async () => {
  await ensurePM2Connected();
  return pm2Promise('list');
});
// Start a new process
ipcMain.handle('pm2-start', async (event, script, options) => {
  await ensurePM2Connected();
  return pm2Promise('start', script, options || {});
});
// Stop a process
ipcMain.handle('pm2-stop', async (event, id) => {
  await ensurePM2Connected();
  return pm2Promise('stop', id);
});
// Restart a process
ipcMain.handle('pm2-restart', async (event, id) => {
  await ensurePM2Connected();
  return pm2Promise('restart', id);
});
// Delete a process
ipcMain.handle('pm2-delete', async (event, id) => {
  await ensurePM2Connected();
  return pm2Promise('delete', id);
});
// Efficient log tailing: returns last N lines or new lines after offset
ipcMain.handle('pm2-logs', async (event, arg) => {
  await ensurePM2Connected();
  // arg can be id (number) or {id, offset, lines}
  let id,
    offset = 0,
    lines = 200;
  if (typeof arg === 'object' && arg !== null) {
    id = arg.id;
    offset = arg.offset || 0;
    lines = arg.lines || 200;
  } else {
    id = arg;
  }
  return pm2Promise('describe', id).then((proc) => {
    if (!proc[0] || !proc[0].pm2_env || !proc[0].pm2_env.pm_out_log_path) {
      return { log: '', newOffset: 0 };
    }
    const fs = require('fs');
    const logPath = proc[0].pm2_env.pm_out_log_path;
    try {
      const stats = fs.statSync(logPath);
      let log = '';
      let newOffset = stats.size;
      if (offset && offset < stats.size) {
        // Read new data since offset (for live tailing)
        const fd = fs.openSync(logPath, 'r');
        const buf = Buffer.alloc(stats.size - offset);
        fs.readSync(fd, buf, 0, stats.size - offset, offset);
        fs.closeSync(fd);
        log = buf.toString();
      } else {
        // Tail last N lines (default 200), max 64KB
        const fd = fs.openSync(logPath, 'r');
        const chunkSize = Math.min(64 * 1024, stats.size); // Read last 64KB max
        const buf = Buffer.alloc(chunkSize);
        fs.readSync(fd, buf, 0, chunkSize, stats.size - chunkSize);
        fs.closeSync(fd);
        const all = buf.toString();
        const linesArr = all.split(/\r?\n/).filter(Boolean);
        log = linesArr.slice(-lines).join('\n');
      }
      return { log, newOffset };
    } catch (e) {
      return { log: '', newOffset: 0 };
    }
  });
});
// Get process config (env)
ipcMain.handle('pm2-get-config', async (event, id) => {
  await ensurePM2Connected();
  return pm2Promise('describe', id).then((proc) => proc[0]?.pm2_env || {});
});
// Set process config (not supported by PM2, placeholder)
// eslint-disable-next-line no-unused-vars
ipcMain.handle('pm2-set-config', async (event, id, config) => {
  await ensurePM2Connected();
  // PM2 does not support direct config editing; this is a placeholder
  return { success: false, message: 'Direct config editing not supported via API.' };
});

// --- PM2 Windows Service, Dependency, Env, and History IPC HANDLERS ---
const fs = require('fs');
const os = require('os');

// PM2 Windows Service Status
ipcMain.handle('pm2-get-service-status', async () => {
  // Check if pm2-windows-service is installed and running
  try {
    const Service = require('node-windows').Service;
    const svc = new Service({
      name: 'PM2',
    });
    // node-windows Service API is async, but we can check existence by file
    const exists = fs.existsSync(path.join(os.homedir(), 'AppData', 'Roaming', 'pm2', 'service-install.log'));
    return { installed: exists };
  } catch (e) {
    return { installed: false, error: e.message };
  }
});
// Install PM2 as Windows Service
ipcMain.handle('pm2-install-service', async () => {
  // Use pm2-windows-service CLI
  const { execSync } = require('child_process');
  try {
    execSync('npx pm2-service-install -y', { stdio: 'ignore' });
    return { success: true };
  } catch (e) {
    throw new Error(e.message || 'Failed to install service');
  }
});
// Uninstall PM2 Windows Service
ipcMain.handle('pm2-uninstall-service', async () => {
  const { execSync } = require('child_process');
  try {
    execSync('npx pm2-service-uninstall -y', { stdio: 'ignore' });
    return { success: true };
  } catch (e) {
    throw new Error(e.message || 'Failed to uninstall service');
  }
});
// Get process dependencies (from config)
ipcMain.handle('pm2-get-dependencies', async () => {
  await ensurePM2Connected();
  const list = await pm2Promise('list');
  return list.map(proc => {
    const env = proc.pm2_env || {};
    return {
      name: env.name,
      dependsOn: Array.isArray(env.dependsOn) ? env.dependsOn : [],
    };
  });
});
// Global env management (simple JSON file in userData)
const globalEnvPath = path.join(app.getPath('userData'), 'global.env.json');
ipcMain.handle('pm2-get-global-env', async () => {
  try {
    if (fs.existsSync(globalEnvPath)) {
      return JSON.parse(fs.readFileSync(globalEnvPath, 'utf8'));
    }
    return {};
  } catch (e) {
    return {};
  }
});
ipcMain.handle('pm2-set-global-env', async (event, env) => {
  try {
    fs.writeFileSync(globalEnvPath, JSON.stringify(env, null, 2), 'utf8');
    return { success: true };
  } catch (e) {
    throw new Error('Failed to save global env: ' + e.message);
  }
});
// Process history (simulate with restart/crash info from pm2_env)
ipcMain.handle('pm2-get-process-history', async (event, id) => {
  await ensurePM2Connected();
  const desc = await pm2Promise('describe', id);
  const env = desc[0]?.pm2_env;
  if (!env) return [];
  const history = [];
  if (env.pm_uptime) {
    history.push({ date: new Date(env.pm_uptime).toLocaleString(), event: 'Started', code: 0 });
  }
  if (Array.isArray(env.axm_actions)) {
    env.axm_actions.forEach((a) => {
      if (a.action === 'restart') {
        history.push({ date: new Date(a.date).toLocaleString(), event: 'Restarted', code: a.code });
      }
    });
  }
  if (env.exit_code !== undefined && env.exit_code !== 0) {
    history.push({ date: new Date(env.pm_uptime).toLocaleString(), event: 'Crashed', code: env.exit_code });
  }
  // Add restart count
  if (env.restart_time) {
    history.push({ date: '-', event: 'Restart Count', code: env.restart_time });
  }
  return history;
});

// --- Window bar actions (minimize, maximize, close) ---
ipcMain.on('window-minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.minimize();
  }
});
ipcMain.on('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.isMaximized() ? win.unmaximize() : win.maximize();
  }
});
ipcMain.on('window-close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.close();
  }
});

// --- FUTURE IDEAS ---
// - Add log rotation support
// - Add PM2 config file editing
// - Add system tray integration
// - Add app auto-update support
// - Add error reporting/logging

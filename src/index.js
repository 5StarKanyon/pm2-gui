// index.js - Main Electron process for PM2 GUI
//
// Handles window creation, secure IPC, and all backend logic for PM2 process management.
//
// NOTE: Keep all Node.js/PM2 logic here. Only expose safe APIs to renderer via preload.js.

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
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
    frame: false, // Hide the default OS window bar
    titleBarStyle: 'hidden', // Hide the native title bar
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
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
ipcMain.handle('pm2-set-config', async (event, id, config) => {
  await ensurePM2Connected();
  // PM2 does not support direct config editing; this is a placeholder
  return { success: false, message: 'Direct config editing not supported via API.' };
});
// Set environment variables for a process and restart it
ipcMain.handle('pm2-set-env', async (event, id, newEnv) => {
  await ensurePM2Connected();
  // Get current process info
  const procList = await pm2Promise('describe', id);
  const proc = procList[0];
  if (!proc) {
    return { success: false, message: 'Process not found' };
  }
  // Merge new env with existing env
  const mergedEnv = { ...proc.pm2_env.env, ...newEnv };
  // Restart with new env
  return new Promise((resolve) => {
    pm2.restart(
      {
        name: proc.name,
        env: mergedEnv,
      },
      (err) => {
        if (err) {
          resolve({ success: false, message: err.message });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
});

// Schedule a task to restart all PM2 processes (Windows/Linux)
ipcMain.handle('schedule-pm2-restart', async (event, schedule) => {
  // schedule: { time: 'HH:MM', frequency: 'daily'|'hourly'|'custom', custom: string }
  const isWin = process.platform === 'win32';
  const exec = require('child_process').exec;
  let command,
    taskName = 'PM2RestartAll';
  if (isWin) {
    // Windows: use schtasks
    let time = schedule.time || '03:00';
    let freq = schedule.frequency === 'hourly' ? 'HOURLY' : 'DAILY';
    let schtasksCmd = `schtasks /Create /F /TN ${taskName} /TR "pm2 restart all" /SC ${freq} /ST ${time}`;
    command = schtasksCmd;
  } else {
    // Linux: use cron
    let cronTime = schedule.custom || (schedule.frequency === 'hourly' ? '0 * * * *' : '0 3 * * *');
    let cronCmd = `(crontab -l 2>/dev/null; echo "${cronTime} pm2 restart all # PM2RestartAll") | sort | uniq | crontab -`;
    command = cronCmd;
  }
  return new Promise((resolve) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, message: stderr || err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

// Remove scheduled restart task
ipcMain.handle('remove-pm2-restart-schedule', async () => {
  const isWin = process.platform === 'win32';
  const exec = require('child_process').exec;
  let command,
    taskName = 'PM2RestartAll';
  if (isWin) {
    command = `schtasks /Delete /F /TN ${taskName}`;
  } else {
    // Remove cron line with # PM2RestartAll
    command = `crontab -l 2>/dev/null | grep -v '# PM2RestartAll' | crontab -`;
  }
  return new Promise((resolve) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, message: stderr || err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
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

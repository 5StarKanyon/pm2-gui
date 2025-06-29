const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const pm2 = require('pm2');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false, // Hide the default OS window bar
    titleBarStyle: 'hidden', // Hide the native title bar
    backgroundColor: '#181a1b', // Dark background
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper to promisify pm2 methods
function pm2Promise(method, ...args) {
  return new Promise((resolve, reject) => {
    pm2[method](...args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Connect to PM2 before handling requests
function ensurePM2Connected() {
  return new Promise((resolve, reject) => {
    pm2.connect(err => {
      if (err && err.message !== 'PM2 is already connected') reject(err);
      else resolve();
    });
  });
}

ipcMain.handle('pm2-list', async () => {
  await ensurePM2Connected();
  return pm2Promise('list');
});
ipcMain.handle('pm2-start', async (event, script, options) => {
  await ensurePM2Connected();
  return pm2Promise('start', script, options || {});
});
ipcMain.handle('pm2-stop', async (event, id) => {
  await ensurePM2Connected();
  return pm2Promise('stop', id);
});
ipcMain.handle('pm2-restart', async (event, id) => {
  await ensurePM2Connected();
  return pm2Promise('restart', id);
});
ipcMain.handle('pm2-delete', async (event, id) => {
  await ensurePM2Connected();
  return pm2Promise('delete', id);
});
ipcMain.handle('pm2-logs', async (event, id) => {
  await ensurePM2Connected();
  // For logs, use pm2's log file path
  return pm2Promise('describe', id).then(proc => {
    if (!proc[0] || !proc[0].pm2_env || !proc[0].pm2_env.pm_out_log_path) return '';
    const fs = require('fs');
    try {
      return fs.readFileSync(proc[0].pm2_env.pm_out_log_path, 'utf8');
    } catch (e) {
      return '';
    }
  });
});
ipcMain.handle('pm2-get-config', async (event, id) => {
  await ensurePM2Connected();
  return pm2Promise('describe', id).then(proc => proc[0]?.pm2_env || {});
});
ipcMain.handle('pm2-set-config', async (event, id, config) => {
  await ensurePM2Connected();
  // PM2 does not support direct config editing; this is a placeholder
  return { success: false, message: 'Direct config editing not supported via API.' };
});

// Custom window bar actions
ipcMain.on('window-minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});
ipcMain.on('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window-close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});
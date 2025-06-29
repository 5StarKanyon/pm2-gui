// renderer.js - Handles UI and PM2 API interaction

let logInterval = null;
let liveLogInterval = null;
let liveLogPaused = false;

// Toast notification utility
function showToast(message, type = 'info') {
  const toastId = 'toast' + Date.now();
  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-bg-${type} border-0 show mb-2`;
  toast.id = toastId;
  toast.role = 'alert';
  toast.ariaLive = 'assertive';
  toast.ariaAtomic = 'true';
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  document.getElementById('toastContainer').appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Search/filter logic
let processListCache = [];
document.getElementById('searchInput').addEventListener('input', function() {
  renderProcessTable();
});

async function loadProcesses() {
  const table = document.getElementById('pm2TableBody');
  table.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
  try {
    processListCache = await window.pm2Api.list();
    renderProcessTable();
  } catch (e) {
    table.innerHTML = `<tr><td colspan="7">Error: ${e.message}</td></tr>`;
  }
}

function getTypeBadge(env) {
  if (env.axm_options && env.axm_options.isModule) {
    return '<span class="badge bg-info ms-2">Module</span>';
  }
  if (env.exec_mode === 'cluster_mode') {
    return '<span class="badge bg-warning text-dark ms-2">Cluster</span>';
  }
  if (env.exec_mode === 'fork_mode') {
    return '<span class="badge bg-secondary ms-2">Fork</span>';
  }
  return '';
}

function renderProcessTable() {
  const table = document.getElementById('pm2TableBody');
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  let filtered = processListCache;
  if (search) {
    filtered = filtered.filter(proc => {
      const env = proc.pm2_env;
      return env.name.toLowerCase().includes(search) || env.status.toLowerCase().includes(search);
    });
  }
  if (!filtered.length) {
    table.innerHTML = '<tr><td colspan="7">No matching PM2 processes found.</td></tr>';
    return;
  }
  table.innerHTML = '';
  for (const proc of filtered) {
    const env = proc.pm2_env;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><a href="#" onclick="showProcessModal(${proc.pm_id})">${env.name}</a> ${getTypeBadge(env)}</td>
      <td>${env.status}</td>
      <td>${proc.pid}</td>
      <td>${proc.monit.cpu}%</td>
      <td>${(proc.monit.memory / 1024 / 1024).toFixed(1)} MB</td>
      <td>
        <button class="btn btn-sm btn-info" onclick="showLogs(${proc.pm_id})">Logs</button>
        <button class="btn btn-sm btn-secondary" onclick="showConfig(${proc.pm_id})">Config</button>
        <button class="btn btn-sm btn-warning" onclick="restartProc(${proc.pm_id})">Restart</button>
        <button class="btn btn-sm btn-danger" onclick="stopProc(${proc.pm_id})">Stop</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteProc(${proc.pm_id})">Delete</button>
        <button class="btn btn-sm btn-dark ms-1" onclick="showLiveLogModal(${proc.pm_id}, '${env.name.replace(/'/g, "\'")}')">Live Log</button>
      </td>
    `;
    table.appendChild(row);
  }
}

async function showLogs(id) {
  const logsArea = document.getElementById('logsArea');
  logsArea.textContent = 'Loading logs...';
  try {
    const logs = await window.pm2Api.logs(id);
    logsArea.textContent = logs || 'No logs found.';
  } catch (e) {
    logsArea.textContent = 'Error loading logs.';
  }
}

async function showConfig(id) {
  const configArea = document.getElementById('configArea');
  configArea.textContent = 'Loading config...';
  try {
    const config = await window.pm2Api.getConfig(id);
    configArea.textContent = JSON.stringify(config, null, 2);
  } catch (e) {
    configArea.textContent = 'Error loading config.';
  }
}

async function restartProc(id) {
  try {
    await window.pm2Api.restart(id);
    loadProcesses();
    showToast('Process restarted!', 'success');
  } catch (e) {
    showToast('Failed to restart: ' + e.message, 'danger');
  }
}
async function stopProc(id) {
  try {
    await window.pm2Api.stop(id);
    loadProcesses();
    showToast('Process stopped!', 'success');
  } catch (e) {
    showToast('Failed to stop: ' + e.message, 'danger');
  }
}
async function deleteProc(id) {
  try {
    await window.pm2Api.delete(id);
    loadProcesses();
    showToast('Process deleted!', 'success');
  } catch (e) {
    showToast('Failed to delete: ' + e.message, 'danger');
  }
}

document.getElementById('refreshBtn').onclick = loadProcesses;
window.onload = loadProcesses;

// Start new process (simple prompt for now)
document.getElementById('startBtn').onclick = async () => {
  const script = prompt('Enter the script path to start with PM2:');
  if (script) {
    await window.pm2Api.start(script, {});
    loadProcesses();
  }
};

window.showProcessModal = async function(id) {
  const modal = new bootstrap.Modal(document.getElementById('procModal'));
  document.getElementById('procDetails').textContent = 'Loading...';
  document.getElementById('liveLogsArea').textContent = 'Loading...';
  document.getElementById('modalConfigArea').value = '';

  // Load process details
  const list = await window.pm2Api.list();
  const proc = list.find(p => p.pm_id === id);
  if (proc) {
    document.getElementById('procDetails').innerHTML = `
      <b>Name:</b> ${proc.name}<br>
      <b>Status:</b> ${proc.pm2_env.status}<br>
      <b>PID:</b> ${proc.pid}<br>
      <b>CPU:</b> ${proc.monit.cpu}%<br>
      <b>Memory:</b> ${(proc.monit.memory / 1024 / 1024).toFixed(1)} MB<br>
      <b>Script:</b> ${proc.pm2_env.pm_exec_path}
    `;
  }

  // Live log streaming
  if (logInterval) clearInterval(logInterval);
  async function updateLogs() {
    const logs = await window.pm2Api.logs(id);
    document.getElementById('liveLogsArea').textContent = logs || 'No logs.';
  }
  await updateLogs();
  logInterval = setInterval(updateLogs, 2000);

  // Load config
  const config = await window.pm2Api.getConfig(id);
  document.getElementById('modalConfigArea').value = JSON.stringify(config, null, 2);

  // Save config handler
  document.getElementById('saveConfigBtn').onclick = async () => {
    try {
      const newConfig = JSON.parse(document.getElementById('modalConfigArea').value);
      const res = await window.pm2Api.setConfig(id, newConfig);
      if (res.success) {
        showToast('Config updated. Restarting process...', 'success');
        await window.pm2Api.restart(id);
      } else {
        showToast(res.message || 'Config update failed.', 'danger');
      }
    } catch (e) {
      showToast('Invalid config JSON.', 'danger');
    }
  };

  // Show modal
  modal.show();
  document.getElementById('procModal').addEventListener('hidden.bs.modal', () => {
    if (logInterval) clearInterval(logInterval);
  }, { once: true });
};

window.showLiveLogModal = function(id, name) {
  const modal = new bootstrap.Modal(document.getElementById('liveLogModal'));
  const area = document.getElementById('liveLogModalArea');
  document.getElementById('liveLogModalLabel').textContent = `Live Logs: ${name}`;
  area.textContent = 'Loading...';
  liveLogPaused = false;
  document.getElementById('pauseLogBtn').disabled = false;
  document.getElementById('resumeLogBtn').disabled = true;

  async function updateLiveLog() {
    if (liveLogPaused) return;
    const logs = await window.pm2Api.logs(id);
    area.textContent = logs || 'No logs.';
    area.scrollTop = area.scrollHeight;
  }
  updateLiveLog();
  liveLogInterval && clearInterval(liveLogInterval);
  liveLogInterval = setInterval(updateLiveLog, 1500);

  document.getElementById('pauseLogBtn').onclick = () => {
    liveLogPaused = true;
    document.getElementById('pauseLogBtn').disabled = true;
    document.getElementById('resumeLogBtn').disabled = false;
  };
  document.getElementById('resumeLogBtn').onclick = () => {
    liveLogPaused = false;
    document.getElementById('pauseLogBtn').disabled = false;
    document.getElementById('resumeLogBtn').disabled = true;
    updateLiveLog();
  };
  document.getElementById('liveLogModal').addEventListener('hidden.bs.modal', () => {
    clearInterval(liveLogInterval);
  }, { once: true });
  modal.show();
};

// Advanced Start Process Modal
const startBtn = document.getElementById('startBtn');
const startProcModal = new bootstrap.Modal(document.getElementById('startProcModal'));
startBtn.onclick = () => {
  document.getElementById('startProcForm').reset();
  startProcModal.show();
};

document.getElementById('startProcSubmit').onclick = async () => {
  const script = document.getElementById('startScript').value.trim();
  const name = document.getElementById('startName').value.trim();
  const args = document.getElementById('startArgs').value.trim();
  const envRaw = document.getElementById('startEnv').value.trim();
  if (!script) return showToast('Script path is required.', 'danger');
  const options = {};
  if (name) options.name = name;
  if (args) options.args = args.split(/\s+/);
  if (envRaw) {
    options.env = {};
    envRaw.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value !== undefined) {
        options.env[key.trim()] = value.trim();
      }
    });
  }
  try {
    await window.pm2Api.start(script, options);
    startProcModal.hide();
    loadProcesses();
    showToast('Process started!', 'success');
  } catch (e) {
    showToast('Failed to start process: ' + e.message, 'danger');
  }
};

window.addEventListener('DOMContentLoaded', () => {
  // Attach window control button listeners after DOM is loaded
  const minBtn = document.getElementById('minBtn');
  const maxBtn = document.getElementById('maxBtn');
  const closeBtn = document.getElementById('closeBtn');
  if (window.windowControls) {
    if (minBtn) minBtn.onclick = window.windowControls.minimize;
    if (maxBtn) maxBtn.onclick = window.windowControls.maximize;
    if (closeBtn) closeBtn.onclick = window.windowControls.close;
  }
});

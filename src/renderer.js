// renderer.js - Handles UI and PM2 API interaction
/* global bootstrap, clearInterval, Chart */
//
// Main frontend logic for the PM2 GUI app. Handles all UI events, IPC calls to main process, and live updates.
//
// NOTE: If you add new features, keep UI responsive and all IPC calls secure via preload.js contextBridge.

let logInterval = null; // For process modal live logs
let liveLogInterval = null; // For main live log modal
let liveLogPaused = false; // Pause state for live log modal

// Toast notification utility
// Shows a Bootstrap toast in the bottom right for user feedback
function showToast(message, type = 'info') {
  // Could extend to support more types or durations
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

// --- Search/filter logic for process table ---
let processListCache = [];
document.getElementById('searchInput').addEventListener('input', function () {
  renderProcessTable();
});

// Loads all PM2 processes and updates the table
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

// Returns a badge for process type (module, cluster, fork)
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

// --- Bulk Actions State ---
let selectedProcs = new Set();

// Handle select all checkbox
window.handleSelectAll = function (checked) {
  const checkboxes = document.querySelectorAll('.proc-select');
  checkboxes.forEach((cb) => {
    cb.checked = checked;
    if (checked) {
      selectedProcs.add(Number(cb.dataset.id));
    } else {
      selectedProcs.delete(Number(cb.dataset.id));
    }
  });
  updateBulkActionsBar();
};

// Handle individual row checkbox
window.handleSelectProc = function (id, checked) {
  if (checked) {
    selectedProcs.add(Number(id));
  } else {
    selectedProcs.delete(Number(id));
  }
  updateBulkActionsBar();
};

// Update bulk actions bar visibility and count
function updateBulkActionsBar() {
  const bar = document.getElementById('bulkActionsBar');
  if (!bar) {
    return;
  }
  if (selectedProcs.size > 0) {
    bar.style.display = '';
    document.getElementById('bulkSelectedCount').textContent = selectedProcs.size;
  } else {
    bar.style.display = 'none';
  }
}

// Bulk action handlers
window.bulkRestart = async function () {
  if (!selectedProcs.size) {
    return;
  }
  // eslint-disable-next-line no-undef
  if (!confirm(`Restart ${selectedProcs.size} process(es)?`)) {
    return;
  }
  for (const id of selectedProcs) {
    try {
      await window.pm2Api.restart(id);
      showToast(`Process ${id} restarted!`, 'success');
    } catch (e) {
      showToast(`Failed to restart ${id}: ${e.message}`, 'danger');
    }
  }
  selectedProcs.clear();
  loadProcesses();
  updateBulkActionsBar();
};
window.bulkStop = async function () {
  if (!selectedProcs.size) {
    return;
  }
  // eslint-disable-next-line no-undef
  if (!confirm(`Stop ${selectedProcs.size} process(es)?`)) {
    return;
  }
  for (const id of selectedProcs) {
    try {
      await window.pm2Api.stop(id);
      showToast(`Process ${id} stopped!`, 'success');
    } catch (e) {
      showToast(`Failed to stop ${id}: ${e.message}`, 'danger');
    }
  }
  selectedProcs.clear();
  loadProcesses();
  updateBulkActionsBar();
};
window.bulkDelete = async function () {
  if (!selectedProcs.size) {
    return;
  }
  // eslint-disable-next-line no-undef
  if (!confirm(`Delete ${selectedProcs.size} process(es)? This cannot be undone!`)) {
    return;
  }
  for (const id of selectedProcs) {
    try {
      await window.pm2Api.delete(id);
      showToast(`Process ${id} deleted!`, 'success');
    } catch (e) {
      showToast(`Failed to delete ${id}: ${e.message}`, 'danger');
    }
  }
  selectedProcs.clear();
  loadProcesses();
  updateBulkActionsBar();
};

// --- Sorting State ---
let sortField = 'name';
let sortAsc = true;

window.sortTable = function (field) {
  if (sortField === field) {
    sortAsc = !sortAsc;
  } else {
    sortField = field;
    sortAsc = true;
  }
  renderProcessTable();
  updateSortIcons();
};

function updateSortIcons() {
  const fields = ['name', 'status', 'pid', 'cpu', 'memory'];
  fields.forEach((f) => {
    const icon = document.getElementById('sortIcon-' + f);
    if (!icon) {
      return;
    }
    if (sortField === f) {
      icon.textContent = sortAsc ? '▲' : '▼';
    } else {
      icon.textContent = '';
    }
  });
}

// Renders the process table, filtered by search
function renderProcessTable() {
  const table = document.getElementById('pm2TableBody');
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  let filtered = processListCache;
  if (search) {
    filtered = filtered.filter((proc) => {
      const env = proc.pm2_env;
      return env.name.toLowerCase().includes(search) || env.status.toLowerCase().includes(search);
    });
  }
  // --- Sorting logic ---
  filtered = filtered.slice(); // copy
  filtered.sort((a, b) => {
    let av, bv;
    switch (sortField) {
      case 'name':
        av = a.pm2_env.name.toLowerCase();
        bv = b.pm2_env.name.toLowerCase();
        break;
      case 'status':
        av = a.pm2_env.status.toLowerCase();
        bv = b.pm2_env.status.toLowerCase();
        break;
      case 'pid':
        av = a.pid;
        bv = b.pid;
        break;
      case 'cpu':
        av = a.monit.cpu;
        bv = b.monit.cpu;
        break;
      case 'memory':
        av = a.monit.memory;
        bv = b.monit.memory;
        break;
      default:
        av = a.pm2_env.name.toLowerCase();
        bv = b.pm2_env.name.toLowerCase();
    }
    if (av < bv) {
      return sortAsc ? -1 : 1;
    }
    if (av > bv) {
      return sortAsc ? 1 : -1;
    }
    return 0;
  });
  if (!filtered.length) {
    table.innerHTML = '<tr><td colspan="8">No matching PM2 processes found.</td></tr>';
    return;
  }
  table.innerHTML = '';
  for (const proc of filtered) {
    const env = proc.pm2_env;
    const uptime = env.pm_uptime ? ((Date.now() - env.pm_uptime) / 1000) : 0;
    const uptimeStr = env.pm_uptime ?
      (uptime > 86400 ? Math.floor(uptime / 86400) + 'd ' : '') +
      new Date(uptime * 1000).toISOString().substr(11, 8) : '-';
    const lastRestart = env.pm_uptime ? new Date(env.pm_uptime).toLocaleString() : '-';
    const restartCount = env.restart_time || 0;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" class="proc-select" data-id="${proc.pm_id}" onclick="handleSelectProc(${proc.pm_id}, this.checked)" ${selectedProcs.has(proc.pm_id) ? 'checked' : ''}></td>
      <td><a href="#" onclick="showProcessModal(${proc.pm_id})">${env.name}</a> ${getTypeBadge(env)}</td>
      <td>${env.status}</td>
      <td>${proc.pid}</td>
      <td>${proc.monit.cpu}%</td>
      <td>${(proc.monit.memory / 1024 / 1024).toFixed(1)} MB</td>
      <td>${uptimeStr}</td>
      <td>${restartCount}</td>
      <td>${lastRestart}</td>
      <td>
        <button class="btn btn-sm btn-info" onclick="showLogs(${proc.pm_id})">Logs</button>
        <button class="btn btn-sm btn-secondary" onclick="showConfig(${proc.pm_id})">Config</button>
        <button class="btn btn-sm btn-warning" onclick="restartProc(${proc.pm_id})">Restart</button>
        <button class="btn btn-sm btn-danger" onclick="stopProc(${proc.pm_id})">Stop</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteProc(${proc.pm_id})">Delete</button>
        <button class="btn btn-sm btn-dark ms-1" onclick="showLiveLogModal(${proc.pm_id}, '${env.name.replace(/'/g, "'")}')">Live Log</button>
        <button class="btn btn-sm btn-primary ms-1" onclick="showMonitorModal(${proc.pm_id}, '${env.name.replace(/'/g, "'")}')">Monitor</button>
        <button class="btn btn-sm btn-outline-secondary ms-1" onclick="showProcessHistory(${proc.pm_id})">History</button>
      </td>
    `;
    table.appendChild(row);
  }
  updateBulkActionsBar();
  updateSortIcons();
}

// --- Log Search/Filter State ---
let mainLogRaw = '';
let modalLogRaw = '';

// Utility: highlight search matches
function highlightLog(log, query) {
  if (!query) {
    return log;
  }
  // Escape regex special chars
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(safe, 'gi');
  return log.replace(re, (m) => `<mark>${m}</mark>`);
}

// Main log search handler
window.handleMainLogSearch = function () {
  const input = document.getElementById('mainLogSearch');
  const logsArea = document.getElementById('logsArea');
  const query = input.value.trim();
  if (!mainLogRaw) {
    logsArea.innerHTML = '';
    return;
  }
  if (!query) {
    logsArea.innerHTML = mainLogRaw;
    return;
  }
  const lines = mainLogRaw
    .split(/\r?\n/)
    .filter((l) => l.toLowerCase().includes(query.toLowerCase()));
  if (!lines.length) {
    logsArea.innerHTML = '<em>No matching log lines.</em>';
  } else {
    logsArea.innerHTML = highlightLog(lines.join('\n'), query);
  }
};

// Modal log search handler
window.handleModalLogSearch = function () {
  const input = document.getElementById('modalLogSearch');
  const logsArea = document.getElementById('liveLogsArea');
  const query = input.value.trim();
  if (!modalLogRaw) {
    logsArea.innerHTML = '';
    return;
  }
  if (!query) {
    logsArea.innerHTML = modalLogRaw;
    return;
  }
  const lines = modalLogRaw
    .split(/\r?\n/)
    .filter((l) => l.toLowerCase().includes(query.toLowerCase()));
  if (!lines.length) {
    logsArea.innerHTML = '<em>No matching log lines.</em>';
  } else {
    logsArea.innerHTML = highlightLog(lines.join('\n'), query);
  }
};

// --- Update showLogs to store raw log and filter ---
async function showLogs(id) {
  const logsArea = document.getElementById('logsArea');
  logsArea.textContent = 'Loading logs...';
  try {
    const result = await window.pm2Api.logs({ id, lines: 200 });
    mainLogRaw =
      result && typeof result === 'object'
        ? result.log || 'No logs found.'
        : result || 'No logs found.';
    window.handleMainLogSearch();
  } catch (e) {
    mainLogRaw = '';
    logsArea.textContent = 'Error loading logs.';
  }
}

// Show config for a process in the main config area
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

// Restart a process and reload table
async function restartProc(id) {
  try {
    await window.pm2Api.restart(id);
    loadProcesses();
    showToast('Process restarted!', 'success');
  } catch (e) {
    showToast('Failed to restart: ' + e.message, 'danger');
  }
}
// Stop a process and reload table
async function stopProc(id) {
  try {
    await window.pm2Api.stop(id);
    loadProcesses();
    showToast('Process stopped!', 'success');
  } catch (e) {
    showToast('Failed to stop: ' + e.message, 'danger');
  }
}
// Delete a process and reload table
async function deleteProc(id) {
  try {
    await window.pm2Api.delete(id);
    loadProcesses();
    showToast('Process deleted!', 'success');
  } catch (e) {
    showToast('Failed to delete: ' + e.message, 'danger');
  }
}

// --- UI event hooks ---
document.getElementById('refreshBtn').onclick = loadProcesses;
window.onload = loadProcesses;

// Start new process (simple prompt for now, replaced by modal below)
document.getElementById('startBtn').onclick = async () => {
  // eslint-disable-next-line no-undef
  const script = prompt('Enter the script path to start with PM2:');
  if (script) {
    await window.pm2Api.start(script, {});
    loadProcesses();
  }
};

// --- Advanced Config Editing: Sync, Validation, and Save ---
function fillConfigFormFromJson(json) {
  document.getElementById('configName').value = json.name || '';
  document.getElementById('configScript').value = json.script || json.pm_exec_path || '';
  document.getElementById('configArgs').value = Array.isArray(json.args)
    ? json.args.join(' ')
    : json.args || '';
  if (json.env && typeof json.env === 'object') {
    document.getElementById('configEnv').value = Object.entries(json.env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
  } else {
    document.getElementById('configEnv').value = '';
  }
}
function buildJsonFromConfigForm() {
  const name = document.getElementById('configName').value.trim();
  const script = document.getElementById('configScript').value.trim();
  const args = document.getElementById('configArgs').value.trim();
  const envRaw = document.getElementById('configEnv').value.trim();
  const obj = {};
  if (name) {
    obj.name = name;
  }
  if (script) {
    obj.script = script;
  }
  if (args) {
    obj.args = args.split(/\s+/);
  }
  if (envRaw) {
    obj.env = {};
    envRaw.split('\n').forEach((line) => {
      const [k, v] = line.split('=');
      if (k && v !== undefined) {
        obj.env[k.trim()] = v.trim();
      }
    });
  }
  return obj;
}
function validateConfigForm() {
  const script = document.getElementById('configScript').value.trim();
  if (!script) {
    document.getElementById('configFormError').textContent = 'Script path is required.';
    document.getElementById('configFormError').style.display = '';
    return false;
  }
  document.getElementById('configFormError').style.display = 'none';
  return true;
}
function validateConfigJson() {
  const val = document.getElementById('modalConfigArea').value;
  try {
    JSON.parse(val);
    document.getElementById('configJsonError').style.display = 'none';
    return true;
  } catch (e) {
    document.getElementById('configJsonError').textContent = 'Invalid JSON: ' + e.message;
    document.getElementById('configJsonError').style.display = '';
    return false;
  }
}
// Sync form -> JSON
function syncFormToJson() {
  if (!validateConfigForm()) {
    return;
  }
  const obj = buildJsonFromConfigForm();
  document.getElementById('modalConfigArea').value = JSON.stringify(obj, null, 2);
  validateConfigJson();
}
// Sync JSON -> form
function syncJsonToForm() {
  if (!validateConfigJson()) {
    return;
  }
  try {
    const obj = JSON.parse(document.getElementById('modalConfigArea').value);
    fillConfigFormFromJson(obj);
    document.getElementById('configFormError').style.display = 'none';
  } catch (e) {
    document.getElementById('configFormError').textContent = 'Invalid JSON: ' + e.message;
    document.getElementById('configFormError').style.display = '';
  }
}
// Attach sync events
['configName', 'configScript', 'configArgs', 'configEnv'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', syncFormToJson);
  }
});
document.getElementById('modalConfigArea').addEventListener('input', syncJsonToForm);
// Tab switch: sync on show
const configFormTab = document.getElementById('config-form-tab');
const configJsonTab = document.getElementById('config-json-tab');
if (configFormTab && configJsonTab) {
  configFormTab.addEventListener('shown.bs.tab', syncJsonToForm);
  configJsonTab.addEventListener('shown.bs.tab', syncFormToJson);
}

// Show process details modal, including live logs and config
window.showProcessModal = async function (id) {
  const modal = new bootstrap.Modal(document.getElementById('procModal'));
  document.getElementById('procDetails').textContent = 'Loading...';
  document.getElementById('liveLogsArea').textContent = 'Loading...';
  document.getElementById('modalConfigArea').value = '';
  document.getElementById('modalLogSearch').value = '';
  fillConfigFormFromJson({});
  // Load process details
  const list = await window.pm2Api.list();
  const proc = list.find((p) => p.pm_id === id);
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

  // Live log streaming for process modal (not main modal)
  if (logInterval) {
    clearInterval(logInterval);
  }
  async function updateLogs() {
    const logs = await window.pm2Api.logs(id);
    modalLogRaw = logs || 'No logs.';
    window.handleModalLogSearch();
  }
  await updateLogs();
  logInterval = setInterval(updateLogs, 2000);

  // Load config for process
  const config = await window.pm2Api.getConfig(id);
  document.getElementById('modalConfigArea').value = JSON.stringify(config, null, 2);
  fillConfigFormFromJson(config);

  // Save config handler
  document.getElementById('saveConfigBtn').onclick = async () => {
    // Save from the active tab
    const activeTab = document.querySelector('#configTab .nav-link.active');
    let newConfig;
    if (activeTab && activeTab.id === 'config-form-tab') {
      if (!validateConfigForm()) {
        return;
      }
      newConfig = buildJsonFromConfigForm();
    } else {
      if (!validateConfigJson()) {
        return;
      }
      newConfig = JSON.parse(document.getElementById('modalConfigArea').value);
    }
    try {
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

  // Show modal and clear interval on close
  modal.show();
  document.getElementById('procModal').addEventListener(
    'hidden.bs.modal',
    () => {
      if (logInterval) {
        clearInterval(logInterval);
      }
    },
    { once: true }
  );
};

// --- Live log modal (main tailing, efficient for large logs) ---
window.showLiveLogModal = function (id, name) {
  const modal = new bootstrap.Modal(document.getElementById('liveLogModal'));
  const area = document.getElementById('liveLogModalArea');
  document.getElementById('liveLogModalLabel').textContent = `Live Logs: ${name}`;
  area.textContent = 'Loading...';
  liveLogPaused = false;
  document.getElementById('pauseLogBtn').disabled = false;
  document.getElementById('resumeLogBtn').disabled = true;

  let logOffset = 0; // Track byte offset for efficient tailing
  let initial = true;

  async function updateLiveLog() {
    if (liveLogPaused) {
      return;
    }
    let result;
    if (initial) {
      // On open, fetch only last 200 lines
      result = await window.pm2Api.logs({ id, lines: 200 });
      initial = false;
    } else {
      // On poll, fetch only new lines after last offset
      result = await window.pm2Api.logs({ id, offset: logOffset });
    }
    if (result && typeof result === 'object') {
      if (initial) {
        area.textContent = result.log || 'No logs.';
      } else {
        if (result.log) {
          area.textContent += (area.textContent ? '\n' : '') + result.log;
        }
      }
      logOffset = result.newOffset || logOffset;
      area.scrollTop = area.scrollHeight;
    }
  }
  updateLiveLog();
  liveLogInterval && clearInterval(liveLogInterval);
  liveLogInterval = setInterval(updateLiveLog, 1500);

  // Pause/resume controls for live log modal
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
  document.getElementById('liveLogModal').addEventListener(
    'hidden.bs.modal',
    () => {
      clearInterval(liveLogInterval);
    },
    { once: true }
  );
  modal.show();
};

// --- Live Resource Monitoring Modal ---
let monitorInterval = null;
let cpuChart = null;
let memChart = null;

window.showMonitorModal = async function (id, name) {
  const modal = new bootstrap.Modal(document.getElementById('monitorModal'));
  document.getElementById('monitorModalLabel').textContent = `Live Resource Monitor: ${name}`;
  const cpuCtx = document.getElementById('cpuChart').getContext('2d');
  const memCtx = document.getElementById('memChart').getContext('2d');
  const statsDiv = document.getElementById('monitorStats');

  // Chart.js setup
  const labels = Array(30).fill('');
  let cpuData = Array(30).fill(0);
  let memData = Array(30).fill(0);

  if (cpuChart) {
    cpuChart.destroy();
  }
  if (memChart) {
    memChart.destroy();
  }
  cpuChart = new Chart(cpuCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'CPU %',
          data: cpuData,
          borderColor: '#4e8cff',
          backgroundColor: 'rgba(78,140,255,0.1)',
          tension: 0.2,
          pointRadius: 0,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 100, ticks: { color: '#fff' } }, x: { display: false } },
    },
  });
  memChart = new Chart(memCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Memory MB',
          data: memData,
          borderColor: '#ffb84e',
          backgroundColor: 'rgba(255,184,78,0.1)',
          tension: 0.2,
          pointRadius: 0,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, ticks: { color: '#fff' } }, x: { display: false } },
    },
  });

  async function updateMonitor() {
    try {
      const list = await window.pm2Api.list();
      const proc = list.find((p) => p.pm_id === id);
      if (!proc) {
        statsDiv.textContent = 'Process not found.';
        return;
      }
      const cpu = proc.monit.cpu || 0;
      const mem = proc.monit.memory ? proc.monit.memory / 1024 / 1024 : 0;
      cpuData.push(cpu);
      cpuData.shift();
      memData.push(mem);
      memData.shift();
      cpuChart.data.datasets[0].data = cpuData;
      memChart.data.datasets[0].data = memData;
      cpuChart.update('none');
      memChart.update('none');
      statsDiv.innerHTML = `<b>Status:</b> ${proc.pm2_env.status} &nbsp; <b>PID:</b> ${proc.pid} &nbsp; <b>CPU:</b> ${cpu}% &nbsp; <b>Memory:</b> ${mem.toFixed(1)} MB`;
    } catch (e) {
      statsDiv.textContent = 'Error loading stats.';
    }
  }
  await updateMonitor();
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }
  monitorInterval = setInterval(updateMonitor, 1500);

  document.getElementById('monitorModal').addEventListener(
    'hidden.bs.modal',
    () => {
      if (monitorInterval) {
        clearInterval(monitorInterval);
      }
    },
    { once: true }
  );
  modal.show();
};

// --- Advanced Start Process Modal ---
const startBtn = document.getElementById('startBtn');
const startProcModal = new bootstrap.Modal(document.getElementById('startProcModal'));
startBtn.onclick = () => {
  document.getElementById('startProcForm').reset();
  startProcModal.show();
};

document.getElementById('startProcSubmit').onclick = async () => {
  // Gather form values for new process
  const script = document.getElementById('startScript').value.trim();
  const name = document.getElementById('startName').value.trim();
  const args = document.getElementById('startArgs').value.trim();
  const envRaw = document.getElementById('startEnv').value.trim();
  if (!script) {
    return showToast('Script path is required.', 'danger');
  }
  const options = {};
  if (name) {
    options.name = name;
  }
  if (args) {
    options.args = args.split(/\s+/);
  }
  if (envRaw) {
    options.env = {};
    envRaw.split('\n').forEach((line) => {
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

// --- Process Creation Wizard Logic ---
// State for wizard fields
const wizardState = {
  script: '',
  name: '',
  args: '',
  env: '',
};

function showWizardStep(step) {
  // Hide all steps
  for (let i = 1; i <= 4; i++) {
    document.getElementById('wizardStep' + i).style.display = 'none';
  }
  document.getElementById('wizardStep' + step).style.display = '';
}

// Step 1: Script Path
const wizardScript = document.getElementById('wizardScript');
const wizardStep1Error = document.getElementById('wizardStep1Error');
document.getElementById('wizardNext1').onclick = function () {
  const script = wizardScript.value.trim();
  if (!script) {
    wizardStep1Error.textContent = 'Script path is required.';
    wizardStep1Error.style.display = '';
    return;
  }
  wizardStep1Error.style.display = 'none';
  wizardState.script = script;
  showWizardStep(2);
};

// Step 2: Name & Args
const wizardName = document.getElementById('wizardName');
const wizardArgs = document.getElementById('wizardArgs');
document.getElementById('wizardBack2').onclick = function () {
  showWizardStep(1);
};
document.getElementById('wizardNext2').onclick = function () {
  wizardState.name = wizardName.value.trim();
  wizardState.args = wizardArgs.value.trim();
  showWizardStep(3);
};

// Step 3: Environment Variables
const wizardEnv = document.getElementById('wizardEnv');
document.getElementById('wizardBack3').onclick = function () {
  showWizardStep(2);
};
document.getElementById('wizardNext3').onclick = function () {
  wizardState.env = wizardEnv.value.trim();
  // Prepare review JSON
  const reviewObj = { script: wizardState.script };
  if (wizardState.name) {
    reviewObj.name = wizardState.name;
  }
  if (wizardState.args) {
    reviewObj.args = wizardState.args.split(/\s+/);
  }
  if (wizardState.env) {
    reviewObj.env = {};
    wizardState.env.split('\n').forEach((line) => {
      const [k, v] = line.split('=');
      if (k && v !== undefined) {
        reviewObj.env[k.trim()] = v.trim();
      }
    });
  }
  document.getElementById('wizardReview').textContent = JSON.stringify(reviewObj, null, 2);
  showWizardStep(4);
};

// Step 4: Review & Start
const wizardStep4Error = document.getElementById('wizardStep4Error');
document.getElementById('wizardBack4').onclick = function () {
  showWizardStep(3);
};
document.getElementById('wizardStartBtn').onclick = async function () {
  // Build options from state
  const script = wizardState.script;
  const options = {};
  if (wizardState.name) {
    options.name = wizardState.name;
  }
  if (wizardState.args) {
    options.args = wizardState.args.split(/\s+/);
  }
  if (wizardState.env) {
    options.env = {};
    wizardState.env.split('\n').forEach((line) => {
      const [k, v] = line.split('=');
      if (k && v !== undefined) {
        options.env[k.trim()] = v.trim();
      }
    });
  }
  try {
    await window.pm2Api.start(script, options);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('startProcModal')).hide();
    loadProcesses();
    showToast('Process started!', 'success');
  } catch (e) {
    wizardStep4Error.textContent = 'Failed to start process: ' + e.message;
    wizardStep4Error.style.display = '';
    return;
  }
  wizardStep4Error.style.display = 'none';
};

// Reset wizard on open/close
const startProcModalEl = document.getElementById('startProcModal');
startProcModalEl.addEventListener('show.bs.modal', () => {
  wizardScript.value = '';
  wizardName.value = '';
  wizardArgs.value = '';
  wizardEnv.value = '';
  wizardStep1Error.style.display = 'none';
  wizardStep4Error.style.display = 'none';
  showWizardStep(1);
});
startProcModalEl.addEventListener('hidden.bs.modal', () => {
  wizardScript.value = '';
  wizardName.value = '';
  wizardArgs.value = '';
  wizardEnv.value = '';
  wizardStep1Error.style.display = 'none';
  wizardStep4Error.style.display = 'none';
  showWizardStep(1);
});

// --- PM2 Windows Service Wizard ---
window.showServiceWizard = async function () {
  const modal = new bootstrap.Modal(document.getElementById('serviceWizardModal'));
  const statusDiv = document.getElementById('serviceStatus');
  const installBtn = document.getElementById('serviceInstallBtn');
  const uninstallBtn = document.getElementById('serviceUninstallBtn');
  statusDiv.textContent = 'Checking service status...';
  installBtn.disabled = true;
  uninstallBtn.disabled = true;
  try {
    const status = await window.pm2Api.getServiceStatus();
    if (status.installed) {
      statusDiv.innerHTML = `<span class='text-success'>PM2 is installed as a Windows service.</span>`;
      installBtn.style.display = 'none';
      uninstallBtn.style.display = '';
      uninstallBtn.disabled = false;
    } else {
      statusDiv.innerHTML = `<span class='text-danger'>PM2 is NOT installed as a Windows service.</span>`;
      installBtn.style.display = '';
      uninstallBtn.style.display = 'none';
      installBtn.disabled = false;
    }
  } catch (e) {
    statusDiv.innerHTML = `<span class='text-danger'>Error: ${e.message}</span>`;
  }
  modal.show();
};

document.getElementById('serviceInstallBtn').onclick = async function () {
  this.disabled = true;
  try {
    await window.pm2Api.installService();
    showToast('PM2 installed as a Windows service!', 'success');
    window.showServiceWizard();
  } catch (e) {
    showToast('Failed to install service: ' + e.message, 'danger');
  }
  this.disabled = false;
};
document.getElementById('serviceUninstallBtn').onclick = async function () {
  this.disabled = true;
  try {
    await window.pm2Api.uninstallService();
    showToast('PM2 service uninstalled.', 'success');
    window.showServiceWizard();
  } catch (e) {
    showToast('Failed to uninstall service: ' + e.message, 'danger');
  }
  this.disabled = false;
};

// --- Process Dependency Visualization ---
window.showDependencyGraph = async function () {
  const modal = new bootstrap.Modal(document.getElementById('dependencyModal'));
  const graphArea = document.getElementById('dependencyGraphArea');
  graphArea.innerHTML = 'Loading...';
  try {
    const deps = await window.pm2Api.getDependencies(); // Should return [{name, dependsOn: [name, ...]}, ...]
    // Simple tree/graph rendering (text-based fallback)
    let html = '';
    deps.forEach(proc => {
      html += `<b>${proc.name}</b>`;
      if (proc.dependsOn && proc.dependsOn.length) {
        html += ' → ' + proc.dependsOn.map(d => `<span class='badge bg-secondary'>${d}</span>`).join(' ');
      }
      html += '<br>';
    });
    graphArea.innerHTML = html || '<em>No dependencies defined.</em>';
  } catch (e) {
    graphArea.innerHTML = 'Error loading dependencies.';
  }
  modal.show();
};

// --- Global Environment Variable Management ---
window.showGlobalEnvModal = async function () {
  const modal = new bootstrap.Modal(document.getElementById('globalEnvModal'));
  const area = document.getElementById('globalEnvArea');
  area.value = 'Loading...';
  try {
    const env = await window.pm2Api.getGlobalEnv();
    area.value = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
  } catch (e) {
    area.value = 'Error loading global env.';
  }
  modal.show();
};
document.getElementById('globalEnvSaveBtn').onclick = async function () {
  const area = document.getElementById('globalEnvArea');
  const envRaw = area.value.trim();
  const env = {};
  envRaw.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k && v !== undefined) env[k.trim()] = v.trim();
  });
  try {
    await window.pm2Api.setGlobalEnv(env);
    showToast('Global environment updated!', 'success');
  } catch (e) {
    showToast('Failed to update global env: ' + e.message, 'danger');
  }
};
document.getElementById('globalEnvImportBtn').onclick = function () {
  document.getElementById('globalEnvFile').click();
};
document.getElementById('globalEnvFile').onchange = function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    document.getElementById('globalEnvArea').value = evt.target.result;
  };
  reader.readAsText(file);
};
document.getElementById('globalEnvExportBtn').onclick = function () {
  const area = document.getElementById('globalEnvArea');
  const blob = new Blob([area.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'global.env';
  a.click();
  URL.revokeObjectURL(url);
};

// --- Process History Modal ---
window.showProcessHistory = async function (id) {
  const modal = new bootstrap.Modal(document.getElementById('historyModal'));
  const area = document.getElementById('historyArea');
  area.innerHTML = 'Loading...';
  try {
    const history = await window.pm2Api.getProcessHistory(id); // Should return array of {date, event, code}
    if (!history || !history.length) {
      area.innerHTML = '<em>No history found.</em>';
    } else {
      area.innerHTML = '<ul class="list-group">' +
        history.map(h => `<li class="list-group-item bg-dark text-light">${h.date} - ${h.event} (code: ${h.code ?? '-'})</li>`).join('') +
        '</ul>';
    }
  } catch (e) {
    area.innerHTML = 'Error loading history.';
  }
  modal.show();
};

// --- FUTURE IDEAS ---
// - Add bulk actions (multi-select processes)
// - Add log search/filter in modal
// - Add process grouping/sorting
// - Add settings modal for user preferences
// - Add system tray integration
// - Add light theme toggle
// - Add more advanced config editing UI

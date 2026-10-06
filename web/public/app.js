// agypool Dashboard Frontend Application

const API = {
  status: () => fetch('/api/status').then(r => r.json()),
  accounts: () => fetch('/api/accounts').then(r => r.json()),
  events: () => fetch('/api/events').then(r => r.json()),
  useAccount: (id) => fetch('/api/accounts/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }).then(r => r.json()),
  addKey: (payload) => fetch('/api/accounts/add-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json()),
  captureCurrent: (id) => fetch('/api/accounts/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }).then(r => r.json()),
  deleteAccount: (id) => fetch('/api/accounts/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }).then(r => r.json()),
  resetCooldown: (id) => fetch('/api/accounts/reset-cooldown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }).then(r => r.json()),
  testAccount: (id) => fetch('/api/accounts/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }).then(r => r.json()),
  saveConfig: (cfg) => fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  }).then(r => r.json())
};

let currentStatus = null;
let currentAccounts = [];

async function refreshAll() {
  try {
    const [status, accounts, events] = await Promise.all([
      API.status(),
      API.accounts(),
      API.events()
    ]);
    currentStatus = status;
    currentAccounts = accounts;

    renderStatus(status);
    renderAccounts(accounts, status.active_account);
    renderEvents(events);
  } catch (err) {
    console.error('Failed to refresh data:', err);
  }
}

function renderStatus(status) {
  // Watchdog status
  const daemonEl = document.getElementById('daemonStatus');
  const daemonText = document.getElementById('daemonStatusText');
  if (status.daemon_running) {
    daemonEl.classList.remove('stopped');
    daemonText.textContent = 'Active (Live)';
  } else {
    daemonEl.classList.add('stopped');
    daemonText.textContent = 'Stopped';
  }

  // Auto switch toggle
  const toggle = document.getElementById('autoSwitchToggle');
  toggle.checked = !!status.auto_switch;

  // Active account card
  const active = status.active_account;
  const nameEl = document.getElementById('activeAccountName');
  const emailEl = document.getElementById('activeAccountEmail');
  const badgesEl = document.getElementById('activeAccountBadges');

  if (active) {
    nameEl.textContent = active.name || active.id;
    emailEl.textContent = active.email;
    badgesEl.innerHTML = `
      <span class="badge ${active.type === 'google' ? 'badge-google' : 'badge-key'}">${active.type}</span>
      <span class="badge badge-active">Active</span>
    `;
  } else {
    nameEl.textContent = 'No Account Selected';
    emailEl.textContent = 'Please add or select an account';
    badgesEl.innerHTML = `<span class="badge badge-exhausted">None</span>`;
  }

  // Pool numbers
  document.getElementById('poolReadyCount').textContent = status.ready_accounts;
  document.getElementById('poolTotalCount').textContent = status.total_accounts;
  document.getElementById('poolExhaustedCount').textContent = `${status.exhausted_accounts} in cooldown`;

  // Strategy & Cooldown
  document.getElementById('strategyText').textContent = status.switch_strategy === 'round_robin' ? 'Round-Robin' : 'Priority';
  document.getElementById('cooldownText').textContent = status.cooldown_minutes;
}

function renderAccounts(accounts, activeAccount) {
  const tbody = document.getElementById('accountsTableBody');
  if (!accounts || accounts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">No accounts found. Click "Sign in Google Account" or "Add API Key" above.</td>
      </tr>
    `;
    return;
  }

  const activeId = activeAccount ? activeAccount.id : null;

  tbody.innerHTML = accounts.map(acc => {
    const isActive = acc.id === activeId;
    const isExhausted = acc.status === 'exhausted';
    const typeBadge = acc.type === 'google'
      ? '<span class="badge badge-google">Google</span>'
      : '<span class="badge badge-key">API Key</span>';

    let statusBadge = '';
    if (isActive) {
      statusBadge = '<span class="badge badge-active">Active</span>';
    } else if (isExhausted) {
      statusBadge = '<span class="badge badge-exhausted">Quota Limit</span>';
    } else {
      statusBadge = '<span class="badge badge-ready">Ready</span>';
    }

    const lastUsedStr = acc.last_used
      ? new Date(acc.last_used).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Never';

    const cooldownStr = isExhausted && acc.exhausted_until
      ? `<span class="text-danger">${getRemainingTime(acc.exhausted_until)}</span>`
      : '—';

    return `
      <tr>
        <td><strong>#${acc.priority || 10}</strong></td>
        <td class="account-id-cell">
          <strong>${escapeHtml(acc.name)}</strong>
          <small>${escapeHtml(acc.email)}</small>
        </td>
        <td>${typeBadge}</td>
        <td>${statusBadge}</td>
        <td>${cooldownStr}</td>
        <td>${lastUsedStr}</td>
        <td class="text-right actions-cell">
          ${!isActive ? `<button class="btn btn-sm btn-primary" onclick="useAccount('${acc.id}')">Make Active</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="testAccount('${acc.id}')" title="Test with agy models">Test</button>
          ${isExhausted ? `<button class="btn btn-sm btn-secondary" onclick="resetCooldown('${acc.id}')">Clear Cooldown</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="deleteAccount('${acc.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderEvents(events) {
  const container = document.getElementById('eventsList');
  if (!events || events.length === 0) {
    container.innerHTML = '<div class="empty-state">No recent auto-switch events recorded.</div>';
    return;
  }

  container.innerHTML = events.slice(0, 15).map(ev => {
    const time = new Date(ev.timestamp).toLocaleTimeString();
    return `
      <div class="event-item ${ev.type}">
        <span class="event-time">${time}</span>
        <div class="event-msg">${escapeHtml(ev.message)}</div>
      </div>
    `;
  }).join('');
}

function getRemainingTime(iso) {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((target - now) / 1000));
  if (diffSec <= 0) return 'Expiring...';
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m}m ${s}s`;
}

// User Actions
async function useAccount(id) {
  try {
    await API.useAccount(id);
    await refreshAll();
  } catch (err) {
    alert('Failed to switch account: ' + err.message);
  }
}

async function testAccount(id) {
  const btn = event.target;
  const origText = btn.textContent;
  btn.textContent = 'Testing...';
  btn.disabled = true;

  try {
    const res = await API.testAccount(id);
    if (res.success) {
      alert('✅ Account verified successfully!');
    } else {
      alert('⚠️ Verification warning: ' + res.message);
    }
  } catch (err) {
    alert('❌ Test error: ' + err.message);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
    await refreshAll();
  }
}

async function resetCooldown(id) {
  try {
    await API.resetCooldown(id);
    await refreshAll();
  } catch (err) {
    alert('Failed to reset cooldown: ' + err.message);
  }
}

async function deleteAccount(id) {
  if (!confirm(`Are you sure you want to remove account '${id}' from the pool?`)) return;
  try {
    await API.deleteAccount(id);
    await refreshAll();
  } catch (err) {
    alert('Failed to delete account: ' + err.message);
  }
}

// Auto-switch Toggle
document.getElementById('autoSwitchToggle').addEventListener('change', async (e) => {
  try {
    await API.saveConfig({ auto_switch: e.target.checked });
    await refreshAll();
  } catch (err) {
    alert('Failed to update config: ' + err.message);
  }
});

// Modal Handlers
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function openAddKeyModal() { openModal('addKeyModal'); }
function openGoogleLoginModal() { openModal('googleLoginModal'); }
function openCaptureModal() { openModal('captureModal'); }

function openSettingsModal() {
  if (currentStatus) {
    document.getElementById('settingStrategy').value = currentStatus.switch_strategy || 'priority';
    document.getElementById('settingCooldown').value = currentStatus.cooldown_minutes || 60;
  }
  openModal('settingsModal');
}

async function handleAddKeySubmit(e) {
  e.preventDefault();
  const id = document.getElementById('keyId').value.trim();
  const name = document.getElementById('keyName').value.trim();
  const api_key = document.getElementById('keySecret').value.trim();
  const priority = parseInt(document.getElementById('keyPriority').value) || 10;

  try {
    await API.addKey({ id, name, api_key, priority });
    closeModal('addKeyModal');
    e.target.reset();
    await refreshAll();
  } catch (err) {
    alert('Error saving key: ' + err.message);
  }
}

async function handleCaptureSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('captureId').value.trim();

  try {
    await API.captureCurrent(id);
    closeModal('captureModal');
    e.target.reset();
    await refreshAll();
  } catch (err) {
    alert('Error capturing session: ' + err.message);
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const switch_strategy = document.getElementById('settingStrategy').value;
  const cooldown_minutes = parseInt(document.getElementById('settingCooldown').value) || 60;
  const notifications = document.getElementById('settingNotifications').checked;

  try {
    await API.saveConfig({ switch_strategy, cooldown_minutes, notifications });
    closeModal('settingsModal');
    await refreshAll();
  } catch (err) {
    alert('Error saving settings: ' + err.message);
  }
}

function copyLoginCmd() {
  const code = document.getElementById('loginCliCmd').textContent;
  navigator.clipboard.writeText(code);
  alert('Copied to clipboard: ' + code);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// Initial Boot
refreshAll();
setInterval(refreshAll, 3000);

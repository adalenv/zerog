// zerog Dashboard Frontend
'use strict';

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
  addToken: (payload) => fetch('/api/accounts/add-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json()),
  startGoogleLogin: (id, name) => fetch('/api/accounts/login/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name })
  }).then(r => r.json()),
  getGoogleLoginStatus: () => fetch('/api/accounts/login/status').then(r => r.json()),
  cancelGoogleLogin: () => fetch('/api/accounts/login/cancel', {
    method: 'POST'
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
let loginPollTimer = null;

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

// Data Fetch & Synchronization
async function refreshAll() {
  try {
    const [statusData, accountsData, eventsData] = await Promise.all([
      API.status().catch(err => { console.error('Status fetch error:', err); return null; }),
      API.accounts().catch(err => { console.error('Accounts fetch error:', err); return null; }),
      API.events().catch(err => { console.error('Events fetch error:', err); return []; })
    ]);

    if (statusData) {
      currentStatus = statusData;
      renderStatus(statusData);
    }

    if (accountsData) {
      const list = Array.isArray(accountsData)
        ? accountsData
        : (accountsData.accounts || []);
      const activeId = (statusData && statusData.active_account && statusData.active_account.id)
        || accountsData.active_account
        || null;
      currentAccounts = list;
      renderAccounts(list, activeId);
    }

    if (eventsData) {
      renderEvents(eventsData);
    }
  } catch (err) {
    console.error('Refresh failed:', err);
  }
}

// Render Header & Metric Panels
function renderStatus(status) {
  // Watchdog indicator
  const daemonEl = document.getElementById('daemonStatus');
  const daemonText = document.getElementById('daemonStatusText');
  if (daemonEl && daemonText) {
    if (status.daemon_running) {
      daemonEl.classList.remove('stopped');
      daemonText.textContent = 'Watchdog: Active';
    } else {
      daemonEl.classList.add('stopped');
      daemonText.textContent = 'Watchdog: Stopped';
    }
  }

  // Auto-switch toggle
  const toggle = document.getElementById('autoSwitchToggle');
  if (toggle && status.auto_switch !== undefined) {
    toggle.checked = !!status.auto_switch;
  }

  // Active account card
  const active = status.active_account;
  const nameEl = document.getElementById('activeAccountName');
  const emailEl = document.getElementById('activeAccountEmail');
  const tagEl = document.getElementById('activeAccountTag');

  if (active) {
    if (nameEl) nameEl.textContent = active.name || active.id;
    if (emailEl) emailEl.textContent = active.email || '—';
    if (tagEl) {
      tagEl.innerHTML = `
        <span class="badge ${active.type === 'google' ? 'badge-google' : 'badge-key'}">${active.type === 'google' ? 'Google' : 'API Key'}</span>
        <span class="badge badge-active">Active</span>
      `;
    }
  } else {
    if (nameEl) nameEl.textContent = 'None';
    if (emailEl) emailEl.textContent = 'No account active';
    if (tagEl) tagEl.innerHTML = '<span class="badge badge-ready">Idle</span>';
  }

  // Metric counts
  const readyCount = status.ready ?? status.ready_accounts ?? 0;
  const totalCount = status.total ?? status.total_accounts ?? 0;
  const cooldownCount = status.in_cooldown ?? status.exhausted ?? status.exhausted_accounts ?? 0;

  const readyEl = document.getElementById('poolReadyCount');
  const totalEl = document.getElementById('poolTotalCount');
  const exhaustedEl = document.getElementById('poolExhaustedCount');

  if (readyEl) readyEl.textContent = readyCount;
  if (totalEl) totalEl.textContent = totalCount;
  if (exhaustedEl) exhaustedEl.textContent = cooldownCount;

  // Rotation strategy & default cooldown
  const stratEl = document.getElementById('strategyText');
  const cdEl = document.getElementById('cooldownText');
  if (stratEl) stratEl.textContent = status.switch_strategy === 'round_robin' ? 'Round-Robin' : 'Priority';
  if (cdEl) cdEl.textContent = status.cooldown_minutes || 60;
}

// Render Accounts Data Table
function renderAccounts(accounts, activeAccount) {
  const tbody = document.getElementById('accountsTableBody');
  if (!tbody) return;

  const list = Array.isArray(accounts) ? accounts : (accounts && accounts.accounts ? accounts.accounts : []);
  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="cell-empty">No accounts in pool. Click "+ Add Account" above to add one.</td>
      </tr>
    `;
    return;
  }

  const activeId = (activeAccount && typeof activeAccount === 'object' ? activeAccount.id : activeAccount)
    || (currentStatus && currentStatus.active_account ? currentStatus.active_account.id : null);

  tbody.innerHTML = list.map(acc => {
    const isActive = (acc.id === activeId) || (acc.status === 'active');
    const isExhausted = acc.status === 'exhausted' || (acc.exhausted_until && new Date(acc.exhausted_until).getTime() > Date.now());

    const typeBadge = acc.type === 'google'
      ? '<span class="badge badge-google">Google</span>'
      : '<span class="badge badge-key">API Key</span>';

    let statusBadge = '';
    if (isActive) {
      statusBadge = '<span class="badge badge-active">Active</span>';
    } else if (isExhausted) {
      statusBadge = '<span class="badge badge-limit">Cooldown</span>';
    } else {
      statusBadge = '<span class="badge badge-ready">Ready</span>';
    }

    const lastUsedStr = acc.last_used
      ? formatRelativeTime(acc.last_used)
      : 'Never';

    const cooldownStr = isExhausted && acc.exhausted_until
      ? `<span class="cooldown-timer" data-until="${escapeHtml(acc.exhausted_until)}" style="color: var(--danger); font-family: var(--font-mono); font-size: 12px;">${getRemainingTime(acc.exhausted_until)}</span>`
      : '—';

    return `
      <tr>
        <td style="font-family: var(--font-mono); color: var(--text-dim); font-size: 12px;">#${acc.priority || 1}</td>
        <td>
          <div class="account-cell">
            <span class="account-id">${escapeHtml(acc.name || acc.id)}</span>
            <span class="account-email">${escapeHtml(acc.email || acc.id)}</span>
          </div>
        </td>
        <td>${typeBadge}</td>
        <td>${statusBadge}</td>
        <td>${cooldownStr}</td>
        <td style="color: var(--text-muted); font-size: 12px;">${lastUsedStr}</td>
        <td class="text-right">
          <div class="actions-row">
            ${!isActive ? `<button class="btn btn-secondary btn-sm" onclick="useAccount('${escapeHtml(acc.id)}')">Switch</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="testAccount('${escapeHtml(acc.id)}', this)">Test</button>
            ${isExhausted ? `<button class="btn btn-secondary btn-sm" onclick="resetCooldown('${escapeHtml(acc.id)}')">Reset</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="deleteAccount('${escapeHtml(acc.id)}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Event Stream
function renderEvents(events) {
  const container = document.getElementById('eventsList');
  if (!container) return;

  if (!events || events.length === 0) {
    container.innerHTML = '<div class="empty-state">No recent failover events recorded.</div>';
    return;
  }

  container.innerHTML = events.slice(0, 25).map(ev => {
    const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '';
    const type = escapeHtml(ev.type || 'INFO');
    const msg = escapeHtml(ev.message || '');
    return `
      <div class="event-row">
        <span class="event-time">${time}</span>
        <span class="event-type ${type}">${type}</span>
        <span class="event-msg">${msg}</span>
      </div>
    `;
  }).join('');
}

async function loadEvents() {
  try {
    const events = await API.events();
    renderEvents(events);
    showToast('Event feed refreshed', 'info');
  } catch (err) {
    showToast('Failed to load events: ' + err.message, 'error');
  }
}

// Time Formatting Helpers
function getRemainingTime(iso) {
  if (!iso) return '—';
  const diffSec = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
  if (diffSec <= 0) return 'Expired';
  const d = Math.floor(diffSec / 86400);
  const h = Math.floor((diffSec % 86400) / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatRelativeTime(iso) {
  if (!iso) return 'Never';
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// Live Cooldown Countdown Ticker
setInterval(() => {
  document.querySelectorAll('.cooldown-timer[data-until]').forEach(el => {
    el.textContent = getRemainingTime(el.getAttribute('data-until'));
  });
}, 1000);

// Account Actions
async function useAccount(id) {
  try {
    const res = await API.useAccount(id);
    if (res.error) throw new Error(res.error);
    showToast(`Switched active account to '${id}'`, 'success');
    await refreshAll();
  } catch (err) {
    showToast('Failed to switch: ' + err.message, 'error');
  }
}

async function testAccount(id, btn) {
  const origText = btn ? btn.textContent : 'Test';
  if (btn) {
    btn.textContent = 'Testing...';
    btn.disabled = true;
  }

  try {
    const res = await API.testAccount(id);
    if (res.error) throw new Error(res.error);
    if (res.success) {
      showToast(`Account '${id}' verified successfully`, 'success');
    } else {
      showToast(`Account '${id}' verification warning: ${res.message}`, 'error');
    }
  } catch (err) {
    showToast('Test failed: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.textContent = origText;
      btn.disabled = false;
    }
    await refreshAll();
  }
}

async function resetCooldown(id) {
  try {
    const res = await API.resetCooldown(id);
    if (res.error) throw new Error(res.error);
    showToast(`Cleared cooldown for '${id}'`, 'success');
    await refreshAll();
  } catch (err) {
    showToast('Failed to reset cooldown: ' + err.message, 'error');
  }
}

async function deleteAccount(id) {
  if (!confirm(`Are you sure you want to remove account '${id}' from the pool?`)) return;
  try {
    const res = await API.deleteAccount(id);
    if (res.error) throw new Error(res.error);
    showToast(`Account '${id}' deleted`, 'success');
    await refreshAll();
  } catch (err) {
    showToast('Failed to delete account: ' + err.message, 'error');
  }
}

// Auto-switch Toggle Listener
const autoToggle = document.getElementById('autoSwitchToggle');
if (autoToggle) {
  autoToggle.addEventListener('change', async (e) => {
    try {
      const res = await API.saveConfig({ auto_switch: e.target.checked });
      if (res.error) throw new Error(res.error);
      showToast(`Auto-switch ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
      await refreshAll();
    } catch (err) {
      showToast('Failed to update setting: ' + err.message, 'error');
    }
  });
}

// Modal Management
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Unified Add Account Modal & Tabs
function switchAddTab(tabName) {
  const tabs = ['google', 'key', 'capture', 'token'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const pane = document.getElementById(`pane${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.classList.toggle('active', t === tabName);
  });
}

function openAddAccountModal(tab = 'google') {
  switchAddTab(tab);
  openModal('addAccountModal');
}

// Legacy Aliases for backwards-compatibility
function openGoogleLoginModal() { openAddAccountModal('google'); }
function openAddKeyModal() { openAddAccountModal('key'); }
function openCaptureModal() { openAddAccountModal('capture'); }

function openSettingsModal() {
  if (currentStatus) {
    const stratEl = document.getElementById('settingStrategy');
    const cdEl = document.getElementById('settingCooldown');
    if (stratEl) stratEl.value = currentStatus.switch_strategy || 'priority';
    if (cdEl) cdEl.value = currentStatus.cooldown_minutes || 60;
  }
  openModal('settingsModal');
}

// Modal Backdrop & ESC Handlers
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(el => el.classList.remove('open'));
  }
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
    }
  });
});

// Google OAuth Sign-In Handlers
async function handleGoogleLoginSubmit(e) {
  e.preventDefault();
  const idInput = document.getElementById('googleLoginId');
  const nameInput = document.getElementById('googleLoginName');
  const id = idInput ? idInput.value.trim() : '';
  const name = nameInput ? nameInput.value.trim() : '';

  if (!id) {
    showToast('Please enter an account identifier', 'error');
    return;
  }

  const progressEl = document.getElementById('googleLoginProgress');
  const buttonsEl = document.getElementById('googleLoginButtons');
  const cancelButtonsEl = document.getElementById('googleCancelButtons');
  const msgEl = document.getElementById('loginProgressMsg');
  const titleEl = document.getElementById('loginProgressTitle');
  const authUrlCont = document.getElementById('loginAuthUrlContainer');
  const authUrlLink = document.getElementById('loginAuthUrlLink');

  try {
    const res = await API.startGoogleLogin(id, name);
    if (res.error) throw new Error(res.error);

    // Show Progress State
    if (progressEl) progressEl.style.display = 'block';
    if (buttonsEl) buttonsEl.style.display = 'none';
    if (cancelButtonsEl) cancelButtonsEl.style.display = 'flex';
    if (titleEl) titleEl.textContent = 'Browser opened for authentication...';
    if (msgEl) msgEl.textContent = 'Please complete Google sign-in in your browser window.';
    if (authUrlCont) authUrlCont.style.display = 'none';

    showToast('Browser opened. Complete Google sign-in to continue.', 'info');

    if (loginPollTimer) clearInterval(loginPollTimer);
    loginPollTimer = setInterval(async () => {
      try {
        const statusRes = await API.getGoogleLoginStatus();
        if (statusRes.authUrl && authUrlCont && authUrlLink) {
          authUrlCont.style.display = 'block';
          authUrlLink.href = statusRes.authUrl;
        }
        if (statusRes.message && msgEl) {
          msgEl.textContent = statusRes.message;
        }

        if (statusRes.status === 'success') {
          clearInterval(loginPollTimer);
          loginPollTimer = null;
          resetGoogleLoginForm();
          closeModal('addAccountModal');
          showToast(`Account '${id}' registered successfully!`, 'success');
          await refreshAll();
        } else if (statusRes.status === 'error') {
          clearInterval(loginPollTimer);
          loginPollTimer = null;
          resetGoogleLoginForm();
          showToast('Sign-in failed: ' + (statusRes.message || 'Unknown error'), 'error');
        } else if (statusRes.status === 'cancelled') {
          clearInterval(loginPollTimer);
          loginPollTimer = null;
          resetGoogleLoginForm();
          showToast('Sign-in was cancelled', 'info');
        }
      } catch (pollErr) {
        console.error('Login status poll failed:', pollErr);
      }
    }, 1500);

  } catch (err) {
    showToast('Failed to start Google sign-in: ' + err.message, 'error');
  }
}

async function cancelGoogleLogin() {
  if (loginPollTimer) {
    clearInterval(loginPollTimer);
    loginPollTimer = null;
  }
  try {
    await API.cancelGoogleLogin();
  } catch {}
  resetGoogleLoginForm();
  showToast('Sign-in cancelled', 'info');
}

function resetGoogleLoginForm() {
  const form = document.getElementById('googleLoginForm');
  if (form) form.reset();
  const progressEl = document.getElementById('googleLoginProgress');
  const buttonsEl = document.getElementById('googleLoginButtons');
  const cancelButtonsEl = document.getElementById('googleCancelButtons');
  if (progressEl) progressEl.style.display = 'none';
  if (buttonsEl) buttonsEl.style.display = 'flex';
  if (cancelButtonsEl) cancelButtonsEl.style.display = 'none';
}

// Form Submissions: API Key, Capture, Token
async function handleAddKeySubmit(e) {
  e.preventDefault();
  const id = document.getElementById('keyId').value.trim();
  const name = document.getElementById('keyName').value.trim();
  const api_key = document.getElementById('keySecret').value.trim();
  const priority = parseInt(document.getElementById('keyPriority').value, 10) || 1;

  try {
    const res = await API.addKey({ id, name, api_key, priority });
    if (res.error) throw new Error(res.error);
    closeModal('addAccountModal');
    e.target.reset();
    showToast(`Added API Key '${id}'`, 'success');
    await refreshAll();
  } catch (err) {
    showToast('Failed to save API key: ' + err.message, 'error');
  }
}

async function handleCaptureSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('captureId').value.trim();

  try {
    const res = await API.captureCurrent(id);
    if (res.error) throw new Error(res.error);
    closeModal('addAccountModal');
    e.target.reset();
    showToast(`Session captured as '${id}'`, 'success');
    await refreshAll();
  } catch (err) {
    showToast('Failed to capture session: ' + err.message, 'error');
  }
}

async function handleTokenSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('tokenId').value.trim();
  const name = document.getElementById('tokenName').value.trim();
  const payload = document.getElementById('tokenPayload').value.trim();
  const priority = parseInt(document.getElementById('tokenPriority').value, 10) || 1;

  try {
    const res = await API.addToken({ id, name, payload, priority });
    if (res.error) throw new Error(res.error);
    closeModal('addAccountModal');
    e.target.reset();
    showToast(`Account '${id}' imported successfully`, 'success');
    await refreshAll();
  } catch (err) {
    showToast('Failed to import token: ' + err.message, 'error');
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const switch_strategy = document.getElementById('settingStrategy').value;
  const cooldown_minutes = parseInt(document.getElementById('settingCooldown').value, 10) || 60;
  const notifications = document.getElementById('settingNotifications') ? document.getElementById('settingNotifications').checked : true;

  try {
    const res = await API.saveConfig({ switch_strategy, cooldown_minutes, notifications });
    if (res.error) throw new Error(res.error);
    closeModal('settingsModal');
    showToast('Settings updated', 'success');
    await refreshAll();
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// Initial Boot & Auto-refresh Polling
refreshAll();
setInterval(refreshAll, 3000);

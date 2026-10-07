'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const VERSION = require('./version');
const Config = require('./config');
const Account = require('./account');
const AgyLocator = require('./agy-locator');

const KEYCHAIN_SERVICE = 'gemini';
const KEYCHAIN_ACCOUNT = 'antigravity';
const KEYCHAIN_FALLBACK_FILE = path.join(os.homedir(), '.gemini', 'antigravity-cli', '.zerog_keyring_token');

class AccountManager {
  static get KEYCHAIN_SERVICE() { return KEYCHAIN_SERVICE; }
  static get KEYCHAIN_ACCOUNT() { return KEYCHAIN_ACCOUNT; }

  static get appStoragePath() {
    return process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity', 'app_storage.json')
      : path.join(os.homedir(), '.config', 'Antigravity', 'app_storage.json');
  }

  static get settingsPath() {
    return path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
  }

  static ensureAgyInstalled(config = null, exitOnMissing = false) {
    if (exitOnMissing) {
      return AgyLocator.findOrThrow(config);
    }
    return AgyLocator.find(config);
  }

  static agyPath(config = null) {
    return AgyLocator.find(config);
  }

  constructor(config = null) {
    this.config = config || new Config();
    this._ensureAutoImport();
  }

  get agyPath() {
    return AccountManager.agyPath(this.config) || 'agy';
  }

  listAccounts() {
    const accounts = [];
    const dir = Config.accountsDir;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf8');
          const data = JSON.parse(raw);
          const acc = Account.fromJSON(data);
          acc.isExhausted(); // refresh status if cooldown expired
          accounts.push(acc);
        } catch (e) {
          console.warn(`[zerog] Warning: failed to parse account file ${file}: ${e.message}`);
        }
      }
    } catch {
      // directory read error
    }

    return accounts.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.id.localeCompare(b.id);
    });
  }

  findAccount(id) {
    if (!id || typeof id !== 'string') return null;
    const filePath = path.join(Config.accountsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return Account.fromJSON(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  saveAccount(account) {
    const filePath = path.join(Config.accountsDir, `${account.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(account.toJSON(), null, 2), { mode: 0o600 });
    return account;
  }

  deleteAccount(id) {
    const filePath = path.join(Config.accountsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (this.config.activeAccount === id) {
      const remaining = this.listAccounts();
      this.config.activeAccount = remaining.length > 0 ? remaining[0].id : null;
    }
    return true;
  }

  activeAccount() {
    const activeId = this.config.activeAccount;
    if (activeId) {
      const acc = this.findAccount(activeId);
      if (acc) return acc;
    }
    const list = this.listAccounts();
    return list.length > 0 ? list[0] : null;
  }

  activateAccount(idOrAccount) {
    const account = idOrAccount instanceof Account ? idOrAccount : this.findAccount(idOrAccount);
    if (!account) throw new Error(`Account not found: ${idOrAccount}`);

    if (account.type === 'google') {
      const payload = account.data ? account.data.keyring_payload : null;
      if (!payload) {
        throw new Error(`No keychain token available for Google account ${account.id}`);
      }
      this.writeKeychain(payload);
      this._updateAppStorage(account.email);
      this._updateGeminiSettings(false);
    } else if (account.type === 'gemini-api-key') {
      this._updateGeminiSettings(true);
    }

    account.lastUsed = new Date();
    account.status = 'active';
    this.saveAccount(account);

    for (const other of this.listAccounts()) {
      if (other.id !== account.id && other.status === 'active') {
        other.status = 'ready';
        this.saveAccount(other);
      }
    }

    this.config.activeAccount = account.id;
    this.logEvent('SWITCH', `Switched active account to '${account.id}' (${account.email})`);
    return account;
  }

  syncActiveState() {
    const active = this.activeAccount();
    if (!active) {
      this._updateGeminiSettings(false);
      return null;
    }

    try {
      if (active.type === 'google') {
        const payload = active.data ? active.data.keyring_payload : null;
        if (payload) {
          try { this.writeKeychain(payload); } catch {}
        }
        if (active.email) {
          this._updateAppStorage(active.email);
        }
        this._updateGeminiSettings(false);
      } else if (active.type === 'gemini-api-key') {
        this._updateGeminiSettings(true);
      } else {
        this._updateGeminiSettings(false);
      }
    } catch {}

    return active;
  }

  markExhausted(idOrAccount, reason = 'Plan usage over', minutes = null) {
    const account = idOrAccount instanceof Account ? idOrAccount : this.findAccount(idOrAccount);
    if (!account) return;

    const cooldown = Number(minutes || this.config.cooldownMinutes) || 60;
    account.markExhausted(cooldown);
    this.saveAccount(account);

    this.logEvent('EXHAUSTED', `Account '${account.id}' (${account.email}) exhausted: ${reason}. Cooldown ${cooldown}m.`);
  }

  resetCooldown(idOrAccount) {
    const account = idOrAccount instanceof Account ? idOrAccount : this.findAccount(idOrAccount);
    if (!account) return;

    account.resetCooldown();
    this.saveAccount(account);
    this.logEvent('RESET', `Cleared cooldown for account '${account.id}' (${account.email})`);
  }

  getNextAvailable(currentId = null) {
    const currId = currentId || this.config.activeAccount;
    const candidates = this.listAccounts().filter(acc => {
      return acc.id !== currId && !acc.isExhausted();
    });

    if (candidates.length === 0) return null;

    if (this.config.switchStrategy === 'round_robin') {
      candidates.sort((a, b) => {
        const timeA = a.lastUsed ? a.lastUsed.getTime() : 0;
        const timeB = b.lastUsed ? b.lastUsed.getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.priority - b.priority;
      });
    } else {
      candidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const timeA = a.lastUsed ? a.lastUsed.getTime() : 0;
        const timeB = b.lastUsed ? b.lastUsed.getTime() : 0;
        return timeA - timeB;
      });
    }

    return candidates[0];
  }

  autoSwitch(currentId = null, reason = 'Plan usage over', minutes = null) {
    const curr = currentId ? this.findAccount(currentId) : this.activeAccount();
    if (curr) {
      this.markExhausted(curr, reason, minutes);
    }

    const nextAcc = this.getNextAvailable(curr ? curr.id : null);
    if (nextAcc) {
      this.activateAccount(nextAcc);
      this.logEvent('AUTO_SWITCH', `Auto-switched from '${curr ? curr.id : 'none'}' to '${nextAcc.id}' (${nextAcc.email})`);
      return nextAcc;
    }

    this.logEvent('POOL_EXHAUSTED', 'All accounts in pool are quota-exhausted');
    return null;
  }

  captureCurrent(id, name = null) {
    const payload = this.readKeychain();
    if (!payload || payload.trim() === '') {
      throw new Error('No Antigravity login token found in system Keychain.');
    }

    const info = this.parseKeychainPayload(payload);
    const email = info.email || `${id}@antigravity.google`;
    const accName = name || email;

    const account = new Account({
      id: id,
      name: accName,
      email: email,
      type: 'google',
      status: 'active',
      priority: 1,
      data: {
        keyring_payload: payload,
        username: email
      }
    });

    this.saveAccount(account);
    this.config.activeAccount = account.id;
    this.logEvent('CAPTURE', `Captured existing Keychain session as '${id}' (${email})`);
    return account;
  }

  addGeminiApiKey(id, name = null, apiKey, priority = 10) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('API key cannot be blank');
    }

    const cleanKey = apiKey.trim();
    const displayEmail = `api:${cleanKey.slice(0, 7)}...${cleanKey.slice(-4)}`;
    const accName = name || `Gemini API (${id})`;

    const account = new Account({
      id: id,
      name: accName,
      email: displayEmail,
      type: 'gemini-api-key',
      status: 'ready',
      priority: Number(priority) || 10,
      data: {
        api_key: cleanKey,
        model_provider: 'gemini'
      }
    });

    this.saveAccount(account);
    this.logEvent('ADD_KEY', `Added Gemini API key account '${id}'`);
    return account;
  }

  startGoogleLogin(id, name = null, onProgress = null) {
    const currentToken = this.readKeychain();
    if (onProgress) onProgress('backing_up', 'Backing up current credentials...');

    try { this.deleteKeychain(); } catch {}

    if (onProgress) onProgress('launching', 'Launching Google authentication. Please complete login in your browser...');

    // Run agy --print 'hi' to trigger browser login flow
    spawnSync(this.agyPath, ['--print', 'hi'], { stdio: 'inherit' });

    const newToken = this.readKeychain();
    if (newToken && newToken.trim() !== '' && newToken !== currentToken) {
      const info = this.parseKeychainPayload(newToken);
      const email = info.email || `${id}@antigravity.google`;
      const accName = name || email;

      const newAcc = new Account({
        id: id,
        name: accName,
        email: email,
        type: 'google',
        status: 'ready',
        priority: 1,
        data: {
          keyring_payload: newToken,
          username: email
        }
      });

      this.saveAccount(newAcc);
      if (onProgress) onProgress('success', `Successfully logged in and saved account '${id}' (${email})`);

      // Immediately activate the newly authenticated account
      this.activateAccount(newAcc);

      return newAcc;
    } else {
      if (currentToken) this.writeKeychain(currentToken);
      throw new Error('Sign-in did not complete or no new token was received in Keychain.');
    }
  }

  testAccount(idOrAccount) {
    const account = idOrAccount instanceof Account ? idOrAccount : this.findAccount(idOrAccount);
    if (!account) throw new Error(`Account not found: ${idOrAccount}`);

    const previousActive = this.activeAccount();

    try {
      this.activateAccount(account);
      const res = spawnSync(this.agyPath, ['models'], { encoding: 'utf8' });
      const stdout = res.stdout || '';
      const stderr = res.stderr || '';
      const success = res.status === 0 && stdout.includes('gemini');

      if (success) {
        account.status = 'ready';
        account.resetCooldown();
        this.saveAccount(account);
        return { success: true, message: 'Authentication verified successfully!' };
      } else {
        const err = (stderr.trim() || stdout.trim()).slice(0, 200);
        return { success: false, message: `Check failed: ${err}` };
      }
    } finally {
      if (previousActive && previousActive.id !== account.id) {
        try { this.activateAccount(previousActive); } catch {}
      }
    }
  }

  // Cross-Platform Keyring Implementation
  get isDarwin() { return process.platform === 'darwin'; }
  get isLinux() { return process.platform === 'linux'; }
  get isWindows() { return process.platform === 'win32'; }

  get hasSecretTool() {
    if (this._hasSecretTool !== undefined) return this._hasSecretTool;
    try {
      execSync('which secret-tool', { stdio: 'ignore' });
      this._hasSecretTool = true;
    } catch {
      this._hasSecretTool = false;
    }
    return this._hasSecretTool;
  }

  get keyringBackend() {
    if (this.isDarwin) return 'macOS Keychain (security)';
    if (this.isLinux) return this.hasSecretTool ? 'Linux Secret Service (secret-tool)' : 'File Fallback';
    if (this.isWindows) return 'Windows Credential Manager';
    return 'File Fallback';
  }

  readKeychain() {
    try {
      if (this.isDarwin) {
        const out = execSync(
          `security find-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
        );
        if (out && out.trim() !== '') return out.trim();
      } else if (this.isLinux) {
        if (this.hasSecretTool) {
          const out = execSync(
            `secret-tool lookup service "${KEYCHAIN_SERVICE}" username "${KEYCHAIN_ACCOUNT}"`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
          );
          if (out && out.trim() !== '') return out.trim();
        }
      } else if (this.isWindows) {
        const psScript = `[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null; $v = New-Object Windows.Security.Credentials.PasswordVault; try { $c = $v.Retrieve("${KEYCHAIN_SERVICE}", "${KEYCHAIN_ACCOUNT}"); $c.RetrievePassword(); Write-Output $c.Password } catch {}`;
        const out = execSync(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        if (out && out.trim() !== '') return out.trim();
      }
    } catch {
      // Fallback below
    }

    if (fs.existsSync(KEYCHAIN_FALLBACK_FILE)) {
      try {
        const content = fs.readFileSync(KEYCHAIN_FALLBACK_FILE, 'utf8').trim();
        if (content) return content;
      } catch {}
    }

    return null;
  }

  writeKeychain(payload) {
    try {
      if (this.isDarwin) {
        const res = spawnSync(
          'security',
          ['add-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', KEYCHAIN_SERVICE, '-U', '-w', payload],
          { encoding: 'utf8' }
        );
        if (res.status !== 0) throw new Error(res.stderr || 'security write failed');
        return true;
      } else if (this.isLinux) {
        if (this.hasSecretTool) {
          const res = spawnSync(
            'secret-tool',
            ['store', '--label=Antigravity', 'service', KEYCHAIN_SERVICE, 'username', KEYCHAIN_ACCOUNT],
            { input: payload, encoding: 'utf8' }
          );
          if (res.status !== 0) throw new Error(res.stderr || 'secret-tool failed');
          return true;
        } else {
          this._writeFallbackFile(payload);
          return true;
        }
      } else if (this.isWindows) {
        const b64 = Buffer.from(payload, 'utf8').toString('base64');
        const psScript = `[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null; $v = New-Object Windows.Security.Credentials.PasswordVault; $c = New-Object Windows.Security.Credentials.PasswordCredential("${KEYCHAIN_SERVICE}", "${KEYCHAIN_ACCOUNT}", [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${b64}"))); $v.Add($c)`;
        const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
        if (res.status !== 0) {
          spawnSync('cmdkey', [`/generic:${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`, `/user:${KEYCHAIN_ACCOUNT}`, `/pass:${payload}`]);
        }
        return true;
      } else {
        this._writeFallbackFile(payload);
        return true;
      }
    } catch (err) {
      this._writeFallbackFile(payload);
      return true;
    }
  }

  deleteKeychain() {
    try {
      if (this.isDarwin) {
        spawnSync('security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT]);
      } else if (this.isLinux) {
        if (this.hasSecretTool) {
          spawnSync('secret-tool', ['clear', 'service', KEYCHAIN_SERVICE, 'username', KEYCHAIN_ACCOUNT]);
        }
      } else if (this.isWindows) {
        spawnSync('cmdkey', [`/delete:${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`]);
      }
    } catch {}

    if (fs.existsSync(KEYCHAIN_FALLBACK_FILE)) {
      try { fs.unlinkSync(KEYCHAIN_FALLBACK_FILE); } catch {}
    }
  }

  _writeFallbackFile(payload) {
    const dir = path.dirname(KEYCHAIN_FALLBACK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(KEYCHAIN_FALLBACK_FILE, payload, { mode: 0o600 });
  }

  parseKeychainPayload(payload) {
    if (!payload || !payload.startsWith('go-keyring-base64:')) return {};

    try {
      const b64 = payload.replace(/^go-keyring-base64:/, '');
      const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
      const parsed = JSON.parse(jsonStr);

      let email = null;
      if (parsed.id_token) {
        const parts = parsed.id_token.split('.');
        if (parts.length >= 2) {
          const pad = '='.repeat((4 - (parts[1].length % 4)) % 4);
          const bodyStr = Buffer.from(parts[1] + pad, 'base64').toString('utf8');
          const body = JSON.parse(bodyStr);
          email = body.email;
        }
      }

      return {
        email: email,
        token: parsed.token,
        auth_method: parsed.auth_method
      };
    } catch {
      return {};
    }
  }

  exportAccounts(destFile = null) {
    const dest = destFile ? path.resolve(destFile) : path.join(process.cwd(), 'zerog-accounts.json');
    const accounts = this.listAccounts().map(a => a.toJSON());
    const exportBundle = {
      version: VERSION,
      exported_at: new Date().toISOString(),
      platform: process.platform,
      active_account: this.config.activeAccount,
      config: this.config.data,
      accounts: accounts
    };

    fs.writeFileSync(dest, JSON.stringify(exportBundle, null, 2), { mode: 0o600 });
    return dest;
  }

  importAccounts(srcFile) {
    const resolved = path.resolve(srcFile);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${srcFile}`);
    }

    const raw = fs.readFileSync(resolved, 'utf8');
    const data = JSON.parse(raw);
    const accountsData = data.accounts || [];

    let importedCount = 0;
    for (const accObj of accountsData) {
      const acc = Account.fromJSON(accObj);
      acc.resetCooldown();
      this.saveAccount(acc);
      importedCount++;
    }

    if (data.config && typeof data.config === 'object') {
      for (const [k, v] of Object.entries(data.config)) {
        if (k !== 'active_account') this.config.set(k, v);
      }
    }

    const targetId = data.active_account || (accountsData[0] && accountsData[0].id);
    if (targetId && this.findAccount(targetId)) {
      try {
        this.activateAccount(targetId);
      } catch {
        this.config.activeAccount = targetId;
      }
    }

    this.logEvent('IMPORT', `Imported ${importedCount} accounts from ${srcFile}`);
    return { count: importedCount, activeAccount: this.config.activeAccount };
  }

  logEvent(type, message) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: type,
      message: message
    };
    try {
      fs.appendFileSync(Config.eventsPath, JSON.stringify(entry) + '\n');
    } catch {}
  }

  readEvents(limit = 50) {
    if (!fs.existsSync(Config.eventsPath)) return [];
    try {
      const raw = fs.readFileSync(Config.eventsPath, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean).reverse();
    } catch {
      return [];
    }
  }

  _ensureAutoImport() {
    if (this.listAccounts().length > 0) return;

    const raw = this.readKeychain();
    if (!raw || raw.trim() === '') return;

    const info = this.parseKeychainPayload(raw);
    const email = info.email || 'default@antigravity.google';
    const acc = new Account({
      id: 'default',
      name: `Default Account (${email.split('@')[0]})`,
      email: email,
      type: 'google',
      status: 'active',
      priority: 1,
      data: {
        keyring_payload: raw,
        username: email
      }
    });

    this.saveAccount(acc);
    this.config.activeAccount = acc.id;
    this.logEvent('INIT', `Auto-discovered and imported primary account '${acc.id}' (${email})`);
  }

  _updateAppStorage(username) {
    const appStoragePath = AccountManager.appStoragePath;
    if (!fs.existsSync(appStoragePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(appStoragePath, 'utf8'));
      if (username) data['jetski.onboarding.lastLoginUsername'] = username;
      fs.writeFileSync(appStoragePath, JSON.stringify(data, null, 2));
    } catch {}
  }

  _updateGeminiSettings(isGeminiApiKey) {
    const settingsPath = AccountManager.settingsPath;
    try {
      if (!fs.existsSync(settingsPath)) {
        if (!isGeminiApiKey) return;
        const dir = path.dirname(settingsPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify({ modelProvider: 'gemini' }, null, 2));
        return;
      }
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (isGeminiApiKey) {
        data.modelProvider = 'gemini';
      } else {
        delete data.modelProvider;
      }
      fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    } catch {}
  }
}

module.exports = AccountManager;

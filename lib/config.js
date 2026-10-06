'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

class Config {
  static get zerogDir() {
    const d = path.join(os.homedir(), '.zerog');
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    }
    return d;
  }

  static get accountsDir() {
    const d = path.join(this.zerogDir, 'accounts');
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    }
    return d;
  }

  static get configPath() {
    return path.join(this.zerogDir, 'config.json');
  }

  static get eventsPath() {
    return path.join(this.zerogDir, 'events.jsonl');
  }

  static get daemonPidPath() {
    return path.join(this.zerogDir, 'daemon.pid');
  }

  static get daemonLogPath() {
    return path.join(this.zerogDir, 'daemon.log');
  }

  static get defaults() {
    return {
      auto_switch: true,
      switch_strategy: 'priority',
      cooldown_minutes: 60,
      wait_for_quota: true,
      web_port: 7890,
      continue_conversation: true,
      active_account: null,
      agy_path: null
    };
  }

  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(Config.configPath)) {
        const raw = fs.readFileSync(Config.configPath, 'utf8');
        return { ...Config.defaults, ...JSON.parse(raw) };
      }
    } catch {
      // Fallback on corrupt file
    }
    const def = { ...Config.defaults };
    this._save(def);
    return def;
  }

  _save(data = this.data) {
    try {
      fs.writeFileSync(Config.configPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch (err) {
      console.warn(`[zerog] Warning: failed to save config: ${err.message}`);
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, val) {
    this.data[key] = val;
    this._save();
    return val;
  }

  get autoSwitch() {
    return this.data.auto_switch !== false;
  }

  get switchStrategy() {
    return this.data.switch_strategy || 'priority';
  }

  get cooldownMinutes() {
    return Number(this.data.cooldown_minutes) || 60;
  }

  get waitForQuota() {
    return this.data.wait_for_quota !== false;
  }

  get continueConversation() {
    return this.data.continue_conversation !== false;
  }

  get webPort() {
    return Number(this.data.web_port) || 7890;
  }

  get activeAccount() {
    return this.data.active_account;
  }

  set activeAccount(id) {
    this.set('active_account', id);
  }
}

module.exports = Config;

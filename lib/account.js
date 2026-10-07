'use strict';

class Account {
  constructor({
    id,
    name = '',
    email = '',
    type = 'google',
    status = 'ready',
    priority = 10,
    exhausted_until = null,
    last_used = null,
    data = {}
  }) {
    this.id = String(id);
    this.name = name || id;
    this.email = email || `${id}@antigravity.google`;
    this.type = type || 'google';
    this.status = status || 'ready';
    this.priority = Number(priority) || 10;
    this.exhaustedUntil = exhausted_until ? new Date(exhausted_until) : null;
    this.lastUsed = last_used ? new Date(last_used) : null;
    this.data = data || {};
  }

  isExhausted() {
    if (!this.exhaustedUntil) return false;
    const now = new Date();
    if (now >= this.exhaustedUntil) {
      this.exhaustedUntil = null;
      if (this.status === 'exhausted') {
        this.status = 'ready';
      }
      return false;
    }
    return true;
  }

  remainingCooldownSeconds() {
    if (!this.isExhausted()) return 0;
    return Math.max(0, Math.ceil((this.exhaustedUntil.getTime() - Date.now()) / 1000));
  }

  remainingCooldownHuman() {
    const sec = this.remainingCooldownSeconds();
    if (sec <= 0) return 'Ready';
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const rem = sec % 60;
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m ${rem}s`;
    if (mins > 0) return `${mins}m ${rem}s`;
    return `${rem}s`;
  }

  markExhausted(minutes = 60) {
    this.exhaustedUntil = new Date(Date.now() + minutes * 60 * 1000);
    this.status = 'exhausted';
  }

  resetCooldown() {
    this.exhaustedUntil = null;
    if (this.status === 'exhausted') {
      this.status = 'ready';
    }
  }

  envOverrides() {
    if (this.type === 'gemini-api-key' && this.data && this.data.api_key) {
      return { GEMINI_API_KEY: this.data.api_key };
    }
    return {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      type: this.type,
      status: this.isExhausted() ? 'exhausted' : this.status,
      priority: this.priority,
      exhausted_until: this.exhaustedUntil ? this.exhaustedUntil.toISOString() : null,
      last_used: this.lastUsed ? this.lastUsed.toISOString() : null,
      data: this.data
    };
  }

  static fromJSON(obj) {
    return new Account({
      id: obj.id,
      name: obj.name,
      email: obj.email,
      type: obj.type,
      status: obj.status,
      priority: obj.priority,
      exhausted_until: obj.exhausted_until,
      last_used: obj.last_used,
      data: obj.data
    });
  }
}

module.exports = Account;

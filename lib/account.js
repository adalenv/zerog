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
    quota_type = null,
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
    this.quotaType = quota_type || null;
    this.data = data || {};
  }

  isExhausted() {
    if (!this.exhaustedUntil) return false;
    const now = new Date();
    if (now >= this.exhaustedUntil) {
      this.exhaustedUntil = null;
      this.quotaType = null;
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

  markExhausted(minutes = 60, quotaType = null) {
    this.exhaustedUntil = new Date(Date.now() + minutes * 60 * 1000);
    this.status = 'exhausted';
    if (quotaType) {
      this.quotaType = quotaType;
    } else if (minutes <= 300) {
      this.quotaType = '5_hour';
    } else {
      this.quotaType = 'weekly';
    }
  }

  mark5HourExhausted(minutes = 300) {
    this.markExhausted(minutes, '5_hour');
  }

  markWeeklyExhausted(minutes = 10080) {
    this.markExhausted(minutes, 'weekly');
  }

  markTotalExhausted(minutes = 1440) {
    this.markExhausted(minutes, 'total');
  }

  resetCooldown() {
    this.exhaustedUntil = null;
    this.quotaType = null;
    if (this.status === 'exhausted') {
      this.status = 'ready';
    }
  }

  getLimitSummary() {
    const isEx = this.isExhausted();
    const remainingSec = this.remainingCooldownSeconds();

    let fiveHourStatus = 'available';
    let weeklyStatus = 'available';
    let totalStatus = 'available';

    if (isEx) {
      if (this.quotaType === '5_hour' || (this.quotaType !== 'weekly' && remainingSec <= 5 * 3600)) {
        fiveHourStatus = 'exhausted';
      } else if (this.quotaType === 'weekly' || remainingSec > 5 * 3600) {
        weeklyStatus = 'exhausted';
      } else if (this.quotaType === 'total') {
        totalStatus = 'exhausted';
      }
    }

    const fiveHourText = fiveHourStatus === 'exhausted'
      ? `0m (Resets in ${this.remainingCooldownHuman()})`
      : '5h remaining';

    const weeklyText = weeklyStatus === 'exhausted'
      ? `0h (Resets in ${this.remainingCooldownHuman()})`
      : '7d remaining';

    const totalText = totalStatus === 'exhausted'
      ? '0% remaining'
      : '100% remaining';

    return {
      five_hour: {
        status: fiveHourStatus,
        label: fiveHourStatus === 'exhausted' ? `Resets in ${this.remainingCooldownHuman()}` : '5h remaining',
        remaining: fiveHourStatus === 'exhausted' ? '0m' : '5h',
        remaining_text: fiveHourText,
        resets_in_seconds: fiveHourStatus === 'exhausted' ? remainingSec : 0,
        is_exhausted: fiveHourStatus === 'exhausted'
      },
      weekly: {
        status: weeklyStatus,
        label: weeklyStatus === 'exhausted' ? `Resets in ${this.remainingCooldownHuman()}` : '7d remaining',
        remaining: weeklyStatus === 'exhausted' ? '0h' : '7d',
        remaining_text: weeklyText,
        resets_in_seconds: weeklyStatus === 'exhausted' ? remainingSec : 0,
        is_exhausted: weeklyStatus === 'exhausted'
      },
      total: {
        status: totalStatus,
        label: totalStatus === 'exhausted' ? '0% remaining' : '100% remaining',
        remaining: totalStatus === 'exhausted' ? '0%' : '100%',
        remaining_text: totalText,
        is_exhausted: totalStatus === 'exhausted'
      }
    };
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
      quota_type: this.quotaType,
      limits: this.getLimitSummary(),
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
      quota_type: obj.quota_type,
      exhausted_until: obj.exhausted_until,
      last_used: obj.last_used,
      data: obj.data
    });
  }
}

module.exports = Account;

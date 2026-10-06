'use strict';

const { exec } = require('child_process');

class Notifier {
  static get RESET()   { return '\x1b[0m'; }
  static get BOLD()    { return '\x1b[1m'; }
  static get RED()     { return '\x1b[31m'; }
  static get GREEN()   { return '\x1b[32m'; }
  static get YELLOW()  { return '\x1b[33m'; }
  static get BLUE()    { return '\x1b[34m'; }
  static get MAGENTA() { return '\x1b[35m'; }
  static get CYAN()    { return '\x1b[36m'; }
  static get GRAY()    { return '\x1b[90m'; }

  static banner(title, message, color = this.CYAN) {
    const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
    console.log(`\n${this.BOLD}${color}┌─────────────────────────────────────────────────────────────┐${this.RESET}`);
    console.log(`${this.BOLD}${color}│ [zerog] ${pad(title, 51)} │${this.RESET}`);
    console.log(`${color}├─────────────────────────────────────────────────────────────┤${this.RESET}`);
    message.split(/\r?\n/).forEach(line => {
      console.log(`${color}│ ${pad(line.trim(), 59)} │${this.RESET}`);
    });
    console.log(`${this.BOLD}${color}└─────────────────────────────────────────────────────────────┘${this.RESET}\n`);
  }

  static notifySwitch(fromAccount, toAccount) {
    const fromDesc = fromAccount ? `'${fromAccount.id}' (${fromAccount.email})` : 'previous account';
    const toDesc = `'${toAccount.id}' (${toAccount.email})`;
    const msg = `Quota limit reached on ${fromDesc}.\nAuto-switched to ${toDesc}.`;
    this.banner('🔄 ACCOUNT AUTO-SWITCHED', msg, this.YELLOW);
    this.systemNotification(
      'Zero-G Account Switched',
      `Switched from ${fromAccount ? fromAccount.id : 'old'} to ${toAccount.id} (${toAccount.email})`
    );
  }

  static notifyAllExhausted(earliestCooldown) {
    const msg = `All accounts in pool have exhausted their quota.\nNext reset in: ${earliestCooldown}.`;
    this.banner('⚠️ ALL ACCOUNTS EXHAUSTED', msg, this.RED);
    this.systemNotification('Zero-G Quota Alert', 'All accounts in your pool are currently quota-exhausted.');
  }

  static systemNotification(title, message) {
    const cleanMsg = (message || '').replace(/"/g, '\\"').replace(/\\/g, '\\\\');
    const cleanTitle = (title || '').replace(/"/g, '\\"').replace(/\\/g, '\\\\');

    if (process.platform === 'darwin') {
      const script = `display notification "${cleanMsg}" with title "${cleanTitle}" sound name "Hero"`;
      exec(`osascript -e "${script}"`, () => {});
    } else if (process.platform === 'linux') {
      exec(`notify-send "${cleanTitle}" "${cleanMsg}"`, () => {});
    }
  }
}

module.exports = Notifier;

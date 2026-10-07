'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const Config = require('./config');
const AccountManager = require('./account-manager');
const QuotaDetector = require('./quota-detector');
const Notifier = require('./notifier');

const CLI_LOG_PATH = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'cli.log');

class Daemon {
  constructor(manager = null) {
    this.manager = manager || new AccountManager();
    this.config = this.manager.config;
  }

  isRunning() {
    if (!fs.existsSync(Config.daemonPidPath)) return false;
    try {
      const pid = parseInt(fs.readFileSync(Config.daemonPidPath, 'utf8').trim(), 10);
      if (!pid) return false;
      // Signal 0 checks if process exists
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  startBackground() {
    if (this.isRunning()) {
      const pid = fs.readFileSync(Config.daemonPidPath, 'utf8').trim();
      console.log(`${Notifier.YELLOW}zerog daemon is already running (PID: ${pid})${Notifier.RESET}`);
      return;
    }

    const scriptPath = path.resolve(__dirname, '..', 'bin', 'zerog.js');
    const out = fs.openSync(Config.daemonLogPath, 'a');
    const child = spawn(process.execPath, [scriptPath, 'watch'], {
      detached: true,
      stdio: ['ignore', out, out]
    });

    child.unref();

    fs.writeFileSync(Config.daemonPidPath, String(child.pid), { mode: 0o600 });
    console.log(`${Notifier.GREEN}✓ Started zerog watchdog daemon (PID: ${child.pid})${Notifier.RESET}`);
    console.log(`${Notifier.GRAY}Logs: ${Config.daemonLogPath}${Notifier.RESET}`);
  }

  stop() {
    if (!fs.existsSync(Config.daemonPidPath)) {
      console.log(`${Notifier.GRAY}zerog daemon is not running.${Notifier.RESET}`);
      return;
    }

    try {
      const pid = parseInt(fs.readFileSync(Config.daemonPidPath, 'utf8').trim(), 10);
      process.kill(pid, 'SIGTERM');
      console.log(`${Notifier.GREEN}✓ Stopped zerog daemon (PID: ${pid})${Notifier.RESET}`);
    } catch (e) {
      console.log(`${Notifier.YELLOW}Could not kill PID: ${e.message}${Notifier.RESET}`);
    } finally {
      try { fs.unlinkSync(Config.daemonPidPath); } catch {}
    }
  }

  status() {
    if (this.isRunning()) {
      const pid = fs.readFileSync(Config.daemonPidPath, 'utf8').trim();
      console.log(`${Notifier.GREEN}zerog daemon is RUNNING (PID: ${pid})${Notifier.RESET}`);
      console.log(`Log file: ${Config.daemonLogPath}`);
    } else {
      console.log(`${Notifier.GRAY}zerog daemon is STOPPED${Notifier.RESET}`);
    }
  }

  startForeground() {
    console.log(`${Notifier.GREEN}[zerog daemon] Watchdog started in foreground.${Notifier.RESET}`);
    console.log(`Monitoring: ${CLI_LOG_PATH}`);
    console.log('Press Ctrl+C to stop.\n');

    let lastPos = 0;
    try {
      if (fs.existsSync(CLI_LOG_PATH)) {
        lastPos = fs.statSync(CLI_LOG_PATH).size;
      }
    } catch {}

    const interval = setInterval(() => {
      try {
        if (!fs.existsSync(CLI_LOG_PATH)) return;
        const currentSize = fs.statSync(CLI_LOG_PATH).size;
        if (currentSize > lastPos) {
          const stream = fs.createReadStream(CLI_LOG_PATH, {
            start: lastPos,
            end: currentSize,
            encoding: 'utf8'
          });
          let chunk = '';
          stream.on('data', d => { chunk += d; });
          stream.on('end', () => {
            lastPos = currentSize;
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (QuotaDetector.matchLogLine(line)) {
                console.log(`\n${Notifier.RED}[WATCHDOG] Quota limit detected!${Notifier.RESET}`);
                const active = this.manager.activeAccount();
                const quotaInfo = QuotaDetector.classifyQuota({ text: line });
                const resetMins = quotaInfo ? quotaInfo.minutes : QuotaDetector.parseResetMinutes(line);
                const quotaType = quotaInfo ? quotaInfo.type : null;
                const reason = quotaInfo ? quotaInfo.reason : 'Watchdog detected limit in cli.log';
                const nextAcc = this.manager.autoSwitch(active ? active.id : null, reason, resetMins, quotaType);
                if (nextAcc) {
                  Notifier.notifySwitch(active, nextAcc);
                } else {
                  console.log(`${Notifier.RED}[WATCHDOG] All accounts exhausted!${Notifier.RESET}`);
                }
                break;
              }
            }
          });
        }
      } catch {}
    }, 1500);

    const cleanup = () => {
      clearInterval(interval);
      console.log('\n[zerog daemon] Watchdog stopped.');
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

module.exports = Daemon;

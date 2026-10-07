'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const AccountManager = require('./account-manager');
const QuotaDetector = require('./quota-detector');
const Notifier = require('./notifier');

const CLI_LOG_PATH = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'cli.log');

class Runner {
  constructor(manager = null) {
    this.manager = manager || new AccountManager();
    this.config = this.manager.config;
  }

  async run(args = []) {
    const isInteractive = !args.includes('-p') && !args.includes('--print');
    if (isInteractive) {
      return this.runInteractiveLoop(args);
    } else {
      return this.runNonInteractiveLoop(args);
    }
  }

  runNonInteractiveLoop(initialArgs) {
    let args = [...initialArgs];
    const maxAttempts = Math.max(this.manager.listAccounts().length, 1);
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      this.manager.syncActiveState();
      const active = this.manager.activeAccount();
      const env = this.buildEnv(active);

      const res = spawnSync(this.manager.agyPath, args, {
        env,
        encoding: 'utf8'
      });

      const stdoutStr = res.stdout || '';
      const stderrStr = res.stderr || '';
      const combinedOutput = `${stdoutStr}\n${stderrStr}`;
      const exitCode = res.status;

      if (QuotaDetector.isQuotaExhausted({ text: combinedOutput, exitCode })) {
        if (this.config.autoSwitch) {
          const prevAcc = active;
          const nextAcc = this.manager.autoSwitch(prevAcc ? prevAcc.id : null, 'Quota exhausted in prompt execution');

          if (nextAcc) {
            Notifier.notifySwitch(prevAcc, nextAcc);
            console.log(`${Notifier.GRAY}[zerog] Retrying agy with ${nextAcc.id}...${Notifier.RESET}\n`);
            continue;
          } else if (this.config.waitForQuota) {
            const readyAcc = this.waitForAnyAccountQuota();
            if (readyAcc) {
              console.log(`${Notifier.GREEN}✓ Quota available on ${readyAcc.id}! Retrying agy...${Notifier.RESET}\n`);
              continue;
            }
          }

          Notifier.notifyAllExhausted(this.earliestCooldownStr());
          process.stdout.write(combinedOutput);
          return exitCode || 1;
        } else {
          process.stdout.write(combinedOutput);
          return exitCode || 1;
        }
      } else {
        process.stdout.write(stdoutStr);
        if (stderrStr) process.stderr.write(stderrStr);
        return exitCode || 0;
      }
    }

    return 0;
  }

  runInteractiveLoop(initialArgs) {
    let args = [...initialArgs];
    const maxSwitches = Math.max(this.manager.listAccounts().length, 1);
    let switches = 0;

    return new Promise((resolve) => {
      const runTurn = () => {
        this.manager.syncActiveState();
        const active = this.manager.activeAccount();
        const env = this.buildEnv(active);

        let startLogPos = 0;
        try {
          if (fs.existsSync(CLI_LOG_PATH)) {
            startLogPos = fs.statSync(CLI_LOG_PATH).size;
          }
        } catch {}

        let quotaDetected = false;
        let running = true;

        // Spawn agy directly attached to the terminal (stdin/stdout/stderr)
        // Guarantees 100% native typing fidelity, arrow keys, and TUI shortcuts
        const child = spawn(this.manager.agyPath, args, {
          env,
          stdio: 'inherit'
        });

        // Monitor cli.log in background to catch quota exhaustion in real time
        let logPollInterval = null;
        let lastReadPos = startLogPos;

        const checkLog = () => {
          if (!running) return;
          try {
            if (fs.existsSync(CLI_LOG_PATH)) {
              const currentSize = fs.statSync(CLI_LOG_PATH).size;
              if (currentSize > lastReadPos) {
                const stream = fs.createReadStream(CLI_LOG_PATH, {
                  start: lastReadPos,
                  end: currentSize,
                  encoding: 'utf8'
                });
                let chunk = '';
                stream.on('data', d => { chunk += d; });
                stream.on('end', () => {
                  lastReadPos = currentSize;
                  const lines = chunk.split('\n');
                  for (const line of lines) {
                    if (QuotaDetector.matchLogLine(line)) {
                      quotaDetected = true;
                      try { child.kill('SIGTERM'); } catch {}
                      break;
                    }
                  }
                });
              }
            }
          } catch {}
        };

        logPollInterval = setInterval(checkLog, 800);

        child.on('close', (code) => {
          running = false;
          clearInterval(logPollInterval);

          // Give a split-second to inspect any final log line
          checkLog();

          const exitQuota = QuotaDetector.matchExitCode(code);
          const needsSwitch = (quotaDetected || exitQuota) && this.config.autoSwitch;

          if (needsSwitch) {
            switches++;
            const prevAcc = active;
            let nextAcc = null;

            if (switches < maxSwitches) {
              nextAcc = this.manager.autoSwitch(prevAcc ? prevAcc.id : null, 'Quota limit reached during session');
            } else {
              this.manager.markExhausted(prevAcc, 'Quota limit reached during session');
              nextAcc = null;
            }

            if (nextAcc) {
              Notifier.notifySwitch(prevAcc, nextAcc);
              if (this.config.continueConversation && !args.includes('-c') && !args.includes('--continue')) {
                args = ['--continue', ...args];
              }
              console.log(`${Notifier.GRAY}[zerog] Resuming agy session with account '${nextAcc.id}'...${Notifier.RESET}\n`);
              runTurn();
              return;
            } else {
              Notifier.notifyAllExhausted(this.earliestCooldownStr());

              if (this.config.waitForQuota) {
                const readyAcc = this.waitForAnyAccountQuota();
                if (readyAcc) {
                  switches = 0;
                  console.log(`${Notifier.GREEN}✓ Resuming with restored account '${readyAcc.id}'...${Notifier.RESET}\n`);
                  if (this.config.continueConversation && !args.includes('-c') && !args.includes('--continue')) {
                    args = ['--continue', ...args];
                  }
                  runTurn();
                  return;
                }
              }

              console.log(`\n${Notifier.RED}[zerog] All accounts in pool are quota-exhausted. Exiting cleanly without looping.${Notifier.RESET}`);
              resolve(code || 3);
              return;
            }
          }

          resolve(code || 0);
        });
      };

      runTurn();
    });
  }

  waitForAnyAccountQuota() {
    console.log(`\n${Notifier.CYAN}[zerog] Auto-continue is enabled. Pausing until an account quota resets...${Notifier.RESET}`);
    console.log(`${Notifier.GRAY}Press Ctrl+C to cancel wait and exit.${Notifier.RESET}\n`);

    while (true) {
      const accounts = this.manager.listAccounts();
      const readyAccounts = accounts.filter(a => !a.isExhausted());

      if (readyAccounts.length > 0) {
        process.stdout.write('\r\x1b[K');
        const restored = readyAccounts[0];
        this.manager.activateAccount(restored);
        return restored;
      }

      const exhaustedAccounts = accounts.filter(a => a.isExhausted());
      if (exhaustedAccounts.length === 0) {
        process.stdout.write('\r\x1b[K');
        return this.manager.activeAccount();
      }

      const sortedByCooldown = exhaustedAccounts.sort((a, b) => a.remainingCooldownSeconds() - b.remainingCooldownSeconds());
      const earliest = sortedByCooldown[0];
      const remainingSec = earliest.remainingCooldownSeconds();

      if (remainingSec <= 0) {
        process.stdout.write('\r\x1b[K');
        earliest.resetCooldown();
        this.manager.saveAccount(earliest);
        this.manager.activateAccount(earliest);
        return earliest;
      }

      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      process.stdout.write(`\r${Notifier.YELLOW}⏳ Waiting for quota: '${earliest.id}' resets in ${Notifier.BOLD}${timeStr}${Notifier.RESET}${Notifier.YELLOW}...${Notifier.RESET} `);

      // Sleep synchronously 1 second in loop
      this._sleepSync(1000);
    }
  }

  _sleepSync(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // Busy wait short slice
    }
  }

  buildEnv(account) {
    const env = { ...process.env };
    if (account) {
      const overrides = account.envOverrides();
      Object.assign(env, overrides);
    }
    // Safety guard: if GEMINI_API_KEY is not present or account is not an API key account,
    // ensure modelProvider is removed from settings.json so agy never crashes on missing API key
    if (!env.GEMINI_API_KEY || (account && account.type !== 'gemini-api-key')) {
      this.manager._updateGeminiSettings(false);
    }
    return env;
  }

  earliestCooldownStr() {
    const accounts = this.manager.listAccounts();
    const inCooldown = accounts.filter(a => a.isExhausted());
    if (inCooldown.length === 0) return 'None';

    const sorted = inCooldown.sort((a, b) => a.remainingCooldownSeconds() - b.remainingCooldownSeconds());
    return sorted[0].remainingCooldownHuman();
  }
}

module.exports = Runner;

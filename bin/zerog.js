#!/usr/bin/env node
'use strict';

const path = require('path');
const VERSION = require('../lib/version');
const Config = require('../lib/config');
const AccountManager = require('../lib/account-manager');
const Notifier = require('../lib/notifier');
const Runner = require('../lib/runner');
const Daemon = require('../lib/daemon');
const WebServer = require('../lib/web-server');

const MANAGEMENT_COMMANDS = new Set([
  'list', 'ls', 'accounts',
  'status', 'info',
  'use', 'switch',
  'login',
  'add-key', 'addkey',
  'capture',
  'delete', 'rm',
  'reset-cooldown', 'reset',
  'test',
  'daemon',
  'watch',
  'web', 'ui', 'dashboard',
  'init',
  'config',
  'export',
  'import',
  'version', '--version', '-v',
  'help', '--help', '-h'
]);

class CLI {
  constructor() {
    AccountManager.ensureAgyInstalled();
    this.manager = new AccountManager();
    this.config = this.manager.config;
  }

  async run(args) {
    // If no arguments provided, directly run agy with rotating accounts!
    if (args.length === 0) {
      const runner = new Runner(this.manager);
      const code = await runner.run([]);
      process.exit(code || 0);
    }

    const first = args[0];

    // If first argument is a management command:
    if (MANAGEMENT_COMMANDS.has(first)) {
      await this.handleManagement(args);
    } else if (first === 'run') {
      const runner = new Runner(this.manager);
      const code = await runner.run(args.slice(1));
      process.exit(code || 0);
    } else {
      // Pass-through to agy with auto-rotating accounts!
      const runner = new Runner(this.manager);
      const code = await runner.run(args);
      process.exit(code || 0);
    }
  }

  async handleManagement(args) {
    const cmd = args.shift();

    switch (cmd) {
      case 'list':
      case 'ls':
      case 'accounts':
        this.listAccounts();
        break;

      case 'status':
      case 'info':
        this.showStatus();
        break;

      case 'use':
      case 'switch':
        this.useAccount(args[0]);
        break;

      case 'login':
        this.loginAccount(args[0], args[1]);
        break;

      case 'add-key':
      case 'addkey':
        this.addApiKey(args[0], args[1], args[2]);
        break;

      case 'capture':
        this.captureCurrent(args[0], args[1]);
        break;

      case 'delete':
      case 'rm':
        this.deleteAccount(args[0]);
        break;

      case 'reset-cooldown':
      case 'reset':
        this.resetCooldown(args[0]);
        break;

      case 'test':
        this.testAccount(args[0]);
        break;

      case 'daemon':
        this.manageDaemon(args[0]);
        break;

      case 'watch':
        new Daemon(this.manager).startForeground();
        break;

      case 'web':
      case 'ui':
      case 'dashboard':
        const port = args[0] ? parseInt(args[0], 10) : null;
        new WebServer(this.manager, port).start();
        break;

      case 'init':
        this.initShell(args[0]);
        break;

      case 'config':
        this.manageConfig(args[0], args[1]);
        break;

      case 'export':
        this.exportAccounts(args[0]);
        break;

      case 'import':
        this.importAccounts(args[0]);
        break;

      case 'version':
      case '--version':
      case '-v':
        console.log(`zerog v${VERSION} (Node.js edition wrapping agy CLI with rotating accounts)`);
        break;

      case 'help':
      case '--help':
      case '-h':
      default:
        this.showHelp();
        break;
    }
  }

  showHelp() {
    console.log(`
${Notifier.BOLD}${Notifier.CYAN}zerog${Notifier.RESET} v${VERSION} — Run Antigravity (agy) with Auto-Rotating Accounts

${Notifier.BOLD}USAGE:${Notifier.RESET}
  zerog [agy_flags...]                ${Notifier.GREEN}Run agy with automatic account rotation${Notifier.RESET}
  zerog -p "your prompt"             Run prompt turn; auto-retries on quota limit
  zerog accounts                     List all accounts in the pool
  zerog status                       Show active account and pool health
  zerog use <id>                     Manually switch active account
  zerog login <id> [name]            Log into a new Google account in browser
  zerog add-key <id> <key> [prio]    Add a Gemini API key profile
  zerog capture <id>                 Capture currently logged-in Google session
  zerog delete <id>                  Remove account from the pool
  zerog reset-cooldown <id>          Clear quota cooldown for an account
  zerog test [id]                    Verify account credentials with agy
  zerog export [file]                Export accounts to portable JSON file for other PCs
  zerog import <file>                Import accounts into pool from file
  zerog daemon [start|stop|status]   Manage background log watchdog
  zerog web [port]                   Launch local web dashboard (default: 7890)

${Notifier.BOLD}BEHAVIOR:${Notifier.RESET}
  Running ${Notifier.CYAN}zerog${Notifier.RESET} by itself runs ${Notifier.CYAN}agy${Notifier.RESET} directly.
  If your account hits a plan usage or quota limit, ${Notifier.CYAN}zerog${Notifier.RESET} automatically
  swaps to the next healthy account and resumes your session seamless!
`);
  }

  showStatus() {
    const active = this.manager.activeAccount();
    const accounts = this.manager.listAccounts();
    const exhausted = accounts.filter(a => a.isExhausted());
    const daemon = new Daemon(this.manager);

    console.log(`\n${Notifier.BOLD}─── zerog Pool Status ───${Notifier.RESET}`);
    if (active) {
      console.log(`  ${Notifier.BOLD}Active Account:${Notifier.RESET}    ${Notifier.GREEN}${active.name}${Notifier.RESET} (${active.email}) [${active.type}]`);
    } else {
      console.log(`  ${Notifier.BOLD}Active Account:${Notifier.RESET}    ${Notifier.YELLOW}None${Notifier.RESET}`);
    }
    console.log(`  ${Notifier.BOLD}Total Accounts:${Notifier.RESET}    ${accounts.length}`);
    console.log(`  ${Notifier.BOLD}Ready Accounts:${Notifier.RESET}    ${accounts.length - exhausted.length}`);
    console.log(`  ${Notifier.BOLD}In Cooldown:${Notifier.RESET}       ${exhausted.length}`);
    console.log(`  ${Notifier.BOLD}Auto-Switch:${Notifier.RESET}       ${this.config.autoSwitch ? `${Notifier.GREEN}ENABLED${Notifier.RESET}` : `${Notifier.RED}DISABLED${Notifier.RESET}`}`);
    console.log(`  ${Notifier.BOLD}Strategy:${Notifier.RESET}          ${this.config.switchStrategy.toUpperCase()}`);
    console.log(`  ${Notifier.BOLD}Cooldown Duration:${Notifier.RESET} ${this.config.cooldownMinutes} minutes`);
    console.log(`  ${Notifier.BOLD}Antigravity Path:${Notifier.RESET}  ${this.manager.agyPath}`);
    console.log(`  ${Notifier.BOLD}Keyring Backend:${Notifier.RESET}   ${this.manager.keyringBackend}`);
    console.log(`  ${Notifier.BOLD}Watchdog Daemon:${Notifier.RESET}   ${daemon.isRunning() ? `${Notifier.GREEN}RUNNING${Notifier.RESET}` : `${Notifier.GRAY}STOPPED${Notifier.RESET}`}`);
    console.log('');
  }

  listAccounts() {
    const accounts = this.manager.listAccounts();
    const active = this.manager.activeAccount();

    if (accounts.length === 0) {
      console.log(`${Notifier.YELLOW}No accounts in pool. Use 'zerog capture default' or 'zerog login <id>' to add one.${Notifier.RESET}`);
      return;
    }

    console.log(`\n${Notifier.BOLD}PRIO  STATUS    TYPE    ID              EMAIL                           COOLDOWN${Notifier.RESET}`);
    console.log('─'.repeat(78));

    for (const acc of accounts) {
      const isActive = active && active.id === acc.id;
      let statusStr = '';
      if (isActive) {
        statusStr = `${Notifier.GREEN}ACTIVE  ${Notifier.RESET}`;
      } else if (acc.isExhausted()) {
        statusStr = `${Notifier.RED}LIMIT   ${Notifier.RESET}`;
      } else {
        statusStr = `${Notifier.GRAY}READY   ${Notifier.RESET}`;
      }

      const typeStr = acc.type === 'google' ? 'Google ' : 'API Key';
      const cooldown = acc.isExhausted() ? `${Notifier.RED}${acc.remainingCooldownHuman()}${Notifier.RESET}` : '-';
      const prioStr = `#${acc.priority}`.padEnd(5);
      const idStr = acc.id.padEnd(15);
      const emailStr = acc.email.slice(0, 28).padEnd(30);

      console.log(`${prioStr} ${statusStr} ${typeStr}  ${idStr} ${emailStr} ${cooldown}`);
    }
    console.log('');
  }

  useAccount(id) {
    if (!id) {
      console.log(`${Notifier.RED}Error: please specify account ID. (Run 'zerog accounts' to see IDs)${Notifier.RESET}`);
      process.exit(1);
    }
    const acc = this.manager.activateAccount(id);
    console.log(`${Notifier.GREEN}✓ Switched active account to '${acc.id}' (${acc.email})${Notifier.RESET}`);
  }

  captureCurrent(id = 'primary', name = null) {
    const acc = this.manager.captureCurrent(id, name);
    console.log(`${Notifier.GREEN}✓ Successfully captured active session as '${acc.id}' (${acc.email})${Notifier.RESET}`);
  }

  addApiKey(id, key, priority = 10) {
    if (!id || !key) {
      console.log(`${Notifier.RED}Usage: zerog add-key <id> <gemini_api_key> [priority]${Notifier.RESET}`);
      process.exit(1);
    }
    const acc = this.manager.addGeminiApiKey(id, null, key, priority);
    console.log(`${Notifier.GREEN}✓ Added Gemini API key account '${acc.id}'${Notifier.RESET}`);
  }

  loginAccount(id, name = null) {
    if (!id) {
      console.log(`${Notifier.RED}Usage: zerog login <id> [display_name]${Notifier.RESET}`);
      process.exit(1);
    }

    console.log(`${Notifier.CYAN}Starting sign-in for '${id}'...${Notifier.RESET}`);
    console.log(`${Notifier.GRAY}Your browser will open. Sign into your Google account, then return here.${Notifier.RESET}\n`);

    const acc = this.manager.startGoogleLogin(id, name, (phase, msg) => {
      console.log(`[zerog] ${msg}`);
    });

    console.log(`\n${Notifier.GREEN}✓ Successfully registered account '${acc.id}' (${acc.email}) into the pool!${Notifier.RESET}`);
  }

  deleteAccount(id) {
    if (!id) {
      console.log(`${Notifier.RED}Usage: zerog delete <id>${Notifier.RESET}`);
      process.exit(1);
    }
    this.manager.deleteAccount(id);
    console.log(`${Notifier.GREEN}✓ Account '${id}' deleted from pool.${Notifier.RESET}`);
  }

  resetCooldown(id) {
    if (!id) {
      console.log(`${Notifier.RED}Usage: zerog reset-cooldown <id>${Notifier.RESET}`);
      process.exit(1);
    }
    this.manager.resetCooldown(id);
    console.log(`${Notifier.GREEN}✓ Cleared cooldown for '${id}'. Account is now READY.${Notifier.RESET}`);
  }

  testAccount(id) {
    const acc = id ? this.manager.findAccount(id) : this.manager.activeAccount();
    if (!acc) {
      console.log(`${Notifier.RED}Account not found.${Notifier.RESET}`);
      process.exit(1);
    }

    process.stdout.write(`Testing account '${acc.id}' (${acc.email}) with agy... `);
    const result = this.manager.testAccount(acc);

    if (result.success) {
      console.log(`${Notifier.GREEN}PASSED! ✓${Notifier.RESET}`);
    } else {
      console.log(`${Notifier.RED}FAILED! ✗${Notifier.RESET}`);
      console.log(`  ${result.message}`);
    }
  }

  exportAccounts(filePath = null) {
    const target = filePath || 'zerog-accounts.json';
    const dest = this.manager.exportAccounts(target);
    const count = this.manager.listAccounts().length;
    console.log(`${Notifier.GREEN}✓ Successfully exported ${count} account(s) to ${dest}${Notifier.RESET}`);
    console.log(`${Notifier.GRAY}To use these on another PC, transfer this file and run: npx zerog import ${path.basename(dest)}${Notifier.RESET}`);
  }

  importAccounts(filePath) {
    if (!filePath) {
      console.log(`${Notifier.RED}Usage: zerog import <path_to_accounts.json>${Notifier.RESET}`);
      process.exit(1);
    }
    const res = this.manager.importAccounts(filePath);
    console.log(`${Notifier.GREEN}✓ Successfully imported ${res.count} account(s) into pool!${Notifier.RESET}`);
    console.log(`${Notifier.GREEN}✓ Active account set to: '${res.activeAccount}'${Notifier.RESET}`);
    console.log('Run \'zerog accounts\' to inspect your pool.');
  }

  manageDaemon(action) {
    const daemon = new Daemon(this.manager);
    switch (action) {
      case 'start':
        daemon.startBackground();
        break;
      case 'stop':
        daemon.stop();
        break;
      case 'status':
        daemon.status();
        break;
      default:
        console.log('Usage: zerog daemon [start|stop|status]');
        break;
    }
  }

  initShell(shellType) {
    const sh = shellType || path.basename(process.env.SHELL || 'zsh');
    const rcFile = sh.includes('bash') ? '~/.bashrc' : '~/.zshrc';

    console.log(`
${Notifier.BOLD}zerog is ready!${Notifier.RESET}
Run ${Notifier.CYAN}zerog${Notifier.RESET} to launch agy with rotating accounts.

If you also want 'agy' to automatically route to 'zerog', add to ${rcFile}:
  ${Notifier.CYAN}alias agy="zerog"${Notifier.RESET}
`);
  }

  manageConfig(key, val) {
    if (!key) {
      console.log(JSON.stringify(this.config.data, null, 2));
    } else if (val === undefined) {
      console.log(`${key}: ${this.config.get(key)}`);
    } else {
      let parsed = val;
      if (val === 'true') parsed = true;
      else if (val === 'false') parsed = false;
      else if (/^\d+$/.test(val)) parsed = parseInt(val, 10);

      this.config.set(key, parsed);
      console.log(`${Notifier.GREEN}✓ Updated ${key} = ${parsed}${Notifier.RESET}`);
    }
  }
}

if (require.main === module) {
  new CLI().run(process.argv.slice(2));
}

module.exports = CLI;

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const AccountManager = require('./account-manager');
const Notifier = require('./notifier');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

class WebServer {
  constructor(manager = null, port = null) {
    this.manager = manager || new AccountManager();
    this.config = this.manager.config;
    this.port = port || this.config.webPort || 7890;
    this.publicDir = path.resolve(__dirname, '..', 'web', 'public');
  }

  start() {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/api/')) {
        this.handleApi(req, res);
      } else {
        this.handleStatic(req, res);
      }
    });

    server.listen(this.port, () => {
      console.log(`\n${Notifier.GREEN}🚀 zerog Web Dashboard running at: http://localhost:${this.port}${Notifier.RESET}`);
      console.log(`${Notifier.GRAY}Press Ctrl+C to stop the web server.${Notifier.RESET}\n`);

      this.openBrowser(`http://localhost:${this.port}`);
    });

    const shutdown = () => {
      console.log('\nStopping web server...');
      server.close(() => process.exit(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  openBrowser(url) {
    if (process.platform === 'darwin') {
      exec(`open "${url}"`, () => {});
    } else if (process.platform === 'linux') {
      exec(`xdg-open "${url}"`, () => {});
    } else if (process.platform === 'win32') {
      exec(`start "${url}"`, () => {});
    }
  }

  handleStatic(req, res) {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    const fullPath = path.join(this.publicDir, safePath);

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
      fs.createReadStream(fullPath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  handleApi(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const endpoint = req.url.replace(/^\/api\/?/, '').split('?')[0];

    const parseBody = (callback) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          callback(null, body ? JSON.parse(body) : {});
        } catch (e) {
          callback(e, {});
        }
      });
    };

    try {
      if (req.method === 'GET') {
        if (endpoint === 'accounts') {
          const accounts = this.manager.listAccounts().map(a => a.toJSON());
          const active = this.manager.activeAccount();
          const inCooldown = accounts.filter(a => a.status === 'exhausted').length;
          res.writeHead(200);
          res.end(JSON.stringify({
            accounts,
            active_account: active ? active.id : null,
            total: accounts.length,
            ready: accounts.length - inCooldown,
            exhausted: inCooldown
          }));
        } else if (endpoint === 'status') {
          const active = this.manager.activeAccount();
          const accounts = this.manager.listAccounts();
          const inCooldown = accounts.filter(a => a.isExhausted()).length;
          res.writeHead(200);
          res.end(JSON.stringify({
            active_account: active ? active.toJSON() : null,
            total: accounts.length,
            ready: accounts.length - inCooldown,
            in_cooldown: inCooldown,
            auto_switch: this.config.autoSwitch,
            switch_strategy: this.config.switchStrategy,
            cooldown_minutes: this.config.cooldownMinutes,
            agy_path: this.manager.agyPath,
            keyring_backend: this.manager.keyringBackend
          }));
        } else if (endpoint === 'events') {
          const events = this.manager.readEvents(50);
          res.writeHead(200);
          res.end(JSON.stringify(events));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Endpoint not found' }));
        }
      } else if (req.method === 'POST') {
        parseBody((err, data) => {
          if (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
          }

          if (endpoint === 'switch') {
            const acc = this.manager.activateAccount(data.id);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, active: acc.toJSON() }));
          } else if (endpoint === 'reset-cooldown') {
            this.manager.resetCooldown(data.id);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
          } else if (endpoint === 'delete') {
            this.manager.deleteAccount(data.id);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
          } else if (endpoint === 'test') {
            const result = this.manager.testAccount(data.id);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Endpoint not found' }));
          }
        });
      }
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
  }
}

module.exports = WebServer;

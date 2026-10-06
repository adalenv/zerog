'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const COMMON_SEARCH_PATHS = [
  '~/.local/bin/agy',
  '~/.gemini/antigravity-cli/bin/agy',
  '~/bin/agy',
  '/opt/homebrew/bin/agy',
  '/usr/local/bin/agy',
  '/usr/bin/agy',
  '/bin/agy',
  '/snap/bin/agy',
  '%LOCALAPPDATA%/Programs/Antigravity/agy.exe',
  '%APPDATA%/npm/agy.cmd',
  '~/.local/bin/agy.exe',
  'C:/Program Files/Antigravity/agy.exe'
];

class AgyLocator {
  static expandPath(filePath) {
    if (!filePath || typeof filePath !== 'string') return null;

    let resolved = filePath;
    // Replace %VAR% for Windows environment variables
    resolved = resolved.replace(/%([^%]+)%/g, (_, key) => process.env[key] || '');
    if (resolved.includes('%') || resolved.trim() === '') return null;

    if (resolved.startsWith('~/') || resolved === '~') {
      resolved = path.join(os.homedir(), resolved.slice(1));
    }

    return path.resolve(resolved);
  }

  static isExecutable(filePath) {
    if (!filePath) return false;
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return false;
      if (process.platform === 'win32') return true;
      // Check execute permission for owner, group, or others
      return (stat.mode & 0o111) !== 0;
    } catch {
      return false;
    }
  }

  static find(config = null) {
    // 1. Environment variable override
    if (process.env.AGY_PATH && process.env.AGY_PATH.trim() !== '') {
      const p = this.expandPath(process.env.AGY_PATH);
      if (this.isExecutable(p)) return p;
    }

    // 2. Config file override
    if (config) {
      const cfgPath = typeof config.get === 'function' ? config.get('agy_path') : config.agy_path;
      if (cfgPath && cfgPath.trim() !== '') {
        const p = this.expandPath(cfgPath);
        if (this.isExecutable(p)) return p;
      }
    }

    // 3. System PATH check
    try {
      const cmd = process.platform === 'win32' ? 'where agy' : 'which agy';
      const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
      const firstLine = out.split(/\r?\n/)[0].trim();
      if (firstLine && this.isExecutable(firstLine)) {
        return firstLine;
      }
    } catch {
      // Ignore PATH check error
    }

    // 4. Known common search paths
    for (const candidate of COMMON_SEARCH_PATHS) {
      const expanded = this.expandPath(candidate);
      if (expanded && this.isExecutable(expanded)) {
        return expanded;
      }
    }

    // 5. Search inside ~/.gemini tree
    const geminiDir = path.join(os.homedir(), '.gemini');
    if (fs.existsSync(geminiDir)) {
      const found = this._searchDirForAgy(geminiDir, 3);
      if (found) return found;
    }

    return null;
  }

  static findOrThrow(config = null) {
    const p = this.find(config);
    if (p) return p;

    console.error('\x1b[31m[zerog] Error: Antigravity CLI (\'agy\') binary was not found.\x1b[0m');
    console.error('\nzerog searched the following locations:');
    console.error('  • Current PATH ($PATH)');
    for (const candidate of COMMON_SEARCH_PATHS) {
      const exp = this.expandPath(candidate);
      console.error(`  • ${exp || candidate}`);
    }
    console.error('\nPlease ensure agy is installed: https://antigravity.google/docs/cli/install');
    console.error('Or point zerog directly to your agy binary:');
    console.error('  npx zerog config agy_path /path/to/agy');
    console.error('  or export AGY_PATH=/path/to/agy\n');
    process.exit(1);
  }

  static _searchDirForAgy(dir, depth) {
    if (depth <= 0) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && (entry.name === 'agy' || entry.name === 'agy.exe')) {
          if (this.isExecutable(full)) return full;
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const sub = this._searchDirForAgy(full, depth - 1);
          if (sub) return sub;
        }
      }
    } catch {
      // Ignore permission errors
    }
    return null;
  }
}

module.exports = AgyLocator;

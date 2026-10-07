'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const Config = require('../lib/config');
const Account = require('../lib/account');
const AccountManager = require('../lib/account-manager');
const AgyLocator = require('../lib/agy-locator');
const QuotaDetector = require('../lib/quota-detector');

test('Config defaults and persistence', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zerog-test-'));
  const origHome = process.env.HOME;
  process.env.HOME = tmpDir;

  try {
    const cfg = new Config();
    assert.strictEqual(cfg.autoSwitch, true);
    assert.strictEqual(cfg.switchStrategy, 'priority');
    assert.strictEqual(cfg.cooldownMinutes, 60);
    assert.strictEqual(cfg.webPort, 7890);

    cfg.set('cooldown_minutes', 120);
    const cfg2 = new Config();
    assert.strictEqual(cfg2.cooldownMinutes, 120);
  } finally {
    process.env.HOME = origHome;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('Account model and cooldown', () => {
  const acc = new Account({
    id: 'acc1',
    name: 'Account One',
    email: 'one@example.com',
    priority: 2
  });

  assert.strictEqual(acc.id, 'acc1');
  assert.strictEqual(acc.isExhausted(), false);
  assert.strictEqual(acc.remainingCooldownSeconds(), 0);

  acc.markExhausted(30);
  assert.strictEqual(acc.isExhausted(), true);
  assert.ok(acc.remainingCooldownSeconds() > 1700);
  assert.strictEqual(acc.status, 'exhausted');

  acc.resetCooldown();
  assert.strictEqual(acc.isExhausted(), false);
  assert.strictEqual(acc.status, 'ready');
});

test('AccountManager CRUD and pool selection', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zerog-test-'));
  const origHome = process.env.HOME;
  process.env.HOME = tmpDir;

  try {
    const manager = new AccountManager();
    const acc1 = new Account({ id: 'acc1', name: 'First', email: '1@test.com', priority: 1 });
    const acc2 = new Account({ id: 'acc2', name: 'Second', email: '2@test.com', priority: 2 });

    manager.saveAccount(acc1);
    manager.saveAccount(acc2);
    manager.config.activeAccount = 'acc1';

    const accounts = manager.listAccounts();
    assert.strictEqual(accounts.length, 2);
    assert.strictEqual(accounts[0].id, 'acc1');

    const nextAcc = manager.getNextAvailable('acc1');
    assert.strictEqual(nextAcc.id, 'acc2');

    // Mark acc2 exhausted
    manager.markExhausted(nextAcc, 'test quota', 10);
    assert.strictEqual(nextAcc.isExhausted(), true);

    // Now acc2 is exhausted, so no other accounts are ready -> returns null!
    assert.strictEqual(manager.getNextAvailable('acc1'), null);
  } finally {
    process.env.HOME = origHome;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('No loop when all accounts are exhausted', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zerog-test-'));
  const origHome = process.env.HOME;
  process.env.HOME = tmpDir;

  try {
    const manager = new AccountManager();
    const acc1 = new Account({ id: 'acc1', priority: 1 });
    const acc2 = new Account({ id: 'acc2', priority: 2 });
    manager.saveAccount(acc1);
    manager.saveAccount(acc2);

    manager.markExhausted(acc1, 'limit reached', 60);
    manager.markExhausted(acc2, 'limit reached', 60);

    // Neither account can be picked -> returns null, stops without looping!
    assert.strictEqual(manager.getNextAvailable('acc1'), null);
    assert.strictEqual(manager.getNextAvailable('acc2'), null);
  } finally {
    process.env.HOME = origHome;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('QuotaDetector pattern matching', () => {
  assert.ok(QuotaDetector.matchText('Error: RESOURCE_EXHAUSTED - You have exhausted your quota.'));
  assert.ok(QuotaDetector.matchText('429 Too Many Requests: Rate limit exceeded'));
  assert.ok(QuotaDetector.matchText('Quota exhausted: plan limit reached'));
  assert.ok(QuotaDetector.matchText('AI credits are exhausted for this billing period'));
  assert.ok(!QuotaDetector.matchText('File saved successfully.'));

  assert.strictEqual(QuotaDetector.matchExitCode(3), true);
  assert.strictEqual(QuotaDetector.matchExitCode(0), false);
  assert.strictEqual(QuotaDetector.matchExitCode(1), false);

  assert.ok(QuotaDetector.matchLogLine('E1006 22:58:07 quota_manager.go:45 RESOURCE_EXHAUSTED'));
  assert.ok(!QuotaDetector.matchLogLine('I1007 20:25:29.854036 249 quota_manager.go:45] doRefreshQuota: starting reload (force=true)'));
  assert.ok(!QuotaDetector.matchText('quota_manager.go:45] doRefreshQuota: starting reload'));

  assert.strictEqual(QuotaDetector.parseResetMinutes('error: Individual quota reached. Resets in 114h8m53s.'), 6849);
  assert.strictEqual(QuotaDetector.parseResetMinutes('Resets in 2h30m'), 150);
  assert.strictEqual(QuotaDetector.parseResetMinutes('Resets in 45m'), 45);
  assert.strictEqual(QuotaDetector.parseResetMinutes('Resets in 30s'), 1);
  assert.strictEqual(QuotaDetector.parseResetMinutes('No reset time info'), null);
});

test('AgyLocator discovery and overrides', () => {
  // If agy happens to be installed on the machine, verify it exists
  const found = AgyLocator.find();
  if (found) {
    assert.ok(fs.existsSync(found));
  }

  // Test AGY_PATH env override
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zerog-test-'));
  const fakeBin = path.join(tmpDir, 'fake_agy');
  fs.writeFileSync(fakeBin, '#!/bin/sh\necho fake', { mode: 0o755 });

  const origEnv = process.env.AGY_PATH;
  try {
    process.env.AGY_PATH = fakeBin;
    assert.strictEqual(AgyLocator.find(), fakeBin);
  } finally {
    process.env.AGY_PATH = origEnv;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('Export and import accounts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zerog-test-'));
  const origHome = process.env.HOME;
  process.env.HOME = tmpDir;

  try {
    const manager = new AccountManager();
    const acc1 = new Account({
      id: 'exp1',
      name: 'Export 1',
      email: 'exp1@test.com',
      type: 'gemini-api-key',
      priority: 1,
      data: { api_key: 'KEY1' }
    });
    const acc2 = new Account({
      id: 'exp2',
      name: 'Export 2',
      email: 'exp2@test.com',
      type: 'gemini-api-key',
      priority: 2,
      data: { api_key: 'KEY2' }
    });

    manager.saveAccount(acc1);
    manager.saveAccount(acc2);
    manager.config.activeAccount = 'exp1';

    const exportPath = path.join(tmpDir, 'export.json');
    manager.exportAccounts(exportPath);

    assert.ok(fs.existsSync(exportPath));
    const content = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    assert.strictEqual(content.accounts.length, 2);
    assert.strictEqual(content.active_account, 'exp1');

    // Simulate importing onto another PC
    const otherTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zerog-other-pc-'));
    process.env.HOME = otherTmp;
    try {
      const manager2 = new AccountManager();
      assert.strictEqual(manager2.listAccounts().length, 0);

      const result = manager2.importAccounts(exportPath);
      assert.strictEqual(result.count, 2);
      assert.strictEqual(result.activeAccount, 'exp1');
      assert.strictEqual(manager2.listAccounts().length, 2);
      assert.strictEqual(manager2.listAccounts()[0].id, 'exp1');
    } finally {
      try { fs.rmSync(otherTmp, { recursive: true, force: true }); } catch {}
    }
  } finally {
    process.env.HOME = origHome;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('settings.json auto-reconciliation and syncActiveState', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zerog-test-'));
  const origHome = process.env.HOME;
  process.env.HOME = tmpDir;

  try {
    const settingsPath = AccountManager.settingsPath;
    const settingsDir = path.dirname(settingsPath);
    fs.mkdirSync(settingsDir, { recursive: true });

    // Pre-seed settings.json with lingering modelProvider: "gemini"
    fs.writeFileSync(settingsPath, JSON.stringify({ modelProvider: 'gemini', trustedWorkspaces: ['/tmp'] }, null, 2));

    const manager = new AccountManager();
    const googleAcc = new Account({
      id: 'google-acc',
      name: 'Google Test',
      email: 'test@google.com',
      type: 'google',
      priority: 1
    });
    manager.saveAccount(googleAcc);
    manager.config.activeAccount = 'google-acc';

    // syncActiveState should strip modelProvider for Google accounts
    manager.syncActiveState();
    let currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.strictEqual(currentSettings.modelProvider, undefined);
    assert.deepStrictEqual(currentSettings.trustedWorkspaces, ['/tmp']);

    // Switch to gemini-api-key account
    const apiKeyAcc = new Account({
      id: 'api-acc',
      name: 'API Key Test',
      email: 'apikey@test.com',
      type: 'gemini-api-key',
      priority: 2,
      data: { api_key: 'AIzaSyTest123' }
    });
    manager.saveAccount(apiKeyAcc);
    manager.config.activeAccount = 'api-acc';

    manager.syncActiveState();
    currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.strictEqual(currentSettings.modelProvider, 'gemini');

    // Switch back to google account
    manager.config.activeAccount = 'google-acc';
    manager.syncActiveState();
    currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.strictEqual(currentSettings.modelProvider, undefined);
  } finally {
    process.env.HOME = origHome;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('Quota classification and limit breakdowns (5-hour, weekly, total)', () => {
  // Test 5-hour quota classification
  const shortCooldownErr = 'Rate limit exceeded: 5 hour quota exhausted. Resets in 2h30m.';
  const shortResult = QuotaDetector.classifyQuota({ text: shortCooldownErr });
  assert.strictEqual(shortResult.quotaType, '5_hour');
  assert.strictEqual(shortResult.cooldownMinutes, 150);

  // Test weekly quota classification
  const weeklyErr = 'error: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 166h59m4s.';
  const weeklyResult = QuotaDetector.classifyQuota({ text: weeklyErr, exitCode: 3 });
  assert.strictEqual(weeklyResult.quotaType, 'weekly');
  assert.ok(weeklyResult.cooldownMinutes > 9000);

  // Test total / plan exhausted classification
  const totalErr = 'Total plan quota exhausted for this billing period. Please upgrade plan.';
  const totalResult = QuotaDetector.classifyQuota({ text: totalErr });
  assert.strictEqual(totalResult.quotaType, 'total');

  // Test Account model limit summaries
  const acc = new Account({
    id: 'test-acc',
    name: 'Test',
    email: 'test@example.com',
    type: 'google'
  });

  // Initially all available
  let summary = acc.getLimitSummary();
  assert.strictEqual(summary.five_hour.status, 'available');
  assert.strictEqual(summary.weekly.status, 'available');
  assert.strictEqual(summary.total.status, 'available');

  // Mark 5-hour exhausted
  acc.mark5HourExhausted(180, '5-hour limit reached');
  assert.strictEqual(acc.quotaType, '5_hour');
  assert.strictEqual(acc.isExhausted(), true);
  summary = acc.getLimitSummary();
  assert.strictEqual(summary.five_hour.status, 'exhausted');
  assert.strictEqual(summary.five_hour.is_exhausted, true);
  assert.strictEqual(summary.weekly.status, 'available');
  assert.strictEqual(summary.weekly.is_exhausted, false);

  // Reset and mark weekly exhausted
  acc.resetCooldown();
  assert.strictEqual(acc.isExhausted(), false);
  acc.markWeeklyExhausted(10000, 'Weekly quota exhausted');
  assert.strictEqual(acc.quotaType, 'weekly');
  summary = acc.getLimitSummary();
  assert.strictEqual(summary.weekly.status, 'exhausted');
  assert.strictEqual(summary.weekly.is_exhausted, true);
  assert.strictEqual(summary.five_hour.status, 'available');
  assert.strictEqual(summary.five_hour.is_exhausted, false);
});

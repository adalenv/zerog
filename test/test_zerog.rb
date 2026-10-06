# frozen_string_literal: true

require "minitest/autorun"
require "fileutils"
require "tmpdir"

require_relative "../lib/zerog/version"
require_relative "../lib/zerog/config"
require_relative "../lib/zerog/agy_locator"
require_relative "../lib/zerog/account"
require_relative "../lib/zerog/account_manager"
require_relative "../lib/zerog/quota_detector"
require_relative "../lib/zerog/notifier"
require_relative "../lib/zerog/runner"
require_relative "../lib/zerog/daemon"

class TestZeroG < Minitest::Test
  def setup
    @tmp_dir = Dir.mktmpdir("zerog_test")
    @orig_home = ENV["HOME"]
    ENV["HOME"] = @tmp_dir
  end

  def teardown
    ENV["HOME"] = @orig_home
    FileUtils.remove_entry(@tmp_dir) if File.exist?(@tmp_dir)
  end

  def test_config_defaults_and_persistence
    cfg = ZeroG::Config.new
    assert_equal true, cfg.auto_switch?
    assert_equal "priority", cfg.switch_strategy
    assert_equal 60, cfg.cooldown_minutes
    assert_equal 7890, cfg.web_port

    cfg["cooldown_minutes"] = 120
    cfg2 = ZeroG::Config.new
    assert_equal 120, cfg2.cooldown_minutes
  end

  def test_account_model_and_cooldown
    acc = ZeroG::Account.new(
      id: "acc1",
      name: "Account One",
      email: "one@example.com",
      priority: 2
    )

    assert_equal "acc1", acc.id
    refute acc.exhausted?
    assert_equal 0, acc.remaining_cooldown_seconds

    acc.mark_exhausted(30)
    assert acc.exhausted?
    assert acc.remaining_cooldown_seconds > 1700
    assert_equal "exhausted", acc.status

    acc.reset_cooldown
    refute acc.exhausted?
    assert_equal "ready", acc.status
  end

  def test_account_manager_crud_and_pool_selection
    manager = ZeroG::AccountManager.new

    acc1 = ZeroG::Account.new(id: "acc1", name: "First", email: "1@test.com", priority: 1)
    acc2 = ZeroG::Account.new(id: "acc2", name: "Second", email: "2@test.com", priority: 2)

    manager.save_account(acc1)
    manager.save_account(acc2)
    manager.config.active_account = "acc1"

    accounts = manager.list_accounts
    assert_equal 2, accounts.size
    assert_equal "acc1", accounts.first.id

    next_acc = manager.get_next_available("acc1")
    assert_equal "acc2", next_acc.id

    # Mark acc2 exhausted
    manager.mark_exhausted(next_acc, "test quota", 10)
    assert next_acc.exhausted?

    # Now acc2 is exhausted, so no other accounts are ready -> returns nil!
    assert_nil manager.get_next_available("acc1")
  end

  def test_no_loop_when_all_accounts_exhausted
    manager = ZeroG::AccountManager.new

    acc1 = ZeroG::Account.new(id: "acc1", priority: 1)
    acc2 = ZeroG::Account.new(id: "acc2", priority: 2)
    manager.save_account(acc1)
    manager.save_account(acc2)

    # Both accounts are marked exhausted
    manager.mark_exhausted(acc1, "limit reached", 60)
    manager.mark_exhausted(acc2, "limit reached", 60)

    # Neither account can be picked -> returns nil, stops without looping!
    assert_nil manager.get_next_available("acc1")
    assert_nil manager.get_next_available("acc2")
  end

  def test_quota_detector_patterns
    assert ZeroG::QuotaDetector.match_text?("Error: RESOURCE_EXHAUSTED - You have exhausted your quota.")
    assert ZeroG::QuotaDetector.match_text?("429 Too Many Requests: Rate limit exceeded")
    assert ZeroG::QuotaDetector.match_text?("Quota exhausted: plan limit reached")
    assert ZeroG::QuotaDetector.match_text?("AI credits are exhausted for this billing period")
    refute ZeroG::QuotaDetector.match_text?("File saved successfully.")

    assert ZeroG::QuotaDetector.match_exit_code?(3)
    refute ZeroG::QuotaDetector.match_exit_code?(0)
    refute ZeroG::QuotaDetector.match_exit_code?(1)

    assert ZeroG::QuotaDetector.match_log_line?("E1006 22:58:07 quota_manager.go:45 RESOURCE_EXHAUSTED")
  end

  def test_wait_resumes_when_cooldown_expires
    manager = ZeroG::AccountManager.new
    acc = ZeroG::Account.new(
      id: "acc_expired",
      type: "gemini-api-key",
      priority: 1,
      data: { "api_key" => "AIzaSyTest" }
    )
    acc.exhausted_until = Time.now.utc - 1
    manager.save_account(acc)

    runner = ZeroG::Runner.new(manager)
    res = runner.send(:wait_for_any_account_quota)
    assert_equal "acc_expired", res.id
    refute res.exhausted?
  end

  def test_export_and_import_accounts
    manager = ZeroG::AccountManager.new
    acc1 = ZeroG::Account.new(id: "exp1", name: "Export 1", email: "exp1@test.com", type: "gemini-api-key", priority: 1, data: { "api_key" => "KEY1" })
    acc2 = ZeroG::Account.new(id: "exp2", name: "Export 2", email: "exp2@test.com", type: "gemini-api-key", priority: 2, data: { "api_key" => "KEY2" })
    manager.save_account(acc1)
    manager.save_account(acc2)
    manager.config.active_account = "exp1"

    export_path = File.join(@tmp_dir, "export.json")
    manager.export_accounts(export_path)

    assert File.exist?(export_path)
    content = JSON.parse(File.read(export_path))
    assert_equal 2, content["accounts"].size
    assert_equal "exp1", content["active_account"]

    # Now create a fresh second manager in a different directory to simulate another PC
    new_tmp = Dir.mktmpdir("zerog_other_pc")
    orig = ENV["HOME"]
    begin
      ENV["HOME"] = new_tmp
      manager2 = ZeroG::AccountManager.new
      assert_equal 0, manager2.list_accounts.size

      result = manager2.import_accounts(export_path)
      assert_equal 2, result[:count]
      assert_equal "exp1", result[:active_account]
      assert_equal 2, manager2.list_accounts.size
      assert_equal "exp1", manager2.list_accounts.first.id
    ensure
      ENV["HOME"] = orig
      FileUtils.remove_entry(new_tmp) if File.exist?(new_tmp)
    end
  end

  def test_agy_locator_discovery
    # Should discover current agy
    found = ZeroG::AgyLocator.find
    refute_nil found
    assert File.executable?(found)

    # Test AGY_PATH env override
    fake_bin = File.join(@tmp_dir, "fake_agy")
    File.write(fake_bin, "#!/bin/sh\necho fake")
    File.chmod(0755, fake_bin)

    orig_env = ENV["AGY_PATH"]
    begin
      ENV["AGY_PATH"] = fake_bin
      assert_equal fake_bin, ZeroG::AgyLocator.find
    ensure
      ENV["AGY_PATH"] = orig_env
    end

    # Test config override
    cfg = ZeroG::Config.new
    cfg["agy_path"] = fake_bin
    assert_equal fake_bin, ZeroG::AgyLocator.find(cfg)
  end
end

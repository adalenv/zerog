# frozen_string_literal: true

require "json"
require "fileutils"

module ZeroG
  class Config
    DEFAULT_CONFIG = {
      "auto_switch" => true,
      "switch_strategy" => "priority", # "priority" or "round_robin"
      "cooldown_minutes" => 60,
      "wait_for_quota" => true,
      "web_port" => 7890,
      "continue_conversation" => true,
      "notifications" => true,
      "active_account" => nil
    }.freeze

    def self.base_dir
      dir = File.expand_path("~/.zerog")
      FileUtils.mkdir_p(dir) unless Dir.exist?(dir)
      migrate_from_legacy_if_needed(dir)
      dir
    end

    def self.migrate_from_legacy_if_needed(new_dir)
      legacy_dir = File.expand_path("~/.agypool")
      return unless Dir.exist?(legacy_dir)

      # Copy any accounts over if new_dir has none
      legacy_accounts = File.join(legacy_dir, "accounts")
      new_accounts = File.join(new_dir, "accounts")
      if Dir.exist?(legacy_accounts) && (!Dir.exist?(new_accounts) || Dir.empty?(new_accounts))
        FileUtils.mkdir_p(new_accounts)
        FileUtils.cp_r(Dir.glob(File.join(legacy_accounts, "*")), new_accounts) rescue nil
      end

      legacy_cfg = File.join(legacy_dir, "config.json")
      new_cfg = File.join(new_dir, "config.json")
      if File.exist?(legacy_cfg) && !File.exist?(new_cfg)
        FileUtils.cp(legacy_cfg, new_cfg) rescue nil
      end
    end

    def self.accounts_dir
      dir = File.join(base_dir, "accounts")
      FileUtils.mkdir_p(dir) unless Dir.exist?(dir)
      dir
    end

    def self.config_path
      File.join(base_dir, "config.json")
    end

    def self.events_path
      File.join(base_dir, "events.log")
    end

    attr_accessor :data

    def initialize
      @data = load_config
    end

    def load_config
      path = self.class.config_path
      if File.exist?(path)
        begin
          parsed = JSON.parse(File.read(path))
          DEFAULT_CONFIG.merge(parsed)
        rescue StandardError
          DEFAULT_CONFIG.dup
        end
      else
        DEFAULT_CONFIG.dup
      end
    end

    def save
      File.write(self.class.config_path, JSON.pretty_generate(@data))
    end

    def [](key)
      @data[key.to_s]
    end

    def []=(key, val)
      @data[key.to_s] = val
      save
    end

    def auto_switch?
      !!@data["auto_switch"]
    end

    def switch_strategy
      @data["switch_strategy"] || "priority"
    end

    def wait_for_quota?
      @data["wait_for_quota"] != false
    end

    def cooldown_minutes
      (@data["cooldown_minutes"] || 60).to_i
    end

    def web_port
      (@data["web_port"] || 7890).to_i
    end

    def continue_conversation?
      @data["continue_conversation"] != false
    end

    def notifications?
      @data["notifications"] != false
    end

    def active_account
      @data["active_account"]
    end

    def active_account=(val)
      self["active_account"] = val
    end
  end
end

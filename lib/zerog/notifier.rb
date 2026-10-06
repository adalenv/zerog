# frozen_string_literal: true

require "open3"

module ZeroG
  class Notifier
    RESET   = "\e[0m"
    BOLD    = "\e[1m"
    RED     = "\e[31m"
    GREEN   = "\e[32m"
    YELLOW  = "\e[33m"
    BLUE    = "\e[34m"
    MAGENTA = "\e[35m"
    CYAN    = "\e[36m"
    GRAY    = "\e[90m"

    def self.banner(title, message, color = CYAN)
      puts "\n#{BOLD}#{color}┌─────────────────────────────────────────────────────────────┐#{RESET}"
      puts "#{BOLD}#{color}│ [zerog] #{title.ljust(51)} │#{RESET}"
      puts "#{color}├─────────────────────────────────────────────────────────────┤#{RESET}"
      message.each_line do |line|
        puts "#{color}│ #{line.strip.ljust(59)} │#{RESET}"
      end
      puts "#{BOLD}#{color}└─────────────────────────────────────────────────────────────┘#{RESET}\n"
    end

    def self.notify_switch(from_account, to_account)
      from_desc = from_account ? "'#{from_account.id}' (#{from_account.email})" : "previous account"
      to_desc = "'#{to_account.id}' (#{to_account.email})"

      msg = "Quota limit reached on #{from_desc}.\nAuto-switched to #{to_desc}."
      banner("🔄 ACCOUNT AUTO-SWITCHED", msg, YELLOW)
      system_notification("Zero-G Account Switched", "Switched from #{from_account ? from_account.id : "old"} to #{to_account.id} (#{to_account.email})")
    end

    def self.notify_all_exhausted(earliest_cooldown)
      msg = "All accounts in pool have exhausted their quota.\nNext reset in: #{earliest_cooldown}."
      banner("⚠️ ALL ACCOUNTS EXHAUSTED", msg, RED)
      system_notification("Zero-G Quota Alert", "All accounts in your pool are currently quota-exhausted.")
    end

    def self.system_notification(title, message)
      if RUBY_PLATFORM =~ /darwin/
        script = %(display notification "#{escape_applescript(message)}" with title "#{escape_applescript(title)}" sound name "Hero")
        Open3.capture3("osascript", "-e", script) rescue nil
      elsif RUBY_PLATFORM =~ /linux/
        Open3.capture3("notify-send", title, message) rescue nil
      end
    end

    def self.escape_applescript(str)
      str.to_s.gsub('"', '\"').gsub('\\', '\\\\')
    end
  end
end

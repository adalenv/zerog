# frozen_string_literal: true

require "open3"
require_relative "account_manager"
require_relative "quota_detector"
require_relative "notifier"

module ZeroG
  class Runner
    CLI_LOG_PATH = File.expand_path("~/.gemini/antigravity-cli/cli.log")

    attr_reader :manager, :config

    def initialize(manager = nil)
      @manager = manager || AccountManager.new
      @config = @manager.config
    end

    def run(args = [])
      is_interactive = !args.include?("-p") && !args.include?("--print")

      if is_interactive
        run_interactive_loop(args)
      else
        run_non_interactive_loop(args)
      end
    end

    private

    def run_non_interactive_loop(initial_args)
      args = initial_args.dup
      max_attempts = [@manager.list_accounts.size, 1].max
      attempts = 0

      while attempts < max_attempts
        attempts += 1
        active = @manager.active_account
        env = build_env(active)

        stdout_str, stderr_str, status = Open3.capture3(env, @manager.agy_path, *args)
        combined_output = "#{stdout_str}\n#{stderr_str}"

        if QuotaDetector.quota_exhausted?(text: combined_output, exit_code: status.exitstatus)
          if @config.auto_switch?
            prev_acc = active
            next_acc = @manager.auto_switch!(prev_acc ? prev_acc.id : nil, "Quota exhausted in prompt execution")

            if next_acc
              Notifier.notify_switch(prev_acc, next_acc)
              puts "#{Notifier::GRAY}[zerog] Retrying agy with #{next_acc.id}...#{Notifier::RESET}\n"
              next
            elsif @config.wait_for_quota? && (ready_acc = wait_for_any_account_quota)
              puts "#{Notifier::GREEN}✓ Quota available on #{ready_acc.id}! Retrying agy...#{Notifier::RESET}\n"
              next
            else
              Notifier.notify_all_exhausted(earliest_cooldown_str)
              print combined_output
              return status.exitstatus || 1
            end
          else
            print combined_output
            return status.exitstatus || 1
          end
        else
          print stdout_str
          warn stderr_str unless stderr_str.empty?
          return status.exitstatus || 0
        end
      end

      0
    end

    def run_interactive_loop(initial_args)
      args = initial_args.dup
      max_switches = [@manager.list_accounts.size, 1].max
      switches = 0

      loop do
        active = @manager.active_account
        env = build_env(active)

        start_log_pos = 0
        if File.exist?(CLI_LOG_PATH)
          start_log_pos = File.size(CLI_LOG_PATH) rescue 0
        end

        quota_detected = false
        running = true

        # Spawn agy directly attached to the terminal (stdin/stdout/stderr)
        # This guarantees 100% native keyboard typing, escape queries, arrow keys, and TUI rendering.
        pid = Process.spawn(env, @manager.agy_path, *args, in: STDIN, out: STDOUT, err: STDERR)

        # Monitor cli.log in background to catch quota exhaustion in real time
        log_thread = Thread.new do
          begin
            sleep 1
            if File.exist?(CLI_LOG_PATH)
              File.open(CLI_LOG_PATH, "r") do |f|
                f.seek(start_log_pos, IO::SEEK_SET) rescue nil
                while running
                  line = f.gets
                  if line
                    if QuotaDetector.match_log_line?(line)
                      quota_detected = true
                      # Tell agy process to gracefully terminate
                      Process.kill("TERM", pid) rescue nil
                      break
                    end
                  else
                    sleep 0.5
                  end
                end
              end
            end
          rescue StandardError
            # ignore background log reading error
          end
        end

        # Trap INT so user pressing Ctrl+C inside agy passes directly to agy without killing zerog
        old_int = trap("INT") do
          Process.kill("INT", pid) rescue nil
        end

        _, status = Process.waitpid2(pid)
        running = false
        log_thread.kill rescue nil
        trap("INT", old_int || "DEFAULT")

        exit_code = status.exitstatus || 0

        # Exit code 3 explicitly indicates quota exhaustion in agy
        if QuotaDetector.match_exit_code?(exit_code)
          quota_detected = true
        end

        # Inspect any new entries in cli.log written during the session
        if !quota_detected && File.exist?(CLI_LOG_PATH)
          begin
            File.open(CLI_LOG_PATH, "r") do |f|
              f.seek(start_log_pos, IO::SEEK_SET) rescue nil
              while (line = f.gets)
                if QuotaDetector.match_log_line?(line)
                  quota_detected = true
                  break
                end
              end
            end
          rescue StandardError
            # non-fatal
          end
        end

        # Auto-switch if quota exhaustion detected
        if quota_detected && @config.auto_switch? && switches < max_switches
          switches += 1
          prev_acc = active
          next_acc = @manager.auto_switch!(prev_acc ? prev_acc.id : nil, "Quota limit in interactive session")

          if next_acc
            Notifier.notify_switch(prev_acc, next_acc)
            puts "\n#{Notifier::CYAN}[zerog] Resuming conversation with 'agy --continue' using #{next_acc.id}...#{Notifier::RESET}\n"
            args = ["--continue"] unless args.include?("--continue") || args.include?("-c")
            next
          elsif @config.wait_for_quota? && (ready_acc = wait_for_any_account_quota)
            puts "\n#{Notifier::GREEN}✓ Quota available on #{ready_acc.id}! Resuming conversation with 'agy --continue'...#{Notifier::RESET}\n"
            args = ["--continue"] unless args.include?("--continue") || args.include?("-c")
            next
          else
            Notifier.notify_all_exhausted(earliest_cooldown_str)
            return exit_code
          end
        end

        return exit_code
      end
    end

    def wait_for_any_account_quota
      ready_now = @manager.list_accounts.reject(&:exhausted?)
      if ready_now.any?
        chosen = ready_now.first
        @manager.activate_account(chosen)
        return chosen
      end

      exhausted_accounts = @manager.list_accounts.select(&:exhausted?)
      return nil if exhausted_accounts.empty?

      earliest = exhausted_accounts.min_by(&:remaining_cooldown_seconds)
      return nil unless earliest

      puts "\n#{Notifier::YELLOW}┌─────────────────────────────────────────────────────────────┐#{Notifier::RESET}"
      puts "#{Notifier::YELLOW}│ [zerog] ⏳ All accounts in pool have reached quota limits.  │#{Notifier::RESET}"
      puts "#{Notifier::YELLOW}│ Account '#{earliest.id}' will refresh in: #{earliest.remaining_cooldown_human.ljust(17)}│#{Notifier::RESET}"
      puts "#{Notifier::YELLOW}│ Waiting for quota to become available... (Ctrl+C to cancel) │#{Notifier::RESET}"
      puts "#{Notifier::YELLOW}└─────────────────────────────────────────────────────────────┘#{Notifier::RESET}\n"

      begin
        loop do
          ready_now = @manager.list_accounts.reject(&:exhausted?)
          if ready_now.any?
            chosen = ready_now.first
            @manager.activate_account(chosen)
            print "\r\e[K"
            return chosen
          end

          current_exhausted = @manager.list_accounts.select(&:exhausted?)
          earliest = current_exhausted.min_by(&:remaining_cooldown_seconds)
          rem = earliest ? earliest.remaining_cooldown_seconds : 0

          if rem <= 0
            earliest.reset_cooldown
            @manager.save_account(earliest)
            @manager.activate_account(earliest)
            print "\r\e[K"
            return earliest
          end

          mins = rem / 60
          secs = rem % 60
          print "\r#{Notifier::CYAN}[zerog] ⏳ Quota available in #{mins}m #{secs.to_s.rjust(2, '0')}s (account: #{earliest.id})...#{Notifier::RESET}   "
          $stdout.flush
          sleep 1
        end
      rescue Interrupt
        puts "\n#{Notifier::GRAY}[zerog] Wait cancelled by user.#{Notifier::RESET}\n"
        nil
      end
    end

    def build_env(account)
      env = {}
      if account && account.type == "gemini-api-key"
        key = account.data["api_key"]
        env["GEMINI_API_KEY"] = key if key
      end
      env
    end

    def earliest_cooldown_str
      candidates = @manager.list_accounts.select(&:exhausted?)
      return "unknown" if candidates.empty?
      earliest = candidates.min_by(&:remaining_cooldown_seconds)
      "~#{earliest.remaining_cooldown_human} (account: #{earliest.id})"
    end
  end
end

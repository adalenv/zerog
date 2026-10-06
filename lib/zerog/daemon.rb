# frozen_string_literal: true

require "fileutils"
require_relative "account_manager"
require_relative "quota_detector"
require_relative "notifier"

module ZeroG
  class Daemon
    LOG_FILE_PATH = File.expand_path("~/.gemini/antigravity-cli/cli.log")
    PID_FILE_PATH = File.join(Config.base_dir, "daemon.pid")

    attr_reader :manager, :running

    def initialize(manager = nil)
      @manager = manager || AccountManager.new
      @running = false
    end

    def start_foreground
      puts "#{Notifier::CYAN}[zerog] Starting watchdog in foreground...#{Notifier::RESET}"
      puts "#{Notifier::GRAY}Monitoring #{LOG_FILE_PATH}#{Notifier::RESET}"
      watch_loop
    end

    def start_background
      if running?
        puts "#{Notifier::YELLOW}[zerog] Daemon is already running (PID: #{read_pid})#{Notifier::RESET}"
        return
      end

      pid = Process.fork do
        Process.daemon(true, false)
        File.write(PID_FILE_PATH, Process.pid.to_s)
        watch_loop
      end

      Process.detach(pid)
      puts "#{Notifier::GREEN}[zerog] Daemon started in background (PID: #{pid})#{Notifier::RESET}"
    end

    def stop
      pid = read_pid
      if pid
        begin
          Process.kill("TERM", pid)
          FileUtils.rm_f(PID_FILE_PATH)
          puts "#{Notifier::GREEN}[zerog] Daemon stopped (PID: #{pid})#{Notifier::RESET}"
        rescue Errno::ESRCH
          FileUtils.rm_f(PID_FILE_PATH)
          puts "#{Notifier::YELLOW}[zerog] Daemon was not running (stale PID removed)#{Notifier::RESET}"
        end
      else
        puts "#{Notifier::YELLOW}[zerog] No daemon PID found.#{Notifier::RESET}"
      end
    end

    def status
      pid = read_pid
      if pid && process_alive?(pid)
        puts "#{Notifier::GREEN}[zerog] Daemon is RUNNING (PID: #{pid})#{Notifier::RESET}"
      else
        puts "#{Notifier::GRAY}[zerog] Daemon is STOPPED#{Notifier::RESET}"
      end
    end

    def running?
      pid = read_pid
      pid && process_alive?(pid)
    end

    private

    def read_pid
      return nil unless File.exist?(PID_FILE_PATH)
      File.read(PID_FILE_PATH).strip.to_i
    rescue StandardError
      nil
    end

    def process_alive?(pid)
      Process.kill(0, pid)
      true
    rescue Errno::ESRCH, Errno::EPERM
      false
    end

    def watch_loop
      @running = true

      sleep 1 until File.exist?(LOG_FILE_PATH) || !@running

      File.open(LOG_FILE_PATH, "r") do |f|
        f.seek(0, IO::SEEK_END)

        while @running
          line = f.gets
          if line
            check_line(line)
          else
            sleep 0.5
          end
        end
      end
    rescue Interrupt
      puts "\n[zerog] Stopping watchdog..."
    ensure
      @running = false
      FileUtils.rm_f(PID_FILE_PATH) if read_pid == Process.pid
    end

    def check_line(line)
      return unless @manager.config.auto_switch?
      return unless QuotaDetector.match_log_line?(line)

      now = Time.now.to_i
      return if @last_switch_time && (now - @last_switch_time) < 5

      @last_switch_time = now
      prev_acc = @manager.active_account
      next_acc = @manager.auto_switch!(prev_acc ? prev_acc.id : nil, "Quota pattern in cli.log: #{line.strip[0..80]}")

      if next_acc
        Notifier.notify_switch(prev_acc, next_acc)
      else
        Notifier.notify_all_exhausted("all accounts exhausted")
      end
    end
  end
end

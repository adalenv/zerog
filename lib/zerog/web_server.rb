# frozen_string_literal: true

require "webrick"
require "json"
require "uri"
require_relative "account_manager"
require_relative "daemon"

module ZeroG
  class WebServer
    attr_reader :manager, :port

    def initialize(manager = nil, port = nil)
      @manager = manager || AccountManager.new
      @port = port || @manager.config.web_port
      @public_dir = File.expand_path("../../web/public", __dir__)
    end

    def start
      server = WEBrick::HTTPServer.new(
        Port: @port,
        DocumentRoot: @public_dir,
        Logger: WEBrick::Log.new(File::NULL),
        AccessLog: []
      )

      server.mount_proc "/api" do |req, res|
        handle_api(req, res)
      end

      trap("INT") { server.shutdown }
      trap("TERM") { server.shutdown }

      puts "\n#{Notifier::GREEN}🚀 zerog Web Dashboard running at: http://localhost:#{@port}#{Notifier::RESET}"
      puts "#{Notifier::GRAY}Press Ctrl+C to stop the web server.#{Notifier::RESET}\n"

      if RUBY_PLATFORM =~ /darwin/
        system("open", "http://localhost:#{@port}") rescue nil
      elsif RUBY_PLATFORM =~ /linux/
        system("xdg-open", "http://localhost:#{@port}") rescue nil
      elsif RUBY_PLATFORM =~ /mswin|mingw/
        system("start", "http://localhost:#{@port}") rescue nil
      end

      server.start
    end

    private

    def handle_api(req, res)
      res["Content-Type"] = "application/json"
      res["Access-Control-Allow-Origin"] = "*"
      res["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
      res["Access-Control-Allow-Headers"] = "Content-Type"

      if req.request_method == "OPTIONS"
        res.status = 200
        return
      end

      path = req.path.sub(%r{^/api/?}, "")

      begin
        case path
        when "status"
          res.body = api_status.to_json
        when "accounts"
          res.body = api_accounts.to_json
        when "accounts/use"
          body = parse_json_body(req)
          acc = @manager.activate_account(body["id"])
          res.body = { success: true, account: acc.to_h }.to_json
        when "accounts/add-key"
          body = parse_json_body(req)
          acc = @manager.add_gemini_api_key(body["id"], body["name"], body["api_key"], body["priority"] || 10)
          res.body = { success: true, account: acc.to_h }.to_json
        when "accounts/capture"
          body = parse_json_body(req)
          acc = @manager.capture_current(body["id"], body["name"])
          res.body = { success: true, account: acc.to_h }.to_json
        when "accounts/delete"
          body = parse_json_body(req)
          @manager.delete_account(body["id"])
          res.body = { success: true }.to_json
        when "accounts/reset-cooldown"
          body = parse_json_body(req)
          @manager.reset_cooldown(body["id"])
          res.body = { success: true }.to_json
        when "accounts/test"
          body = parse_json_body(req)
          result = @manager.test_account(body["id"])
          res.body = result.to_json
        when "config"
          if req.request_method == "POST"
            body = parse_json_body(req)
            body.each { |k, v| @manager.config[k] = v }
          end
          res.body = @manager.config.data.to_json
        when "events"
          res.body = @manager.read_events(50).to_json
        else
          res.status = 404
          res.body = { error: "Not found: #{path}" }.to_json
        end
      rescue StandardError => e
        res.status = 500
        res.body = { error: e.message }.to_json
      end
    end

    def api_status
      accounts = @manager.list_accounts
      active = @manager.active_account
      exhausted_count = accounts.count(&:exhausted?)
      daemon = Daemon.new(@manager)

      {
        active_account: active ? active.to_h : nil,
        total_accounts: accounts.size,
        exhausted_accounts: exhausted_count,
        ready_accounts: accounts.size - exhausted_count,
        auto_switch: @manager.config.auto_switch?,
        switch_strategy: @manager.config.switch_strategy,
        cooldown_minutes: @manager.config.cooldown_minutes,
        daemon_running: daemon.running?,
        web_port: @port
      }
    end

    def api_accounts
      @manager.list_accounts.map(&:to_h)
    end

    def parse_json_body(req)
      return {} if req.body.nil? || req.body.empty?
      JSON.parse(req.body)
    rescue StandardError
      {}
    end
  end
end

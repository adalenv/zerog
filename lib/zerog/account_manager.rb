# frozen_string_literal: true

require "base64"
require "json"
require "fileutils"
require "open3"
require_relative "version"
require_relative "config"
require_relative "agy_locator"
require_relative "account"

module ZeroG
  class AccountManager
    KEYCHAIN_SERVICE = "gemini"
    KEYCHAIN_ACCOUNT = "antigravity"
    KEYCHAIN_FALLBACK_FILE = File.expand_path("~/.gemini/antigravity-cli/.zerog_keyring_token")

    APP_STORAGE_PATH = if RUBY_PLATFORM =~ /darwin/
                         File.expand_path("~/Library/Application Support/Antigravity/app_storage.json")
                       else
                         File.expand_path("~/.config/Antigravity/app_storage.json")
                       end
    SETTINGS_PATH = File.expand_path("~/.gemini/antigravity-cli/settings.json")

    attr_reader :config

    def self.agy_path(config = nil)
      AgyLocator.find!(config)
    end

    def self.ensure_agy_installed!(config = nil)
      AgyLocator.find!(config)
    end

    def agy_path
      self.class.agy_path(@config)
    end

    def initialize(config = nil)
      @config = config || Config.new
      self.class.ensure_agy_installed!(@config)
      ensure_auto_import
    end

    def list_accounts
      accounts = []
      Dir.glob(File.join(Config.accounts_dir, "*.json")).each do |file|
        begin
          data = JSON.parse(File.read(file))
          acc = Account.from_h(data)
          acc.exhausted?
          accounts << acc
        rescue StandardError => e
          warn "[zerog] Warning: failed to parse account file #{file}: #{e.message}"
        end
      end

      accounts.sort_by { |a| [a.priority, a.id] }
    end

    def find_account(id)
      return nil if id.nil? || id.to_s.strip.empty?
      file = File.join(Config.accounts_dir, "#{id}.json")
      return nil unless File.exist?(file)

      begin
        data = JSON.parse(File.read(file))
        Account.from_h(data)
      rescue StandardError
        nil
      end
    end

    def save_account(account)
      file = File.join(Config.accounts_dir, "#{account.id}.json")
      File.write(file, JSON.pretty_generate(account.to_h))
      account
    end

    def delete_account(id)
      file = File.join(Config.accounts_dir, "#{id}.json")
      File.delete(file) if File.exist?(file)
      if @config.active_account == id
        next_acc = list_accounts.first
        @config.active_account = next_acc ? next_acc.id : nil
      end
      true
    end

    def active_account
      acc_id = @config.active_account
      acc = find_account(acc_id) if acc_id
      acc || list_accounts.first
    end

    def activate_account(id_or_account)
      account = id_or_account.is_a?(Account) ? id_or_account : find_account(id_or_account)
      raise "Account not found: #{id_or_account}" unless account

      if account.type == "google"
        payload = account.data["keyring_payload"]
        raise "No keychain token available for Google account #{account.id}" unless payload

        write_keychain(payload)
        update_app_storage(account.email)
        update_gemini_settings(false)
      elsif account.type == "gemini-api-key"
        update_gemini_settings(true)
      end

      account.last_used = Time.now.utc
      account.status = "active"
      save_account(account)

      list_accounts.each do |other|
        if other.id != account.id && other.status == "active"
          other.status = "ready"
          save_account(other)
        end
      end

      @config.active_account = account.id
      log_event("SWITCH", "Switched active account to '#{account.id}' (#{account.email})")
      account
    end

    def mark_exhausted(id_or_account, reason = "Plan usage over", minutes = nil)
      account = id_or_account.is_a?(Account) ? id_or_account : find_account(id_or_account)
      return unless account

      cooldown = (minutes || @config.cooldown_minutes).to_i
      account.mark_exhausted(cooldown)
      save_account(account)

      log_event("EXHAUSTED", "Account '#{account.id}' (#{account.email}) exhausted: #{reason}. Cooldown #{cooldown}m.")
    end

    def reset_cooldown(id_or_account)
      account = id_or_account.is_a?(Account) ? id_or_account : find_account(id_or_account)
      return unless account

      account.reset_cooldown
      save_account(account)
      log_event("RESET", "Cleared cooldown for account '#{account.id}' (#{account.email})")
    end

    def get_next_available(current_id = nil)
      current_id ||= @config.active_account

      # Only select accounts that are completely ready (cooldown has ended)
      candidates = list_accounts.reject do |acc|
        acc.id == current_id || acc.exhausted?
      end

      # If all accounts are exhausted, strictly return nil to prevent looping!
      return nil if candidates.empty?

      if @config.switch_strategy == "round_robin"
        candidates.sort_by { |a| [a.last_used ? a.last_used.to_i : 0, a.priority] }.first
      else
        candidates.sort_by { |a| [a.priority, a.last_used ? a.last_used.to_i : 0] }.first
      end
    end

    def auto_switch!(current_id = nil, reason = "Plan usage over")
      curr = current_id ? find_account(current_id) : active_account
      mark_exhausted(curr, reason) if curr

      next_acc = get_next_available(curr ? curr.id : nil)
      if next_acc
        activate_account(next_acc)
        log_event("AUTO_SWITCH", "Auto-switched from '#{curr ? curr.id : "none"}' to '#{next_acc.id}' (#{next_acc.email})")
        next_acc
      else
        log_event("POOL_EXHAUSTED", "All accounts in pool are quota-exhausted")
        nil
      end
    end

    def capture_current(id, name = nil)
      payload = read_keychain
      raise "No Antigravity login token found in system Keychain" unless payload && !payload.empty?

      info = parse_keychain_payload(payload)
      email = info[:email] || "#{id}@antigravity.google"
      name ||= email

      account = Account.new(
        id: id,
        name: name,
        email: email,
        type: "google",
        status: "active",
        priority: 1,
        data: {
          "keyring_payload" => payload,
          "username" => email
        }
      )

      save_account(account)
      @config.active_account = account.id
      log_event("CAPTURE", "Captured existing Keychain session as '#{id}' (#{email})")
      account
    end

    def add_gemini_api_key(id, name, api_key, priority = 10)
      raise "API key cannot be blank" if api_key.to_s.strip.empty?

      display_email = "api:#{api_key[0..6]}...#{api_key[-4..-1]}"
      name ||= "Gemini API (#{id})"

      account = Account.new(
        id: id,
        name: name,
        email: display_email,
        type: "gemini-api-key",
        status: "ready",
        priority: priority.to_i,
        data: {
          "api_key" => api_key.strip,
          "model_provider" => "gemini"
        }
      )

      save_account(account)
      log_event("ADD_KEY", "Added Gemini API key account '#{id}'")
      account
    end

    def start_google_login(id, name = nil, &progress_block)
      current_token = read_keychain
      progress_block&.call(:backing_up, "Backing up current credentials...")

      delete_keychain rescue nil

      progress_block&.call(:launching, "Launching Google authentication. Please complete login in your browser...")

      login_cmd = "#{agy_path} --print 'hi'"
      system(login_cmd)

      new_token = read_keychain
      if new_token && !new_token.empty? && new_token != current_token
        info = parse_keychain_payload(new_token)
        email = info[:email] || "#{id}@antigravity.google"
        name ||= email

        new_acc = Account.new(
          id: id,
          name: name,
          email: email,
          type: "google",
          status: "ready",
          priority: 5,
          data: {
            "keyring_payload" => new_token,
            "username" => email
          }
        )
        save_account(new_acc)
        progress_block&.call(:success, "Successfully logged in and saved account '#{id}' (#{email})")

        if current_token && @config.active_account && @config.active_account != id
          write_keychain(current_token)
        else
          activate_account(new_acc)
        end

        new_acc
      else
        write_keychain(current_token) if current_token
        raise "Sign-in did not complete or no new token was received in Keychain."
      end
    end

    def test_account(id_or_account)
      account = id_or_account.is_a?(Account) ? id_or_account : find_account(id_or_account)
      raise "Account not found: #{id_or_account}" unless account

      previous_active = active_account

      begin
        activate_account(account)

        stdout, stderr, status = Open3.capture3(agy_path, "models")
        success = status.success? && stdout.include?("gemini")

        if success
          account.status = "ready"
          account.reset_cooldown
          save_account(account)
          { success: true, message: "Authentication verified successfully!" }
        else
          err = (stderr.empty? ? stdout : stderr).strip
          { success: false, message: "Check failed: #{err[0..200]}" }
        end
      ensure
        if previous_active && previous_active.id != account.id
          activate_account(previous_active) rescue nil
        end
      end
    end

    def darwin?
      RUBY_PLATFORM =~ /darwin/i
    end

    def linux?
      RUBY_PLATFORM =~ /linux/i
    end

    def windows?
      RUBY_PLATFORM =~ /mswin|mingw|cygwin/i
    end

    def keyring_backend
      if darwin?
        "macOS Keychain (security)"
      elsif linux?
        has_secret_tool? ? "Linux Secret Service (secret-tool)" : "File Fallback"
      elsif windows?
        "Windows Credential Manager"
      else
        "File Fallback"
      end
    end

    def has_secret_tool?
      @has_secret_tool ||= system("which secret-tool > /dev/null 2>&1")
    end

    def read_keychain
      if darwin?
        out, _, status = Open3.capture3("security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w")
        return out.strip if status.success? && !out.strip.empty?
      elsif linux?
        if has_secret_tool?
          out, _, status = Open3.capture3("secret-tool", "lookup", "service", KEYCHAIN_SERVICE, "username", KEYCHAIN_ACCOUNT)
          return out.strip if status.success? && !out.strip.empty?
        end
      elsif windows?
        ps_script = %([Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null; $v = New-Object Windows.Security.Credentials.PasswordVault; try { $c = $v.Retrieve("#{KEYCHAIN_SERVICE}", "#{KEYCHAIN_ACCOUNT}"); $c.RetrievePassword(); Write-Output $c.Password } catch {})
        out, _, status = Open3.capture3("powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script)
        return out.strip if status.success? && !out.strip.empty?
      end

      if File.exist?(KEYCHAIN_FALLBACK_FILE)
        content = File.read(KEYCHAIN_FALLBACK_FILE).strip
        return content unless content.empty?
      end

      nil
    rescue StandardError
      nil
    end

    def write_keychain(payload)
      if darwin?
        _, stderr, status = Open3.capture3(
          "security", "add-generic-password",
          "-a", KEYCHAIN_ACCOUNT,
          "-s", KEYCHAIN_SERVICE,
          "-U",
          "-w", payload
        )
        raise "Failed to write to Keychain: #{stderr}" unless status.success?
        return true
      elsif linux?
        if has_secret_tool?
          Open3.popen3("secret-tool", "store", "--label=Antigravity", "service", KEYCHAIN_SERVICE, "username", KEYCHAIN_ACCOUNT) do |i, _o, e, wait_thr|
            i.write(payload)
            i.close
            status = wait_thr.value
            raise "Failed to write to Secret Service: #{e.read}" unless status.success?
          end
          return true
        else
          FileUtils.mkdir_p(File.dirname(KEYCHAIN_FALLBACK_FILE))
          File.write(KEYCHAIN_FALLBACK_FILE, payload, perm: 0600)
          return true
        end
      elsif windows?
        ps_script = %([Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null; $v = New-Object Windows.Security.Credentials.PasswordVault; $c = New-Object Windows.Security.Credentials.PasswordCredential("#{KEYCHAIN_SERVICE}", "#{KEYCHAIN_ACCOUNT}", [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("#{Base64.strict_encode64(payload)}"))); $v.Add($c))
        _, _, status = Open3.capture3("powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script)
        if !status.success?
          Open3.capture3("cmdkey", "/generic:#{KEYCHAIN_SERVICE}:#{KEYCHAIN_ACCOUNT}", "/user:#{KEYCHAIN_ACCOUNT}", "/pass:#{payload}")
        end
        return true
      else
        FileUtils.mkdir_p(File.dirname(KEYCHAIN_FALLBACK_FILE))
        File.write(KEYCHAIN_FALLBACK_FILE, payload, perm: 0600)
        return true
      end
    rescue StandardError => e
      raise "Failed to write credentials: #{e.message}"
    end

    def delete_keychain
      if darwin?
        Open3.capture3("security", "delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT)
      elsif linux?
        if has_secret_tool?
          Open3.capture3("secret-tool", "clear", "service", KEYCHAIN_SERVICE, "username", KEYCHAIN_ACCOUNT)
        end
      elsif windows?
        Open3.capture3("cmdkey", "/delete:#{KEYCHAIN_SERVICE}:#{KEYCHAIN_ACCOUNT}") rescue nil
      end
      File.delete(KEYCHAIN_FALLBACK_FILE) if File.exist?(KEYCHAIN_FALLBACK_FILE)
    rescue StandardError
      nil
    end

    def export_accounts(dest_file = nil)
      dest_file ||= File.expand_path("zerog-accounts.json")

      accounts = list_accounts.map(&:to_h)
      export_bundle = {
        "version" => VERSION,
        "exported_at" => Time.now.utc.iso8601,
        "platform" => RUBY_PLATFORM,
        "active_account" => @config.active_account,
        "config" => @config.data,
        "accounts" => accounts
      }

      File.write(dest_file, JSON.pretty_generate(export_bundle))
      File.chmod(0600, dest_file) rescue nil
      dest_file
    end

    def import_accounts(src_file)
      raise "File not found: #{src_file}" unless File.exist?(src_file)

      raw = File.read(src_file)
      data = JSON.parse(raw)
      accounts_data = data["accounts"] || []

      imported_count = 0
      accounts_data.each do |acc_hash|
        acc = Account.from_h(acc_hash)
        acc.reset_cooldown
        save_account(acc)
        imported_count += 1
      end

      if data["config"].is_a?(Hash)
        data["config"].each do |k, v|
          @config[k] = v unless k == "active_account"
        end
      end

      target_id = data["active_account"] || accounts_data.first&.dig("id")
      if target_id && find_account(target_id)
        begin
          activate_account(target_id)
        rescue StandardError => e
          @config.active_account = target_id
        end
      end

      log_event("IMPORT", "Imported #{imported_count} accounts from #{src_file}")
      { count: imported_count, active_account: @config.active_account }
    end

    def parse_keychain_payload(payload)
      return {} unless payload && payload.start_with?("go-keyring-base64:")

      b64 = payload.sub(/^go-keyring-base64:/, "")
      parsed = JSON.parse(Base64.decode64(b64))

      email = nil
      if parsed["id_token"]
        parts = parsed["id_token"].split(".")
        if parts.size >= 2
          pad = "=" * ((4 - parts[1].length % 4) % 4)
          body = JSON.parse(Base64.decode64(parts[1] + pad))
          email = body["email"]
        end
      end

      {
        email: email,
        token: parsed["token"],
        auth_method: parsed["auth_method"]
      }
    rescue StandardError
      {}
    end

    def log_event(type, message)
      entry = {
        timestamp: Time.now.utc.iso8601,
        type: type,
        message: message
      }
      File.open(Config.events_path, "a") do |f|
        f.puts(entry.to_json)
      end
    rescue StandardError
      # ignore
    end

    def read_events(limit = 50)
      return [] unless File.exist?(Config.events_path)
      lines = File.readlines(Config.events_path).last(limit)
      lines.map do |line|
        JSON.parse(line) rescue nil
      end.compact.reverse
    rescue StandardError
      []
    end

    private

    def ensure_auto_import
      return unless list_accounts.empty?

      raw = read_keychain
      return unless raw && !raw.empty?

      info = parse_keychain_payload(raw)
      email = info[:email] || "default@antigravity.google"
      acc = Account.new(
        id: "default",
        name: "Default Account (#{email.split('@').first})",
        email: email,
        type: "google",
        status: "active",
        priority: 1,
        data: {
          "keyring_payload" => raw,
          "username" => email
        }
      )
      save_account(acc)
      @config.active_account = acc.id
      log_event("INIT", "Auto-discovered and imported primary account '#{acc.id}' (#{email})")
    end

    def update_app_storage(username)
      return unless File.exist?(APP_STORAGE_PATH)
      data = JSON.parse(File.read(APP_STORAGE_PATH)) rescue {}
      data["jetski.onboarding.lastLoginUsername"] = username if username
      File.write(APP_STORAGE_PATH, JSON.pretty_generate(data))
    rescue StandardError
      # non-fatal
    end

    def update_gemini_settings(is_gemini_api_key)
      return unless File.exist?(SETTINGS_PATH)
      data = JSON.parse(File.read(SETTINGS_PATH)) rescue {}
      if is_gemini_api_key
        data["modelProvider"] = "gemini"
      else
        data.delete("modelProvider")
      end
      File.write(SETTINGS_PATH, JSON.pretty_generate(data))
    rescue StandardError
      # non-fatal
    end
  end
end

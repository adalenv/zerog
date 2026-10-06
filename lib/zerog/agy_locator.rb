# frozen_string_literal: true

require "open3"

module ZeroG
  class AgyLocator
    COMMON_SEARCH_PATHS = [
      "~/.local/bin/agy",
      "~/.gemini/antigravity-cli/bin/agy",
      "~/bin/agy",
      "/opt/homebrew/bin/agy",
      "/usr/local/bin/agy",
      "/usr/bin/agy",
      "/bin/agy",
      "/snap/bin/agy",
      "%LOCALAPPDATA%/Programs/Antigravity/agy.exe",
      "%APPDATA%/npm/agy.cmd",
      "~/.local/bin/agy.exe",
      "C:/Program Files/Antigravity/agy.exe"
    ].freeze

    class << self
      def find(config = nil)
        # 1. Environment variable override
        if ENV["AGY_PATH"] && !ENV["AGY_PATH"].empty?
          path = File.expand_path(ENV["AGY_PATH"])
          return path if File.executable?(path)
        end

        # 2. Config file override
        if config && config["agy_path"] && !config["agy_path"].to_s.empty?
          path = File.expand_path(config["agy_path"])
          return path if File.executable?(path)
        end

        # 3. Dynamic PATH resolution (which on Unix, where on Windows)
        which_cmd = RUBY_PLATFORM =~ /mswin|mingw/ ? "where" : "which"
        out, _, status = Open3.capture3(which_cmd, "agy")
        if status.success? && !out.strip.empty?
          resolved = out.strip.lines.first.to_s.strip
          return resolved if !resolved.empty? && File.executable?(resolved)
        end

        # 4. Search known common installation directories
        COMMON_SEARCH_PATHS.each do |candidate|
          expanded = expand_candidate(candidate)
          return expanded if expanded && File.executable?(expanded)
        end

        # 5. Wildcard search in ~/.gemini tree
        gemini_dir = File.expand_path("~/.gemini")
        if Dir.exist?(gemini_dir)
          Dir.glob(File.join(gemini_dir, "**/agy")).each do |f|
            return f if File.file?(f) && File.executable?(f)
          end
        end

        nil
      end

      def find!(config = nil)
        path = find(config)
        return path if path

        warn "\e[31m[zerog] Error: Antigravity CLI ('agy') binary was not found.\e[0m"
        warn "\nzerog searched the following locations:"
        warn "  • Current PATH ($PATH)"
        COMMON_SEARCH_PATHS.each do |p|
          expanded = expand_candidate(p)
          warn "  • #{expanded || p}"
        end
        warn "\nPlease ensure agy is installed: https://antigravity.google/docs/cli/install"
        warn "Or point zerog directly to your agy binary:"
        warn "  zerog config agy_path /path/to/agy"
        warn "  or export AGY_PATH=/path/to/agy\n"
        exit 1
      end

      private

      def expand_candidate(path)
        # Resolve Windows environment variables if present (e.g. %LOCALAPPDATA%)
        resolved = path.gsub(/%([^%]+)%/) { ENV[$1] || "" }
        return nil if resolved.include?("%") || resolved.empty?

        File.expand_path(resolved)
      rescue StandardError
        nil
      end
    end
  end
end

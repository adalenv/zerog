# frozen_string_literal: true

require_relative "zerog/version"
require_relative "zerog/config"
require_relative "zerog/agy_locator"
require_relative "zerog/account"
require_relative "zerog/account_manager"
require_relative "zerog/quota_detector"
require_relative "zerog/notifier"
require_relative "zerog/runner"
require_relative "zerog/daemon"
require_relative "zerog/web_server"

# Backward compatibility alias
AgyPool = ZeroG

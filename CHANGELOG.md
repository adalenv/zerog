# Changelog

All notable changes to **zerog** will be documented in this file.

## [1.0.0] - 2026-10-07

### Added
- **Direct Antigravity Execution**: Running `zerog` directly executes `agy` with transparent multi-account rotation.
- **Dynamic Binary Discovery (`AgyLocator`)**: Automatically searches PATH, `~/.local/bin`, `/opt/homebrew/bin`, `~/.gemini`, and system directories for `agy`. Supports manual overrides via `AGY_PATH` environment variable or `zerog config agy_path`.
- **Intelligent Quota Detection**: Detects HTTP 429, gRPC `RESOURCE_EXHAUSTED`, `quota_manager.go` log lines, and exit code 3.
- **Auto-Failover with Zero Context Loss**: Swaps credentials in macOS Keychain or settings, and resumes automatically with `--continue`.
- **Anti-Looping & Auto-Continue**: Stops rotation when all accounts are in cooldown; displays a live countdown and automatically resumes execution the moment quota is restored.
- **Cross-Platform Keychain Support**: Supports macOS Keychain (`security`), Linux Secret Service (`secret-tool` and fallback), and Windows Credential Manager (`wincred`).
- **Account Portability (`zerog export` & `zerog import`)**: Export and import account pools between machines without re-authenticating in a browser.
- **Real-Time Visual Web Dashboard**: Embedded local web UI on `http://localhost:7890` for monitoring account health, switching active accounts, and reviewing rotation events.
- **Multi-Account Pool Management**: Supports multiple Google accounts (browser OAuth) and Gemini API keys.
- **One-Command Installer**: `install.sh` and `uninstall.sh` for easy installation.

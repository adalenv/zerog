# zerog

Account switcher for Google Antigravity CLI (`agy`). When your active account hits quota limits or rate limits (HTTP 429), `zerog` switches to the next account in your pool and resumes the session with `--continue`.

## Install

```bash
npm install -g zerog
```

Or run directly without installing:

```bash
npx zerog
```

If `agy` is not already installed, `zerog` installs it automatically.

## Quick Start

1. Add accounts to your pool:

```bash
# Add a Google account (opens browser to sign in)
zerog login personal

# Or add a Gemini API key
zerog add-key my-key AIzaSy...
```

2. Run `zerog` instead of `agy`:

```bash
# Interactive session (auto-rotates accounts when quota runs out)
zerog

# Single prompt
zerog -p "Fix the login bug"
```

All standard `agy` flags and arguments work as expected.

## Commands

| Command | Description |
|---|---|
| `zerog` | Run `agy` with automatic account rotation |
| `zerog accounts` | List accounts, priority, and cooldown status |
| `zerog login <id>` | Sign into a Google account via browser |
| `zerog add-key <id> <key>` | Add a Gemini API key |
| `zerog use <id>` | Manually switch active account |
| `zerog test <id>` | Verify account authentication with agy |
| `zerog reset-cooldown <id>` | Clear cooldown for an account |
| `zerog delete <id>` | Remove an account from pool |
| `zerog export [file]` | Export pool to JSON |
| `zerog import <file>` | Import pool from JSON |
| `zerog web` | Open local web dashboard (`http://localhost:7890`) |

## Configuration

Settings are stored in `~/.zerog/config.json`:

```bash
# Switch strategy: "priority" or "round_robin"
zerog config switch_strategy round_robin

# Default cooldown duration (minutes)
zerog config cooldown_minutes 60

# Custom agy binary path
zerog config agy_path /path/to/agy
```

## License

MIT

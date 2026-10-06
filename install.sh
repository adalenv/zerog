#!/usr/bin/env bash
# ==============================================================================
# zerog Installer
# Installs zerog CLI with automatic agy path discovery
# ==============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}${CYAN}"
echo "  ______                _____ "
echo " |___  /               |  __ \\"
echo "    / / ___ _ __ ___   | |  \\/ "
echo "   / / / _ \\ '__/ _ \\  | | __ "
echo " ./ /_|  __/ | | (_) | | |_\ \\"
echo " \\_____|\\___|_|  \\___/  \\____/"
echo -e "${NC}"
echo -e "${BOLD}Installing zerog — Antigravity CLI Account Auto-Switcher...${NC}\n"

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js is required but was not found on your system.${NC}"
  echo "Please install Node.js (>= 16):"
  echo "  macOS:  'brew install node'"
  echo "  Ubuntu/Debian: 'sudo apt update && sudo apt install nodejs npm'"
  echo "  Fedora: 'sudo dnf install nodejs'"
  echo "  Arch:   'sudo pacman -S nodejs npm'"
  echo "  Windows: https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v)
echo -e "✓ Found Node.js ${GREEN}${NODE_VER}${NC}"

# 2. Check for agy (Antigravity CLI)
AGY_FOUND=""
if command -v agy >/dev/null 2>&1; then
  AGY_FOUND=$(command -v agy)
elif [ -x "$HOME/.local/bin/agy" ]; then
  AGY_FOUND="$HOME/.local/bin/agy"
elif [ -x "/opt/homebrew/bin/agy" ]; then
  AGY_FOUND="/opt/homebrew/bin/agy"
elif [ -x "/usr/local/bin/agy" ]; then
  AGY_FOUND="/usr/local/bin/agy"
elif [ -x "$HOME/.gemini/antigravity-cli/bin/agy" ]; then
  AGY_FOUND="$HOME/.gemini/antigravity-cli/bin/agy"
fi

if [ -n "$AGY_FOUND" ]; then
  echo -e "✓ Discovered Antigravity CLI (agy) at: ${CYAN}${AGY_FOUND}${NC}"
else
  echo -e "${YELLOW}[! NOTICE] 'agy' binary not immediately found in common paths.${NC}"
  echo "  zerog will auto-detect it at runtime, or you can configure it via:"
  echo "  zerog config agy_path /path/to/agy"
fi

# 3. Determine repository directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_SRC="${SCRIPT_DIR}/bin/zerog.js"

if [ ! -f "${BIN_SRC}" ]; then
  echo -e "${RED}[ERROR] Cannot find bin/zerog.js at ${BIN_SRC}${NC}"
  exit 1
fi

chmod +x "${BIN_SRC}"

# 4. Target install directory
TARGET_DIR="${HOME}/.local/bin"
mkdir -p "${TARGET_DIR}"

TARGET_LINK="${TARGET_DIR}/zerog"
ln -sf "${BIN_SRC}" "${TARGET_LINK}"
echo -e "✓ Linked executable: ${GREEN}${TARGET_LINK}${NC} -> ${BIN_SRC}"

# 5. Check PATH
case ":$PATH:" in
  *":${TARGET_DIR}:"*)
    PATH_OK=1
    ;;
  *)
    PATH_OK=0
    ;;
esac

echo ""
if [ "$PATH_OK" -eq 1 ]; then
  echo -e "${GREEN}${BOLD}✓ Installation successful!${NC}"
  echo -e "You can now run '${CYAN}zerog${NC}' from any directory."
else
  echo -e "${YELLOW}${BOLD}✓ Installed to ${TARGET_DIR}/zerog, but this directory is not in your PATH.${NC}"
  echo "Add the following line to your shell configuration file (~/.zshrc or ~/.bashrc):"
  echo -e "${CYAN}  export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
  echo "Then run: source ~/.zshrc (or source ~/.bashrc)"
fi

echo ""
echo -e "${BOLD}Quick Start:${NC}"
echo "  zerog                 # Launch agy with auto-rotating accounts"
echo "  zerog accounts        # View configured account pool"
echo "  zerog login <id>      # Add a Google account to the pool"
echo "  zerog add-key <id>    # Add a Gemini API key profile"
echo "  zerog status          # Inspect pool health and agy binary path"
echo "  zerog web             # Launch real-time visual web dashboard"
echo ""

#!/usr/bin/env bash
# ==============================================================================
# zerog Uninstaller
# ==============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

TARGET_LINK="${HOME}/.local/bin/zerog"

echo -e "${BOLD}Uninstalling zerog...${NC}"

if [ -L "${TARGET_LINK}" ] || [ -f "${TARGET_LINK}" ]; then
  rm -f "${TARGET_LINK}"
  echo -e "✓ Removed symlink at ${GREEN}${TARGET_LINK}${NC}"
else
  echo "Symlink at ${TARGET_LINK} was not found."
fi

echo ""
echo -e "${YELLOW}Your accounts and configurations in ~/.zerog were preserved.${NC}"
echo "To also delete all account credentials and history, run:"
echo "  rm -rf ~/.zerog"
echo ""
echo -e "${GREEN}✓ Uninstallation complete.${NC}"

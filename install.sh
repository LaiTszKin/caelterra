#!/usr/bin/env bash
#
# Caelterra — Hermes plugin installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/LaiTszKin/caelterra/main/install.sh | bash
#
# Requires: git, hermes
set -euo pipefail

PLUGIN_REF="LaiTszKin/caelterra"

# ── Colour helpers ──────────────────────────────────────────────────
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m"
INFO="${BOLD}ℹ${NC}"
OK="${GREEN}✓${NC}"
WARN="${YELLOW}⚠${NC}"
ERR="${RED}✗${NC}"

echo ""
echo "  ⚡ Installing Caelterra..."
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 1: Check prerequisites ────────────────────────────────────
echo -e "  ${INFO} Checking prerequisites..."

if ! command -v hermes &>/dev/null; then
    echo -e "  ${ERR} 'hermes' CLI not found."
    echo ""
    echo "    Install Hermes first:"
    echo "      curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash"
    echo ""
    exit 1
fi
echo -e "  ${OK} Hermes found: $(hermes --version 2>/dev/null || echo 'installed')"

if ! command -v git &>/dev/null; then
    echo -e "  ${ERR} 'git' not found. Please install git first."
    exit 1
fi
echo -e "  ${OK} Git found: $(git --version)"

echo ""

# ── Step 2: Install plugin via Hermes (GitHub) ─────────────────────
echo -e "  ${INFO} Installing plugin..."
echo ""

if hermes plugins install "$PLUGIN_REF"; then
    echo ""
    echo -e "  ${OK} Plugin installed via GitHub"
else
    echo ""
    echo -e "  ${ERR} Plugin installation failed."
    echo ""
    echo "    Try manually:"
    echo "      hermes plugins install ${PLUGIN_REF}"
    echo ""
    exit 1
fi

# ── Step 3: Run Caelterra setup ─────────────────────────────────────
echo ""
echo -e "  ${INFO} Running Caelterra setup..."
echo ""

if hermes caelterra setup; then
    echo ""
    echo -e "  ${OK} Setup complete"
else
    echo ""
    echo -e "  ${WARN} Setup encountered issues."
    echo "    You can re-run it later:"
    echo "      hermes caelterra setup"
fi

echo ""
echo "  ───────────────────────────────────────────────────────────"
echo ""
echo -e "  ${OK} ${BOLD}Caelterra installation complete!${NC}"
echo ""
echo "    Start a session:     hermes -p caelterra"
echo "    Run setup:           hermes caelterra setup"
echo "    Check for updates:   hermes caelterra update --check"
echo "    Update plugin:       hermes caelterra update"
echo "    Load a skill:        skill_view('optimise-skill')"
echo ""

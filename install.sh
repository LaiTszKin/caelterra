#!/usr/bin/env bash
#
# Caelterra — Hermes plugin installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/LaiTszKin/caelterra/main/install.sh | bash
#
# What it does:
#   1. Checks that Hermes is installed
#   2. Clones the Caelterra repo to ~/.hermes/profiles/caelterra/plugins/caelterra/
#   3. Enables the plugin via 'hermes plugins install'
#   4. Runs 'hermes caelterra setup' to configure profile, SOUL.md, and skills
#
# Requires: git, hermes
set -euo pipefail

PLUGIN_NAME="caelterra"
REPO_URL="https://github.com/LaiTszKin/caelterra.git"

# ── Colour helpers ──────────────────────────────────────────────────
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m" # No Colour
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

# ── Step 2: Determine install path ──────────────────────────────────
# Best practice: install into the user's default profile plugins dir
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
INSTALL_DIR="${HERMES_HOME}/plugins/${PLUGIN_NAME}"

# If running under a profile, try the profile's plugin dir first
if [ -n "${HERMES_HOME_PLUGINS:-}" ]; then
    INSTALL_DIR="${HERMES_HOME_PLUGINS}/${PLUGIN_NAME}"
elif [ -d "${HERMES_HOME}/profiles" ]; then
    # Check if there's an active profile
    ACTIVE_PROFILE=$(hermes config get profile.active 2>/dev/null || echo "")
    if [ -n "$ACTIVE_PROFILE" ] && [ "$ACTIVE_PROFILE" != "default" ]; then
        INSTALL_DIR="${HERMES_HOME}/profiles/${ACTIVE_PROFILE}/plugins/${PLUGIN_NAME}"
    fi
fi

# ── Step 3: Clone or update the repository ─────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "  ${INFO} Caelterra already installed at ${INSTALL_DIR}"
    echo -e "  ${INFO} Updating..."
    (cd "$INSTALL_DIR" && git pull --ff-only origin main)
    echo -e "  ${OK} Updated to latest version"
else
    echo -e "  ${INFO} Installing to ${INSTALL_DIR}..."
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    echo -e "  ${OK} Repository cloned"
fi

echo ""

# ── Step 4: Register with Hermes ───────────────────────────────────
echo -e "  ${INFO} Registering plugin with Hermes..."

# Try 'hermes plugins install' first (path-based)
if hermes plugins install "$INSTALL_DIR" 2>/dev/null; then
    echo -e "  ${OK} Plugin registered via 'hermes plugins install'"
elif hermes plugins add "$INSTALL_DIR" 2>/dev/null; then
    echo -e "  ${OK} Plugin registered via 'hermes plugins add'"
else
    echo -e "  ${WARN} Could not auto-register plugin."
    echo "    You may need to run manually:"
    echo "      hermes plugins install ${INSTALL_DIR}"
    echo "      # or: hermes plugins add ${INSTALL_DIR}"
fi

echo ""

# ── Step 5: Run setup ──────────────────────────────────────────────
echo -e "  ${INFO} Running Caelterra setup..."
cd "$INSTALL_DIR" && hermes caelterra setup 2>/dev/null || {
    echo -e "  ${WARN} Could not run setup automatically."
    echo "    Run it manually after restarting Hermes:"
    echo "      hermes caelterra setup"
}

echo ""
echo -e "  ${OK} ${BOLD}Caelterra installation complete!${NC}"
echo ""
echo "  ───────────────────────────────────────────────────────────"
echo ""
echo "    Start a session:    hermes -p caelterra"
echo "    Run setup:          hermes caelterra setup"
echo "    Check for updates:  hermes caelterra update --check"
echo "    Update plugin:      hermes caelterra update"
echo ""
echo "    Load a skill:       skill_view('optimise-skill')"
echo ""

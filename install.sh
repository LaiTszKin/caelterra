#!/usr/bin/env bash
#
# Caelterra — Hermes plugin installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/LaiTszKin/caelterra/main/install.sh | bash
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
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"

# Install under the global plugins dir (auto-discovered by Hermes)
INSTALL_DIR="${HERMES_HOME}/plugins/${PLUGIN_NAME}"
PARENT_DIR="${HERMES_HOME}/plugins"

# ── Step 3: Clone or update the repository ─────────────────────────
mkdir -p "$PARENT_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "  ${INFO} Caelterra already installed at ${INSTALL_DIR}"
    echo -e "  ${INFO} Updating..."
    (cd "$INSTALL_DIR" && git pull --ff-only origin main)
    echo -e "  ${OK} Updated to latest version"
else
    if [ -d "$INSTALL_DIR" ]; then
        # Directory exists but isn't a git repo — clean it out
        rm -rf "$INSTALL_DIR"
    fi
    echo -e "  ${INFO} Installing to ${INSTALL_DIR}..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    echo -e "  ${OK} Repository cloned"
fi

echo ""

# ── Step 4: Register with Hermes ───────────────────────────────────
echo -e "  ${INFO} Registering plugin with Hermes..."

# Use a relative path to avoid Hermes misparsing the absolute path
# as a GitHub org/repo reference.
if (cd "$PARENT_DIR" && hermes plugins install "$PLUGIN_NAME" 2>/dev/null); then
    echo -e "  ${OK} Plugin registered via 'hermes plugins install'"
else
    # Fallback: add the absolute path as a local plugin
    echo -e "  ${WARN} Auto-registration not supported on this Hermes version."
    echo "    The plugin is installed at:"
    echo "      ${INSTALL_DIR}"
    echo ""
    echo "    If Hermes doesn't detect it automatically on next startup, run:"
    echo "      hermes plugins install ${INSTALL_DIR}"
fi

echo ""

# ── Step 5: Run setup steps directly ───────────────────────────────
echo -e "  ${INFO} Setting up Caelterra..."
echo ""

# Profile
PROFILE_NAME="caelterra"
PROFILE_DIR="${HERMES_HOME}/profiles/${PROFILE_NAME}"
if [ ! -d "$PROFILE_DIR" ]; then
    echo -e "  ${INFO} Creating profile '${PROFILE_NAME}'..."
    if hermes profile create "$PROFILE_NAME" 2>/dev/null; then
        echo -e "  ${OK} Profile '${PROFILE_NAME}' created"
    else
        echo -e "  ${WARN} Could not create profile automatically."
        echo "    Manual: hermes profile create ${PROFILE_NAME}"
    fi
else
    echo -e "  ${OK} Profile '${PROFILE_NAME}' already exists"
fi

# SOUL.md
echo -e "  ${INFO} Writing SOUL.md..."
if [ -f "$INSTALL_DIR/SOUL.md" ]; then
    mkdir -p "$PROFILE_DIR"
    cp "$INSTALL_DIR/SOUL.md" "$PROFILE_DIR/SOUL.md"
    echo -e "  ${OK} SOUL.md written to ${PROFILE_DIR}/SOUL.md"
fi

# Bundled skills
echo -e "  ${INFO} Installing bundled skills..."
SKILLS_SRC="$INSTALL_DIR/skills"
SKILLS_DST="${HERMES_HOME}/skills"
if [ -d "$SKILLS_SRC" ]; then
    for skill_dir in "$SKILLS_SRC"/*/; do
        skill_name="$(basename "$skill_dir")"
        if [ -f "${skill_dir}SKILL.md" ]; then
            mkdir -p "${SKILLS_DST}/${skill_name}"
            cp "${skill_dir}SKILL.md" "${SKILLS_DST}/${skill_name}/SKILL.md"
            echo -e "  ${OK} Skill '${skill_name}' installed"
        fi
    done
fi

echo ""
echo "  ───────────────────────────────────────────────────────────"
echo ""
echo -e "  ${OK} ${BOLD}Caelterra installation complete!${NC}"
echo ""
echo "    Next steps:"
echo "      1. Restart Hermes (or start a new session)"
echo "      2. Run setup:"
echo "         hermes caelterra setup"
echo ""
echo "    Or skip restart and use the profile directly:"
echo "         hermes -p caelterra"
echo ""
echo "    Commands:"
echo "         hermes caelterra setup              # configure profile & skills"
echo "         hermes caelterra update --check     # check for updates"
echo "         hermes caelterra update             # update plugin"
echo "         skill_view('optimise-skill')        # load a skill"
echo ""

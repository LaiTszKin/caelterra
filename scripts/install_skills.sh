#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<"USAGE"
Usage:
  ./scripts/install_skills.sh [install] [codex|openclaw|trae|agents|claude-code|all]...
  ./scripts/install_skills.sh uninstall [codex|openclaw|trae|agents|claude-code|all]...

Modes:
  codex       Copy skills into ~/.codex/skills (includes ./codex/ agent-specific skills)
  openclaw    Copy skills into ~/.openclaw/workspace*/skills
  trae        Copy skills into ~/.trae/skills
  agents      Copy skills into ~/.agents/skills (for agent-skill-compatible software)
  claude-code Copy skills into ~/.claude/skills
  all         Install all supported targets

Options:
  --symlink   Install skills as symlinks (recommended; auto-update via git pull)
  --copy      Install skills as file copies (manual reinstall for updates)

Optional environment overrides:
  CODEX_SKILLS_DIR    Override codex skills destination path
  OPENCLAW_HOME       Override openclaw home path
  TRAE_SKILLS_DIR     Override trae skills destination path
  AGENTS_SKILLS_DIR   Override agents skills destination path
  CLAUDE_CODE_SKILLS_DIR Override claude-code skills destination path
  APOLLO_TOOLKIT_HOME  Override local install path used in curl/pipe mode
  APOLLO_TOOLKIT_REPO_URL Override git repository URL used in curl/pipe mode
USAGE
}

SCRIPT_SOURCE="${BASH_SOURCE[0]-}"
TOOLKIT_REPO_URL="${APOLLO_TOOLKIT_REPO_URL:-https://github.com/LaiTszKin/apollo-toolkit.git}"
MANIFEST_FILENAME=".apollo-toolkit-manifest.json"
LINK_MODE=""

expand_user_path() {
  local raw_path="${1-}"

  case "$raw_path" in
    "~")
      printf '%s\n' "$HOME"
      ;;
    "~/"*)
      printf '%s\n' "$HOME/${raw_path#~/}"
      ;;
    *)
      printf '%s\n' "$raw_path"
      ;;
  esac
}

TOOLKIT_HOME="$(expand_user_path "${APOLLO_TOOLKIT_HOME:-$HOME/.apollo-toolkit}")"

show_banner() {
  cat <<'BANNER'
+------------------------------------------+
|              Apollo Toolkit              |
|      npm installer and skill copier      |
+------------------------------------------+
BANNER
}

bootstrap_repo_if_needed() {
  if [[ -d "$TOOLKIT_HOME/.git" ]]; then
    git -C "$TOOLKIT_HOME" pull --ff-only >/dev/null
  else
    rm -rf "$TOOLKIT_HOME"
    git clone --depth 1 "$TOOLKIT_REPO_URL" "$TOOLKIT_HOME" >/dev/null
  fi
}

if [[ -n "$SCRIPT_SOURCE" && -f "$SCRIPT_SOURCE" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  # curl/pipe mode: use current directory only when it looks like this repo.
  if [[ -f "$PWD/package.json" ]] && find "$PWD/skills" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/SKILL.md' ';' -print -quit 2>/dev/null | grep -q .; then
    REPO_ROOT="$PWD"
  else
    bootstrap_repo_if_needed
    REPO_ROOT="$TOOLKIT_HOME"
  fi
  SCRIPT_DIR="$REPO_ROOT/scripts"
fi

# ---- State variables ----
SELECTED_MODES=()
SHARED_SKILL_PATHS=()
CODEX_SKILL_PATHS=()

# ---- Skill collection ----

collect_skills() {
  local dir
  SHARED_SKILL_PATHS=()
  CODEX_SKILL_PATHS=()
  while IFS= read -r dir; do
    if [[ -f "$dir/SKILL.md" ]]; then
      SHARED_SKILL_PATHS+=("$dir")
    fi
  done < <(find "$REPO_ROOT/skills" -mindepth 1 -maxdepth 1 -type d | sort)

  if [[ " ${SELECTED_MODES[*]} " =~ " codex " ]]; then
    local codex_dir="$REPO_ROOT/codex"
    if [[ -d "$codex_dir" ]]; then
      while IFS= read -r dir; do
        if [[ -f "$dir/SKILL.md" ]]; then
          CODEX_SKILL_PATHS+=("$dir")
        fi
      done < <(find "$codex_dir" -mindepth 1 -maxdepth 1 -type d | sort)
    fi
  fi

  if [[ ${#SHARED_SKILL_PATHS[@]} -eq 0 ]]; then
    echo "No skill folders found in: $REPO_ROOT" >&2
    exit 1
  fi
}

# Get skill names from paths (basename only, deduplicated)
get_skill_names() {
  local -a paths=("$@")
  local -a names=()
  local name
  for path in "${paths[@]}"; do
    name="$(basename "$path")"
    names+=("$name")
  done
  printf '%s\n' "${names[@]}" | sort -u
}

# ---- Manifest management ----

read_manifest_skills() {
  local target_root="$1"
  local manifest_file="$target_root/$MANIFEST_FILENAME"
  if [[ -f "$manifest_file" ]]; then
    # Extract skill names from JSON manifest (historical + current, deduplicated)
    # Use python3 if available, otherwise fall back to simple grep
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "
import json, sys
try:
    with open('$manifest_file') as f:
        m = json.load(f)
    skills = set(m.get('historicalSkills', []) + m.get('skills', []))
    for s in sorted(skills):
        print(s)
except: pass
" 2>/dev/null || true
    else
      # Fallback: grep for skill names in JSON array
      grep -E '^\s*"' "$manifest_file" 2>/dev/null | \
        sed 's/.*"\([^"]*\)".*/\1/' | \
        grep -v 'version\|installedAt\|linkMode\|skills\|historicalSkills\|source' | \
        sort -u || true
    fi
  fi
}

write_manifest() {
  local target_root="$1"
  local version="${2:-unknown}"
  local link_mode="$3"
  shift 3
  local -a skill_names=("$@")

  local manifest_file="$target_root/$MANIFEST_FILENAME"

  # Read existing manifest for historical skills
  local -a historical_skills=()
  if [[ -f "$manifest_file" ]]; then
    while IFS= read -r name; do
      [[ -n "$name" ]] && historical_skills+=("$name")
    done < <(read_manifest_skills "$target_root")
  fi

  # Merge current + historical, deduplicate
  local -a merged=()
  local name
  for name in "${historical_skills[@]}" "${skill_names[@]}"; do
    merged+=("$name")
  done

  local -a all_skills_sorted
  while IFS= read -r name; do
    [[ -n "$name" ]] && all_skills_sorted+=("$name")
  done < <(printf '%s\n' "${merged[@]}" | sort -u)

  local now
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  # Write JSON manifest manually (no jq dependency)
  mkdir -p "$target_root"
  {
    printf '{\n'
    printf '  "version": "%s",\n' "$version"
    printf '  "installedAt": "%s",\n' "$now"
    printf '  "linkMode": "%s",\n' "$link_mode"
    printf '  "skills": [\n'
    local i=0
    for name in "${skill_names[@]}"; do
      if [[ $i -gt 0 ]]; then printf ',\n'; fi
      printf '    "%s"' "$name"
      i=$((i + 1))
    done
    printf '\n  ],\n'
    printf '  "historicalSkills": [\n'
    i=0
    for name in "${all_skills_sorted[@]}"; do
      if [[ $i -gt 0 ]]; then printf ',\n'; fi
      printf '    "%s"' "$name"
      i=$((i + 1))
    done
    printf '\n  ]\n'
    printf '}\n'
  } > "$manifest_file"
}

# List all known skill names (current + historical from all manifests, deduplicated)
list_all_known_skill_names() {
  local -a target_dirs=()
  local target_dir

  # Collect all potential target directories
  for mode in "${SELECTED_MODES[@]}"; do
    case "$mode" in
      codex) target_dirs+=("$(expand_user_path "${CODEX_SKILLS_DIR:-$HOME/.codex/skills}")") ;;
      trae) target_dirs+=("$(expand_user_path "${TRAE_SKILLS_DIR:-$HOME/.trae/skills}")") ;;
      agents) target_dirs+=("$(expand_user_path "${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}")") ;;
      claude-code) target_dirs+=("$(expand_user_path "${CLAUDE_CODE_SKILLS_DIR:-$HOME/.claude/skills}")") ;;
      openclaw)
        local openclaw_home oc_workspace
        openclaw_home="$(expand_user_path "${OPENCLAW_HOME:-$HOME/.openclaw}")"
        if [[ -d "$openclaw_home" ]]; then
          for oc_workspace in "$openclaw_home"/workspace*; do
            [[ -d "$oc_workspace/skills" ]] && target_dirs+=("$oc_workspace/skills")
          done
        fi
        ;;
    esac
  done

  local -a all_names=()

  # Current skill names from repo
  local name
  while IFS= read -r name; do
    [[ -n "$name" ]] && all_names+=("$name")
  done < <(get_skill_names "${SHARED_SKILL_PATHS[@]}" "${CODEX_SKILL_PATHS[@]}")

  # Historical from manifests
  for target_dir in "${target_dirs[@]}"; do
    while IFS= read -r name; do
      [[ -n "$name" ]] && all_names+=("$name")
    done < <(read_manifest_skills "$target_dir")
  done

  printf '%s\n' "${all_names[@]}" | sort -u
}

# ---- Install operations ----

replace_with_copy() {
  local src="$1"
  local target_root="$2"
  local name target

  name="$(basename "$src")"
  target="$target_root/$name"

  mkdir -p "$target_root"
  if [[ -e "$target" || -L "$target" ]]; then
    rm -rf "$target"
  fi
  cp -R "$src" "$target"
  echo "[copied] $src -> $target"
}

replace_with_symlink() {
  local src="$1"
  local target_root="$2"
  local name target

  name="$(basename "$src")"
  target="$target_root/$name"

  mkdir -p "$target_root"
  if [[ -e "$target" || -L "$target" ]]; then
    rm -rf "$target"
  fi
  ln -s "$src" "$target"
  echo "[symlink] $src -> $target"
}

do_replace() {
  if [[ "$LINK_MODE" == "symlink" ]]; then
    replace_with_symlink "$@"
  else
    replace_with_copy "$@"
  fi
}

install_codex() {
  local codex_skills_dir src
  codex_skills_dir="$(expand_user_path "${CODEX_SKILLS_DIR:-$HOME/.codex/skills}")"

  echo "Installing to codex: $codex_skills_dir (mode: $LINK_MODE)"
  local -a skill_names=()
  for src in "${SHARED_SKILL_PATHS[@]}" "${CODEX_SKILL_PATHS[@]}"; do
    do_replace "$src" "$codex_skills_dir"
    skill_names+=("$(basename "$src")")
  done
  write_manifest "$codex_skills_dir" "${VERSION:-unknown}" "$LINK_MODE" "${skill_names[@]}"
}

install_openclaw() {
  local openclaw_home workspace skills_dir src
  local -a workspaces

  openclaw_home="$(expand_user_path "${OPENCLAW_HOME:-$HOME/.openclaw}")"

  workspaces=()
  while IFS= read -r workspace; do
    workspaces+=("$workspace")
  done < <(find "$openclaw_home" -mindepth 1 -maxdepth 1 -type d -name 'workspace*' | sort)

  if [[ ${#workspaces[@]} -eq 0 ]]; then
    echo "No workspace directories found under: $openclaw_home" >&2
    exit 1
  fi

  for workspace in "${workspaces[@]}"; do
    skills_dir="$workspace/skills"
    echo "Installing to openclaw workspace: $skills_dir (mode: $LINK_MODE)"
    local -a skill_names=()
    for src in "${SHARED_SKILL_PATHS[@]}"; do
      do_replace "$src" "$skills_dir"
      skill_names+=("$(basename "$src")")
    done
    write_manifest "$skills_dir" "${VERSION:-unknown}" "$LINK_MODE" "${skill_names[@]}"
  done
}

install_trae() {
  local trae_skills_dir src
  trae_skills_dir="$(expand_user_path "${TRAE_SKILLS_DIR:-$HOME/.trae/skills}")"

  echo "Installing to trae: $trae_skills_dir (mode: $LINK_MODE)"
  local -a skill_names=()
  for src in "${SHARED_SKILL_PATHS[@]}"; do
    do_replace "$src" "$trae_skills_dir"
    skill_names+=("$(basename "$src")")
  done
  write_manifest "$trae_skills_dir" "${VERSION:-unknown}" "$LINK_MODE" "${skill_names[@]}"
}

install_agents() {
  local agents_skills_dir src
  agents_skills_dir="$(expand_user_path "${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}")"

  echo "Installing to agents: $agents_skills_dir (mode: $LINK_MODE)"
  local -a skill_names=()
  for src in "${SHARED_SKILL_PATHS[@]}"; do
    do_replace "$src" "$agents_skills_dir"
    skill_names+=("$(basename "$src")")
  done
  write_manifest "$agents_skills_dir" "${VERSION:-unknown}" "$LINK_MODE" "${skill_names[@]}"
}

install_claude_code() {
  local claude_code_skills_dir src
  claude_code_skills_dir="$(expand_user_path "${CLAUDE_CODE_SKILLS_DIR:-$HOME/.claude/skills}")"

  echo "Installing to claude-code: $claude_code_skills_dir (mode: $LINK_MODE)"
  local -a skill_names=()
  for src in "${SHARED_SKILL_PATHS[@]}"; do
    do_replace "$src" "$claude_code_skills_dir"
    skill_names+=("$(basename "$src")")
  done
  write_manifest "$claude_code_skills_dir" "${VERSION:-unknown}" "$LINK_MODE" "${skill_names[@]}"
}

# ---- Uninstall operations ----

uninstall_target() {
  local target_root="$1"
  local target_label="$2"

  local manifest_file="$target_root/$MANIFEST_FILENAME"
  if [[ ! -f "$manifest_file" ]]; then
    echo "[skip] No manifest found in: $target_root" >&2
    return
  fi

  local -a skills=()
  local name
  while IFS= read -r name; do
    [[ -n "$name" ]] && skills+=("$name")
  done < <(read_manifest_skills "$target_root")

  if [[ ${#skills[@]} -eq 0 ]]; then
    echo "[skip] No skills in manifest: $target_root" >&2
    rm -f "$manifest_file"
    return
  fi

  echo "Uninstalling from $target_label: $target_root"
  for name in "${skills[@]}"; do
    local skill_path="$target_root/$name"
    if [[ -e "$skill_path" || -L "$skill_path" ]]; then
      rm -rf "$skill_path"
      echo "  [removed] $skill_path"
    fi
  done

  rm -f "$manifest_file"
  echo "  [removed manifest] $manifest_file"
}

run_uninstall() {
  local mode

  if [[ ${#SELECTED_MODES[@]} -eq 0 ]]; then
    # Uninstall from all known targets
    SELECTED_MODES=(codex openclaw trae agents claude-code)
  fi

  echo "Uninstalling Apollo Toolkit skills..."
  echo "Target modes: ${SELECTED_MODES[*]}"
  echo

  # Show all known skills (current + historical, deduplicated)
  collect_skills
  echo "All known skills (current + historical):"
  list_all_known_skill_names | while read -r name; do
    [[ -n "$name" ]] && echo "  - $name"
  done
  echo

  for mode in "${SELECTED_MODES[@]}"; do
    case "$mode" in
      codex)
        local dir="$(expand_user_path "${CODEX_SKILLS_DIR:-$HOME/.codex/skills}")"
        uninstall_target "$dir" "codex"
        ;;
      openclaw)
        local openclaw_home oc_workspace
        openclaw_home="$(expand_user_path "${OPENCLAW_HOME:-$HOME/.openclaw}")"
        if [[ -d "$openclaw_home" ]]; then
          for oc_workspace in "$openclaw_home"/workspace*; do
            uninstall_target "$oc_workspace/skills" "openclaw"
          done
        fi
        ;;
      trae)
        local dir="$(expand_user_path "${TRAE_SKILLS_DIR:-$HOME/.trae/skills}")"
        uninstall_target "$dir" "trae"
        ;;
      agents)
        local dir="$(expand_user_path "${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}")"
        uninstall_target "$dir" "agents"
        ;;
      claude-code)
        local dir="$(expand_user_path "${CLAUDE_CODE_SKILLS_DIR:-$HOME/.claude/skills}")"
        uninstall_target "$dir" "claude-code"
        ;;
    esac
  done

  echo "Done."
}

# ---- Mode management ----

add_mode_once() {
  local mode="$1"
  local existing

  if [[ ${#SELECTED_MODES[@]} -gt 0 ]]; then
    for existing in "${SELECTED_MODES[@]}"; do
      if [[ "$existing" == "$mode" ]]; then
        return
      fi
    done
  fi
  SELECTED_MODES+=("$mode")
}

parse_mode() {
  local mode="$1"

  case "$mode" in
    codex|openclaw|trae|agents|claude-code)
      add_mode_once "$mode"
      ;;
    all)
      add_mode_once "codex"
      add_mode_once "openclaw"
      add_mode_once "trae"
      add_mode_once "agents"
      add_mode_once "claude-code"
      ;;
    *)
      echo "Invalid mode: $mode" >&2
      usage
      exit 1
      ;;
  esac
}

read_choice_from_user() {
  local prompt="$1"
  local result

  if [[ -t 0 ]]; then
    read -r -p "$prompt" result
  elif [[ -r /dev/tty ]]; then
    read -r -p "$prompt" result < /dev/tty
  else
    echo "Interactive input unavailable. Pass mode arguments (e.g. codex/openclaw/trae/agents/claude-code/all)." >&2
    exit 1
  fi

  printf '%s' "$result"
}

read_yes_no() {
  local prompt="$1"
  local default_yes="${2:-true}"
  local hint result

  if [[ "$default_yes" == "true" ]]; then
    hint="[Y/n]"
  else
    hint="[y/N]"
  fi

  result="$(read_choice_from_user "$prompt $hint ")"
  result="${result,,}"  # lowercase

  if [[ -z "$result" ]]; then
    if [[ "$default_yes" == "true" ]]; then
      return 0
    else
      return 1
    fi
  fi

  [[ "$result" == "y" || "$result" == "yes" ]]
}

# Prompt user to choose symlink or copy mode
prompt_link_mode() {
  echo
  echo "Symlink mode:"
  echo "  Pro: Skills auto-update when you 'git pull' in ~/.apollo-toolkit"
  echo "  Pro: No need to re-run installer after patch updates"
  echo "  Con: Changes pushed to the repo automatically reflect in your skills -"
  echo "       you may receive updates you did not intend to accept"
  echo

  if read_yes_no "Install skills as symlinks (recommended)?" "true"; then
    LINK_MODE="symlink"
  else
    LINK_MODE="copy"
  fi
  echo "Using: $LINK_MODE"
}

# Prompt whether to include codex-exclusive skills in non-codex targets
prompt_include_exclusive() {
  if [[ ${#CODEX_SKILL_PATHS[@]} -eq 0 ]]; then
    return
  fi

  local has_non_codex=false
  local mode
  for mode in "${SELECTED_MODES[@]}"; do
    if [[ "$mode" != "codex" ]]; then
      has_non_codex=true
      break
    fi
  done

  if [[ "$has_non_codex" != "true" ]]; then
    return
  fi

  local -a codex_only_names=()
  local codex_path name
  for codex_path in "${CODEX_SKILL_PATHS[@]}"; do
    name="$(basename "$codex_path")"
    codex_only_names+=("$name")
  done

  echo
  echo "Exclusive skills detected:"
  echo "  The following skills are exclusive to codex: ${codex_only_names[*]}"
  echo "  Your selected non-codex targets: $(printf '%s\n' "${SELECTED_MODES[@]}" | grep -v codex | tr '\n' ' ')"

  if read_yes_no "Install codex-exclusive skills to non-codex targets as well?" "false"; then
    # Add codex skills to shared paths so they get installed everywhere
    for codex_path in "${CODEX_SKILL_PATHS[@]}"; do
      SHARED_SKILL_PATHS+=("$codex_path")
    done
    echo "Will include codex-exclusive skills in all targets."
  fi
}

choose_modes_interactive() {
  local choice raw_choice
  local -a choices

  show_banner
  echo
  echo "Select install options (comma-separated):"
  echo "1) codex (~/.codex/skills, includes ./codex/ agent-specific skills)"
  echo "2) openclaw (~/.openclaw/workspace*/skills)"
  echo "3) trae (~/.trae/skills)"
  echo "4) agents (~/.agents/skills)"
  echo "5) claude-code (~/.claude/skills)"
  echo "6) all"
  choice="$(read_choice_from_user 'Enter choice(s) [1-6]: ')"

  IFS=',' read -r -a choices <<< "$choice"
  for raw_choice in "${choices[@]}"; do
    raw_choice="${raw_choice//[[:space:]]/}"
    case "$raw_choice" in
      1) add_mode_once "codex" ;;
      2) add_mode_once "openclaw" ;;
      3) add_mode_once "trae" ;;
      4) add_mode_once "agents" ;;
      5) add_mode_once "claude-code" ;;
      6) add_mode_once "codex"; add_mode_once "openclaw"; add_mode_once "trae"; add_mode_once "agents"; add_mode_once "claude-code" ;;
      *)
        echo "Invalid choice: $raw_choice" >&2
        exit 1
        ;;
    esac
  done

  if [[ ${#SELECTED_MODES[@]} -eq 0 ]]; then
    echo "No install option selected." >&2
    exit 1
  fi
}

resolve_modes() {
  local mode

  if [[ $# -eq 0 ]]; then
    choose_modes_interactive
    return
  fi

  for mode in "$@"; do
    parse_mode "$mode"
  done
}

# ---- Main ----

main() {
  local first_arg="${1:-}"

  if [[ "$first_arg" == "-h" || "$first_arg" == "--help" ]]; then
    usage
    exit 0
  fi

  # Parse --symlink / --copy flags
  local -a filtered_args=()
  for arg in "$@"; do
    case "$arg" in
      --symlink) LINK_MODE="symlink" ;;
      --copy) LINK_MODE="copy" ;;
      *) filtered_args+=("$arg") ;;
    esac
  done
  set -- "${filtered_args[@]}"

  first_arg="${1:-}"

  # Uninstall path
  if [[ "$first_arg" == "uninstall" ]]; then
    shift
    SELECTED_MODES=()
    if [[ $# -gt 0 ]]; then
      resolve_modes "$@"
    fi
    run_uninstall
    exit 0
  fi

  # Install path (default). Skip "install" verb if present.
  if [[ "$first_arg" == "install" ]]; then
    shift
  fi

  SELECTED_MODES=()
  resolve_modes "$@"
  collect_skills

  # Prompt for link mode if not set via CLI
  if [[ -z "$LINK_MODE" ]]; then
    prompt_link_mode
  fi

  # Prompt for exclusive skills inclusion
  prompt_include_exclusive

  # Show summary and confirm
  echo
  echo "Apollo Toolkit repo: $REPO_ROOT"
  echo "Install mode: $LINK_MODE"
  echo "Targets: ${SELECTED_MODES[*]}"
  echo

  for mode in "${SELECTED_MODES[@]}"; do
    case "$mode" in
      codex) install_codex ;;
      openclaw) install_openclaw ;;
      trae) install_trae ;;
      agents) install_agents ;;
      claude-code) install_claude_code ;;
      *)
        usage
        exit 1
        ;;
    esac
  done

  echo "Done."
}

main "$@"

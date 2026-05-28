# Apollo Toolkit Skills

A curated skill catalog for Codex, OpenClaw, Trae, Agents, and Claude Code with a managed installer that keeps the toolkit in `~/.apollo-toolkit` and copies each skill into the targets you choose.

## Included skills

- docs-project
- analyse-app-logs
- answering-questions-with-research
- archive
- cjk-pdf
- commit
- develop-new-features
- docs-to-voice
- document-vision-reader
- enhance-existing-features
- exam-pdf-workflow
- feature-propose
- financial-research
- spec
- implement
- plan
- improve-observability
- init-project-html
- katex
- learning-error-book
- maintain-project-constraints
- merge-changes-from-local-branches
- novel-to-short-video
- open-github-issue
- open-source-pr-workflow
- openai-text-to-image-storyboard
- optimise-skill
- read-github-issue
- record-spending
- resolve-review-comments
- qa
- review
- shadow-api-model-research
- ship-github-issue-fix
- fix
- systematic-debug
- test-case-strategy
- text-to-short-video
- update-project-html
- version-release
- video-production
- weekly-financial-event-report

## Install with npm or npx

### Recommended

```bash
npx @laitszkin/apollo-toolkit
```

The interactive installer:
- shows a branded `Apollo Toolkit` terminal welcome screen with a short staged reveal
- installs a managed copy into `~/.apollo-toolkit`
- lets you multi-select `codex`, `openclaw`, `trae`, `agents`, `claude-code`, or `all`
- asks whether to install skills as **symlinks** (recommended) or **file copies**
- lets you choose whether to include codex-exclusive skills in non-codex targets
- copies or symlinks `~/.apollo-toolkit/<skill>` into each selected target
- removes stale previously installed skill directories that existed in the previous installed version but no longer exist in the current package skill list
- replaces legacy symlink-based installs created by older Apollo Toolkit installers with real copied directories
- writes a manifest (`.apollo-toolkit-manifest.json`) per target for future uninstall and skill tracking

### Symlink vs Copy

| Mode | Pro | Con |
| --- | --- | --- |
| **Symlink** (recommended) | Auto-updates when you `git pull` in `~/.apollo-toolkit`; no need to re-run installer after patch updates | Changes pushed to the repo automatically reflect in your skills — you may receive updates you did not intend to accept |
| **Copy** | Stable snapshot; won't change until you re-run the installer | Must manually re-run `apltk` after each toolkit update to get the latest skills |

### Uninstall

```bash
apltk uninstall                    # Choose which agent targets to uninstall
apltk uninstall codex              # Remove only from codex
apltk uninstall codex agents --yes # Non-interactive cleanup for selected targets
```

The uninstall flow removes the manifest-tracked current and historical skill
directories for the selected targets, then removes each target manifest.

### Global install

```bash
npm i -g @laitszkin/apollo-toolkit
apltk
apollo-toolkit
```

Global install 後，`apltk` 與 `apollo-toolkit` 都會啟動同一個 Apollo Toolkit CLI。直接執行 `apltk` 會打開互動安裝頁，並在互動模式下先檢查 npm registry 是否有新版可用；若有，CLI 會先詢問，再自動執行全域更新。

除了安裝模式之外，`apltk` 也會把技能內常用腳本暴露成簡單 CLI 工具，例如：

```bash
apltk tools
apltk filter-logs app.log --start "2026-03-24T10:00:00Z"
apltk create-specs "Membership upgrade flow" --change-name membership-upgrade-flow
apltk open-github-issue --help

# Browse architecture HTML atlas and active-spec diffs
apltk architecture          # opens resources/project-architecture/index.html
apltk architecture diff     # paginates docs/plans/**/architecture_diff/ vs atlas
```

### Non-interactive install

```bash
npx @laitszkin/apollo-toolkit codex
npx @laitszkin/apollo-toolkit agents
npx @laitszkin/apollo-toolkit claude-code
npx @laitszkin/apollo-toolkit codex openclaw
npx @laitszkin/apollo-toolkit all
```

Add `--symlink` (recommended) or `--copy` to skip the interactive prompt:

```bash
npx @laitszkin/apollo-toolkit codex --symlink
npx @laitszkin/apollo-toolkit all --copy
```

### Optional overrides

```bash
APOLLO_TOOLKIT_HOME=~/custom-toolkit npx @laitszkin/apollo-toolkit codex
CODEX_SKILLS_DIR=~/custom-codex-skills npx @laitszkin/apollo-toolkit codex
OPENCLAW_HOME=~/.openclaw npx @laitszkin/apollo-toolkit openclaw
TRAE_SKILLS_DIR=~/.trae/skills npx @laitszkin/apollo-toolkit trae
AGENTS_SKILLS_DIR=~/.agents/skills npx @laitszkin/apollo-toolkit agents
CLAUDE_CODE_SKILLS_DIR=~/.claude/skills npx @laitszkin/apollo-toolkit claude-code
```

## Local installer scripts

Installers still live in `scripts/` for local repository usage and curl / iwr installation:

- macOS/Linux: `scripts/install_skills.sh`
- Windows (PowerShell): `scripts/install_skills.ps1`

### Local usage

```bash
./scripts/install_skills.sh
./scripts/install_skills.sh codex
./scripts/install_skills.sh codex --symlink
./scripts/install_skills.sh all --copy
./scripts/install_skills.sh uninstall
./scripts/install_skills.sh uninstall codex trae
```

```powershell
./scripts/install_skills.ps1
./scripts/install_skills.ps1 codex
./scripts/install_skills.ps1 agents --symlink
./scripts/install_skills.ps1 all --copy
./scripts/install_skills.ps1 uninstall
./scripts/install_skills.ps1 uninstall codex trae
```

### Curl / iwr one-liners

```bash
curl -fsSL https://raw.githubusercontent.com/LaiTszKin/apollo-toolkit/main/scripts/install_skills.sh | bash
curl -fsSL https://raw.githubusercontent.com/LaiTszKin/apollo-toolkit/main/scripts/install_skills.sh | bash -s -- codex --symlink
curl -fsSL https://raw.githubusercontent.com/LaiTszKin/apollo-toolkit/main/scripts/install_skills.sh | bash -s -- uninstall
```

```powershell
irm https://raw.githubusercontent.com/LaiTszKin/apollo-toolkit/main/scripts/install_skills.ps1 | iex
```

In curl / iwr mode, the scripts clone or update the managed toolkit copy under `~/.apollo-toolkit` by default. Override with `APOLLO_TOOLKIT_HOME` if you need a different location.

## External dependency skills

The install commands below were checked with the Skills CLI unless otherwise noted.

| Skill name | Used by | Author / producer | Install command / note |
| --- | --- | --- | --- |
| `pdf` | `exam-pdf-workflow`, `financial-research`, `learning-error-book`, `weekly-financial-event-report` | OpenAI (`openai/skills`) | `npx skills add openai/skills@pdf -g -y` |
| `spreadsheet` | `record-spending` | OpenAI (`openai/skills`) | `npx skills add openai/skills@spreadsheet -g -y` |
| `remotion-best-practices` | `novel-to-short-video`, `video-production` | Remotion (`remotion-dev/skills`) | `npx skills add remotion-dev/skills@remotion-best-practices -g -y` |
| `code-simplifier` | `open-source-pr-workflow` | Sentry (`getsentry/skills`) | `npx skills add getsentry/skills@code-simplifier -g -y` |

Compatibility note:

- `spec` is a local skill used by `develop-new-features` and `enhance-existing-features`, and it can produce either a single spec set under `docs/plans/{YYYY-MM-DD}/{change_name}/` or a coordinated parallel batch under `docs/plans/{YYYY-MM-DD}/{batch_name}/{change_name}/` with shared `coordination.md`.
- `plan` converts completed spec documents into a detailed execution plan (`PROMPT.md`) with dependency analysis, batch scheduling, and subagent routing. `implement` then reads `PROMPT.md` and executes mechanically without making its own coordination decisions.

- `read-github-issue` uses GitHub CLI (`gh`) directly for remote issue discovery and inspection, so it does not add any extra skill dependency.
- `review` is a local skill that reviews spec compliance of changes against governing planning documents, assessing business goals before secondary code-practice concerns. It outputs `REPORT.md` (issue list only, no solutions).
- `qa` reads `REPORT.md` and spec documents to generate `FIX.md` — a complete fix plan with dependency analysis and subagent routing. `fix` then reads `FIX.md` and executes mechanically.
- `update-project-html` is a local skill that depends on `init-project-html` for semantic rules and on the `apltk architecture` CLI to refresh the base atlas after code changes; for spec overlay diagrams use `spec-to-project-html` instead.


## Release publishing

GitHub Releases can publish the npm package automatically through npm Trusted Publishing.

Before the workflow can succeed, configure the npm package to trust this GitHub repository and the publish workflow. After that, creating a GitHub Release will trigger `.github/workflows/publish-npm.yml` and run `npm publish --provenance --access public`.

## Notes

- This repository is intended for personal toolkit curation and experimentation.
- Skill folders are stored as regular files, not git submodules.

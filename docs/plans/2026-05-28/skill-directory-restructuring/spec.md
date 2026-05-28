# Spec: 技能目錄重組

- Date: 2026-05-28
- Feature: 技能目錄重組
- Owner: [To be filled]

## Goal

將 repo 根目錄下 42 個技能目錄統一移至 `skills/` 子目錄，並更新安裝腳本的路徑搜尋邏輯，使技能組織結構清晰化。

## Scope

### In Scope
- 在 repo 根目錄建立 `skills/` 目錄
- 將 42 個含 `SKILL.md` 的技能目錄從根目錄移至 `skills/` 下
- 更新 `scripts/install_skills.sh` 的 `collect_skills()` 函數，將 `find "$REPO_ROOT" -mindepth 1 -maxdepth 1` 改為 `find "$REPO_ROOT/skills" -mindepth 1 -maxdepth 1`
- 更新 `scripts/install_skills.ps1` 的對應路徑邏輯
- 如有其他引用根目錄技能路徑的代碼（如 `lib/cli.ts`、`lib/installer.ts`），一併更新

### Out of Scope
- 修改技能的 SKILL.md 內容
- 修改技能的內部目錄結構
- 修改安裝腳本的安裝/卸載邏輯（僅改路徑）
- 修改 `codex/` 專屬技能的掃描邏輯（保留 `$REPO_ROOT/codex` 掃描）

## Functional Behaviors (BDD)

### Requirement 1: 技能目錄遷移
**GIVEN** repo 根目錄有 42 個含 SKILL.md 的技能目錄
**AND** `skills/` 目錄尚未存在
**WHEN** 執行遷移操作（建立 `skills/`，移動所有技能目錄至其下）
**THEN** `skills/` 目錄包含全部 42 個技能目錄
**AND** 根目錄不再遺留任何技能目錄
**AND** 非技能目錄（`bin/`, `dist/`, `docs/`, `lib/`, `resources/`, `scripts/`, `test/`, `node_modules/`）保持在原位

**Uncertainty Level**: Known

**Requirements**:
- [ ] R1.1 `skills/` 目錄存在於 repo 根目錄
- [ ] R1.2 全部 42 個技能目錄（含 SKILL.md）位於 `skills/` 下
- [ ] R1.3 根目錄不再有含 SKILL.md 的子目錄
- [ ] R1.4 非技能目錄的結構保持不變

### Requirement 2: 安裝腳本路徑更新
**GIVEN** 技能目錄已移至 `skills/` 下
**AND** `scripts/install_skills.sh` 的 `collect_skills()` 函數使用 `find "$REPO_ROOT" -mindepth 1 -maxdepth 1` 搜尋技能
**WHEN** 更新 `collect_skills()` 的 find 路徑為 `find "$REPO_ROOT/skills" -mindepth 1 -maxdepth 1`
**THEN** `./scripts/install_skills.sh codex --symlink` 能正確發現並安裝 `skills/` 下的全部技能
**AND** 安裝後的技能可正常被 agent 載入使用

**Uncertainty Level**: Known

**Requirements**:
- [ ] R2.1 `collect_skills()` 的 SHARED_SKILL_PATHS 從 `skills/` 目錄收集技能
- [ ] R2.2 `scripts/install_skills.ps1` 的對應邏輯同步更新
- [ ] R2.3 安裝命令正確將 `skills/<name>/` 安裝至目標平台的 skills 目錄
- [ ] R2.4 `scripts/install_skills.sh` 的 curl/pipe 模式（`bootstrap_repo_if_needed`）不受影響

### Requirement 3: 其他代碼路徑引用更新
**GIVEN** 技能目錄已移至 `skills/` 下
**AND** repo 中可能存在引用根目錄技能路徑的代碼（如 `lib/cli.ts`、`lib/installer.ts` 的 skill discovery 邏輯）
**WHEN** 搜尋並更新所有引用根目錄一級子目錄作為技能來源的代碼
**THEN** 所有 CLI 功能（如 `apltk validate-skill-frontmatter`）正確掃描 `skills/` 目錄
**AND** 現有測試全部通過

**Uncertainty Level**: Exploratory（需先搜尋確認哪些檔案引用了技能路徑）

**Requirements**:
- [ ] R3.1 搜尋所有引用技能目錄路徑的代碼並完成更新
- [ ] R3.2 `npm test` 全部通過
- [ ] R3.3 `apltk validate-skill-frontmatter` 正確掃描 `skills/` 目錄

## Error and Edge Cases
- [ ] `skills/` 目錄已存在時的行為（冪等性）
- [ ] 符號連結模式下安裝的技能在目錄移動後是否仍然有效
- [ ] `.gitignore` 是否需要更新以確保 `skills/` 被正確追蹤
- [ ] `scripts/install_skills.sh` 在 curl/pipe 模式下的路徑解析（`REPO_ROOT` 檢測邏輯涉及檢查 `SKILL.md`）
- [ ] 現有 git worktree 或分支上的技能路徑相容性

## Clarification Questions
None（需求已明確）

## References
- Official docs: None
- Related code files:
  - `scripts/install_skills.sh` — `collect_skills()` 函數（第95-120行）
  - `scripts/install_skills.ps1` — PowerShell 安裝腳本
  - `lib/cli.ts` — CLI 入口，可能有技能路徑引用
  - `lib/installer.ts` — 安裝器邏輯
  - `.gitignore` — 可能需要更新忽略規則

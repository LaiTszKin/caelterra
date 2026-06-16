# Spec: 背景自動更新

- **Date**: 2026-06-16
- **Feature**: 背景自動更新

## Goal
讓 Apollo Toolkit 安裝的技能/工作流在用戶不需手動維護的情況下持續保持最新，並提供明確可控的開關與狀態查詢。

## Scope

### In Scope
- 安裝後預設啟用背景自動更新。
- 定期檢查並更新 Apollo Toolkit 管理的技能/工作流。
- 提供 CLI 開關、重新開啟與狀態查詢。
- 背景更新失敗時不阻斷使用者工作，但需保留可觀察的提醒或日誌。
- 即使用戶手動修改過技能/工作流，本功能仍以最新版本覆蓋本地內容。

### Out of Scope
- 更新 Apollo Toolkit CLI 本身。
- 保留、合併或比對用戶手動修改過的技能/工作流內容。
- 每次啟動 CLI 或每次使用工作流時即時檢查更新。
- 以完全靜默方式處理更新失敗。

## Functional Behaviors (BDD)

### Requirement 1: Default background updates after install
**GIVEN** 用戶已安裝 Apollo Toolkit
**WHEN** 安裝完成後且背景自動更新尚未被用戶關閉
**THEN** 系統會將背景自動更新視為啟用狀態
**AND** 系統會保持 Apollo Toolkit 管理的技能/工作流可被背景更新

**Uncertainty Level**: Known

### Requirement 2: Scheduled update control
**GIVEN** 背景自動更新處於啟用狀態
**WHEN** 到達預設的定時檢查時點
**THEN** 系統會執行一次背景更新檢查
**AND** 預設檢查頻率為每天一次
**AND** 用戶可以透過 CLI 關閉或重新開啟此行為
**AND** 若背景任務無法建立或執行，系統會明確暴露失敗狀態而不是靜默退化

**Uncertainty Level**: Known

### Requirement 3: Scope of updates
**GIVEN** Apollo Toolkit 管理的技能/工作流存在可用新版本
**WHEN** 背景更新執行
**THEN** 系統只更新 Apollo Toolkit 管理的技能/工作流
**AND** 系統不處理 Apollo Toolkit CLI 本身的版本更新

**Uncertainty Level**: Known

### Requirement 4: Overwrite behavior for local modifications
**GIVEN** 用戶曾手動修改 Apollo Toolkit 管理的技能/工作流
**WHEN** 背景更新檢查到該內容有新版本
**THEN** 系統仍以最新版本覆蓋本地版本
**AND** 系統不保留或合併手動修改內容

**Uncertainty Level**: Known

### Requirement 5: Failure handling and status visibility
**GIVEN** 背景更新執行失敗
**WHEN** 用戶繼續使用 Apollo Toolkit
**THEN** 目前工作不會被中斷
**AND** 系統會留下簡短提醒或日誌以便排查
**AND** CLI 可以顯示背景自動更新的開啟或關閉狀態

**Uncertainty Level**: Known

## Error and Edge Cases

- 用戶關閉背景自動更新後，手動更新仍必須可用，且不應被視為功能異常。
- 用戶重新開啟背景自動更新後，後續定時檢查應恢復。
- 更新失敗時不得中止既有 CLI 工作流程。
- 若本地技能/工作流被修改過，更新仍直接覆蓋，這是預期行為而非衝突處理。
- 跨平台背景任務若無法建立或執行，應回到可觀察的失敗狀態，而不是悄悄失效。

## Clarification Questions

None

## References

- **Key code file paths** (affected by this spec):
  - `packages/cli/index.ts`
  - `packages/cli/installer.ts`
  - `packages/cli/updater.ts`
  - `packages/cli/help-text-builder.ts`
  - `packages/cli/parsers/install-parser.ts`
  - `packages/cli/parsers/uninstall-parser.ts`
  - `packages/cli/tool-registration.ts`
  - `packages/tool-utils/platform-adapter.ts`
  - `test/cli/*.test.js`
  - `test/installer.test.js`
  - `test/updater-extras.test.js`
- Related project context files:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `docs/plans/2026-06-16/background-auto-update/PROPOSAL.md`

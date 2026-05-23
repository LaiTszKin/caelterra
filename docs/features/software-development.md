# 軟體開發流程

## 建立功能規格

- **Given** 使用者有一個新的產品需求
- **When** 使用 `spec` 技能建立 spec
- **Then** 在 `docs/plans/{YYYY-MM-DD}/{change_name}/` 產生標準化的規劃文件，包含需求分析、實作步驟與驗收標準

- **Given** 需求涉及多個獨立模組
- **When** 產生 batch spec
- **Then** 在 `docs/plans/{YYYY-MM-DD}/{batch_name}/` 下產生多份 spec，並附帶 `coordination.md` 管理跨模組依賴

## 實作新功能

- **Given** 已有經批准的 spec
- **When** 使用 `implement` 技能
- **Then** 依照 spec 逐步實作功能，並確保最終實作與規劃文件一致

- **Given** 多份 spec 需平行實作且環境支援 subagent
- **When** 使用 `implement-with-subagents` 技能
- **Then** 每份 spec 分配至獨立 subagent，以 bounded concurrency 平行實作

- **Given** 需要在隔離環境中實作且不污染主要工作目錄
- **When** 使用 `implement-with-worktree` 技能
- **Then** 在獨立的 git worktree 中實作 spec，完成後合併回主要分支

## 增強現有功能

- **Given** 既有程式碼需要擴充
- **When** 使用 `enhance-existing-features` 技能
- **Then** 產生 spec、實作功能，並建立必要的回歸測試

## 合併變更

- **Given** 本地分支包含來自不同來源的變更
- **When** 使用 `merge-changes-from-local-branches` 技能
- **Then** 將指定分支的變更合併至目前分支，處理衝突

## 程式碼審查

- **Given** 變更已實作完成
- **When** 使用 `qa` 技能
- **Then** 對照原始 spec 檢視變更，先確認商業目標達成狀況，再檢查邊界案例、安全性與程式碼品質

- **Given** GitHub PR 上有審查意見
- **When** 使用 `resolve-review-comments` 技能
- **Then** 逐一處理審查意見並標記為已解決

- **Given** 審查中發現需要修復的問題
- **When** 使用 `fix` 技能
- **Then** 依嚴重程度排序處理問題，每個修復獨立驗證，完成後全面再驗證

## 架構圖同步

- **Given** spec 包含 `architecture_diff/` overlay，且架構變更已獲批准
- **When** 使用 `apltk architecture merge --spec <spec_dir>` 命令
- **Then** 將 spec 提議的架構變更合併至專案基礎架構圖，並重新渲染 HTML

- **Given** 多份已完成 spec 的架構變更需批量合併
- **When** 使用 `apltk architecture merge --all` 命令
- **Then** 掃描 `docs/plans/` 下所有 pending overlay 並逐一合併

## 系統性除錯

- **Given** 應用程式出現非預期行為
- **When** 使用 `systematic-debug` 技能
- **Then** 重現問題、定位根本原因、實作修復並驗證修復有效性

## 可觀測性改善

- **Given** 程式碼流程不夠透明、難以追蹤
- **When** 使用 `improve-observability` 技能
- **Then** 在關鍵路徑加入日誌、指標、追蹤與測試

## 提交與發佈

- **Given** 變更已就緒但不需要版本發佈
- **When** 使用 `commit` 技能
- **Then** 提交變更並推送至遠端，不執行版本號或 release 操作

- **Given** 需要正式發佈新版本
- **When** 使用 `version-release` 技能
- **Then** 更新版本號、產生 changelog、建立 git tag 並推送

## 策略性測試

- **Given** 需要決定測試範圍與層級
- **When** 使用 `test-case-strategy` 技能
- **Then** 根據風險選擇測試層級（單元/整合/E2E）並定義 drift checks

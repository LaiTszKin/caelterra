# 軟體開發流程

## 討論與釐清需求

- **Given** 使用者有模糊的需求或想法，尚未準備好進入 spec 階段
- **When** 使用 `discuss` 技能
- **Then** 以「用戶完全不懂技術」為前提，通過結構化四維度提問（功能範圍、使用者場景、約束條件、業務價值）釐清需求，產出 PROPOSAL.md

- **Given** PROPOSAL.md 已產出且用戶確認需求足夠清晰
- **When** 用戶同意銜接
- **Then** 將 PROPOSAL.md 交給 `spec` 技能，進一步轉化為 SPEC.md

## 建立功能規格

- **Given** 使用者有一個新的產品需求（或已有 PROPOSAL.md）
- **When** 使用 `spec` 技能建立 spec
- **Then** 在 `docs/plans/{YYYY-MM-DD}/{change_name}/` 產生標準化的規劃文件，包含需求分析、實作步驟與驗收標準

- **Given** 需求涉及多個獨立模組
- **When** 產生 batch spec
- **Then** 在 `docs/plans/{YYYY-MM-DD}/{batch_name}/` 下產生多份 spec，並附帶 `coordination.md` 管理跨模組依賴

## 生成實作計畫

- **Given** 已有經批准的 spec
- **When** 使用 `plan` 技能
- **Then** 將 spec 轉化為 PROMPT.md，包含依賴分析、批次排程、檔案所有權分配與 subagent 路由策略

- **Given** spec 是 batch spec
- **When** 使用 `plan` 技能
- **Then** 分析 coordination.md 與各 spec 的 design.md，建立 spec 級別 DAG、檢測檔案重疊、排程批次、分配 subagent 路由

## 實作新功能

- **Given** 已有 PROMPT.md
- **When** 使用 `implement` 技能
- **Then** 嚴格按照 PROMPT.md 的批次排程與 subagent 路由執行實作，不做任何協同決策

- **Given** 需要在隔離環境中實作且不污染主要工作目錄
- **When** implement 判斷需要隔離
- **Then** 在獨立的 git worktree 中實作，完成後合併回主要分支

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
- **When** 使用 `review` 技能
- **Then** 對照原始 spec 檢視變更，從六個維度產出 REPORT.md（僅問題清單，不含修復建議）

- **Given** REPORT.md 產出且有需要修復的問題
- **When** 使用 `qa` 技能
- **Then** 讀取 spec + REPORT.md，生成 FIX.md 修復計畫（含依賴分析、檔案重疊檢測、批次排程、subagent 路由）

- **Given** 已有 FIX.md
- **When** 使用 `fix` 技能
- **Then** 嚴格按照 FIX.md 的修復計畫執行，不做任何規劃決策

- **Given** GitHub PR 上有審查意見
- **When** 使用 `resolve-review-comments` 技能
- **Then** 逐一處理審查意見並標記為已解決

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

# 技能安裝與管理

使用任何 `apltk` 命令前，先執行對應的 `--help` 並以 live CLI 指引為準。

## 安裝 Apollo Toolkit

- **Given** 使用者尚未安裝 Apollo Toolkit
- **When** 執行 `npx @laitszkin/apollo-toolkit` 或 `apltk`
- **Then** 互動安裝程式將技能同步至 `~/.apollo-toolkit`，並提示選擇目標平台與安裝模式

- **Given** 使用者已知要安裝的目標平台
- **When** 執行 `apltk codex agents --symlink`
- **Then** 技能以 symlink 模式安裝至 Codex 和 Agents 目標目錄，不需互動

- **Given** 使用者想安裝至所有支援平台
- **When** 執行 `apltk all --copy`
- **Then** 技能以複製模式安裝至 Codex、OpenClaw、Trae、Agents、Claude Code

## 選擇安裝模式

- **Given** 使用者偏好技能自動跟隨倉庫更新
- **When** 選擇 symlink 模式安裝
- **Then** 技能目錄符號連結至 `~/.apollo-toolkit`，`git pull` 後自動反映變更

- **Given** 使用者偏好穩定快照、避免意外更新
- **When** 選擇 copy 模式安裝
- **Then** 技能目錄為獨立複本，僅在重新執行安裝程式時更新

## 解除安裝技能

- **Given** 已安裝 Apollo Toolkit 技能的目標平台
- **When** 執行 `apltk uninstall`
- **Then** 互動選擇器列出所有目標平台，確認後移除 manifest 追蹤的技能目錄

- **Given** 已知要移除的目標平台
- **When** 執行 `apltk uninstall codex --yes`
- **Then** 跳過確認，直接從 Codex 移除所有 Apollo Toolkit 管理的技能

## 使用內建工具

- **Given** 使用者需要瀏覽可用工具
- **When** 執行 `apltk tools`
- **Then** 依任務分類列出所有內建工具及其用途說明

- **Given** 使用者需要特定工具的詳細說明
- **When** 執行 `apltk tools architecture --help`
- **Then** 顯示工具目的、使用時機、替代方案、原生指令標誌與範例

- **Given** 使用者知道工具名稱
- **When** 直接執行 `apltk codegraph status --json`
- **Then** 工具包裝器以對應執行環境（node/python3/swift）啟動技能腳本

## 自動更新檢查

- **Given** 使用者在 TTY 環境執行安裝流程
- **When** `apltk` 啟動
- **Then** CLI 檢查 npm registry 是否有新版，若有則詢問是否自動更新

- **Given** 環境變數 `APOLLO_TOOLKIT_SKIP_UPDATE_CHECK=1`
- **When** 執行 `apltk`
- **Then** 跳過更新檢查，直接進入安裝流程

## 背景自動更新

安裝完成後，Apollo Toolkit 預設啟用背景自動更新，讓已安裝的技能/工作流持續保持最新。

### 運作方式

- **Given** 背景自動更新已啟用
- **When** 到達每日排程檢查時點（預設每日 09:00）
- **Then** 系統透過 OS 原生排程器（macOS launchd / Linux systemd user timer / Windows schtasks）執行更新腳本
- **And** 只更新 Apollo Toolkit 管理的技能/工作流，不更新 CLI 本身

- **Given** 使用者曾手動修改技能/工作流的本地內容
- **When** 背景更新檢查到該內容有新版本
- **Then** 系統直接以最新版本覆蓋本地內容，不保留或合併手動修改

### CLI 命令控制

- **Given** 使用者想查詢目前背景自動更新狀態
- **When** 執行 `apltk auto-update status`
- **Then** 顯示目前為啟用或停用狀態、上次執行時間、排程器狀態

- **Given** 使用者想關閉背景自動更新
- **When** 執行 `apltk auto-update disable`
- **Then** 移除 OS 排程任務，儲存停用狀態，後續不再自動檢查更新

- **Given** 使用者想重新開啟背景自動更新
- **When** 執行 `apltk auto-update enable`
- **Then** 重新建立 OS 排程任務，恢復每日檢查

- **Given** 使用者想立即執行一次更新檢查（不等待下次排程）
- **When** 執行 `apltk auto-update run`
- **Then** 立即檢查 npm registry，若有新版本則更新本機技能

- **Given** 使用者已關閉背景自動更新
- **When** 執行 `apltk auto-update run`
- **Then** 單次手動更新仍可正常執行，不受關閉狀態影響

### 失敗處理

- **Given** 背景更新執行失敗（網路問題、套件解析錯誤等）
- **When** 使用者繼續使用 Apollo Toolkit
- **Then** 目前工作不會被中斷，系統記錄失敗狀態至 `.apollo-toolkit-auto-update-status.json`
- **And** 使用者可透過 `apltk auto-update status` 查閱上次錯誤資訊

### 狀態儲存

- **Given** 使用者已設定背景自動更新為停用
- **When** 再次執行安裝流程
- **Then** 停用狀態被保留，不會被重新啟用

- **Given** 背景自動更新從未設定過
- **When** 安裝完成後第一次啟動
- **Then** 預設為啟用狀態

### 平台支援

| 平台 | 排程機制 | 任務名稱 |
|------|---------|---------|
| macOS | launchd user agent | `com.apollotoolkit.auto-update` |
| Linux | systemd user timer | `apollo-toolkit-update.timer` |
| Windows | schtasks | `ApolloToolkitAutoUpdate` |

### 實作檔案

- `packages/cli/auto-update-state.ts` — 配置/狀態/鎖定的讀寫與路徑解析
- `packages/cli/auto-update-scheduler.ts` — 跨平台 OS 排程任務註冊/移除/狀態查詢
- `packages/cli/auto-update-runner.ts` — 一次性更新執行器（套件解析、提取、同步、安裝）
- `packages/cli/auto-update-parser.ts` — CLI 命令參數解析
- `packages/cli/package-source.ts` — npm 套件提取抽象層

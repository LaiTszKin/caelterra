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

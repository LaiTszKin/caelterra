# CLI 設計原則

對外文檔或 agent 指令引用 `apltk` 時，應要求先執行對應 `--help`，並以 live CLI 指引作為命令拼寫與 flags 的權威來源。

## 統一進入點、多命令調度

CLI 由 `bin/apollo-toolkit.ts` 啟動，委派給 `lib/cli.ts` 的 `run()` 函數。命令分類由 `parseArguments()` 處理，支援三種主要流程：安裝、解除安裝與工具執行。所有非工具參數若無法識別則視為目標模式，允許 `apltk codex` 這類簡潔語法。

## 互動與非互動雙模式

在 TTY 環境中提供動畫歡迎畫面、checkbox 選擇器與確認提示；非 TTY 環境則直接使用命令列參數，不中斷管道式或 CI 執行。`--yes` 旗標可跳過解除安裝確認。

## 工具註冊式調度

`lib/tool-runner.ts` 維護一份工具登錄清單，每個工具宣告名稱、分類、所屬技能與 TypeScript handler 函數。工具可經由 `apltk <tool>` 或 `apltk tools <tool>` 兩種方式呼叫，handler 被直接調用而非產生子行程，`--help` 會先顯示 Apollo Toolkit 的上層說明再顯示工具說明。

## 命令解析器架構

安裝 (`install`)、解除安裝 (`uninstall`)、工具 (`tools`) 與自動更新 (`auto-update`) 各有專屬的解析器類別，透過 `parseArguments()` 的調度表分發。[`AutoUpdateArgsParser`](packages/cli/parsers/auto-update-parser.ts) 處理 `apltk auto-update enable|disable|status|run` 四種動作，並支援 `--home` 覆蓋工具目錄路徑。

## 更新檢查雙軌制

CLI 有兩種更新機制，各司其職：

## 更新檢查閘道 (CLI 自更新)

安裝流程啟動時，除非設定 `APOLLO_TOOLKIT_SKIP_UPDATE_CHECK=1`，否則 CLI 會查詢 npm registry 比較版本，在使用者同意後自動執行 `npm install -g`。此檢查在非 TTY 環境中自動跳過。

## 背景技能自動更新

不同於上述的互動式 CLI 自更新，背景自動更新機制 (`apltk auto-update`) 負責靜默更新 Apollo Toolkit 管理的技能/工作流，不更新 CLI 本身：

- **模組**：[`AutoUpdateArgsParser`](packages/cli/parsers/auto-update-parser.ts) 解析 `enable|disable|status|run` 命令
- **狀態管理**：[`auto-update-state.ts`](packages/cli/auto-update-state.ts) 以 JSON 檔案 (`~/.apollo-toolkit/.apollo-toolkit-auto-update.json`) 持久化啟用/停用狀態
- **排程器**：[`auto-update-scheduler.ts`](packages/cli/auto-update-scheduler.ts) 透過 OS 原生 API（launchctl / systemctl / schtasks）註冊每日排程任務
- **執行器**：[`auto-update-runner.ts`](packages/cli/auto-update-runner.ts) 經由 `pacote` 解析並提取最新套件，再透過 `installer.ts` 同步至 `~/.apollo-toolkit` 及目標技能目錄
- **並發防護**：使用檔案鎖 (`withAutoUpdateLock`) 確保同一時間只有一個更新進程在執行
- **失敗處理**：更新失敗不會中斷使用者工作，失敗狀態寫入 `auto-update-status.json` 供後續查詢

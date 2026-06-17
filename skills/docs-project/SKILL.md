---
name: docs-project
description: >-
  以 repo 程式碼為唯一依據，維護標準化的 docs/features/、docs/architecture/、docs/principles/ 文檔，
  並清理已失效或重複的舊文檔。每條文檔記述必須可追溯至實際程式碼證據。
---

## 目標

以整個生產 repo 為唯一依據，建立或維護標準化的 `docs/features/`、`docs/architecture/`、`docs/principles/` 文檔。
清理已失效或重複的舊文檔。
完成後同步刷新根目錄約束文件。

## 驗收條件

- 使用 `apltk codegraph` 完成 repo 深度調查，產出模組邊界與關鍵 API 證據摘要
- 使用 subagents 閱讀關鍵程式碼片段，確保文檔記述可驗證
- repo 的所有細節被仔細閱讀，並轉化為標準化的 `docs/features/`、`docs/architecture/`、`docs/principles/` 文檔
- 每條文檔記述皆有可追溯的來源證據（檔案路徑 + 行號區間）；無法證明的內容標記為 `[INFERRED]`
- `AGENTS.md` / `CLAUDE.md` 已被同步更新
- 舊的非標準文檔已被遷移、合併或移除

## 工作流程

### 1. 使用 CodeGraph 深入調查 Repo

在開始文檔工作前，先用 `apltk codegraph` 建立對 repo 的深度理解。

1. 先執行 `apltk codegraph --help`，再對候選 subcommand 執行 `apltk codegraph <subcommand> --help`。
2. 根據 live help 選擇合適命令，探索檔案、符號、呼叫關係、上下文或變更影響。
3. 對關鍵模組保留結構化摘要：模組職責、關鍵函式、資料流程、外部整合點與來源路徑。

將調查結果記錄為結構化摘要，供後續文檔撰寫使用。

### 2. 建立對 Repo 的基線認知

閱讀項目現有文檔，並結合 CodeGraph 調查結果，建立對 repo 的基線認知，制定後續閱讀策略。

### 3. 比對 Repo 及項目文檔

按照上一步建立的閱讀策略，通過並行調度 subagents 全面搜索整個 repo，驗證並確保現有項目文檔的描述正確、無遺漏。

使用 subagents 深入閱讀關鍵程式碼片段：

- 每個 subagent 負責一個模組或檔案群組
- Subagent 閱讀原始碼後回報：模組職責、關鍵函式、資料流程、外部整合點
- 將 subagent 發現與現有文檔比對，標記差異

### 4. 制定文檔更新策略

根據上一步發現的文檔遺漏或脫節之處，制定文檔更新策略。
閱讀模板文檔；使用模板規定的格式重寫所有項目文檔。
移除舊有說明文檔（必要文檔如 `CHANGELOG.md`、`CONTRIBUTION.md` 除外）。

### 5. 後續維護指引

完成初始文檔後，在 `docs/README.md` 中記錄以下維護指引：

- **證據追溯**：維護文檔時，每條 claim 都必須附上來源檔案與行號區間。無法從程式碼直接證明的 claim 標記為 `[INFERRED]` 而非偽造。
- **LLM 安全原則**：產生文檔時，只餵給 LLM 結構化中繼資料（檔案列表、模組邊界、API 端點、函式簽名），不傳輸原始碼完整內容。
- **增量更新**：當程式碼變更時，只重新產生受影響的文檔區段。可使用 `git diff` 識別變更範圍，再決定哪些 `.md` 檔案需要更新。
- **定期 drift detection**（建議）：定期（每月或每季）比對文檔與實際程式碼，確認無重大偏離。發現 drift 時只修補受影響章節，不全面重寫。

## 參考資料

- `assets/templates/standardized-docs-template.md` - 三類文檔的目標結構、分類規則與清理檢查表。

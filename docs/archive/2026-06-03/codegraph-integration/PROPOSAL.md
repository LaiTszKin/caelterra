# Proposal: 將 colbymchenry/codegraph 嵌入 CLI 以消除架構圖中的 LLM 幻覺

- **Date**: 2026-06-03
- **Source**: Produced by the `discuss` skill through structured conversation

---

## 1. Scope

### In Scope

- 將 `@colbymchenry/codegraph`（37.9k stars）的 programmatic API 嵌入 `apltk` CLI 作為新工具組
- 新增 CLI 工具：`codegraph init`、`sync`、`status`、`explore`、`survey`、`list-apis`、`verify`
- 新增批量操作命令：`apltk architecture apply <yaml>`，將多次 mutation 合併為單次 CLI 呼叫
- 新增命令：`apltk architecture template --spec <dir>`，從 SPEC.md 生成空白提案骨架
- 修改 `design` 技能的第 5 步（Generate Architecture Diff），整合新的 CodeGraph 工具到流程中
- 修改 `init-project-html` 技能，讓 subagent 透過 CodeGraph MCP server 查詢結構資料取代 grep/Read

### Out of Scope (Explicitly Excluded)

- **不**自動推斷新功能的架構設計——CodeGraph 無法閱讀 SPEC.md 自然語言，整合點選擇是 LLM 的設計決策
- **不**替換現有 Atlas YAML 格式——Atlas 仍是最終架構圖儲存格式
- **不**修改 ELK.js layout 引擎或渲染管線
- **不**包裝 CodeGraph 的全部 API——只包裝與架構圖生成相關的子集（無需 semantic search、context builder、git hooks 等）
- **不**與 `@optave/codegraph` 或 `codegraph-ai/CodeGraph` 等其他類似專案整合

---

## 2. User Scenarios

### Target Users

- **`design` 技能**：LLM agent 在 spec → design 流程中產生 Architecture Diff 時使用
- **`init-project-html` 技能**：LLM subagent 初始化架構圖時使用
- **`update-project-html` 技能**：LLM subagent 更新架構圖時使用
- **人類開發者**：直接透過 CLI 查詢專案結構、驗證架構圖正確性

### Scenario A：新 Spec 的 Architecture Diff 生成

```
1. `design` 技能讀完 SPEC.md，執行 apltk codegraph list-apis --all
   → 取得現有系統的完整公開 API 目錄（確定性資料，零幻覺）

2. LLM 判斷新功能需要用到哪些既有服務
   → 例如：「密碼重設需要 users.findByEmail + notification.sendTemplate」

3. LLM 執行 apltk architecture template --spec <dir> --output .
   → 生成空白提案骨架（含 SPEC.md 需求映射）

4. LLM 填寫提案細節：新 submodule、functions、dataflow、errors
   → 整合點參照 list-apis 的結果

5. LLM 執行 apltk codegraph verify --spec <dir>
   → 驗證所有「既有系統參照」都是真實的
```

### Scenario B：既有功能修改的 Architecture Diff

```
1. `design` 技能執行 apltk codegraph explore "modify-feature-name"
   → 一次呼叫取得受影響符號的原始碼 + 關係圖

2. LLM 結合 SPEC.md 需求與 explore 結果，決定修改範圍

3. LLM 填寫 proposal.yaml（只有變更部分，建立 delta overlay）

4. LLM 執行 apltk architecture apply proposal.yaml
   → 一次 CLI 呼叫完成所有批量變更

5. LLM 執行 apltk codegraph verify --spec <dir>
   → 驗證通過後交付
```

### Scenario C：初始化完整的專案架構圖

```
1. `init-project-html` 技能執行 apltk codegraph survey
   → 取得整個專案的結構調查報告（所有 feature、submodule 候選）

2. LLM subagent 根據 survey 結果決定 feature 分組
   → 不再需要 grep/Read 數百個檔案

3. LLM 執行 apltk architecture apply survey-proposal.yaml
   → 一次匯入所有 feature/submodule 定義

4. LLM 視情況補充 functions/dataflow/errors 細節

5. LLM 執行 apltk codegraph verify
   → 全面驗證 atlas 中的所有宣告 vs 實際程式碼
```

### Success Criteria

1. LLM 產生的 Architecture Diff 中，所有「既有系統參照」都經過 CodeGraph 驗證為真
2. `design` 技能在步驟 5 的 CLI 呼叫次數從 20+ 降至 ≤3
3. `init-project-html` 技能的 token 消耗降低 40% 以上
4. `apltk architecture apply` 支援一次處理完整的 feature + submodule + function + edge 定義
5. `apltk codegraph verify` 能捕獲至少 90% 的「引用不存在的符號」類幻覺

### Error Handling

- **CodeGraph 未初始化**：提示用戶在專案目錄執行 `apltk codegraph init`
- **CodeGraph 索引過時**：提示 `apltk codegraph sync` 後重試
- **驗證失敗**：明確列出每個失敗項目的類型（symbol_not_found / edge_not_found / type_mismatch）、位置、建議修復方式
- **專案不支援的語言**：提示目前支援的語言列表，退回到現有的純 LLM 流程

---

## 3. Constraints

- **Node.js 22.5+**：`@colbymchenry/codegraph` 的 programmatic API 需要 Node.js 22.5+ 的內建 `node:sqlite`，與 Apollo Toolkit 的目標執行環境一致則可
- **非取代關係**：CodeGraph 是輔助工具，不能取代 LLM 的設計決策職責；LLM 仍負責所有「判斷」類工作
- **索引是異步操作**：大型專案的初始索引需要時間（~60 files/sec），CLI 必須提供明確的進度回饋
- **技術棧一致**：`@colbymchenry/codegraph` 是 TypeScript 套件，與 Apollo Toolkit 技術棧一致，無需引入新的編譯工具鏈
- **依賴版本鎖定**：需評估 `@colbymchenry/codegraph` 的依賴樹對現有專案的影響
- **不引入外部服務**：CodeGraph 是 100% local 的，符合專案的離線優先原則

---

## 4. Business Value

### Problem Statement

目前的架構圖生成高度依賴 LLM 閱讀原始碼後手動推斷模組邊界與呼叫關係，這個「結構發現」過程佔用 ~80% 的 token 消耗，且容易產生遺漏與幻覺——宣告的功能模組在程式碼中不存在、邊界分類錯誤、呼叫關係與實際程式碼不符。

### 解決方案

將 `colbymchenry/codegraph` 的確定性程式碼解析能力嵌入 `apltk` CLI，讓「結構發現」從 LLM 的 token 密集型 grep/Read 轉變為 CLI 的樹狀分析查詢——LLM 只做設計決策（約 20% 的工作），不做結構猜測。

### 效益

- **消除架構圖幻覺**：所有既有系統的符號、呼叫關係由 tree-sitter 確定性解析
- **降低 token 消耗**：預估減少 40-60% 的架構圖生成 token 用量
- **減少 CLI 呼叫次數**：10-20 次單一 mutation → 2-3 次批量操作
- **提供驗證層**：在 LLM 做出設計決策後，工具可以驗證決策是否基於真實存在的程式碼

---

## 5. Functional Module Decomposition

```
┌─────────────────────────────────────────────────────────────────┐
│                       apltk CLI 使用者                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │  lifecycle    │ │  discovery    │ │  validation   │
   │  commands     │ │  commands    │ │  commands     │
   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
          │                │                │
          ▼                ▼                ▼
   ┌──────────────────────────────────────────────┐
   │         CodeGraph Programmatic API            │
   │         (@colbymchenry/codegraph)             │
   │                                              │
   │   CodeGraph.init/open → indexAll → sync      │
   │   → searchNodes → getCallers → getCallees    │
   │   → getImpactRadius → buildContext → getFiles │
   └──────────────────────────────────────────────┘
          │
          ▼
   ┌──────────────────────────────────────────────┐
   │         SQLite 知識圖譜 (.codegraph/)         │
   │         tree-sitter 確定性解析                │
   └──────────────────────────────────────────────┘
```

### 5.1 Lifecycle Commands（基礎生命週期）

| 命令 | 功能 | 依賴 | 對應 CodeGraph API |
|------|------|------|-------------------|
| `codegraph init` | 在專案目錄初始化索引 | 無 | `CodeGraph.init()` |
| `codegraph sync` | 增量更新索引 | 已初始化 | `CodeGraph.sync()` |
| `codegraph status` | 查詢索引統計 | 已初始化 | `CodeGraph.getStats()` |

### 5.2 Discovery Commands（結構探索）

| 命令 | 功能 | 依賴 | 對應 CodeGraph API |
|------|------|------|-------------------|
| `codegraph search` | 搜尋符號名稱 | 已索引 | `searchNodes()` |
| `codegraph explore <query>` | 探索符號上下文（原始碼 + 關係） | 已索引 | `buildContext()` + `searchNodes()` |
| `codegraph survey [dir]` | 調查目錄/功能的完整結構（輸出 atlas-compatible 報告） | 已索引 | `getFiles()` + `searchNodes()` + `getCallers()` + `getCallees()` |
| `codegraph list-apis [feature]` | 列出功能模組的公開 API 目錄 | 已索引 | `searchNodes()` + `getCallers()` |
| `codegraph list-apis --all` | 列出系統所有公開 API | 已索引 | 同上，全範圍 |

**`survey` 與 `list-apis` 的區別**：

| | `survey` | `list-apis` |
|---|---|---|
| 輸入 | 目錄路徑或 feature slug | feature slug 或 `--all` |
| 輸出範圍 | 目錄下所有符號 + 內外關係 | 僅公開 entry point + 呼叫者 |
| 用途 | LLM 建立/更新 atlas 時使用 | LLM 做整合點選擇時使用 |
| 聚合程度 | 完整調查報告 | 精簡的 API 目錄 |

### 5.3 Validation Commands（驗證層）

| 命令 | 功能 | 依賴 | 對應 CodeGraph API |
|------|------|------|-------------------|
| `codegraph verify --spec <dir>` | 驗證 spec overlay 中的所有宣告 | 已索引 + spec overlay | `searchNodes()` + `getCallers()` + `getCallees()` |
| `architecture apply <yaml>` | 批量執行 atlas mutation | 無（直接寫 YAML） | 無（現有 state.js） |
| `architecture template --spec <dir>` | 從 SPEC.md 生成空白提案骨架 | 無（純文字處理） | 無 |

### 5.4 Inter-Module Relationships

| 呼叫者 | 被呼叫者 | 關係類型 | 說明 |
|--------|---------|---------|------|
| `codegraph *` 命令 | `@colbymchenry/codegraph` API | 程序內嵌入 | 直接 import，非子進程 |
| `codegraph verify` | `atlas/state.js` | 讀取 | 需讀取 spec overlay 的 YAML |
| `design` 技能 (LLM) | `codegraph list-apis` | CLI 呼叫 | LLM 查詢整合面 |
| `design` 技能 (LLM) | `codegraph verify` | CLI 呼叫 | LLM 驗證提案 |
| `design` 技能 (LLM) | `architecture apply` | CLI 呼叫 | LLM 批量寫入 |
| `init-project-html` 技能 (LLM) | `codegraph survey` | CLI 呼叫 | LLM 取得結構報告 |
| `init-project-html` 技能 (LLM) | `architecture apply` | CLI 呼叫 | LLM 批量建立 atlas |

### 5.5 與現有模組的關係

| 現有模組 | 整合方式 | 影響 |
|---------|---------|------|
| `packages/tools/architecture/` | 共用 mutations（`apply` 復用其 schema 與 state.js） | `apply` 新增 handler |
| `packages/tool-registry/` | 註冊新工具 | 新增 entry 在 `tool-registration.ts` |
| `packages/cli/` | 自動發現 `codegraph` 前綴工具 | 如 `firstArg` 匹配規則已涵蓋 |
| `skills/init-project-html/` | subagent 改用 `codegraph survey` 取代 grep/Read | SKILL.md 工作流程更新 |
| `skills/design/` | 步驟 5 整合新的工具流程 | SKILL.md 工作流程更新 |

---

## 6. Open Questions

- `@colbymchenry/codegraph` 的 programmatic API 是否需要 Node 22.5+ 的 `node:sqlite`？Apollo Toolkit 目前的 Node.js 版本要求是否相容？（需要驗證）
- `architecture apply` 的 YAML 格式需要與現有 mutation schema 相容——如何處理部分更新 vs 完整覆蓋的語意？
- `verify` 遇到不支援語言的檔案時，是否無聲跳過還是明確回報未驗證？
- 是否需要在 `apltk codegraph init` 時自動偵測 `@colbymchenry/codegraph` 的版本並安裝？（類似目前的 updater pattern）

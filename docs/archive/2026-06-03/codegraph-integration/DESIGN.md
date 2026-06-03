# Design: CodeGraph 嵌入 CLI — 消除架構圖中的 LLM 幻覺

- **Date**: 2026-06-03
- **Feature**: codegraph-integration
- **Source SPEC**:
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-lifecycle/SPEC.md`
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-discovery/SPEC.md`
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-validation/SPEC.md`

> **Purpose:** Technical design document — defines architecture, external dependency integration, data flow, invariants, and trade-offs for embedding `@colbymchenry/codegraph` into the `apltk` CLI toolchain.

---

## 1. Research Summary

### 1.1 Technical Feasibility

| 需求項 | 可行性 | 風險 |
|--------|--------|------|
| Req L1-4: `init`, `init --index`, `sync`, `status/search` | ✅ Feasible | `CodeGraph.init()`, `.sync()`, `.getStats()`, `.searchNodes()` API 明確 |
| Req D1: `explore <query>` | ✅ Feasible | `buildContext()` + `searchNodes()` 組合可實現 |
| Req D2: `survey [dir]` | ⚠️ Partial validation | Submodule 分組演算法需實作，無現成 CodeGraph API 直接對應 |
| Req D3: `list-apis [feature]` | ✅ Feasible | `searchNodes()` + `getCallers()` 直接包裝 |
| Req V1: `verify --spec <dir>` | ✅ Feasible | `searchNodes()` + 既有 `state.js` overlay 讀取 |
| Req V2: `architecture apply <yaml>` | ✅ Feasible | 復用 `state.js` 現有 mutation 邏輯 |
| Req V3: `architecture template --spec <dir>` | ⚠️ Partial validation | SPEC.md 解析依賴需求結構化程度，無結構時退到空白骨架 |
| Req V4-5: Skill workflow 更新 | ✅ Feasible | 純文件變更 |

**Overall assessment**: All feasible

### 1.2 Existing Reference Implementations

| 來源 | 可複用的設計模式 |
|------|-----------------|
| `@colbymchenry/codegraph` 的 `src/index.ts` | CodeGraph facade 模式——包裝底層 DB/Extraction/Traverser 為單一類別 |
| 既有的 `packages/tools/architecture/index.ts` | Tool handler 註冊與 CLI 參數解析模式 |
| `packages/tools/architecture/index.ts` 委派 atlas CLI 的方式 | 工具如何委派給子模組的參考 |

### 1.3 Tech Stack Compatibility

| 候選 | Repo 依賴相容性 | 授權 | 決定 |
|------|---------------|------|------|
| `@colbymchenry/codegraph` | 無相依衝突；需 Node 22.5+ 以使用 programmatic API | MIT | ✅ 推薦 |
| CLI 子進程呼叫（替代方案） | 無 Node 版本要求，但無法內嵌 API | — | ❌ 已排除（已決定升級 Node） |

**Node.js 升級影響**：`package.json` 的 `engines.node` 從 `>=20.19.0` 改為 `>=22.5.0`。需確認 CI/CD runner 的 Node 版本。

---

## 2. Architecture Overview

### 2.1 Module List

| Module Key | Responsibility | Owned Artifacts |
|---|---|---|
| `tool-codegraph` | 所有 `codegraph` 前綴的 CLI 命令處理 | `packages/tools/codegraph/index.ts`, `lib/*.ts` |
| `tool-architecture` (enhanced) | `apply` + `template` 新命令 | `packages/tools/architecture/index.ts`（新增 handler） |
| `@colbymchenry/codegraph` | 外部套件，提供程式碼知識圖譜 | `.codegraph/` 目錄下的 SQLite DB |

### 2.2 Boundaries

- **Entry points**: `apltk codegraph *` CLI 命令、`apltk architecture apply`、`apltk architecture template`
- **Trust boundary**: 所有 CodeGraph 操作在本地檔案系統內完成，不涉及網路呼叫
- **外部依賴**: 僅 `@colbymchenry/codegraph` 一個 npm 套件

### 2.3 Target vs Baseline

| Dimension | Baseline (current) | Target (after change) |
|---|---|---|
| CLI 工具數量 | 19 個工具 | 26 個（+6 codegraph +1 architecture apply） |
| Node.js 要求 | >=20.19.0 | >=22.5.0 |
| 架構圖產生方式 | LLM subagent grep/Read → 手動 mutation | LLM 查詢確定性結構資料 → 批量 apply |
| 架構驗證層 | 無（LLM 自行檢查，無法驗證正確性） | `codegraph verify` 確定性驗證 |

---

## 3. Interaction Design

### 3.1 命令調度流程

```
apltk codegraph <command> [args...]
  │
  ├─ init     → CodeGraph.init(projectRoot) + indexAll(onProgress)
  ├─ sync     → CodeGraph.open(projectRoot) + .sync()
  ├─ status   → CodeGraph.open(projectRoot) + .getStats()
  ├─ search   → CodeGraph.open(projectRoot) + .searchNodes(query)
  ├─ explore  → CodeGraph.open(projectRoot) + .searchNodes() + .getCallers() + .getCallees() + .buildContext()
  ├─ survey   → CodeGraph.open(projectRoot) + .getFiles() + .searchNodes() + .getCallers() + .getCallees() + submoduleGrouping()
  ├─ list-apis→ CodeGraph.open(projectRoot) + .searchNodes() + .getCallers()
  └─ verify   → CodeGraph.open(projectRoot) + state.loadOverlay() + .searchNodes() + .getCallers()
```

### 3.2 Interaction Anchors

| ID | Intent | Caller → Callee | Coupling Type | Info Crossing | Failure Propagation |
|---|---|---|---|---|---|
| `INT-001` | CLI 初始化索引 | `codegraph init` → `CodeGraph.init()` | sync call | project root path | 初始化失敗 → CLI exit 1 + 錯誤訊息 |
| `INT-002` | CLI 查詢圖譜 | `codegraph search/searchNodes/explore/survey/list-apis` → `CodeGraph.open()` → `.*()` | sync call | 查詢參數 | 索引不存在 → 提示 init |
| `INT-003` | 驗證 spec overlay | `codegraph verify` → `state.loadOverlay()` + `CodeGraph.searchNodes()` | sync call | overlay YAML path | 驗證失敗項 → 輸出 JSON 報告 |
| `INT-004` | 批量寫入 atlas | `architecture apply` → `state.load()` → `state.save()` | sync call | proposal YAML path | 中間步驟失敗 → undo snapshot 還原 |

### 3.3 CodeGraph Instance 生命週期

```
                    ┌──────────────┐
                    │  parse CLI   │
                    │  arguments   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  create or   │
                    │  open        │
                    │  CodeGraph   │
                    │  instance    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ init():  │ │ open():  │ │ init():  │
       │ init     │ │ sync     │ │ indexAll │
       │ (no idx) │ │ status   │ │          │
       │          │ │ search   │ │          │
       │          │ │ explore  │ │          │
       │          │ │ survey   │ │          │
       │          │ │ list-apis│ │          │
       │          │ │ verify   │ │          │
       └──────────┘ └──────────┘ └──────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  close()     │
                    │  release     │
                    │  resources   │
                    └──────────────┘
```

每個 CLI 命令建立獨立的 CodeGraph instance，用完即關閉。不共享 instance——因為 CLI 是短生命週期程序，不需要 watch 或跨命令狀態。

---

## 4. External Dependencies

### 4.1 Dependency Overview

| Dependency | Purpose | Official Documentation | License |
|---|---|---|---|
| `@colbymchenry/codegraph` | 程式碼知識圖譜引擎（tree-sitter 解析 + SQLite 儲存 + 圖譜查詢） | https://colbymchenry.github.io/codegraph/ | MIT |

無其他新增的外部依賴。`js-yaml` 已在 `atlas/state.js` 中間接使用，不需新增。

### 4.2 `@colbymchenry/codegraph` — API Mapping

#### 使用的 API 方法

| 包裝命令 | CodeGraph API | 參數 | 回傳值 |
|---------|---------------|------|--------|
| `codegraph init` | `CodeGraph.init(path)` | project root | CodeGraph instance |
| `codegraph init --index` | `CodeGraph.init(path)` + `.indexAll({onProgress})` | project root | IndexResult |
| `codegraph sync` | `CodeGraph.open(path)` + `.sync()` | project root | SyncResult |
| `codegraph status` | `CodeGraph.open(path)` + `.getStats()` | project root | GraphStats |
| `codegraph search` | `.searchNodes(query)` + `.getFiles()` | symbol query | SearchResult[] |
| `codegraph explore` | `.searchNodes()` + `.getCallers()` + `.getCallees()` + `.buildContext()` | symbol query, context opts | Context (markdown or JSON) |
| `codegraph survey` | `.getFiles()` + `.searchNodes()` + `.getCallers()` + `.getCallees()` | dir path | SurveyReport (自訂格式) |
| `codegraph list-apis` | `.searchNodes()` + `.getCallers()` | feature slug | APIDirectory (自訂格式) |
| `codegraph verify` | `.searchNodes()` + `.getCallers()` | spec overlay path | VerifyReport (自訂格式) |

#### 不使用的方法

| 方法 | 原因 |
|------|------|
| `getImpactRadius()` | 屬於修改前的影響評估，不是「探索」範疇 |
| `watch()` / `unwatch()` | CLI 為短生命週期，不需要 file watcher |
| `buildContext()` 的 markdown 格式 | 只使用其 JSON 輸出，markdown 格式不適合程式化消費 |

#### Version assumption

`@colbymchenry/codegraph` 鎖定在 `^0.9.x` 範圍。0.9.x 系列是當前穩定版，API 穩定。

---

## 5. Data Persistence

| Resource | Readers / Writers | Consistency Expectation |
|---|---|---|
| `.codegraph/codegraph.db` (SQLite) | `codegraph init` 建立；`codegraph sync` 寫入；所有查詢命令唯讀 | CodeGraph 內部維護，CLI 不直接操作 |
| `resources/project-architecture/atlas/*.yaml` | `architecture apply` 寫入；現有 atlas 工具唯讀 | 透過 `state.js` 的 undo snapshot 保護 |
| `docs/plans/*/architecture_diff/atlas/*.yaml` | `codegraph verify` 唯讀讀取；LLM 手動寫入（無原子性保證） | 驗證不修改檔案 |

---

## 6. System Invariants

| Invariant | How Architecture Could Violate It | Symptoms of Violation |
|---|---|---|
| CodeGraph 索引與原始碼必須保持同步 | 檔案修改後未執行 `sync` | `verify` 誤報或漏報 |
| 同一個 `.codegraph/` 不能同時被多個程序寫入 | 同時索引與同步 | SQLite `database is locked`（CodeGraph 內部以 mutex + file lock 防護） |
| Spec overlay 中對既有系統的參照必須為真 | LLM 填入不存在的符號名 | `verify` 捕獲並回報 symbol_not_found |

---

## 7. Technical Trade-offs

### 7.1 決定：每個 CLI 命令建立獨立的 CodeGraph instance

**理由**：CLI 是短生命週期程序（秒級），不需要跨命令狀態。與 `architecture` 工具的模式一致。

**拒絕的方案**：背景 daemon 模式保持連接池。不必要且增加複雜度。

**Lock-in 效應**：無。可隨時切換為 instance 池策略。

### 7.2 決定：survey 使用混合分組策略

**演算法**：

```
for each target dir:
  1. 掃描目錄下所有 .ts/.js/.py 等檔案
  2. 解析每個檔案的公開函式
  3. 建立函式之間的 call graph（誰呼叫誰）
  4. 使用簡單的連通分量分析：
     - 高度互相呼叫的函式群 → 同一個 submodule 候選
     - 僅被外部呼叫的 entry points → submodule 的入口
  5. 若目錄內無明顯的呼叫群落 → 以檔案為單位作為 submodule 候選
  6. 產生 suggestedSubmodules + suggestedEdges
```

**拒絕的方案**：
- 單純以目錄為邊界：太粗糙，同一目錄可能含多個不相關的 submodule
- Leiden 聚類：overkill，CLI 內實作太重；這是提示性分組而非精確分組

**Lock-in 效應**：分組演算法可獨立迭代優化，不影響其他模組。

### 7.3 決定：所有查詢工具支援 `--json` 與人類可讀雙模式

**偵測邏輯**：
- TTY 模式 → 人類可讀輸出（表格、摘要、顏色）
- 非 TTY 模式（pipe）→ 自動 JSON 輸出
- 明確指定 `--json` → 強制 JSON

### 7.4 決定：Node.js 引擎要求升級至 22.5+

**影響範圍**：
- `package.json` 的 `engines.node: >=22.5.0`
- CI/CD 的 Node 版本設定
- 開發者本機的 Node 版本（透過 `.nvmrc` 或 `.node-version` 同步）

---

## 8. 檔案結構

```
packages/tools/codegraph/
├── package.json               # @laitszkin/tool-codegraph
├── tsconfig.json
├── index.ts                   # ToolDefinition export + 命令調度
└── lib/
    ├── cg-instance.ts          # CodeGraph instance 管理（init/open/close）
    ├── cmd-init.ts             # codegraph init / init --index handler
    ├── cmd-sync.ts             # codegraph sync handler
    ├── cmd-status.ts           # codegraph status handler
    ├── cmd-search.ts           # codegraph search handler
    ├── cmd-explore.ts          # codegraph explore handler
    ├── cmd-survey.ts           # codegraph survey handler
    ├── cmd-list-apis.ts        # codegraph list-apis handler
    ├── cmd-verify.ts           # codegraph verify handler
    ├── survey/
    │   ├── index.ts            # survey 入口：協調目錄掃描 + 呼叫分析 + 分組
    │   ├── scanner.ts          # 目錄掃描與檔案過濾
    │   └── grouper.ts          # 基於 call graph 的 submodule 分組演算法
    ├── verify/
    │   ├── index.ts            # verify 入口
    │   └── checker.ts          # 逐項驗證（symbol existence、edge existence、file path）
    └── formatter.ts            # TTY 人類輸出 vs JSON 輸出切換
```

既有檔案變更：

```
packages/tools/architecture/
├── index.ts                    # 新增 apply 與 template handler

packages/cli/
├── tool-registration.ts        # 新增 @laitszkin/tool-codegraph 到 TOOL_MODULE_NAMES
```

## 9. 規模注意事項

- **Interaction Design (Section 3)**：所有新工具透過 CLI 命令進入，無跨模組耦合問題，INT-001~004已涵蓋所有關鍵互動
- **External Dependency deep-dives (Section 4.2)**：`@colbymchenry/codegraph` 是純 npm 套件，無 API 配額或驗證——僅包裝其程式內 API，因此無需 4-sub-table 格式
- **System Invariants (Section 6)**：僅三條不變性，每條對應具體的違反情境

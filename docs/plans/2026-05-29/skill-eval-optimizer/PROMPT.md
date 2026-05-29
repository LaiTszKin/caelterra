# Implementation Coordinator Prompt: Skill Eval & Optimizer

- **Date**: 2026-05-29
- **Type**: Batch Spec
- **Source Specs**:
  - `docs/plans/2026-05-29/skill-eval-optimizer/eval-core/SPEC.md`
  - `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/SPEC.md`
- **Source Designs**:
  - `docs/plans/2026-05-29/skill-eval-optimizer/eval-core/DESIGN.md`
  - `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/DESIGN.md`
- **Source Checklists**:
  - `docs/plans/2026-05-29/skill-eval-optimizer/eval-core/CHECKLIST.md`
  - `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/CHECKLIST.md`

---

## 1. Your Role

**You are the implementation coordinator.** You do not write code. You do not edit files. You are the brain of this operation — your job is to think, plan, delegate, synthesize, and verify.

### What you do

- Read and understand the mission, scope, technical context, and task definitions below
- Spawn workers to execute individual tasks, giving each a self-contained prompt (provided in Section 6)
- Wait for all workers in a batch to complete, then digest their results
- Run verification commands at each checkpoint
- Decide whether to proceed to the next batch, retry a failed worker, or halt
- Handle lightweight coordination tasks: resolving merge conflicts, updating lockfiles, committing results

### What you NEVER do

- Write, edit, or modify any source-code file directly
- Skip a verification checkpoint
- Proceed to the next batch when the current batch has not passed verification
- Delegate comprehension — digest every worker result yourself before deciding next steps
- Let workers spawn their own workers (workers are leaf nodes)

---

## 2. Mission

Build a CLI-integrated automated skill evaluation and optimization system for the Apollo Toolkit. The system tests an agent skill (starting with `spec`) against a question bank, executes it with tool-call tracing, scores performance via LLM-as-Judge on 3 dimensions (instruction adherence, tool calling quality, result quality), produces structured evaluation reports, and generates optimization diffs for the skill's files (SKILL.md, scripts/, references/, assets/).

This formalizes the existing ad-hoc `scripts/run-evals.mjs`, `scripts/score.mjs`, and `scripts/optimize.mjs` into proper CLI tools registered in the Apollo Toolkit tool registry, accessible via `apltk eval <skill>`.

**Success looks like**: Running `apltk eval spec` produces a scored evaluation report and optional optimization diff, with all existing tests passing and the tool registered in the CLI help output.

---

## 3. Scope & Boundaries

### What we WILL implement

**Part 1 — Eval Core:**
- Question bank management: load, validate, sample questions; generate LLM variants
- Eval execution: run skills in isolated workspace, record thinking/tool-call/output traces as JSONL
- LLM-as-Judge scoring: 3-dimension scoring (instruction adherence, tool calling quality, result quality) with multi-level JSON parse fallback
- Structured Markdown report generation with per-question breakdown

**Part 2 — Optimize & Integrate:**
- Optimization engine: extract issues from scores, Jaccard+Judge semantic dedup, generate FIND/REPLACE diffs
- CLI command: `apltk eval <skill> [--mode fast|standard] [--optimize] [--dry-run] [--output-dir]`
- Two modes: fast (3-5 questions), standard (8-12 questions)
- PR gate: GitHub Actions workflow triggered on `skills/**` file changes
- Context isolation: judge model calls use fresh independent context per question
- Tool simulation: read operations execute for real; write operations are mocked

### What we will NOT implement

- Skills other than `spec` (extensible design but only `spec` validated)
- Fully automatic closed-loop iterative optimization (no auto re-run + re-score loop)
- Scheduled/cron evaluation
- Deep mode (20+ questions)
- Cross-project general-purpose evaluation framework
- Auto-merge of optimization diffs without human review
- Support for GitLab CI or other CI platforms beyond GitHub Actions

### File ownership

| 檔案路徑 | 負責的任務 ID | 備註 |
|---|---|---|
| `packages/tools/eval/lib/judge-api.ts` | T1.1 | 從 scripts/lib/judge-api.mjs 遷移 |
| `packages/tools/eval/lib/promise-pool.ts` | T1.1 | 從 scripts/lib/promise-pool.mjs 遷移 |
| `packages/tools/eval/lib/env-utils.ts` | T1.1 | 從 scripts/env-utils.mjs 遷移 |
| `packages/tools/eval/lib/question-utils.ts` | T1.1 | 從 scripts/question-utils.mjs 遷移 |
| `packages/tools/eval/question-loader.ts` | T1.2 | 題庫載入、抽樣、變體生成 |
| `packages/tools/eval/executor.ts` | T1.3 | 評測執行引擎、JSONL 軌跡記錄 |
| `packages/tools/eval/scorer.ts` | T1.4 | 評分 prompt 建構、Judge API 呼叫、parse fallback |
| `packages/tools/eval/reporter.ts` | T1.4 | Markdown 報告組合 |
| `packages/tools/eval/optimizer.ts` | T2.1 | 問題提取、去重、diff 生成 |
| `packages/tools/eval/isolation.ts` | T2.2 | 工具模擬 dispatcher、上下文工廠 |
| `packages/tools/eval/index.ts` | T2.3 | CLI 命令 handler + ToolDefinition 匯出 |
| `packages/cli/tool-registration.ts` | T2.3 | 新增 eval tool 到已知工具列表 |
| `.github/workflows/eval.yml` | T2.4 | GitHub Actions CI workflow |

---

## 4. Technical Context

### Modules involved

| 模組 | 職責 | 會被如何修改 |
|---|---|---|
| `eval-question` | 題庫載入、JSON Schema 驗證、抽樣、LLM 變體生成 | 新建 TypeScript 模組 |
| `eval-executor` | 隔離環境中執行技能，記錄工具調用軌跡為 JSONL | 新建 TypeScript 模組 |
| `eval-scorer` | 建構評分 prompt、呼叫 Judge Model API、多層 JSON parse fallback | 新建 TypeScript 模組 |
| `eval-reporter` | 彙總 score.json 產出結構化 Markdown 報告 | 新建 TypeScript 模組 |
| `eval-optimizer` | 從 score.json 提取問題、Jaccard+Judge 去重、生成 FIND/REPLACE diff | 新建 TypeScript 模組 |
| `eval-cli` | CLI 命令註冊 (`apltk eval`)，參數解析、流程編排、進度顯示 | 新建 CLI handler + 修改 tool-registration.ts |
| `eval-ci-gate` | GitHub Actions workflow：檢測技能檔案變更、觸發評測、回報結果 | 新建 YAML workflow 檔案 |
| `eval-isolation` | 工具調用攔截層：讀取真實執行、寫入 mock 回傳 | 新建 TypeScript 模組 |

### Invariants — must never be broken

| 不變量 | 如果被違反，你會看到的症狀 |
|---|---|
| 題目評分標準對被評測模型不可見 | stripScoringCriteria 後仍殘留 scoringCriteria 欄位 → 模型輸出針對評分標準優化（測驗失真） |
| 評分模型上下文與執行模型上下文隔離 | judge prompt 包含 exec model 的對話歷史 → 評分偏見 |
| 每題至少執行一次才評分 | 跳過 .done 檢查直接評分 → score.json 引用不存在的 trace |
| 已評分的題目不重複評分 | 未檢查 .scored marker → 重複 API 呼叫浪費成本 |
| 優化 diff 不修改技能目錄外的檔案 | ALLOWED_FILES 白名單被繞過 → 不相關原始碼被修改 |
| dry-run 模式不產生檔案系統副作用 | --dry-run flag 未被正確傳遞 → 未審查變更被寫入 |
| 備份在修改前必定存在 | apply 邏輯中備份與寫入之間有 exception → 原始檔案損壞無法復原 |

### Technical decisions to follow

| 決策 | 原因 | 對 worker 的約束 |
|---|---|---|
| JSONL append-only 軌跡格式 | 簡單可靠，無 DB 依賴 | 每行一個 JSON event，append-only，不支援隨機寫入 |
| 三維度評分（vs 現有四維度） | 更貼近 SkillOpt 框架 | 需更新 scoringCriteria schema: outcome/process/style/efficiency → instruction_adherence/tool_calling/result_quality |
| Jaccard + Judge 兩階段去重 | 平衡成本與準確度 | Jaccard 閾值 0.35；Judge 僅在 judgeAvailable 時作為 refine 層 |
| FIND/REPLACE 文本匹配 | 簡單直覺，失敗有備份復原 | 匹配失敗時 fallback 到 template suggestion，不強行修改 |
| 純 Node.js 內建模組 | 與 repo 慣例一致 | 禁止引入 dotenv, ajv, chalk 等 npm 包 |
| OpenAI-compatible API（非 provider-specific） | 支援任意 provider | 使用 EXEC_BASE_URL / JUDGE_BASE_URL 自定義 endpoint |
| 檔案鎖 mkdir mutex（非 flock） | 跨平台兼容 | Windows 上 mkdir 為原子操作，作為鎖機制 |

---

## 5. Task Units

### Dependency Graph

```
T1.1 (shared utils)
  ├──→ T1.2 (eval-question) ──→ T1.3 (eval-executor) ──→ T1.4 (eval-scorer + reporter)
  │                                                          │
  │                              ┌───────────────────────────┘
  │                              ▼
  │                         T2.1 (eval-optimizer) ──→ T2.3 (eval-cli) ──→ T2.4 (CI gate)
  │                              │
  └──────────────────────────────→ T2.2 (eval-isolation)
```

- `→` 表示依賴：箭頭左完成後右才能開始
- T1.2 與 T2.2 無檔案重疊，可與各自同一批次的任務並行

### Task details

#### T1.1: 共享工具庫遷移 (Shared Utils)

- **Goal**: 將 scripts/ 下的共用函式庫遷移到 `packages/tools/eval/lib/`，轉換為 TypeScript
- **Files**: `packages/tools/eval/lib/judge-api.ts`, `packages/tools/eval/lib/promise-pool.ts`, `packages/tools/eval/lib/env-utils.ts`, `packages/tools/eval/lib/question-utils.ts`
- **Depends on**: —（無依賴，基礎層）
- **Verify**:
  - 命令: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
  - 預期: 四個 TS 檔案編譯通過，無型別錯誤

#### T1.2: 題庫管理模組 (eval-question)

- **Goal**: 實作題目載入、JSON Schema 驗證、模式抽樣（快速 3-5 / 標準 8-12）、LLM 變體生成
- **Files**: `packages/tools/eval/question-loader.ts`
- **Depends on**: T1.1（需要 question-utils 的型別和工具函數）
- **Verify**:
  - 命令: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
  - 預期: 編譯通過；loadQuestions() 對有效/無效/空 JSON 回傳正確實現

#### T1.3: 評測執行器 (eval-executor)

- **Goal**: 實作隔離執行環境、JSONL 軌跡記錄、Exec Model API 呼叫（含 timeout、指數退避重試）、並發控制、.done marker
- **Files**: `packages/tools/eval/executor.ts`
- **Depends on**: T1.1, T1.2（需要 API client + 題目資料）
- **Verify**:
  - 命令: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
  - 預期: 編譯通過；executor 匯出 runSingleTest() 和 runAllTests() 函數

#### T1.4: 評分引擎與報告 (eval-scorer + eval-reporter)

- **Goal**: 實作 judge prompt builder、Judge Model API 呼叫、多層 JSON parse fallback（direct → ```json block → brace extraction → error）、.scored marker + scoring lock、Markdown 報告組合
- **Files**: `packages/tools/eval/scorer.ts`, `packages/tools/eval/reporter.ts`
- **Depends on**: T1.1, T1.3（需要 trace.jsonl + judge API client）
- **Verify**:
  - 命令: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
  - 預期: 編譯通過；scorer 匯出 scoreSingleTest()；reporter 匯出 generateReport()

#### T2.1: 優化引擎 (eval-optimizer)

- **Goal**: 實作問題提取（extractIssues）、Jaccard 去重（deduplicateIssues）、選配 Judge refine（refineDedupWithJudge）、FIND/REPLACE diff 生成（含備份/復原）、optimization-plan.json 輸出
- **Files**: `packages/tools/eval/optimizer.ts`
- **Depends on**: T1.1, T1.4（需要 score.json + judge API client）
- **Verify**:
  - 命令: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
  - 預期: 編譯通過；optimizer 匯出 extractIssues(), deduplicateIssues(), generateOptimizationPlan()

#### T2.2: 上下文隔離與工具模擬 (eval-isolation)

- **Goal**: 實作工具調用 dispatcher（read passthrough / write mock 回傳合理值）、獨立評分上下文工廠（每次 judge call 新建 messages array）
- **Files**: `packages/tools/eval/isolation.ts`
- **Depends on**: T1.1（需要理解工具調用介面；與 T1.2 無檔案重疊，可並行）
- **Verify**:
  - 命令: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
  - 預期: 編譯通過；isolation 匯出 createToolDispatcher() 和 createFreshContext()

#### T2.3: CLI 命令整合 (eval-cli)

- **Goal**: 實作 ToolDefinition（name: 'eval'），註冊到 tool-registration.ts，實作 CLI handler：參數解析（skill name, --mode, --optimize, --dry-run, --output-dir）、流程編排（出題→執行→評分→報告→可選優化）、進度顯示、exit code 管理
- **Files**: `packages/tools/eval/index.ts`, `packages/cli/tool-registration.ts`
- **Depends on**: T1.3, T1.4, T2.1（需要 executor + scorer + reporter + optimizer 作為依賴）
- **Verify**:
  - 命令: `node dist/bin/apollo-toolkit.js tools | grep eval`
  - 預期: 顯示 eval tool 及描述

#### T2.4: CI 整合 (eval-ci-gate)

- **Goal**: 建立 `.github/workflows/eval.yml`：on pull_request with paths: skills/**，setup Node + 安裝依賴 + 執行 `apltk eval spec --mode standard`，失敗時在 PR 評論回報摘要
- **Files**: `.github/workflows/eval.yml`
- **Depends on**: T2.3（需要 CLI 命令可用）
- **Verify**:
  - 命令: `cat .github/workflows/eval.yml | yq '.on.pull_request.paths'` (或手動檢查)
  - 預期: workflow 語法正確，paths filter 包含 skills/**

---

## 6. Worker Prompt Library

### T1.1: 共享工具庫遷移

```
## Mission
將 scripts/ 下的四個共用模組遷移到 packages/tools/eval/lib/，從 .mjs (Node ESM) 轉換為 TypeScript。
這些模組是整個評測系統的基礎層，所有其他模組都依賴它們。

## Input
- 閱讀 `scripts/lib/judge-api.mjs` — Judge/Exec model API 呼叫與 JSON parse fallback
- 閱讀 `scripts/lib/promise-pool.mjs` — 並發控制
- 閱讀 `scripts/env-utils.mjs` — .env 載入與驗證（含 REQUIRED_VARS 和 DEFAULTS）
- 閱讀 `scripts/question-utils.mjs` — 題目載入、驗證、剝離評分標準
- 閱讀 `packages/tool-registry/types.ts` — ToolContext, ToolDefinition 型別定義（理解專案 TypeScript 慣例）
- 閱讀 `packages/tools/create-specs/index.ts` — 現有 CLI tool 的 TypeScript 寫法參考

## What to do
1. 建立目錄 `packages/tools/eval/lib/`
2. 建立 `packages/tools/eval/tsconfig.json`（參考 `packages/tools/create-specs/tsconfig.json`）
3. 在 `packages/tools/eval/lib/` 下建立四個檔案：
   - `judge-api.ts`: 匯出 callJudgeModelRaw(), callJudgeModel(), parseJudgeOutput(), callExecModel()
     - 將 CommonJS 風格的 import 轉為 TypeScript import
     - 將 JSDoc 型別註解轉為 TypeScript type annotations
     - parseJudgeOutput() 的多層 fallback 邏輯必須完整保留
   - `promise-pool.ts`: 匯出 promisePool() 泛型函數
   - `env-utils.ts`: 匯出 loadEnv()，保留所有 REQUIRED_VARS、DEFAULTS、自我測試邏輯
     - 支援從指定路徑或 process.cwd() 載入 .env
   - `question-utils.ts`: 匯出 loadQuestions(), stripScoringCriteria(), getScoringCriteria(), loadSchema(), SCORING_DIMENSIONS, SPEC_WORKFLOW_STEPS
     - 保留 validateQuestion() 的完整驗證邏輯
4. 確保所有函數有正確的 TypeScript 型別標註
5. 保留原始 .mjs 檔案不變（作為向後兼容）

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/lib/judge-api.ts` — 新建
  - `packages/tools/eval/lib/promise-pool.ts` — 新建
  - `packages/tools/eval/lib/env-utils.ts` — 新建
  - `packages/tools/eval/lib/question-utils.ts` — 新建
  - `packages/tools/eval/tsconfig.json` — 新建
- 禁止修改的檔案:
  - scripts/ 下的任何原始 .mjs 檔案（保留原樣）
  - 其他 packages/ 下的任何檔案

## Output
完成後必須回報：
- 修改了哪些檔案（絕對路徑）
- 每個檔案的變更摘要
- TypeScript 編譯結果（npx tsc --noEmit）
- 遇到的任何阻礙或風險

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
- 預期: 四個 TS 檔案編譯通過，無型別錯誤

## Boundaries
- 不要修改 scripts/ 目錄下的任何原始檔案
- 不要引入新的外部依賴（只使用 Node.js 內建模組的型別定義）
- 保留原始 .mjs 檔案的所有函數邏輯（不要簡化或刪除功能）
- 如果型別轉換遇到無法解決的問題，標記 `// TODO` 並回報
```

### T1.2: 題庫管理模組

```
## Mission
建立評測題庫管理模組 `eval-question`，負責載入、驗證、抽樣題目，以及生成 LLM 變體。
題庫是整個評測流程的輸入起點。

## Input
- 閱讀 `packages/tools/eval/lib/question-utils.ts` — 題目載入/驗證/剝離的基礎函數
- 閱讀 `assets/spec/question-schema.json` — 題目 JSON Schema 定義
- 閱讀 `assets/spec/2026-05-28/test-questions.json` — 現有 100 道題目範例
- 閱讀 `docs/plans/2026-05-29/skill-eval-optimizer/eval-core/SPEC.md` — R1 需求（題庫管理與題目生成）

## What to do
1. 建立 `packages/tools/eval/question-loader.ts`
2. 實作以下函數：
   - `loadQuestions(filePath: string): Question[]` — 包裝 lib/question-utils 的 loadQuestions，增加檔案不存在時的明確錯誤訊息
   - `sampleQuestions(questions: Question[], mode: 'fast' | 'standard'): Question[]` — 按模式抽樣：
     - fast: 3-5 題，從不同難度分層抽樣
     - standard: 8-12 題，按 basic:advanced:edge 比例約 4:4:2 抽樣
   - `generateVariant(question: Question, env: EnvConfig): Promise<Question>` — 使用 LLM 生成題目變體：
     - 改寫 userPrompt 和 projectContext 的場景描述
     - 保留原始 scoringCriteria 不變（這是關鍵不變量）
     - 保留原始 difficulty 標記
3. 定義 Question 型別（對應 question-schema.json 的結構）
4. 定義 EnvConfig 型別（JUDGE_BASE_URL, JUDGE_MODEL, JUDGE_API_KEY）

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/question-loader.ts` — 新建
- 禁止修改的檔案:
  - `packages/tools/eval/lib/` 下的檔案（屬於 T1.1）
  - 其他 packages/ 下的任何檔案

## Output
完成後必須回報：
- 修改了哪些檔案（絕對路徑）
- 每個檔案的變更摘要
- TypeScript 編譯結果
- 遇到的任何阻礙或風險

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
- 預期: question-loader.ts 編譯通過，與 lib 模組的 import 正確

## Boundaries
- 不要修改 lib/ 目錄下的檔案（即使發現問題，僅回報）
- 不要引入新的外部依賴
- LLM 變體生成需保留原始 scoringCriteria — 這是最關鍵的不變量
```

### T1.3: 評測執行器

```
## Mission
建立評測執行器 `eval-executor`。這是最核心的模組：在隔離環境中讓模型執行技能，記錄完整的工具調用軌跡為 JSONL，支援 timeout、指數退避重試、並發控制。

## Input
- 閱讀 `packages/tools/eval/lib/judge-api.ts` — callExecModel() 的介面
- 閱讀 `packages/tools/eval/lib/promise-pool.ts` — promisePool() 並發控制
- 閱讀 `packages/tools/eval/lib/env-utils.ts` — EXEC_* 環境變數的定義
- 閱讀 `packages/tools/eval/question-loader.ts` — Question 型別定義
- 閱讀 `scripts/run-evals.mjs` — 現有實作的完整邏輯（參考 initWorkspace, runSingleTest, withRetry）
- 閱讀 `docs/plans/2026-05-29/skill-eval-optimizer/eval-core/SPEC.md` — R2 需求

## What to do
1. 建立 `packages/tools/eval/executor.ts`
2. 實作以下核心函數：
   - `initWorkspace(testNo: string, projectContext: ProjectContext, date: string): Promise<string>` — 建立隔離工作目錄，寫入初始檔案
   - `appendTrace(tracePath: string, event: TraceEvent): Promise<void>` — append JSONL event
   - `runSingleTest(question: Question, env: EnvConfig, date: string, skillName: string): Promise<TestResult>` — 執行單一測試：
     - 建構 system prompt（含工作目錄限制）
     - 呼叫 callExecModel()（含 AbortController timeout）
     - 記錄 start → thinking → response → end/error events
     - 寫入 .done marker
     - 支援指數退避重試 (1s/2s/4s，最多 3 次)
   - `runAllTests(questions: Question[], env: EnvConfig, date: string, skillName: string): Promise<TestResult[]>` — 使用 promisePool 並發執行
3. 定義型別：TraceEvent, TestResult, ProjectContext, ToolCallRecord
4. 保留重試邏輯：timeout 和 API error 分別處理，timeout 記錄為 'timeout' 狀態
5. 執行模型和評分模型使用獨立的 env var（EXEC_* vs JUDGE_*）

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/executor.ts` — 新建
- 禁止修改的檔案:
  - `packages/tools/eval/lib/` 下的檔案
  - `packages/tools/eval/question-loader.ts`

## Output
完成後必須回報：
- 修改了哪些檔案（絕對路徑）
- 每個檔案的變更摘要
- TypeScript 編譯結果
- 遇到的任何阻礙或風險

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
- 預期: executor.ts 編譯通過，import 路徑正確

## Boundaries
- 不要修改 lib/ 和 question-loader.ts
- 不要引入新的外部依賴
- 現有 run-evals.mjs 的完整邏輯必須全部保留下來（不要簡化）
- system prompt 中的工作目錄限制必須保留（防止模型操作真實檔案）
```

### T1.4: 評分引擎與報告

```
## Mission
建立評分引擎 `eval-scorer` 和報告模組 `eval-reporter`。
Scorer 讀取 executor 產出的 JSONL 軌跡，呼叫 Judge Model API 從三維度評分，產出 score.json。
Reporter 彙總所有 score.json 產出結構化 Markdown 報告。

## Input
- 閱讀 `packages/tools/eval/lib/judge-api.ts` — callJudgeModel() 和 parseJudgeOutput() 的介面
- 閱讀 `packages/tools/eval/lib/promise-pool.ts` — 並發控制
- 閱讀 `packages/tools/eval/lib/question-utils.ts` — SCORING_DIMENSIONS, getScoringCriteria()
- 閱讀 `packages/tools/eval/executor.ts` — TraceEvent, TestResult 型別
- 閱讀 `scripts/score.mjs` — 現有評分邏輯（buildJudgePrompt, scoreSingleTest, watchMode, scanForDone）
- 閱讀 `docs/plans/2026-05-29/skill-eval-optimizer/eval-core/SPEC.md` — R3 需求

## What to do
1. 建立 `packages/tools/eval/scorer.ts`
2. 實作：
   - `readTrace(tracePath: string): TraceEvent[]` — 讀取 JSONL，處理損壞行
   - `buildJudgePrompt(trace: TraceEvent[], scoringCriteria: ScoringCriteria, testId: string): string` — 建構評分提示詞：
     - 從 trace 中提取 system prompt, user prompt, assistant response, errors
     - 截斷過長 assistant response (>8000 chars)
     - 組合三維度評分標準（instruction_adherence / tool_calling / result_quality）
     - 要求 judge 輸出 JSON 格式（含 overallScore, dimensions[], issues[], summary）
   - `scoreSingleTest(testNo: string, date: string, env: EnvConfig, questionMap?: Record): Promise<ScoreResult>` — 評分單題：
     - 讀取 trace → 獲取 scoring criteria → 建構 prompt → 呼叫 judge → parse output
     - 使用 mkdir mutex (`.scoring-lock`) 防止並發衝突
     - 寫入 `.scored` marker 和 `score.json`
     - .scored marker 防止重複評分
   - `scoreAllTests(date: string, env: EnvConfig): Promise<ScoreResult[]>` — 使用 promisePool 並發評分
   - `watchMode(date: string, env: EnvConfig): Promise<void>` — 監視模式（偵測 .done 即評分）
3. 建立 `packages/tools/eval/reporter.ts`
4. 實作：
   - `generateReport(scores: ScoreResult[], date: string): string` — 產出 Markdown 報告：
     - 總分與各維度平均分
     - 每題明細（分數、扣分原因、關鍵軌跡引用）
     - 常見問題模式摘要
5. 評分維度更新為三維度：
   - `instruction_adherence` (指令遵循) — 取代 outcome
   - `tool_calling` (工具調用) — 取代 process
   - `result_quality` (結果質量) — 合併 style + efficiency

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/scorer.ts` — 新建
  - `packages/tools/eval/reporter.ts` — 新建
- 禁止修改的檔案:
  - `packages/tools/eval/lib/` 下的檔案
  - `packages/tools/eval/executor.ts`, `question-loader.ts`

## Output
完成後必須回報：
- 修改了哪些檔案（絕對路徑）
- 每個檔案的變更摘要
- TypeScript 編譯結果
- 遇到的任何阻礙或風險

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
- 預期: scorer.ts + reporter.ts 編譯通過

## Boundaries
- 不要修改 lib/ 和其他 eval 模組檔案
- 不要引入新的外部依賴
- parseJudgeOutput() 的四層 fallback 必須完整保留
- 評分維度改為三維度，但 lib/question-utils.ts 中的 SCORING_DIMENSIONS 保持不變（由 T1.1 維護）
```

### T2.1: 優化引擎

```
## Mission
建立優化引擎 `eval-optimizer`。從 scorer 產出的 score.json 提取問題、去重、生成 FIND/REPLACE 格式的優化 diff。
這是評測結果轉化為可執行改善的關鍵模組。

## Input
- 閱讀 `packages/tools/eval/lib/judge-api.ts` — callJudgeModelRaw() 的介面
- 閱讀 `packages/tools/eval/scorer.ts` — ScoreResult 型別
- 閱讀 `scripts/optimize.mjs` — 完整的現有優化邏輯（七階段 pipeline：聚合→提取→去重→fix生成→計劃→SKILL.md優化→apltk優化）
- 閱讀 `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/SPEC.md` — R1 需求
- 閱讀 `skills/spec/SKILL.md` — 了解技能檔案結構（frontmatter + body）

## What to do
1. 建立 `packages/tools/eval/optimizer.ts`
2. 實作：
   - `loadAllScores(date: string): ScoreResult[]` — 掃描 results 目錄載入所有 score.json
   - `extractIssues(scores: ScoreResult[]): RawIssue[]` — 從 score.issues[] 提取所有問題，標記來源 testNo
   - `extractKeywords(text: string): Set<string>` — 分詞 + stemming + bigram 提取
   - `jaccardSimilarity(setA: Set<string>, setB: Set<string>): number` — Jaccard 相似度
   - `deduplicateIssues(issues: RawIssue[], env: EnvConfig, judgeAvailable: boolean): Promise<DedupedIssue[]>` — 兩階段去重：
     - Phase 1: 按 category 分組，Jaccard 相似度 > 0.35 合併
     - Phase 2 (可選): Judge model 語意相似度 refine（union-find 合併）
   - `generateSuggestedFix(issue: DedupedIssue, env: EnvConfig, judgeAvailable: boolean): Promise<string>` — 生成修復建議
   - `generateOptimizationPlan(issues: DedupedIssue[], date: string, scores: ScoreResult[]): OptimizationPlan` — 按優先級排序 (P0>P1>P2)，產出 optimization-plan.json
   - `optimizeSkillMd(plan: OptimizationPlan, skillMdPath: string, env: EnvConfig, dryRun: boolean, date: string, judgeAvailable: boolean): Promise<Result>` — 優化 SKILL.md：
     - 讀取當前 SKILL.md → 備份 (.bak) → Judge model 生成建議 → 解析 FIND/REPLACE → 應用修改
     - dry-run 時僅寫入 skill-optimization-patch.md
     - 修改後執行 validate-skill-frontmatter 驗證
     - 驗證失敗 → 自動復原備份
3. 保留所有 STOP_WORDS（中英文停用詞）和 simpleStem() 邏輯
4. ALLOWED_FILES 白名單限制修改範圍：僅 `skills/<name>/SKILL.md`, `skills/<name>/scripts/`, `skills/<name>/references/`, `skills/<name>/assets/`

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/optimizer.ts` — 新建
- 禁止修改的檔案:
  - `packages/tools/eval/lib/` 下的檔案
  - `packages/tools/eval/scorer.ts`, `reporter.ts`, `executor.ts`
  - `skills/spec/SKILL.md`（僅在真實應用模式才修改，worker 不碰）

## Output
完成後必須回報：
- 修改了哪些檔案（絕對路徑）
- 每個檔案的變更摘要
- TypeScript 編譯結果
- 遇到的任何阻礙或風險

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
- 預期: optimizer.ts 編譯通過

## Boundaries
- 不要修改 skills/ 下的任何檔案（optimizer 在執行時才修改，worker 不碰）
- 不要修改 lib/ 和其他 eval 模組檔案
- 不要引入新的外部依賴
- 現有 optimize.mjs 的完整邏輯必須保留（不要簡化去重演算法）
```

### T2.2: 上下文隔離與工具模擬

```
## Mission
建立隔離模組 `eval-isolation`。提供兩個核心能力：
1. 工具調用攔截：讀取操作（Read, Grep, Bash-readonly）真實執行；寫入操作（Write, Edit, Bash-write）mock 回傳
2. 評分上下文工廠：每次 judge call 使用全新 messages array，確保上下文不污染

## Input
- 閱讀 `packages/tools/eval/executor.ts` — 了解 executor 的工具調用流程
- 閱讀 `packages/tools/eval/scorer.ts` — 了解 scorer 的 judge 呼叫流程
- 閱讀 `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/SPEC.md` — R4 需求
- 閱讀 `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/DESIGN.md` — INT-010, Section 4 隔離設計

## What to do
1. 建立 `packages/tools/eval/isolation.ts`
2. 實作：
   - `createToolDispatcher(options: { workspaceDir: string }): ToolDispatcher` — 建立工具分發器：
     - 定義 READ_TOOLS 集合（Read, Grep, Glob, Bash-readonly, LSP 操作）
     - 定義 WRITE_TOOLS 集合（Write, Edit, Bash-write, NotebookEdit）
     - dispatcher 攔截工具調用請求：
       - 若 tool 在 READ_TOOLS → 真實執行（傳遞到真實 tool handler）
       - 若 tool 在 WRITE_TOOLS → 記錄調用意圖（tool name + params），回傳模擬成功 result
       - 模擬回傳值合理且一致（Write 回傳 file written; Edit 回傳 replacement applied）
     - 未知工具 → 記錄 warning 並 passthrough（安全預設）
   - `createFreshContext(): MessageContext` — 建立獨立上下文：
     - 回傳空白 messages array，不包含任何先前對話歷史
     - 每次 judge call 前調用，確保不同題目之間無上下文洩漏
   - `validateIsolation(messages: Message[]): boolean` — 驗證上下文隔離：
     - 檢查 messages 是否包含不應存在的 trace 或先前 judge 輸出
3. 定義型別：ToolDispatcher, MockToolResult, MessageContext

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/isolation.ts` — 新建
- 禁止修改的檔案:
  - `packages/tools/eval/lib/` 下的檔案
  - 其他所有 packages/tools/eval/ 下的檔案

## Output
完成後必須回報：
- 修改了哪些檔案（絕對路徑）
- 每個檔案的變更摘要
- TypeScript 編譯結果
- 遇到的任何阻礙或風險

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
- 預期: isolation.ts 編譯通過

## Boundaries
- 不要修改 executor.ts 或 scorer.ts（isolation 是被這些模組調用的工具）
- 不要引入新的外部依賴
- 工具名單（READ_TOOLS / WRITE_TOOLS）必須易於擴展（使用 Set 或 config object，不要 hardcode if-else chain）
- mock 回傳值的格式必須與真實工具的回傳格式一致
```

### T2.3: CLI 命令整合

```
## Mission
將所有 eval 模組整合為 `apltk eval` CLI 命令。這是整個評測系統的進入點。
實作 ToolDefinition、CLI handler、參數解析、流程編排，並註冊到 tool registry。

## Input
- 閱讀 `packages/tool-registry/types.ts` — ToolDefinition, ToolContext 型別
- 閱讀 `packages/cli/tool-registration.ts` — 現有工具註冊列表
- 閱讀 `packages/tools/create-specs/index.ts` — 現有 CLI tool 的 handler 寫法參考
- 閱讀 `packages/tools/eval/executor.ts` — runAllTests() 介面
- 閱讀 `packages/tools/eval/scorer.ts` — scoreAllTests() 介面
- 閱讀 `packages/tools/eval/reporter.ts` — generateReport() 介面
- 閱讀 `packages/tools/eval/optimizer.ts` — generateOptimizationPlan(), optimizeSkillMd() 介面
- 閱讀 `packages/tools/eval/question-loader.ts` — loadQuestions(), sampleQuestions() 介面
- 閱讀 `packages/tools/eval/isolation.ts` — createToolDispatcher() 介面
- 閱讀 `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/SPEC.md` — R2 需求

## What to do
1. 建立 `packages/tools/eval/index.ts`
2. 實作 `tool: ToolDefinition` 匯出：
   - name: 'eval'
   - category: 'Quality & testing'
   - description: 'Evaluate and optimize agent skills using LLM-as-Judge'
3. 實作 `evalHandler(args: string[], context: ToolContext): Promise<number>`：
   - 參數解析:
     - positional: `<skill_name>`（必要，無指定時顯示可用技能列表）
     - `--mode fast|standard`（預設 fast）
     - `--optimize`（評測後執行優化）
     - `--dry-run`（優化僅輸出 patch，不修改檔案）
     - `--output-dir <dir>`（報告輸出目錄，預設 results/spec/{date}/）
   - 流程編排:
     1. 載入題庫 (loadQuestions)
     2. 抽樣 (sampleQuestions, 依 mode 參數)
     3. 執行評測 (runAllTests)
     4. 評分 (scoreAllTests)
     5. 產出報告 (generateReport) → 寫入檔案 + 終端機顯示摘要
     6. 若 --optimize: 執行優化引擎 → 產出 diff
   - 進度顯示: 每個階段開始/完成時輸出狀態行
   - exit code: 0 = 全部通過, 1 = 有錯誤或低分
4. 修改 `packages/cli/tool-registration.ts`：
   - 在已知工具列表中新增 `@laitszkin/tool-eval` 模組名稱
   - 確保 import 路徑與其他工具一致

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/index.ts` — 新建
  - `packages/cli/tool-registration.ts` — 在工具列表陣列中新增一行
- 禁止修改的檔案:
  - 所有 `packages/tools/eval/` 下的其他模組檔案

## Output
完成後必須回報：
- 修改了哪些檔案（絕對路徑）
- 每個檔案的變更摘要
- TypeScript 編譯結果
- `apltk tools` 輸出中是否出現 eval tool
- 遇到的任何阻礙或風險

## Verify
- 執行: `npx tsc --noEmit`
- 預期: 全專案編譯通過，無型別錯誤
- 執行: `node dist/bin/apollo-toolkit.js tools | grep eval`
- 預期: 顯示 eval tool 及描述

## Boundaries
- tool-registration.ts 中只新增一行模組名稱，不修改其他工具註冊邏輯
- CLI handler 不實作任何業務邏輯（只做編排和委派）
- 不指定 skill_name 時必須顯示清晰的可用技能列表
```

### T2.4: CI 整合

```
## Mission
建立 GitHub Actions workflow，在 PR 修改技能檔案時自動觸發評測，作為品質閘門。

## Input
- 閱讀 `.github/workflows/` 目錄下是否有現有 workflow 檔案（了解專案 CI 慣例）
- 閱讀 `package.json` — 了解 npm scripts
- 閱讀 `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/SPEC.md` — R3 需求

## What to do
1. 建立 `.github/workflows/eval.yml`
2. Workflow 定義：
   - name: "Skill Eval Gate"
   - on:
     - pull_request:
       paths:
         - 'skills/**'  # 僅技能檔案變更時觸發
   - jobs:
     - eval:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: '20'
         - run: npm ci
         - run: npm run build
         - name: Run skill evaluation
           run: node dist/bin/apollo-toolkit.js eval spec --mode standard
           env:
             EXEC_BASE_URL: ${{ secrets.EXEC_BASE_URL }}
             EXEC_MODEL: ${{ secrets.EXEC_MODEL }}
             EXEC_API_KEY: ${{ secrets.EXEC_API_KEY }}
             JUDGE_BASE_URL: ${{ secrets.JUDGE_BASE_URL }}
             JUDGE_MODEL: ${{ secrets.JUDGE_MODEL }}
             JUDGE_API_KEY: ${{ secrets.JUDGE_API_KEY }}
           continue-on-error: true  # 不阻塞 PR，僅報告
         - name: Report results
           if: always()
           run: |
             echo "## Skill Eval Results" >> $GITHUB_STEP_SUMMARY
             # 若報告存在，附加摘要到 workflow summary
3. 在 workflow 檔案頭部加入註解說明需要的 GitHub Secrets

## Scope
- 允許修改的檔案:
  - `.github/workflows/eval.yml` — 新建
- 禁止修改的檔案:
  - 所有其他檔案

## Output
完成後必須回報：
- 修改了哪些檔案（絕對路徑）
- workflow 的結構摘要
- 遇到的任何阻礙或風險

## Verify
- 執行: `cat .github/workflows/eval.yml` （人工檢查語法）
- 預期: YAML 語法正確，on.pull_request.paths 包含 'skills/**'

## Boundaries
- 僅建立一個 workflow 檔案，不修改其他 CI 配置
- 使用 `continue-on-error: true` 確保評測失敗不阻塞 PR（初期作為非阻斷性檢查）
- 所有 secrets 名稱必須與 .env.example 中的變數名稱對應
```

---

## 7. Batch Schedule

### Batch 1 — Foundation Layer

- **Tasks**: T1.1
- **Strategy**: 派發單一 worker
- **Gate**:
  - [ ] T1.1 worker 回報成功
  - [ ] 執行驗證: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` 通過
  - [ ] 確認四個 lib 檔案存在於 `packages/tools/eval/lib/`

---

### Batch 2 — Eval Core (Parallel)

- **Tasks**: T1.2, T1.3
- **Strategy**: 並行派發 2 個 worker（無檔案重疊、無邏輯依賴）
- **Depends on**: Batch 1
- **Gate**:
  - [ ] T1.2 worker 回報成功
  - [ ] T1.3 worker 回報成功
  - [ ] 執行驗證: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` 通過
  - [ ] 確認 question-loader.ts 和 executor.ts 存在

---

### Batch 3 — Eval Scoring & Reporting

- **Tasks**: T1.4
- **Strategy**: 派發單一 worker（依賴 T1.3 的 executor）
- **Depends on**: Batch 2
- **Gate**:
  - [ ] T1.4 worker 回報成功
  - [ ] 執行驗證: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` 通過
  - [ ] 確認 scorer.ts 和 reporter.ts 存在

---

### Batch 4 — Optimization & Isolation (Parallel)

- **Tasks**: T2.1, T2.2
- **Strategy**: 並行派發 2 個 worker（無檔案重疊：optimizer.ts vs isolation.ts）
- **Depends on**: Batch 3 (T2.1 needs scorer.ts), Batch 1 (T2.2 needs lib)
- **Gate**:
  - [ ] T2.1 worker 回報成功
  - [ ] T2.2 worker 回報成功
  - [ ] 執行驗證: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` 通過

---

### Batch 5 — CLI Integration

- **Tasks**: T2.3
- **Strategy**: 派發單一 worker（依賴所有 eval 模組）
- **Depends on**: Batch 3, Batch 4
- **Gate**:
  - [ ] T2.3 worker 回報成功
  - [ ] 執行驗證: `npx tsc --noEmit`（全專案編譯通過）
  - [ ] 執行驗證: `node dist/bin/apollo-toolkit.js tools | grep eval` 顯示 eval tool

---

### Batch 6 — CI Gate

- **Tasks**: T2.4
- **Strategy**: 派發單一 worker
- **Depends on**: Batch 5
- **Gate**:
  - [ ] T2.4 worker 回報成功
  - [ ] 確認 `.github/workflows/eval.yml` 存在且語法正確

---

### Batch 7 — Final Integration & Verification

- **Tasks**: 協調器直接處理（不需派發 worker）
- **Strategy**: 協調器執行以下整合任務：
  1. 執行 `npm run build` 確認全專案建置成功
  2. 執行 `npm test` 確認所有現有測試通過
  3. 執行 `node dist/bin/apollo-toolkit.js tools` 確認 eval tool 出現在工具列表中
  4. 執行 `node dist/bin/apollo-toolkit.js eval --help` 確認 help 輸出正確
  5. 檢查 `packages/cli/tool-registration.ts` 的修改與現有工具列表一致
  6. 若需要，更新 `package.json` 的 workspaces 配置（若新增了 packages/tools/eval）
- **Depends on**: 所有前置批次
- **Gate**:
  - [ ] `npm run build` 通過
  - [ ] `npm test` 所有測試通過
  - [ ] `apltk tools` 顯示 eval tool
  - [ ] `apltk eval --help` 輸出正確

---

## 8. Verification Checkpoints

### Per-batch

| 批次 | 驗證命令 | 預期結果 |
|---|---|---|
| Batch 1 | `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` | 四個 lib TS 檔案編譯通過 |
| Batch 2 | `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` | question-loader.ts + executor.ts 編譯通過 |
| Batch 3 | `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` | scorer.ts + reporter.ts 編譯通過 |
| Batch 4 | `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` | optimizer.ts + isolation.ts 編譯通過 |
| Batch 5 | `npx tsc --noEmit` + `apltk tools \| grep eval` | 全專案編譯通過 + eval 出現在工具列表 |
| Batch 6 | `cat .github/workflows/eval.yml` | workflow YAML 存在且語法正確 |
| Batch 7 | `npm run build` + `npm test` + CLI checks | 全專案建置 + 測試 + CLI 驗證通過 |

### Key behavior checks (from CHECKLIST.md)

| ID | 可觀察行為 | 對應 SPEC 需求 | 驗證方式 |
|---|---|---|---|
| CL-01 | 從 JSON 檔案載入題庫，驗證格式正確 | R1.1, R1.2 | `apltk eval spec --mode fast` (手動） |
| CL-03 | 按模式抽取指定數量題目 | R1.3 | `sampleQuestions()` 的單元測試 |
| CL-05 | 執行成功時記錄完整 trace JSONL | R2.1 | 檢查 trace.jsonl 結構 |
| CL-09 | 評分模型從三維度產出 score.json | R3.1-R3.4 | 檢查 score.json 結構 |
| CL-07 | `apltk eval spec` 執行快速模式評測 | R2.1, R2.2 | CLI exit code 0，REPORT.md 產出 |
| CL-08 | `apltk eval spec --mode standard` 使用 8-12 題 | R2.1 | 檢查報告中題目數量 |
| CL-09 | `apltk eval spec --optimize --dry-run` 產出優化 patch | R2.3 | 檢查 patch 檔案存在 |
| CL-10 | 不指定 skill_name 時顯示可用技能列表 | R2.4 | CLI 輸出檢查 |
| CL-15 | 寫入操作被 mock 攔截 | R4.1 | 隔離測試 |
| CL-17 | 評分模型上下文不包含被評測模型的對話歷史 | R4.2 | judge prompt 內容檢查 |

### Final verification

- [ ] 完整測試套件通過: `npm test`
- [ ] 全專案建置通過: `npm run build`
- [ ] CLI 工具列表包含 eval: `apltk tools | grep eval`

---

## 9. Error Recovery

| 失敗場景 | 處理方式 |
|---|---|
| 單一 worker 回報失敗 | 用 worker 已有的上下文繼續它（不要新建），給予更具體的指令。最多再試一次。 |
| 同一 worker 兩次嘗試後仍失敗 | 暫停整個流程，保留同批次其他成功 worker 的結果。向用戶報告：哪個任務失敗、已嘗試的方式、建議的下一步。 |
| TypeScript 編譯錯誤（跨模組型別不匹配） | 協調器分析錯誤訊息，判斷是哪個 worker 的型別定義需要修正，指示該 worker 修正。 |
| 合併衝突（合併 worker 結果時） | 協調器自己解決衝突，解決後重新執行該批次驗證。 |
| 測試回歸（新代碼導致現有測試失敗） | 暫停，向用戶報告：哪個測試失敗、可能的原因、涉及的 worker。不要為了讓測試通過而弱化測試。 |
| 發現 SPEC/DESIGN 矛盾或不可行的設計 | 暫停，記錄具體矛盾點，通知用戶。 |
| tool-registration.ts import 失敗（新增模組未建置） | 協調器執行 `npm run build` 確保所有 workspace 已建置，再重新執行驗證。 |

---

## 10. Boundaries

### ALWAYS

- 每個批次完成後立即執行 Gate 驗證
- Worker prompt 必須從 Section 6 原樣擷取，不要自己改寫
- Worker 回報後，先消化結果再決定下一步
- 遵循 File Ownership 表 — 不讓兩個 worker 修改同一檔案
- 確認 packages/tools/eval/tsconfig.json 在 Batch 1 就正確設定

### ASK FIRST — 暫停並向用戶確認

- 需要修改 SPEC/DESIGN 中未定義的檔案
- 需要新增外部依賴（目前設計要求零外部依賴）
- Worker 兩次嘗試失敗後
- 測試回歸無法快速定位原因
- 需要修改 `package.json` 的 workspaces 配置

### NEVER

- 協調器自己編輯原始碼檔案
- 讓 worker 生成子 worker
- 跳過驗證直接進入下一批次
- 給 worker 模糊的指令（如 "fix it" 或 "based on what you found"）
- 擅自擴大實作範圍（見 Section 3）
- 修改 `scripts/` 目錄下的原始 .mjs 檔案（保留作為向後兼容）

# Review Report

- **Spec**: skill-eval-optimizer (eval-core + optimize-and-integrate)
- **Date**: 2026-05-29
- **Reviewer**: Claude Code Review Agent (6 parallel agents)
- **Verdict**: Needs Work

---

## 判決說明

**Verdict**: Needs Work

Round 2 修復（commit `5f2061b`）宣稱修復了全部 12 個問題。但本輪審查發現一個嚴重的**文實不符**：commit message 明確列出「EVAL_MIN_SCORE / EVAL_MAX_P0 read from env vars, exit code checks P0 count」，然而 `git diff` 證實 `index.ts` 和 `lib/env-utils.ts` 在該 commit 中完全未被修改。測試檔案的 `computeEvalExitCode` 僅為本地 helper——描述期望行為而非測試實際程式碼。

此外發現 2 個大型死碼模組（共 ~190 行）、judge prompt 資訊傳遞不足，及其他 9 個 P1/P2 問題。

---

## 發現的問題

### P0 — 阻塞問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 1 | **EVAL_MIN_SCORE / EVAL_MAX_P0 環境變數未被代碼使用**：`index.ts` L341-345 將平均分門檻硬編碼為 60，exit code 邏輯完全未檢查 P0 問題數量。`env-utils.ts` 的 `EnvConfig` 介面不包含這兩個欄位，`loadEnv()` 不解析它們。CI workflow（eval.yml L51-52）設定了這兩個變數但程式碼不消費。Round 2 commit 宣稱已修復，但 `git diff 91863d7..5f2061b -- index.ts env-utils.ts` 輸出為空。測試檔案的 REGTEST-FIX02/FIX03 僅測試本地 helper `computeEvalExitCode`，未接入實際 `evalHandler`。 | CI 閘門不可配置：使用者無法調整分數門檻，P0 問題無法觸發 CI 失敗。違反 spec R3「分數門檻和 P0 問題數量閾值可配置」的核心合約 | `index.ts`, `lib/env-utils.ts` | index.ts:341-346, env-utils.ts:24-40 | 實作偏移、實作遺漏 |

### P1 — 重要問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 2 | **`generateVariant` 完全死碼**：約 75 行 LLM 變體生成函式從未被任何模組匯入或調用（源碼、測試、scripts/ 目錄均無引用）。 | 增加公開 API 表面積且包含 LLM 呼叫邏輯，刪除不影響任何功能 | `question-loader.ts` | 158-232 | 冗余代碼 |
| 3 | **`watchMode` 完全死碼**：約 115 行監視模式實作（含 `fs.watch`、polling、並發控制）從未被任何模組匯入。`scripts/score.mjs` 有自己的獨立實現。 | 未被整合的功能模組，增加維護成本且可能與 scripts/ 版本產生行為漂移 | `scorer.ts` | 521-635 | 冗余代碼 |
| 4 | **`buildJudgePrompt` 傳遞給 judge 的 trace events 資訊過於稀疏**：tool_call/tool_result 僅含工具名稱，不含參數和回傳結果；thinking 僅截取 userPrompt 前 60 字元；response 僅截取前 100 字元。Judge 被要求對「工具調用質量」維度評分，卻看不到實際的參數選擇和結果處理。 | Judge 缺乏足夠上下文準確評分 tool_calling 和 result_quality 維度，降低評分可靠性 | `scorer.ts` | 207-225 | 實作偏移 |
| 5 | **`readTrace` 使用 `as unknown as TraceEvent` 引入非法 type variant**：JSONL 行解析失敗時構造 `type: 'parse_error'` 物件，此 type 不在 `TraceEvent` 的 union 中（僅 `start\|thinking\|response\|tool_call\|tool_result\|error\|end`），透過雙重轉型強行塞入 `TraceEvent[]`。 | 下游 exhaustive switch/check 會在執行期遇到未預期值 | `scorer.ts` | 101 | 架構瑕疵 |
| 6 | **5 個僅內部使用的函式被匯出為公開 API**：`runSingleTest`、`appendTrace`、`initWorkspace`（executor.ts）、`scanForDone`、`isAlreadyScored`（scorer.ts）均僅在各自模組內部使用，無任何外部匯入。 | 不必要的公開 API 增加模組介面複雜度，誤導使用者 | `executor.ts`, `scorer.ts` | executor:50-55,69-95,434-441; scorer:475-492,501-504 | 冗余代碼 |
| 7 | **`generateSuggestedFix` 使用 `Promise.all` 無並發控制**：`index.ts` L305-311 對所有去重 issues 同時發起 judge model API 呼叫。同管線其他位置（executor、scorer、optimizer）均使用 `promisePool` 控制並發。 | 當 issues 數量多時可耗盡 API rate limit、觸發 429 錯誤 | `index.ts` | 305-311 | 性能隱患 |
| 8 | **`getProjectRoot` re-export 仍存在於 scorer.ts**：Round 2 宣稱已移除此 re-export，但 scorer.ts L30 仍然保留 `export { getProjectRoot }`。無任何模組從 scorer.ts 匯入此函式。 | Round 2 修復未實際執行，re-export 仍誤導匯入路徑 | `scorer.ts` | 30 | 冗余代碼、架構瑕疵 |

### P2 — 一般問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 9 | **`buildJudgePrompt` 多處未驗證型別轉型**：從 `Record<string, unknown>` 的 data 欄位取值時使用 `as string \| undefined` 等強制轉型（如 systemPrompt、userPrompt 等），這些值來自 JSONL 檔案解析，未經執行期驗證。 | 若 trace.jsonl 格式異常，會將錯誤型別的值傳入 judge prompt | `scorer.ts` | 160-168 | 架構瑕疵 |
| 10 | **`optimizer.ts` JSON.parse 直接斷言為 ScoreResult**：`loadAllScores()` L230 將 `JSON.parse()` 結果直接斷言為 `ScoreResult` 型別，無執行期結構驗證。 | score.json 損壞時下游收到不符預期的資料結構，拋出難追蹤的 TypeError | `optimizer.ts` | 230 | 架構瑕疵 |
| 11 | **`buildSystemPrompt` 硬編碼為 "spec-writing agent"**：system prompt 假設被評測技能永遠是 spec 類型，限制了 eval 工具對其他技能（code-review、debugging 等）的可用性。 | 對非 spec 技能的評測可能因不相關的 system prompt 產生偏差 | `executor.ts` | 111-130 | 實作偏移 |
| 12 | **4 個僅內部使用的常數被匯出**：`REQUIRED_VARS`、`DEFAULTS`（env-utils.ts）、`SCORING_DIMENSIONS`、`SPEC_WORKFLOW_STEPS`（question-utils.ts）僅在各自模組內部使用，無外部匯入。 | 不必要的公開常數 | `lib/env-utils.ts`, `lib/question-utils.ts` | env:48-55,60-67; q:77-82,92-101 | 冗余代碼 |
| 13 | **`scanForDone` 仍使用同步 I/O**：Round 2 宣稱加入 `scanForDoneAsync`，但匯出的 `scanForDone` 仍使用 `existsSync`/`readdirSync`。非同步版本是否存在需確認。 | watch mode polling 每 10 秒阻塞事件循環 | `scorer.ts` | 475-492 | 性能隱患 |
| 14 | **JudgeEnv/ExecEnv 窄介面被 EnvConfig 超集繞過**：`judge-api.ts` 定義了窄介面（最小權限設計），但所有呼叫方傳入完整的 `EnvConfig`。TypeScript 的結構型別系統允許超集賦值，使窄介面的編譯期保護失效。 | 窄介面設計意圖失效，無法在編譯期防止跨域存取（如在 judge 邏輯中誤用 EXEC_* 變數） | `lib/judge-api.ts` | 21-33, 70-74, 133-136, 210-214 | 架構瑕疵 |

### P3 — 建議改善

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 15 | **`loadSchema` 僅被 `selfTest` 使用**：實際 eval pipeline 生產路徑從不調用此函式。若移除 selfTest 則變成完全死碼。 | 與 selfTest 耦合的低價值函式 | `lib/question-utils.ts` | 115-124 | 冗余代碼 |
| 16 | **重複的 selfTest 結構**：`env-utils.ts` 和 `question-utils.ts` 各自複製了相同的「直接執行檢測 + selfTest()」樣板邏輯。 | 違反 DRY 原則 | `lib/env-utils.ts`, `lib/question-utils.ts` | env:212-263, q:322-492 | 冗余代碼 |
| 17 | **`enqueue` 使用 O(n) 陣列查找**：`scorer.ts` L578 使用 `pendingQueue.includes(testNo)` 而非 Set。佇列雖小，但語意不清晰。 | 極輕微 | `scorer.ts` | 578 | 性能隱患 |
| 18 | **`deduplicateIssues` 內部巢狀迴圈無 pair 數量上限**：Jaccard 相似度比較為 O(n²)，而 `refineDedupWithJudge` 已有 `MAX_PAIRS_PER_CATEGORY=100` 保護。第一階段去重缺少對等保護。 | 大量 issues 時效能下降 | `optimizer.ts` | 649-676 | 性能隱患 |

---

## 審查維度摘要

- **實作偏移**: 3 個 finding（P0: EVAL_MIN_SCORE/MAX_P0 未接入 × 1 + P1: judge prompt 資訊稀疏 + P2: system prompt 硬編碼）
- **實作遺漏**: 1 個 finding（P0: EVAL_MIN_SCORE/MAX_P0 未接入，與實作偏移合併計算）
- **冗余代碼**: 4 個 finding（P1: generateVariant 死碼 + watchMode 死碼 + 5 個內部函式匯出 + getProjectRoot re-export; P2: 4 個內部常數; P3 × 2）
- **架構瑕疵**: 3 個 finding（P1: parse_error 型別轉型; P2: buildJudgePrompt 未驗證轉型 + JSON.parse 無驗證 + EnvConfig 超集繞過窄介面）
- **性能隱患**: 2 個 finding（P1: Promise.all 無並發控制; P2: scanForDone 同步 I/O; P3 × 2）
- **幻覺代碼**: 無新發現（6 agent 獨立審查確認所有 import 符號存在、無虛構 API 調用）

---

## Review History

> **2026-05-29 (Round 1)**: 首次審查 — 發現 25 個問題（2 P0 + 13 P1 + 9 P2 + 1 P3），涵蓋 6 個審查維度。核心缺陷為 isolation.ts 未整合至 executor pipeline、軌跡引用未達 JSONL 行號精度。Verdict: Needs Work。
>
> **2026-05-29 (Round 2)**: 修復後再審查（commit `91863d7` 修復了 Round 1 全部 25 個問題）。確認核心 tool-use loop、JSONL 行號、getProjectRoot 共用、磁碟檢查、執行鎖、非同步 I/O 等修復已正確實作。發現 4 個 P1 殘留問題（讀取工具 mock 策略偏移、CI 門檻不可配置、Exit code 缺 P0 檢查、Judge prompt 缺完整 trace）及 7 個 P2/P3 項目。Verdict: Needs Work。
>
> **2026-05-29 (Round 3 — 本次)**: 修復後再審查（commit `5f2061b` 宣稱修復了 Round 2 全部 12 個問題）。發現 commit message 與實際代碼變更不一致：EVAL_MIN_SCORE / EVAL_MAX_P0 接入在 commit 中宣稱已修復，但 `index.ts` 和 `env-utils.ts` 在該 commit 中完全未被修改。測試檔案的 REGTEST-FIX02/FIX03 僅測試本地 helper 函式而非實際 `evalHandler`。另發現 2 個完全死碼模組（generateVariant + watchMode，共 ~190 行）、judge prompt 資訊傳遞不足導致評分品質受限、getProjectRoot re-export 殘留（Round 2 宣稱已移除）、及其他架構/性能問題。共計 1 P0 + 7 P1 + 6 P2 + 4 P3 = 18 個問題。Verdict: Needs Work。

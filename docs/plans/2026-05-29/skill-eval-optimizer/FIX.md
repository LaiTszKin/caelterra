# Fix Coordinator Prompt: skill-eval-optimizer (Round 3)

- **Date**: 2026-05-29
- **Source REPORT**: `docs/plans/2026-05-29/skill-eval-optimizer/REPORT.md`
- **Source Spec**: `docs/plans/2026-05-29/skill-eval-optimizer/`
- **Verdict**: Needs Work (1 P0 + 7 P1 + 6 P2 + 4 P3)

---

## 1. Your Role

你是**修復協調器**。你的工作不是寫程式碼，而是：

1. 理解問題清單與依賴關係
2. 按批次排程，從 Section 6 擷取預先寫好的 worker prompt 派發給 worker
3. 等待 worker 完成修復，消化結果
4. 執行驗證檢查點與回歸測試
5. 遇到阻礙時按錯誤恢復策略處理

**你不能做的事**：
- 親自編輯原始碼（必須透過 worker）
- 跳過驗證步驟
- 讓 worker 自己生成子 worker

---

## 2. Mission

修復 Round 3 審查發現的 14 個 P0/P1/P2 問題（4 個 P3 列入遠期建議，不納入本次修復範圍）。

核心目標：
1. **接入 EVAL_MIN_SCORE / EVAL_MAX_P0 環境變數**，使 CI 閘門真正可配置（P0）
2. **清理 ~190 行完全死碼**（generateVariant + watchMode）（P1）
3. **增強 judge prompt 的 trace 資訊傳遞**，提升評分品質（P1）
4. **修復型別安全問題**與不必要的公開 API（P1/P2）
5. **確保所有修復通過現有測試，無回歸**

---

## 3. Issue Inventory

| ID | Sev | 問題摘要 | 檔案 |
|----|-----|---------|------|
| FIX-01 | **P0** | EVAL_MIN_SCORE / EVAL_MAX_P0 未被代碼使用 | `index.ts`, `lib/env-utils.ts` |
| FIX-02 | P1 | `generateVariant` 完全死碼 (~75行) | `question-loader.ts` |
| FIX-03 | P1 | `watchMode` 完全死碼 (~115行) | `scorer.ts` |
| FIX-04 | P1 | `buildJudgePrompt` trace events 資訊稀疏 | `scorer.ts` |
| FIX-05 | P1 | `readTrace` parse_error `as unknown as` 轉型 | `scorer.ts`, `executor.ts` |
| FIX-06 | P1 | 5 個僅內部使用的函式被匯出 | `executor.ts`, `scorer.ts` |
| FIX-07 | P1 | `generateSuggestedFix` Promise.all 無並發控制 | `index.ts` |
| FIX-08 | P1 | `getProjectRoot` re-export 殘留 | `scorer.ts` |
| FIX-09 | P2 | `buildJudgePrompt` 未驗證型別轉型 | `scorer.ts` |
| FIX-10 | P2 | `JSON.parse` 直接斷言為 ScoreResult | `optimizer.ts` |
| FIX-11 | P2 | `buildSystemPrompt` 硬編碼 "spec-writing agent" | `executor.ts` |
| FIX-12 | P2 | 4 個僅內部使用的常數被匯出 | `lib/env-utils.ts`, `lib/question-utils.ts` |
| FIX-13 | P2 | `scanForDone` 使用同步 I/O | `scorer.ts` |
| FIX-14 | P2 | JudgeEnv/ExecEnv 窄介面被繞過 | `lib/judge-api.ts` |

---

## 4. Fix Dependency Analysis

### 檔案重疊矩陣

| 檔案 | 涉及的 Fix |
|------|-----------|
| `lib/env-utils.ts` | FIX-01, FIX-12 |
| `index.ts` | FIX-01, FIX-07 |
| `scorer.ts` | FIX-03, FIX-04, FIX-05, FIX-06, FIX-08, FIX-09, FIX-13 |
| `executor.ts` | FIX-05(type), FIX-06, FIX-11 |
| `question-loader.ts` | FIX-02 |
| `optimizer.ts` | FIX-10 |
| `lib/question-utils.ts` | FIX-12 |
| `lib/judge-api.ts` | FIX-14 |

### 關鍵重疊

- **scorer.ts** 有 7 個修復，分散在檔案不同區域（L30, L101, L160-168, L207-225, L475-504, L521-635）。可由單一 worker 在一次批次中全部處理。
- **index.ts** 有 2 個修復（FIX-01 exit code + FIX-07 concurrency）。必須在 Batch 1 (FIX-01) 之後再執行 FIX-07。
- **env-utils.ts** 有 2 個修復（FIX-01 新增欄位 + FIX-12 移除 export）。可在同一批次中一併處理。

---

## 5. Fix Details

### FIX-01 (P0): 接入 EVAL_MIN_SCORE / EVAL_MAX_P0

**根因**：Round 2 commit `5f2061b` 宣稱修復但 `git diff` 證實 `index.ts` 和 `env-utils.ts` 從未被修改。

**修復**：
1. `lib/env-utils.ts`: EnvConfig 新增 `EVAL_MIN_SCORE: number` 和 `EVAL_MAX_P0: number`；DEFAULTS 新增 `EVAL_MIN_SCORE: '60'` 和 `EVAL_MAX_P0: '0'`；loadEnv() return 加入 `parsePositiveInt` 轉換。
2. `index.ts` L341-346: `avgScore < 60` → `avgScore < env.EVAL_MIN_SCORE`；加入 P0 計數：`p0Count = scores.reduce(...)`，若 `env.EVAL_MAX_P0 > 0 && p0Count > env.EVAL_MAX_P0` → return 1。

**驗證**：`npx tsc --noEmit && node --test packages/tools/eval/test/index.test.js`

**複雜度**：中等（跨 2 檔案）

**回歸測試**：REGTEST-01 — 驗證 evalHandler exit code 整合行為（非僅本地 helper）

### FIX-02-FIX-14

詳見 Section 6 Worker Prompt Library，每個 prompt 中包含了具體的 "What to do" 步驟。

---

## 6. Worker Prompt Library

### WORKER-A: FIX-01 EVAL_MIN_SCORE / EVAL_MAX_P0 接入

```
## Mission
接入 EVAL_MIN_SCORE 和 EVAL_MAX_P0 環境變數，使 CI 閘門可配置。
目前 index.ts 使用硬編碼的 60 分門檻且完全未檢查 P0 問題數量。
CI workflow 設定的環境變數形同虛設。測試檔案已有 REGTEST-FIX02/FIX03
定義期望行為但僅測試本地 helper，未接入實際 evalHandler。

## Context
- Spec: optimize-and-integrate R3 "分數門檻和 P0 問題數量閾值可配置"
- Round 2 commit 宣稱已修復但 index.ts 和 env-utils.ts 從未被修改

## Input
- packages/tools/eval/lib/env-utils.ts
- packages/tools/eval/index.ts (L341-346 exit code)
- packages/tools/eval/test/index.test.js (computeEvalExitCode helper 做為 spec 參考)

## What to do
1. env-utils.ts:
   a. EnvConfig 介面加入 `EVAL_MIN_SCORE: number` 和 `EVAL_MAX_P0: number`
   b. DEFAULTS 加入 `EVAL_MIN_SCORE: '60'` 和 `EVAL_MAX_P0: '0'`
   c. loadEnv() return 加入:
      EVAL_MIN_SCORE: parsePositiveInt(stringVals.EVAL_MIN_SCORE ?? '60', 60),
      EVAL_MAX_P0: parsePositiveInt(stringVals.EVAL_MAX_P0 ?? '0', 0),
2. index.ts evalHandler L341-346:
   a. `avgScore < 60` → `avgScore < env.EVAL_MIN_SCORE`
   b. 加入 P0 計數:
      const p0Count = scores.reduce((sum, s) =>
        sum + (s.issues?.filter(i => i.severity === 'P0').length || 0), 0);
   c. 若 env.EVAL_MAX_P0 > 0 && p0Count > env.EVAL_MAX_P0，輸出 FAIL 訊息並 return 1

## Scope
- 允許修改: packages/tools/eval/lib/env-utils.ts, packages/tools/eval/index.ts
- 禁止修改: 其他任何檔案

## Output
回報: 修改的檔案清單、變更摘要、驗證命令結果

## Verify
- npx tsc --noEmit (零錯誤)
- node --test packages/tools/eval/test/index.test.js (全部通過)

## Boundaries
- EVAL_MAX_P0 預設值 0 表示 "P0 檢查預設關閉" (向後兼容)
- 不修改測試檔案
```

### WORKER-B: scorer.ts 綜合修復 (FIX-03,04,05,06,08,09,13)

```
## Mission
對 scorer.ts 進行 7 項修復：死碼移除、型別安全、資訊增強、非同步 I/O。
所有修改集中於 scorer.ts + executor.ts (TraceEvent type only)。

## Context
Round 3 審查在 scorer.ts 發現 7 個問題 (P1-P2)。這些修復分散在不同函式，
彼此無邏輯依賴，可由同一 worker 按順序完成。

## Input
- packages/tools/eval/scorer.ts (完整閱讀)
- packages/tools/eval/executor.ts (TraceEvent 型別定義 L31-36)
- packages/tools/eval/test/scorer.test.js

## What to do

### A. FIX-08 (L30): 移除 getProjectRoot re-export
- 刪除 `export { getProjectRoot };` (L30)
- 保留 L29 的 import (內部有使用)

### B. FIX-03: 移除 watchMode 死碼 (L521-635)
- 刪除 watchMode 函式 (約 115 行)
- 從 L19 import 中移除 `watch` (僅 watchMode 使用)
- 檢查 `mkdirSync` 在檔案其他處的使用，若僅 watchMode 使用則一併移除 import

### C. FIX-05: 修復 parse_error 型別
- executor.ts TraceEvent type union 新增 `| 'parse_error'`
- scorer.ts L101: 移除 `as unknown as TraceEvent`，改為直接 `as TraceEvent`

### D. FIX-06 (scorer 部分): 移除內部函式 export
- L475: `export function scanForDone` → `function scanForDone`
- L501: `export function isAlreadyScored` → `function isAlreadyScored`
- 檢查 test/scorer.test.js 是否有 import 這些函式，如有則更新測試

### E. FIX-04: 增強 trace 摘要 (L207-225)
- tool_call events: 加入 `JSON.stringify(params).substring(0, 200)`
- tool_result events: 加入 `JSON.stringify(result).substring(0, 200)`
- traceSummary 總長度上限設為 5000 字元 (超過截斷並加 "... (trace truncated)")
- 不要 filter 掉非 tool/thinking/response 事件 (所有事件都納入摘要)

### F. FIX-09: 加入執行期型別驗證 (L160-168)
- 在 buildJudgePrompt 內加入 helper:
  function safeString(val: unknown, fallback: string): string {
    return typeof val === 'string' ? val : fallback;
  }
- 用 safeString(...) 取代 `as string | undefined ?? '...'` 模式

### G. FIX-13: 新增非同步 scanForDoneAsync
- 使用 fs/promises (readdir + access) 實作 scanForDoneAsync
- export scanForDoneAsync 供未來非同步呼叫者使用
- 保留同步 scanForDone 作為內部函式

## Scope
- 允許修改: scorer.ts, executor.ts (僅 TraceEvent type)
- 允許修改: test/scorer.test.js (僅因移除 export 需要的 import 更新)
- 禁止修改: 其他檔案

## Output
回報: 每個子修復的摘要、刪除行數、驗證結果

## Verify
- npx tsc --noEmit (零錯誤)
- node --test packages/tools/eval/test/scorer.test.js (通過)
- node --test packages/tools/eval/test/executor.test.js (通過)

## Boundaries
- 不改變現有函式的業務邏輯行為
- 遇到測試失敗立即回報
```

### WORKER-C: executor.ts + question-loader.ts (FIX-02,06,11)

```
## Mission
對 executor.ts 和 question-loader.ts 進行 3 項修復：移除 generateVariant 死碼、
清理不必要的公開 API、參數化 system prompt。

## Context
- FIX-02: generateVariant 從未被調用 (~75行)
- FIX-06 (executor): runSingleTest, appendTrace, initWorkspace 僅內部使用
- FIX-11: buildSystemPrompt 硬編碼 "spec-writing agent"

## Input
- packages/tools/eval/executor.ts
- packages/tools/eval/question-loader.ts
- packages/tools/eval/test/executor.test.js

## What to do

### 1. FIX-02: 移除 generateVariant
- 從 question-loader.ts 刪除 generateVariant 函式 (含 JSDoc 約 L150-232)
- 若 callJudgeModel import 僅被 generateVariant 使用，一併移除

### 2. FIX-06 (executor): 移除不必要的 export
- appendTrace (L50): `export` → 移除 export
- initWorkspace (L69): `export` → 移除 export
- runSingleTest (L434): `export` → 移除 export
- 更新 test/executor.test.js 中任何直接 import 這些函式的程式碼

### 3. FIX-11: 參數化 buildSystemPrompt (L111-130)
- "你是一个 spec-writing agent，负责根据使用者需求撰写规格文件。"
  → "你是一个 `${skillName}` skill 的 AI agent，负责根据使用者需求完成任务。"
- "将所有产出的 spec 文件都写入工作目录中"
  → "将所有产出的文件都写入工作目录中"
- 保留工作目錄限制和專案背景描述 (這些是通用邏輯)

## Scope
- 允許修改: packages/tools/eval/executor.ts, packages/tools/eval/question-loader.ts
- 允許修改: packages/tools/eval/test/executor.test.js (僅 import 更新)
- 禁止修改: 其他檔案

## Output
回報: 每個子修復的摘要、驗證結果

## Verify
- npx tsc --noEmit (零錯誤)
- node --test packages/tools/eval/test/executor.test.js (通過)
- node --test packages/tools/eval/test/ (完整測試套件通過)

## Boundaries
- 不改變函式行為語義
- 遇到測試失敗立即回報
```

### WORKER-D: index.ts + lib/ 雜項 (FIX-07,10,12,14)

```
## Mission
對 5 個檔案進行 4 項獨立修復：index.ts 並發控制、optimizer.ts JSON 驗證、
常數 export 移除、judge-api.ts 窄介面簡化。

## Context
這些修復彼此獨立（不同檔案、不同區域），無檔案重疊，可並行完成。

## Input
- packages/tools/eval/index.ts (FIX-07)
- packages/tools/eval/optimizer.ts (FIX-10)
- packages/tools/eval/lib/env-utils.ts (FIX-12)
- packages/tools/eval/lib/question-utils.ts (FIX-12)
- packages/tools/eval/lib/judge-api.ts (FIX-14)
- packages/tools/eval/lib/promise-pool.ts (確認 promisePool import)

## What to do

### 1. FIX-07: index.ts concurrency control (L308-311)
- 將 Promise.all(fixPromises) 改為:
  const fixResults = await promisePool(
    deduped,
    async (issue) => { issue.suggestedFix = await generateSuggestedFix(issue, env, true); },
    env.JUDGE_CONCURRENCY,
  );
- 確認 promisePool 已從 './lib/promise-pool.js' import

### 2. FIX-10: optimizer.ts 加入 ScoreResult 驗證
- 加入 validateScoreResult helper:
  function validateScoreResult(obj: unknown): ScoreResult | null {
    if (typeof obj !== 'object' || obj === null) return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.testId !== 'string') return null;
    if (typeof o.overallScore !== 'number') return null;
    if (!Array.isArray(o.dimensions)) return null;
    if (!Array.isArray(o.issues)) return null;
    return obj as ScoreResult;
  }
- L230: `JSON.parse(raw) as ScoreResult` → validateScoreResult(JSON.parse(raw))
- 驗證失敗回傳 null (現有邏輯已處理 null)

### 3. FIX-12: 移除常數 export
- env-utils.ts: REQUIRED_VARS, DEFAULTS 移除 `export` 關鍵字
- question-utils.ts: SCORING_DIMENSIONS, SPEC_WORKFLOW_STEPS 移除 `export` 關鍵字
- 檢查測試檔案 import，必要時更新

### 4. FIX-14: 簡化 judge-api.ts 窄介面
- 移除 JudgeEnv 和 ExecEnv 介面 (L21-33)
- callJudgeModel 和 callExecModel 的 env 參數型別改為 EnvConfig
- 所有呼叫方已傳入完整 EnvConfig，無需更新

## Scope
- 允許修改: packages/tools/eval/index.ts, optimizer.ts,
  lib/env-utils.ts, lib/question-utils.ts, lib/judge-api.ts
- 允許修改: 測試檔案 (僅因移除 export 需要的 import 更新)
- 禁止修改: 其他檔案

## Output
回報: 每個子修復的摘要、驗證結果

## Verify
- npx tsc --noEmit (零錯誤)
- node --test packages/tools/eval/test/ (全部通過)

## Boundaries
- 不改變商業邏輯行為
- 遇到測試失敗立即回報
```

---

## 7. Fix Batch Schedule

| Batch | Worker(s) | Fix IDs | 檔案 | Gate |
|-------|-----------|---------|------|------|
| **1** | WORKER-A | FIX-01 | `env-utils.ts`, `index.ts` | `tsc --noEmit` + index.test.js 通過 |
| **2** | WORKER-B | FIX-03,04,05,06,08,09,13 | `scorer.ts`, `executor.ts`(type) | `tsc --noEmit` + scorer.test.js + executor.test.js 通過 |
| **3** | WORKER-C ‖ WORKER-D (並行) | FIX-02,06,11 ‖ FIX-07,10,12,14 | executor.ts, question-loader.ts ‖ index.ts, optimizer.ts, lib/*.ts | `tsc --noEmit` + 全部測試通過 |
| **4** | 協調器 | 回歸驗證 | - | 所有測試通過，確認 REGTEST-FIX02/03 測試實際 evalHandler |
| **5** | 協調器 | 最終驗證 | - | 完整測試 + tsc 零錯誤 + git diff 確認 |

**排程說明**：
- Batch 1 必須最先：P0 修復，最高優先級；修改 env-utils.ts 為後續批次建立基礎
- Batch 2: scorer.ts 修改量大 (7 fixes)，獨立一批避免衝突
- Batch 3: WORKER-C 和 WORKER-D 無檔案重疊，可並行
- Batch 4-5: 驗證批次，由協調器執行

---

## 8. Regression Test Inventory

| ID | 關聯 Fix | 類型 | 位置 | 說明 |
|----|---------|------|------|------|
| REGTEST-01 | FIX-01 | 整合 | `test/index.test.js` (擴充) | 修改現有 REGTEST-FIX02/FIX03 使其測試實際 evalHandler exit code 而非僅本地 helper |

本次不新增獨立 REGTEST worker。其他修復（死碼移除、型別修正、內部重構）由 TypeScript 編譯器和現有測試覆蓋。REGTEST-01 的修改在 Batch 4 由協調器判斷是否需要獨立 worker。

---

## 9. Verification Checkpoints

### 每批次 Gate
- `npx tsc --noEmit` — 零錯誤
- 相關測試的 `node --test` — 全部通過

### Batch 4 Gate
- `node --test packages/tools/eval/test/` — 全部通過
- 確認 REGTEST-FIX02/03 測試實際 evalHandler 行為（非僅本地 helper）

### Batch 5 Final Gate
- `npx tsc --noEmit` — 零錯誤
- `node --test packages/tools/eval/test/` — 全部通過
- `git diff --stat` 確認變更範圍合理

---

## 10. Error Recovery

### Worker 失敗
1. 第一次：繼續同一 worker，給予更具體的錯誤定位
2. 第二次：暫停。保留同批次成功結果。分析原因後決定修正 prompt 或報告用戶

### 合併衝突
- Batch 3 兩個 worker 如修改同一檔案不同區域，協調器自行合併
- 合併後重新執行 Gate

### 測試回歸
- 現有測試失敗：立即暫停。判斷是修復引入的 bug 還是測試需更新（如 import 路徑變更）。前者修復程式碼，後者更新測試。

---

## 11. Boundaries

### ALWAYS
- 每批次後執行 Gate 驗證
- 從 Section 6 原樣擷取 worker prompt
- 先消化 worker 回報再進入下一批次

### ASK FIRST
- Worker 兩次失敗後暫停並報告
- 需要修改未列在 Scope 中的檔案

### NEVER
- 協調器自己編輯原始碼
- Worker 生成子 worker
- 跳過 Gate 驗證
- 給 worker 模糊指令 (如 "fix it")

---

## Fix History

> **2026-05-29 (Round 1)**: 首次修復 — 25 個問題。核心：isolation.ts 整合至 executor tool-use loop、JSONL 行號註解、getProjectRoot 共用、磁碟檢查、執行鎖。Commit `91863d7`。全部 verified fixed。
>
> **2026-05-29 (Round 2)**: 第二輪修復 — 12 個問題。核心：isolation.ts 真實讀取、Message 型別擴展移除不安全轉型、reporter Set 去重、promise-pool guard。14 個新測試。Commit `5f2061b`。**注意：commit message 聲稱的 EVAL_MIN_SCORE/EVAL_MAX_P0 修復未實際寫入程式碼。**

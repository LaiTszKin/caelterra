# Fix Coordinator Prompt: skill-eval-optimizer (Round 6)

- **Date**: 2026-05-29
- **Source REPORT**: `docs/plans/2026-05-29/skill-eval-optimizer/REPORT.md`
- **Source Spec**: `docs/plans/2026-05-29/skill-eval-optimizer/`
- **Total Issues**: 0 P0 + 3 P1 + 5 P2 + 12 P3 = 20
- **Total Workers**: 4 fix (A–D)
- **Total Regression Tests**: 6

---

## 1. Your Role

**You are the fix coordinator.** You do not write code. You do not edit files. Your job is to understand the issues found in code review, delegate each fix and regression test to a worker, and verify that every issue is resolved without introducing regressions.

### What you do

- Read and understand the issue inventory, dependency analysis, and fix details below
- Spawn workers to execute individual fixes, giving each a self-contained prompt (provided in Section 6)
- After all fixes pass verification, spawn workers to implement regression tests
- Wait for all workers in a batch to complete, then digest their results
- Run verification commands at each checkpoint
- Decide whether to proceed to the next batch, retry a failed worker, or halt

### What you NEVER do

- Write, edit, or modify any source-code or test file directly
- Skip a verification checkpoint
- Proceed to the next batch when the current batch has not passed verification
- Delegate comprehension — digest every worker result yourself before deciding next steps
- Let workers spawn their own workers (workers are leaf nodes)
- Start regression tests before all fixes in scope are verified

---

## 2. Mission

修復 Round 6 審查發現的 20 個問題（0 P0 + 3 P1 + 5 P2 + 12 P3）。

**核心目標**：

1. **Dry-run 路徑產出實際 diff**（P1）→ 修復 `index.ts` 的 dry-run 路徑使其先收集評分數據再傳入 `optimizeSkillMd`
2. **Bash `find -exec` 繞過防護**（P1）→ 過濾 `find` 命令的危險旗標，加入 `find` 安全限制
3. **Bash workspace 路徑穿越防護**（P1）→ 在 `executeBash` 中加入類似 `executeRead` 的路徑驗證
4. **Bash 模擬透明度**（P2）→ 移除 `[Simulated]` 前綴，與 Write/Edit mock 風格一致
5. **死碼清理與型別安全**（P2+P3）→ appendTrace 死函式、未使用 import、重複常數、不安全斷言等

**Success looks like**: REPORT.md 中 20 個問題全部修復，6 個回歸測試通過，完整測試套件通過，`tsc --noEmit` 零錯誤。

---

## 3. Issue Inventory

| Issue ID | 等級 | 問題簡述 | 涉及檔案 | 審查維度 | 複雜度 |
|---|---|---|---|---|---|
| **A** | P1 | **Dry-run 永遠不產出優化 diff** — emptyPlan 的 `issues:[]` 使 optimizeSkillMd 在第 1105 行立即返回，`dryRun` 分支永遠不會被執行 | `index.ts` | 實作偏移 | 簡單 |
| **B** | P1 | **Bash `find -exec` 繞過安全命令白名單** — `find` 在白名單中，但 `-exec` 旗標可執行任意系統命令 | `isolation.ts` | 架構瑕疵 | 簡單 |
| **C** | P1 | **Bash 安全命令可存取 workspace 外任意檔案** — `executeBash` 無路徑穿越防護，`cat /etc/passwd` 等可成功執行 | `isolation.ts` | 架構瑕疵 | 複雜 |
| **D** | P2 | **Bash 模擬回應 `[Simulated]` 前綴破壞透明度** — 違反 Spec R4.1，與 Write/Edit mock 風格不一致 | `isolation.ts` | 實作偏移 | 簡單 |
| **E** | P2 | **Grep/Glob 同步 I/O 阻塞事件迴圈** — `readdirSync`/`readFileSync` 在 async dispatch 中使用 | `isolation.ts` | 性能隱患 | 複雜 |
| **F** | P2 | **`isAllowedFile` 不解析符號連結** — `path.resolve()` 不處理 symbolic links | `optimizer.ts` | 架構瑕疵 | 簡單 |
| **G** | P2 | **SIGINT handler 導致 stale exec lock** — `process.exit(1)` 跳過 finally 區塊的 lock 清理 | `index.ts`, `executor.ts` | 架構瑕疵 | 簡單 |
| **H** | P2 | **`as unknown as OptimizationPlan` 雙重轉型** — 繞過型別檢查；修復 FIX-A 後自然消除 | `index.ts` | 架構瑕疵 | 簡單 |
| **I** | P3 | **`appendTrace` 死函式** — 6 行未被呼叫的代碼 | `executor.ts` | 冗余代碼 | 簡單 |
| **J** | P3 | **`readdirSync` 未使用 import** — 已改用 `node:fs/promises` 的 async `readdir` | `scorer.ts` | 冗余代碼 | 簡單 |
| **K** | P3 | **`i >= items.length` 死碼防禦** — JS 單線程保證永遠不會為 true | `lib/promise-pool.ts` | 冗余代碼 | 簡單 |
| **L** | P3 | **重複的嚴重度排序常數** — reporter.ts 的 `severityOrder` 和 optimizer.ts 的 `SEVERITY_RANK` 完全相同 | `reporter.ts`, `optimizer.ts` | 冗余代碼 | 簡單 |
| **M** | P3 | **`as string` 不安全型別斷言** — `e.data?.error` 可能是非字串值 | `scorer.ts` | 架構瑕疵 | 簡單 |
| **N** | P3 | **磁碟空間檢查錯誤訊息誤導** — ENOENT（目錄不存在）被報告為「statfsSync 不可用」 | `executor.ts` | 架構瑕疵 | 簡單 |
| **O** | P3 | **優化器備份檔案無上限累積** — `.bak.<timestamp>` 永遠不清理 | `optimizer.ts` | 架構瑕疵 | 簡單 |
| **P** | P3 | **`jaccardSimilarity` 未選較小集合迭代** — 固定迭代 setA | `optimizer.ts` | 性能隱患 | 簡單 |
| **Q** | P3 | **`records` 陣列無謂累積** — `getRecords()` 無任何生產調用者 | `isolation.ts` | 冗余代碼 | 簡單 |
| **R** | P3 | **報告 evidence 欄位截斷遮蔽 JSONL 行號** — 40 字元截斷可能遺失 `L42:` 格式的行號引用 | `reporter.ts` | 實作偏移 | 簡單 |
| **S** | P3 | **Bash 命令引數解析不處理引號** — `split(/\s+/)` 破壞含空格的引數 | `isolation.ts` | 架構瑕疵 | 簡單 |
| **T** | P3 | **CI workflow 將 secret 作為命令列參數傳遞** — `test -z "${{ secrets... }}"` 邊緣情況可能洩漏 | `.github/workflows/eval.yml` | 架構瑕疵 | 簡單 |

---

## 4. Fix Dependency Analysis

### Dependency graph

```
All 4 FIX workers are INDEPENDENT — file sets are mutually exclusive.

FIX-A (P1, dry-run) is logically independent from Bash isolation fixes.
FIX-B+C+D (P1/P2, Bash isolation) are in the SAME file (isolation.ts) → same Worker A.
FIX-H is resolved automatically once FIX-A is done (emptyPlan removed, double cast removed).

REGTEST workers depend on the corresponding FIX being completed first.
```

### File overlap detection

| 重疊組 | 問題 ID | 共享檔案 | 處理方式 |
|---|---|---|---|
| 重疊組 1 | **B**, **C**, **D**, **E**, **Q**, **S** | `isolation.ts` | 同一 Worker A |
| 重疊組 2 | **F**, **L**, **O**, **P** | `optimizer.ts` | 同一 Worker B |
| 重疊組 3 | **A**, **G**, **H** | `index.ts` | 同一 Worker C |
| 重疊組 4 | **I**, **N** | `executor.ts` | 合併至 Worker C（與 index.ts 無衝突） |
| 重疊組 5 | **J**, **K**, **L**, **M**, **R**, **T** | `scorer.ts`, `lib/promise-pool.ts`, `reporter.ts`, `.github/workflows/eval.yml` | 同一 Worker D |

**結論**：所有 4 個 Worker 的檔案範圍完全互斥，可全部並行派發。

---

## 5. Fix Details

### FIX-A: Dry-run 路徑產出實際 diff (P1)

| 欄位 | 內容 |
|---|---|
| **根因** | `index.ts` dry-run 分支（L313-331）建立 `issues: []` 空 plan 傳入 `optimizeSkillMd`。該函式 L1103-1106 檢查 `skillIssues.length === 0` 後立即返回，L1179-1186 的 `dryRun` 分支永遠不會被執行 |
| **涉及檔案** | `index.ts` L313-331 |
| **修復方式** | dry-run 路徑仍需執行 `loadAllScores()` + `extractIssues()` + `deduplicateIssues()`（這些包含 judge API 呼叫）。為避免 API 成本，改為：dry-run 時只執行 `loadAllScores` + `extractIssues`（無 judge API），然後將 `extractIssues` 的結果直接傳入 `generateOptimizationPlan`（寫入 optimization-plan.json），再將 plan 以 `dryRun=true` 傳入 `optimizeSkillMd`。這需要修改 dry-run 路徑的 plan 建構：不傳 emptyPlan，而是收集實際 issue 後傳入 |
| **複雜度** | 簡單 — 改 dry-run 路徑呼叫真實的 loadAllScores + extractIssues，但跳過 deduplicateIssues（含 judge API）和 generateSuggestedFix（含 judge API） |

**更具體的修復**：

```typescript
// index.ts dry-run 路徑改為:
if (dryRun) {
  stderr.write('[7/7] Dry-run mode: collecting scores, skipping judge API...\n');
  const allScores = await loadAllScores(today);
  const rawIssues = extractIssues(allScores);
  // 跳過 judge API: 不呼叫 deduplicateIssues 和 generateSuggestedFix
  // 直接從 rawIssues 建構 plan（含實際 issue 數據）
  const plan = generateOptimizationPlan(rawIssues, today, allScores);
  stderr.write(`[7/7] Found ${plan.issues.length} issues. Generating template-based patch...\n`);
  const optResult = await optimizeSkillMd(
    plan,           // 含實際 issues，非 emptyPlan
    skillMdPath,
    env,
    true,           // dryRun
    today,
    false,          // judgeAvailable = false
  );
  stderr.write(`[7/7] ${optResult.message}\n`);
}
```

**注意**: `generateOptimizationPlan` 目前接受 `DedupedIssue[]`，但 `extractIssues` 回傳 `RawIssue[]`。需要檢查型別相容性。若不相容，可先將 `rawIssues` 轉換為相容格式，或放寬 `generateOptimizationPlan` 的型別。

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | `REGTEST-01` |
| **測試類型** | 源碼審查 |
| **測試位置** | `packages/tools/eval/test/index.test.js` — 新測試函式 |
| **測試場景** | GIVEN index.ts 原始碼 WHEN 檢查 dry-run 分支 THEN 不傳遞 emptyPlan 給 optimizeSkillMd（應傳遞從 loadAllScores/extractIssues 獲取的實際 plan） |
| **Oracle** | 源碼中 dry-run 分支不含 `issues: []`，且呼叫 `loadAllScores` 或 `extractIssues` |

---

### FIX-B: Bash `find -exec` 繞過防護 (P1)

| 欄位 | 內容 |
|---|---|
| **根因** | `SAFE_BASH_COMMANDS`（isolation.ts L365-368）包含 `find`。`find` 命令支援 `-exec` / `-execdir` 旗標，可在每個匹配檔案上執行任意系統命令。這些子進程不受白名單限制 |
| **涉及檔案** | `isolation.ts` L365-368, L379-382 |
| **修復方式** | 在 `executeBash` 中，對 `find` 命令檢查其參數中是否包含危險旗標。若包含 `-exec` 或 `-execdir`，拒絕執行並回傳模擬結果 |
| **複雜度** | 簡單 |

```typescript
// 在 SAFE_BASH_COMMANDS 附近加入:
const FIND_DANGEROUS_FLAGS = new Set(['-exec', '-execdir', '-delete']);

// 在 executeBash 中 baseCmd 檢查後加入:
if (baseCmd === 'find') {
  const args = command.split(/\s+/).slice(1);
  if (args.some(a => FIND_DANGEROUS_FLAGS.has(a))) {
    console.warn(`[isolation] Dangerous find flag intercepted: ${command}`);
    return { success: true, data: `find: completed (dangerous flags disabled).`, tool: 'Bash' };
  }
}
```

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | `REGTEST-02` |
| **測試類型** | 單元測試 |
| **測試位置** | `packages/tools/eval/test/isolation.test.js` — 新測試函式 |
| **測試場景** | GIVEN `createToolDispatcher({ workspaceDir })` WHEN dispatch `Bash find . -name "*.txt" -exec cat {} \;` THEN 回傳模擬結果（不真實執行 find -exec） |
| **Oracle** | result.data 不含真實檔案內容（不是 `find -exec` 的實際輸出），且 result.data 包含 "dangerous" 或為模擬訊息 |

---

### FIX-C: Bash workspace 路徑穿越防護 (P1)

| 欄位 | 內容 |
|---|---|
| **根因** | `executeBash`（L370-398）完全沒有路徑穿越防護。`executeRead`（L155-166）有完整的 `resolve` + `relative` + `startsWith('..')` 檢查，但 Bash 命令的引數路徑未受限制 |
| **涉及檔案** | `isolation.ts` L370-398 |
| **修復方式** | 在 `executeBash` 成功執行後，檢查 stdout/stderr 是否包含 workspace 外的路徑資訊。但這不可靠。更好的做法是：限制 `execFileAsync` 的 `cwd` 已經是 workspaceDir，且對每個命令行參數中包含路徑的部分進行檢查。最簡潔的方案：使用 `--` 分離選項和路徑參數，對所有看起來像絕對路徑或含 `..` 的相對路徑參數進行驗證 |
| **複雜度** | 複雜 — 需要設計一個安全的路徑驗證機制，在不同命令類型間通用 |

**推薦的實用做法**：將 `cwd` 設定為 workspaceDir（已實現），並**限制所有命令的引數中不能包含絕對路徑**（以 `/` 開頭的參數）。這是最低侵入且有效的方式：在 workspace 內唯讀命令幾乎不需要絕對路徑。例外：`find /`、`cat /etc/passwd` 都會被攔截。

```typescript
// 在 executeBash 中，SAFE_BASH_COMMANDS 檢查後加入:
const args = command.split(/\s+/).slice(1);
const hasAbsolutePath = args.some(a => a.startsWith('/') || a.startsWith('~/'));
const hasParentTraversal = args.some(a => a.includes('..'));
if (hasAbsolutePath || hasParentTraversal) {
  console.warn(`[isolation] Path escape attempt intercepted: ${command}`);
  return { success: true, data: `Error: Access denied — paths outside workspace are restricted.`, tool: 'Bash' };
}
```

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | `REGTEST-03` |
| **測試類型** | 單元測試 |
| **測試位置** | `packages/tools/eval/test/isolation.test.js` — 新測試函式 |
| **測試場景** | GIVEN `createToolDispatcher({ workspaceDir })` WHEN dispatch `Bash cat /etc/passwd` THEN 回傳存取拒絕訊息（不真實讀取 /etc/passwd） |
| **Oracle** | result.data 不含 `/etc/passwd` 的真實內容，而是 "Access denied" 或模擬結果 |

---

### FIX-D: Bash 模擬回應移除 `[Simulated]` 前綴 (P2)

| 欄位 | 內容 |
|---|---|
| **根因** | `executeBash` L382 的不安全命令模擬回應格式為 `[Simulated] ${command} completed.`。Write/Edit 的 mock 使用 `Written ${path} (${length} bytes)` 格式，無標記前綴。不一致性使被測模型能區分真實與模擬執行 |
| **涉及檔案** | `isolation.ts` L382 |
| **修復方式** | 將模擬回應改為：`` `${command}: completed (read-only mode).` `` — 風格與 buildWriteResponse 一致，無標記前綴 |
| **複雜度** | 簡單 — 一行修改 |

```typescript
// 修改前:
return { success: true, data: `[Simulated] ${command} completed.`, tool: 'Bash' };

// 修改後:
return { success: true, data: `${command}: completed (read-only mode).`, tool: 'Bash' };
```

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | `REGTEST-04` |
| **測試類型** | 源碼審查（合併至 REGTEST-02/03 的測試檔案中） |
| **測試位置** | `packages/tools/eval/test/isolation.test.js` |
| **測試場景** | GIVEN isolation.ts 原始碼 WHEN 檢查 unsafe command 的回傳 THEN 不包含 `[Simulated]` 字串 |
| **Oracle** | grep `[Simulated]` 在 isolation.ts 中無匹配 |

---

### FIX-E ~ FIX-T: P2/P3 修復

（詳細修復方案見 Section 6 Worker Prompt，所有 P2/P3 修復已合併入各 Worker 的指令中）

---

## 6. Worker Prompt Library

### Fix Worker Prompts

---

#### WORKER-A: isolation.ts 修復 — Bash 安全加固 + 死碼清理 (FIX-B, C, D, E, Q, S)

```
## Mission
修復 isolation.ts 中的 6 個問題：
1. (P1) Bash `find -exec` 繞過安全白名單
2. (P1) Bash 安全命令可存取 workspace 外任意檔案
3. (P2) Bash 模擬回應 `[Simulated]` 前綴破壞透明度
4. (P2) Grep/Glob 同步 I/O 阻塞事件迴圈
5. (P3) `records` 陣列無謂累積 (getRecords 無調用者)
6. (P3) Bash 命令引數解析不處理引號

## Context
- 審查維度: 架構瑕疵 + 性能隱患 + 實作偏移 + 冗余代碼
- SPEC 需求: optimize-and-integrate R4.1「工具模擬策略對被評測模型透明」
- 設計不變量: workspace 隔離應防止被測模型存取系統檔案

## Input
- 完整閱讀 `packages/tools/eval/isolation.ts`
- 特別關注: L136-196 (executeRead 的路徑防護)、L365-399 (executeBash)、L208-363 (executeGrep/executeGlob)、L440-490 (records/dispatch)

## What to do

### 修正 1: find -exec 繞過防護 (P1)

在 `executeBash` 中，對 `find` 命令檢查危險旗標：

```typescript
// 在 SAFE_BASH_COMMANDS 附近加入常數:
const FIND_DANGEROUS_FLAGS = new Set(['-exec', '-execdir', '-delete']);

// 在 executeBash 中，baseCmd 驗證通過後、execFileAsync 之前加入:
if (baseCmd === 'find') {
  const args = command.split(/\s+/).slice(1);
  if (args.some(a => FIND_DANGEROUS_FLAGS.has(a))) {
    console.warn(`[isolation] Dangerous find flag intercepted: ${command}`);
    return { success: true, data: `find: completed (dangerous flags disabled).`, tool: 'Bash' };
  }
}
```

### 修正 2: workspace 路徑穿越防護 (P1)

在 `executeBash` 中，SAFE_BASH_COMMANDS 檢查通過後加入絕對路徑和 `..` 穿越檢查：

```typescript
// 在 executeBash 中，SAFE_BASH_COMMANDS.has(baseCmd) 檢查後加入:
const args = command.split(/\s+/).slice(1);
const hasAbsolutePath = args.some(a => a.startsWith('/') || a.startsWith('~/'));
const hasParentTraversal = args.some(a => a.includes('..'));
if (hasAbsolutePath || hasParentTraversal) {
  console.warn(`[isolation] Path escape attempt intercepted: ${command}`);
  return { success: true, data: `Error: Access denied — paths outside workspace are restricted.`, tool: 'Bash' };
}
```

注意：`echo /some/path` 不應被攔截（echo 不以路徑方式使用參數）。為簡單起見，先實施嚴格規則（所有絕對路徑都攔截），後續可根據需要放寬特定命令。

### 修正 3: Bash 模擬透明度 (P2)

修改不安全命令的模擬回傳訊息，移除 `[Simulated]` 前綴：

```typescript
// 修改前 (L382):
return { success: true, data: `[Simulated] ${command} completed.`, tool: 'Bash' };

// 修改後:
return { success: true, data: `${command}: completed (read-only mode).`, tool: 'Bash' };
```

### 修正 4: Grep/Glob async I/O (P2)

將 `executeGrep` 和 `executeGlob` 中的 `readdirSync`/`readFileSync` 改為 async 版本。

`walkDir` 輔助函式改為 async：

```typescript
import { readdir, readFile } from 'node:fs/promises';

async function walkDir(
  dir: string,
  visitor: (filePath: string) => Promise<void>,
): Promise<{ skippedCount: number }> {
  let skippedCount = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = await walkDir(fullPath, visitor);
        skippedCount += result.skippedCount;
      } else if (entry.isFile()) {
        await visitor(fullPath);
      }
    }
  } catch {
    skippedCount++;
  }
  return { skippedCount };
}
```

將 `executeGrep` 改為 `async function`：
- 將 `results: string[]` 初始化
- 用 `await walkDir(workspaceDir, async (fullPath) => { ... })` 取代同步遞迴
- 在 visitor 內用 `await readFile(fullPath, 'utf-8')` 取代 `readFileSync`

將 `executeGlob` 改為 `async function`：
- 同上，用 async walkDir 取代同步遞迴
- 在 `executeInWorkspace` 中，將兩個 case 加上 `await`:
  ```typescript
  case 'Grep':
    return await executeGrep(workspaceDir, params);
  case 'Glob':
    return await executeGlob(workspaceDir, params);
  ```

### 修正 5: records 陣列無調用者 (P3)

檢查 `getRecords()` 是否在整個 eval 模組中有任何調用者。若無，移除 `records` 陣列、`getRecords()` 方法、以及 `dispatch` 中的 `records.push()`。

注意：`getRecords` 可能在 `ToolDispatcher` 介面中定義。檢查 `ToolDispatcher` 介面（isolation.ts 頂部）是否需要保留 `getRecords` 方法簽章。

若 `getRecords` 在介面中定義：
- 保留介面中的 `getRecords(): ToolCallRecord[]`（向後兼容）
- 保留 `records` 陣列和 push（效能影響極小）
- 不做改動

若 `getRecords` 不在介面中（僅是 dispatcher 物件的實現細節）：
- 移除 `records`、`records.push()`、`getRecords()` 方法
- 移除 `ToolCallRecord` 型別定義（若無其他地方使用）

建議：先用 grep 在 `packages/tools/eval/` 下搜尋 `getRecords` 和 `ToolCallRecord` 的使用情況，再決定處理方式。

### 修正 6: Bash 引號處理 (P3)

改善命令解析，使用基本的引號感知分割取代簡單的 `split(/\s+/)`：

```typescript
// 輔助函式：基本引號感知分割
function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  
  for (const ch of command) {
    if (ch === "'" && !inDoubleQuote) { inSingleQuote = !inSingleQuote; continue; }
    if (ch === '"' && !inSingleQuote) { inDoubleQuote = !inDoubleQuote; continue; }
    if (ch === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) { args.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (current) args.push(current);
  return args;
}

// 在 executeBash 中使用:
const args = parseCommandArgs(command);
const baseCmd = args[0];
// ...
await execFileAsync(baseCmd, args.slice(1), { cwd: workspaceDir, timeout: 5000 });
```

## Scope
- 允許修改: `packages/tools/eval/isolation.ts`
- 禁止修改: 所有其他檔案

## Output
完成後回報每個修正的變更摘要、tsc 編譯結果、測試執行結果。

## Verify
- `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- `node --test "packages/tools/eval/test/isolation.test.js"` → 全部通過
- `grep '\[Simulated\]' packages/tools/eval/isolation.ts` → 無匹配
- `grep 'readdirSync\|readFileSync' packages/tools/eval/isolation.ts` → 無匹配（在 executeGrep/executeGlob 中）

## Boundaries
- 路徑穿越防護的嚴格規則（所有絕對路徑攔截）可能影響合法的 `echo` 或 `printf` 使用。這是可接受的取捨——安全優先
- 不可修改 `SAFE_BASH_COMMANDS` 以外的白名單邏輯
- async walkDir 的 `skippedCount` 計數必須保留（Round 5 已加入）
```

---

#### WORKER-B: optimizer.ts 修復 — 符號連結 + 常數抽取 + 備份清理 + Jaccard 優化 (FIX-F, L, O, P)

```
## Mission
修復 optimizer.ts 中的 4 個問題：
1. (P2) isAllowedFile 不解析符號連結
2. (P3) 重複的嚴重度排序常數 (SEVERITY_RANK) — 抽取為共享模組
3. (P3) 優化器備份檔案無上限累積
4. (P3) jaccardSimilarity 未選較小集合迭代

## Context
- 審查維度: 架構瑕疵 + 冗余代碼 + 性能隱患
- 設計不變量: 優化 diff 不修改技能目錄外的檔案

## Input
- 閱讀 `packages/tools/eval/optimizer.ts` L85-95, L330-372, L1199-1275
- 閱讀 `packages/tools/eval/reporter.ts` L120-130

## What to do

### 修正 1: isAllowedFile 符號連結解析 (P2)

在 `isAllowedFile` 中，將 `path.resolve(filePath)` 改為使用 `fs.realpathSync` 解析符號連結：

```typescript
import { realpathSync } from 'node:fs';

export function isAllowedFile(filePath: string, skillName: string): boolean {
  let normalized: string;
  try {
    normalized = realpathSync(filePath).replace(/\\/g, '/');
  } catch {
    // 檔案不存在或無法解析 → fallback 到 path.resolve
    normalized = resolve(filePath).replace(/\\/g, '/');
  }
  // ... 其餘邏輯不變
}
```

注意：`realpathSync` 是同步的，但在 `isAllowedFile`（非熱路徑，每次優化只調用少數幾次）中可接受。

### 修正 2: 抽取共享嚴重度排序常數 (P3)

建立新檔案 `packages/tools/eval/lib/constants.ts`：

```typescript
/** Severity ranking: P0 (most severe) > P1 > P2. For consistent sorting across all modules. */
export const SEVERITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
```

在 `optimizer.ts` 中：
- 刪除 L88 的 `const SEVERITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };`
- 新增 import: `import { SEVERITY_RANK } from './lib/constants.js';`

在 `reporter.ts` 中：
- 刪除 L124 的 `const severityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };`
- 新增 import: `import { SEVERITY_RANK } from './lib/constants.js';`
- 將 `severityOrder[a.severity]` 改為 `SEVERITY_RANK[a.severity]`
- 將 `severityOrder[b.severity]` 改為 `SEVERITY_RANK[b.severity]`

### 修正 3: 備份檔案清理 (P3)

在 `optimizeSkillMd` 結尾（成功寫入新 SKILL.md 後），清理舊備份：

```typescript
// 在成功寫入後 (L1260 附近)，保留最新 N 個備份:
const MAX_BACKUPS = 5;
const backupDir = path.dirname(skillMdPath);
const backupPattern = path.basename(skillMdPath) + '.bak.';
try {
  const dirEntries = readdirSync(backupDir);
  const backups = dirEntries
    .filter(f => f.startsWith(backupPattern))
    .map(f => ({ name: f, path: join(backupDir, f) }))
    .sort((a, b) => b.name.localeCompare(a.name)); // 最新排最前
  
  // 刪除超過上限的舊備份
  for (const backup of backups.slice(MAX_BACKUPS)) {
    try { unlinkSync(backup.path); } catch { /* ignore */ }
  }
} catch {
  // 無法列出目錄 — 跳過清理
}
```

### 修正 4: jaccardSimilarity 選較小集合 (P3)

在 `jaccardSimilarity` 函式開頭加入集合大小比較：

```typescript
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  
  // Iterate the smaller set for better performance
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  
  let intersection = 0;
  const union = setA.size + setB.size;
  
  for (const item of smaller) {
    if (larger.has(item)) {
      intersection++;
    }
  }
  
  return intersection / (union - intersection || 1);
}
```

## Scope
- 允許修改:
  - `packages/tools/eval/optimizer.ts`
  - `packages/tools/eval/reporter.ts`
  - `packages/tools/eval/lib/constants.ts`（新建）
- 禁止修改: 所有其他檔案

## Output
完成後回報每個修正的變更摘要、tsc 編譯結果、測試執行結果。

## Verify
- `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- `node --test "packages/tools/eval/test/optimizer.test.js"` → 全部通過
- `node --test "packages/tools/eval/test/reporter.test.js"` → 全部通過（若有）
- `node --test "packages/tools/eval/test/*.test.js"` → 全部通過

## Boundaries
- `realpathSync` 僅在 `isAllowedFile`（非熱路徑）中使用，不影響評測性能
- 抽取 SEVERITY_RANK 時不可改變其值（P0:0, P1:1, P2:2）
- 備份清理的 MAX_BACKUPS=5 是合理預設
```

---

#### WORKER-C: index.ts + executor.ts 修復 — dry-run + SIGINT + 死碼 (FIX-A, G, H, I, N)

```
## Mission
修復 index.ts 和 executor.ts 中的 5 個問題：
1. (P1) Dry-run 永遠不產出優化 diff
2. (P2) SIGINT handler 導致 stale exec lock
3. (P2) as unknown as OptimizationPlan 雙重轉型（由 FIX-A 自然解決）
4. (P3) appendTrace 死函式
5. (P3) 磁碟空間檢查錯誤訊息誤導

## Context
- 審查維度: 實作偏移 + 架構瑕疵 + 冗余代碼
- SPEC 需求: optimize-and-integrate R1.3「支援 dry-run 模式 — 僅產出 diff 預覽，不實際修改檔案」

## Input
- 閱讀 `packages/tools/eval/index.ts` L310-355, L230-245
- 閱讀 `packages/tools/eval/executor.ts` L55-64, L500-528, L555-565
- 閱讀 `packages/tools/eval/optimizer.ts` L1095-1107 (了解 skillIssues.length === 0 的影響)
- 閱讀 `packages/tools/eval/optimizer.ts` L852-901 (generateOptimizationPlan 簽章)

## What to do

### 修正 1: Dry-run 路徑重構 (P1)

將 `index.ts` L313-331 的 dry-run 路徑改為：

```typescript
if (dryRun) {
  stderr.write('[7/7] Dry-run mode: collecting scores, generating template-based suggestions...\n');
  // 收集實際評分數據但不呼叫 judge API 進行去重/建議生成
  const allScores = await loadAllScores(today);
  const rawIssues = extractIssues(allScores);
  stderr.write(`[7/7] Found ${rawIssues.length} raw issues from ${allScores.length} scores.\n`);
  
  // 從 rawIssues 建構 plan（跳過 deduplicateIssues 和 generateSuggestedFix 的 judge API 呼叫）
  // 注意：generateOptimizationPlan 的簽章需要 DedupedIssue[]
  // 若 rawIssues 型別不相容，先用簡單轉換
  const plan = generateOptimizationPlan(rawIssues as any, today, allScores);
  
  const optResult = await optimizeSkillMd(
    plan,
    skillMdPath,
    env,
    true,   // dryRun
    today,
    false,  // judgeAvailable = false
  );
  stderr.write(`[7/7] ${optResult.message}\n`);
}
```

**重要檢查**：`generateOptimizationPlan` 的簽章。請在閱讀 optimizer.ts 後確認它接受什麼型別的 issues 參數。若它需要 `DedupedIssue[]` 而 `extractIssues` 回傳不同的型別，有兩個選擇：
- A) 將 rawIssues 對映到簡化的 DedupedIssue 格式
- B) 修改 `generateOptimizationPlan` 接受更寬鬆的型別

通常最簡單的做法是建立一個 light wrapper：
```typescript
const simplifiedIssues = rawIssues.map((issue, i) => ({
  ...issue,
  id: `dryrun-${i}`,
  frequency: 1,
  affectedTests: [issue.testId || 'unknown'],
  severity: issue.severity || 'P2',
}));
```

移除 `emptyPlan` 和 `as unknown as OptimizationPlan` 雙重轉型。

### 修正 2: SIGINT handler 優雅關閉 (P2)

在 `index.ts` 中，不直接呼叫 `process.exit(1)`，而是設置一個旗標讓主流程自行終止：

```typescript
// index.ts 修改 SIGINT handler:
let sigintReceived = false;
const sigintHandler = () => {
  if (!sigintReceived) {
    sigintReceived = true;
    stderr.write('\n[eval] Interrupted. Completing current operations...\n');
    // 不呼叫 process.exit — 讓主流程在完成當前操作後自行退出
    // executor.ts 的 finally 區塊會清理 .exec-lock
    // 但需要一個方式中斷當前正在進行的 promisePool
  }
};
```

但這樣 SIGINT 後主流程仍會繼續執行所有剩餘測試。更實用的做法是：保留 `process.exit(1)`，但在 executor.ts 中處理 SIGINT 信號來清理 lock。

在 `executor.ts` 中加入獨立的 SIGINT handler：

```typescript
// executor.ts runAllTests 中的 finally 區塊之前:
const sigintCleanup = () => {
  rmSync(lockPath, { recursive: true, force: true });
  process.exit(1);
};
process.once('SIGINT', sigintCleanup);

try {
  // ... 現有的 promisePool 邏輯
} finally {
  process.removeListener('SIGINT', sigintCleanup);
  await rm(lockPath, { recursive: true, force: true });
}
```

使用 `process.once` 確保 handler 只執行一次。

### 修正 3: appendTrace 死函式移除 (P3)

移除 `executor.ts` L55-64 的 `appendTrace` 函式。
注意：移除後 `appendFile` import 僅被 `flushTraceBuffer` 使用（L223），確認 `appendFile` 仍被使用後保留 import。

### 修正 4: 磁碟空間檢查錯誤訊息修正 (P3)

在 `executor.ts` L508-513，先確保 resultsBase 存在再進行 statfsSync：

```typescript
// 磁碟空間檢查 (FIX-06)
try {
  await mkdir(resultsBase, { recursive: true });  // 確保目錄存在
  const stats = statfsSync(resultsBase);
  const availableMB = (stats.bavail * stats.bsize) / (1024 * 1024);
  if (availableMB < 100) {
    throw new DiskSpaceError('Eval aborted: insufficient disk space (< 100MB available)');
  }
} catch (err: unknown) {
  if (err instanceof DiskSpaceError) throw err;
  // statfsSync 不支援 (非 Unix 平台) — 跳過檢查
  console.warn('  无法检查磁盘空间 (statfsSync 不可用，跳过)');
}
```

這樣 `ENOENT` 就不會發生（先建立了目錄），只有真正的 `statfsSync` 不支援才會進入 catch。

注意：L518 的 `await mkdir(resultsBase, { recursive: true });` 在磁碟空間檢查之後。需要調整順序：先確保目錄存在 → 磁碟檢查 → exec lock。目錄的 mkdir 是冪等的（`recursive: true`），重複調用無害。

## Scope
- 允許修改:
  - `packages/tools/eval/index.ts`
  - `packages/tools/eval/executor.ts`
- 禁止修改: 所有其他檔案

## Output
完成後回報每個修正的變更摘要、tsc 編譯結果、測試執行結果。

## Verify
- `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- `node --test "packages/tools/eval/test/*.test.js"` → 全部通過
- `grep 'emptyPlan' packages/tools/eval/index.ts` → 無匹配（已移除）
- `grep 'as unknown as OptimizationPlan' packages/tools/eval/index.ts` → 無匹配
- `grep 'async function appendTrace' packages/tools/eval/executor.ts` → 無匹配（已移除）
- `grep 'appendTrace(' packages/tools/eval/executor.ts` → 僅 `appendTraceBuffered` 相關

## Boundaries
- dry-run 路徑應呼叫 `loadAllScores` + `extractIssues`，但**不**呼叫 `deduplicateIssues` 和 `generateSuggestedFix`（這些含 judge API）
- 確保 dry-run 路徑寫入 `skill-optimization-patch.md`（透過 `optimizeSkillMd` 的 dryRun 分支）
- SIGINT 的 `process.once` 確保 handler 不會重複註冊
```

---

#### WORKER-D: scorer.ts + reporter.ts + lib + CI 修復 (FIX-J, K, L, M, R, T)

```
## Mission
修復多個檔案中的 6 個 P2/P3 問題：
1. (P3) scorer.ts: readdirSync 未使用 import
2. (P3) lib/promise-pool.ts: i >= items.length 死碼防禦
3. (P3) reporter.ts + optimizer.ts: 重複的嚴重度排序常數 (L 部分 — reporter.ts 端)
   (optimizer.ts 的修改由 WORKER-B 處理)
4. (P3) scorer.ts: as string 不安全型別斷言
5. (P3) reporter.ts: evidence 欄位截斷遮蔽 JSONL 行號
6. (P3) .github/workflows/eval.yml: secret 作為命令列參數

## Context
- 審查維度: 冗余代碼 + 架構瑕疵 + 實作偏移

## Input
- 閱讀 `packages/tools/eval/scorer.ts` L15-25, L170-180
- 閱讀 `packages/tools/eval/lib/promise-pool.ts` L29
- 閱讀 `packages/tools/eval/reporter.ts` L120-130, L260-275
- 閱讀 `.github/workflows/eval.yml` L31-39

## What to do

### 修正 1: readdirSync 未使用 import (P3)

在 `scorer.ts` L20：
```typescript
// 修改前:
import { existsSync, readdirSync } from 'node:fs';

// 修改後:
import { existsSync } from 'node:fs';
```

確認 `readdirSync` 在整個 scorer.ts 中無任何使用。

### 修正 2: promise-pool.ts 死碼 (P3)

在 `promise-pool.ts` L29，移除永遠不會觸發的防禦性檢查：

```typescript
// 修改前:
async function worker(): Promise<void> {
  while (index < items.length) {
    const i = index++;
    if (i >= items.length) break;  // ← 移除這行
    results[i] = await fn(items[i], i);
  }
}

// 修改後:
async function worker(): Promise<void> {
  while (index < items.length) {
    const i = index++;
    results[i] = await fn(items[i], i);
  }
}
```

保留 L22-24 的註解（安全說明）。

### 修正 3: 抽取共享 SEVERITY_RANK 常數 — reporter.ts 端 (P3)

此修正需要與 WORKER-B 協調（WORKER-B 在 optimizer.ts 中也做相同變更；兩者都從新的 lib/constants.ts import）。

在 `reporter.ts` 中：
1. 新增 import: `import { SEVERITY_RANK } from './lib/constants.js';`
2. 刪除 L124 的 `const severityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };`
3. 將 `severityOrder[a.severity]` → `SEVERITY_RANK[a.severity]`
4. 將 `severityOrder[b.severity]` → `SEVERITY_RANK[b.severity]`

如果 `lib/constants.ts` 還不存在（WORKER-B 可能尚未建立），WORKER-D 可以先建立它，或依賴 WORKER-B 建立它。**安全方案**：WORKER-D 僅修改 reporter.ts，假設 WORKER-B 會建立 `lib/constants.ts` 和修改 optimizer.ts。兩個 Worker 完成後合併時，`lib/constants.ts` 只需一份。

**若兩個 Worker 都建立 lib/constants.ts**：協調器合併時只保留一份。

### 修正 4: as string 不安全型別斷言 (P3)

在 `scorer.ts` L175，加入執行時型別檢查：

```typescript
// 修改前:
const errors = errorEvents.map(e => {
  const msg = (e.data?.error ?? e.data?.message ?? 'unknown error') as string;
  return msg;
});

// 修改後:
const errors = errorEvents.map(e => {
  const raw = e.data?.error ?? e.data?.message ?? 'unknown error';
  const msg = typeof raw === 'string' ? raw : String(raw);
  return msg;
});
```

### 修正 5: evidence 截斷放寬 (P3)

在 `reporter.ts` L268，放寬 evidence 截斷限制以保留 JSONL 行號：

```typescript
// 修改前:
const ev = issue.evidence.length > 40 ? issue.evidence.substring(0, 40) + '...' : issue.evidence;

// 修改後 — 放寬至 80 字元 (足夠容納多個 L42: 格式的行號引用):
const ev = issue.evidence.length > 80 ? issue.evidence.substring(0, 80) + '...' : issue.evidence;
```

### 修正 6: CI secret 安全處理 (P3)

在 `.github/workflows/eval.yml` L31-39，將 secret 檢查改為使用環境變數方式：

```yaml
# 修改前:
- name: Check eval secrets
  id: check-secrets
  run: |
    if [ -z "${{ secrets.EXEC_API_KEY }}" ] || [ -z "${{ secrets.JUDGE_API_KEY }}" ]; then
      echo "::warning::Eval secrets not configured. Skipping skill evaluation."
      echo "skip=true" >> $GITHUB_OUTPUT
    else
      echo "skip=false" >> $GITHUB_OUTPUT
    fi

# 修改後:
- name: Check eval secrets
  id: check-secrets
  env:
    EXEC_KEY: ${{ secrets.EXEC_API_KEY }}
    JUDGE_KEY: ${{ secrets.JUDGE_API_KEY }}
  run: |
    if [ -z "$EXEC_KEY" ] || [ -z "$JUDGE_KEY" ]; then
      echo "::warning::Eval secrets not configured. Skipping skill evaluation."
      echo "skip=true" >> $GITHUB_OUTPUT
    else
      echo "skip=false" >> $GITHUB_OUTPUT
    fi
```

## Scope
- 允許修改:
  - `packages/tools/eval/scorer.ts`
  - `packages/tools/eval/lib/promise-pool.ts`
  - `packages/tools/eval/reporter.ts`
  - `.github/workflows/eval.yml`
- 若需要建立: `packages/tools/eval/lib/constants.ts`（與 WORKER-B 協調；若 WORKER-B 已建立則跳過）
- 禁止修改: 所有其他檔案

## Output
完成後回報每個修正的變更摘要、tsc 編譯結果、測試執行結果。

## Verify
- `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- `node --test "packages/tools/eval/test/scorer.test.js"` → 全部通過
- `node --test "packages/tools/eval/test/*.test.js"` → 全部通過
- `grep 'readdirSync' packages/tools/eval/scorer.ts` → 無匹配（除非在註解中）
- `grep "as string" packages/tools/eval/scorer.ts` → 僅有安全的使用方式

## Boundaries
- 移除 promise-pool.ts 的死碼時保留安全註解
- evidence 截斷放寬至 80 chars 不影響表格佈局（GitHub markdown 表格支援長內容）
- 若 WORKER-B 未建立 lib/constants.ts，WORKER-D 需建立它（兩個 Worker 之一即可）
```

---

### Regression Test Worker Prompts

---

#### REGTEST-01: Dry-run 不傳遞 emptyPlan（關聯 FIX-A）

```
## Mission
為 FIX-A（dry-run 產出實際 diff）建立回歸測試。

## Context
- 修復問題: Dry-run 永遠不產出優化 diff（傳遞 emptyPlan）
- 根因: index.ts dry-run 分支的 `issues: []` 空 plan

## Input
- 閱讀 `packages/tools/eval/index.ts`（修復後的版本）

## What to do
在 `packages/tools/eval/test/index.test.js` 中新增源碼審查測試：

```javascript
it('REGTEST-01: dry-run mode should collect scores, not pass empty plan', async () => {
  const source = fs.readFileSync(
    new URL('../../index.ts', import.meta.url), 'utf-8'
  );

  // Find dry-run branch in index.ts
  const dryRunStart = source.indexOf('if (dryRun)');
  assert.ok(dryRunStart >= 0, 'Source must contain dryRun branch');

  const dryRunSection = source.slice(dryRunStart, dryRunStart + 1500);

  // Should NOT contain emptyPlan or issues: []
  assert.ok(
    !dryRunSection.includes('emptyPlan'),
    'Dry-run path should not use emptyPlan'
  );
  assert.ok(
    !dryRunSection.includes('issues: []'),
    'Dry-run path should not pass empty issues array'
  );

  // Should call loadAllScores (or at least extractIssues)
  assert.ok(
    dryRunSection.includes('loadAllScores') || dryRunSection.includes('extractIssues'),
    'Dry-run path should collect actual scoring data'
  );
});
```

## Scope
- 允許修改: `packages/tools/eval/test/index.test.js`
- 禁止修改: 所有源碼檔案

## Verify
- `node --test "packages/tools/eval/test/index.test.js"`
- 預期: REGTEST-01 通過
```

---

#### REGTEST-02: find -exec 攔截（關聯 FIX-B）

```
## Mission
為 FIX-B（find -exec 繞過防護）建立回歸測試。

## Context
- 修復問題: find -exec 可繞過安全白名單執行任意命令
- 根因: SAFE_BASH_COMMANDS 包含 find 但未過濾危險旗標

## Input
- 閱讀 `packages/tools/eval/isolation.ts`（修復後的版本）
- 閱讀 `packages/tools/eval/test/isolation.test.js`（現有測試）

## What to do
在 `packages/tools/eval/test/isolation.test.js` 中新增：

```javascript
it('REGTEST-02: should block find -exec dangerous flags', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regtest02-'));
  const testFile = path.join(tmpDir, 'test.txt');
  fs.writeFileSync(testFile, 'hello', 'utf-8');

  const dispatcher = createToolDispatcher({ workspaceDir: tmpDir });

  // find with -exec should be intercepted
  const result = await dispatcher.dispatch({
    tool: 'Bash',
    params: { command: 'find . -name "*.txt" -exec cat {} \\;' },
  });
  assert.ok(result.success);
  // Should NOT contain actual file content (intercepted)
  assert.ok(
    !result.data.includes('hello'),
    `find -exec result should be intercepted, got: "${result.data}"`
  );

  // Regular find (without dangerous flags) should work
  const safeResult = await dispatcher.dispatch({
    tool: 'Bash',
    params: { command: 'find . -name "*.txt"' },
  });
  assert.ok(safeResult.success);
  assert.ok(safeResult.data.includes('test.txt'),
    `Safe find should list files, got: "${safeResult.data}"`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

## Scope
- 允許修改: `packages/tools/eval/test/isolation.test.js`
- 禁止修改: 所有源碼檔案

## Verify
- `node --test "packages/tools/eval/test/isolation.test.js"`
- 預期: REGTEST-02 通過
```

---

#### REGTEST-03: 絕對路徑攔截（關聯 FIX-C）

```
## Mission
為 FIX-C（Bash workspace 路徑穿越防護）建立回歸測試。

## Context
- 修復問題: Bash 命令可使用絕對路徑存取 workspace 外檔案
- 根因: executeBash 無路徑穿越防護

## What to do
在 `packages/tools/eval/test/isolation.test.js` 中新增：

```javascript
it('REGTEST-03: should block absolute paths outside workspace', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regtest03-'));

  const dispatcher = createToolDispatcher({ workspaceDir: tmpDir });

  // cat /etc/passwd should be blocked
  const result1 = await dispatcher.dispatch({
    tool: 'Bash',
    params: { command: 'cat /etc/passwd' },
  });
  assert.ok(result1.success);
  assert.ok(
    !result1.data.includes('root:'),
    `Absolute path cat should be blocked, got: "${result1.data}"`
  );

  // cat ../../etc/passwd should also be blocked (parent traversal)
  const result2 = await dispatcher.dispatch({
    tool: 'Bash',
    params: { command: 'cat ../../etc/passwd' },
  });
  assert.ok(result2.success);
  assert.ok(
    !result2.data.includes('root:'),
    `Parent traversal should be blocked, got: "${result2.data}"`
  );

  // cat ./local-file (relative path within workspace) should work
  const localFile = path.join(tmpDir, 'local.txt');
  fs.writeFileSync(localFile, 'workspace content', 'utf-8');
  const result3 = await dispatcher.dispatch({
    tool: 'Bash',
    params: { command: 'cat local.txt' },
  });
  assert.ok(result3.success);
  assert.ok(result3.data.includes('workspace content'),
    `Relative path within workspace should work, got: "${result3.data}"`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

## Scope
- 允許修改: `packages/tools/eval/test/isolation.test.js`
- 禁止修改: 所有源碼檔案

## Verify
- `node --test "packages/tools/eval/test/isolation.test.js"`
- 預期: REGTEST-03 通過
```

---

#### REGTEST-04: [Simulated] 標記移除（關聯 FIX-D）

```
## Mission
為 FIX-D（Bash [Simulated] 標記移除）建立回歸測試。

## Context
- 修復問題: Bash 模擬回應的 [Simulated] 前綴破壞工具模擬透明度
- 根因: executeBash 使用 [Simulated] 標記模擬命令

## What to do
在 `packages/tools/eval/test/isolation.test.js` 中新增：

```javascript
it('REGTEST-04: unsafe Bash commands should not leak [Simulated] marker', () => {
  const source = fs.readFileSync(
    new URL('../../isolation.ts', import.meta.url), 'utf-8'
  );

  // Verify no [Simulated] string in the source (removed from mock response)
  const simulatedMatches = source.match(/\[Simulated\]/g);
  assert.ok(
    !simulatedMatches || simulatedMatches.length === 0,
    'Source should not contain [Simulated] marker (violates R4.1 transparency)'
  );
});
```

## Scope
- 允許修改: `packages/tools/eval/test/isolation.test.js`
- 禁止修改: 所有源碼檔案

## Verify
- `node --test "packages/tools/eval/test/isolation.test.js"`
- 預期: REGTEST-04 通過
```

---

#### REGTEST-05: Grep/Glob async I/O（關聯 FIX-E）

```
## Mission
為 FIX-E（Grep/Glob async I/O）建立回歸測試。

## Context
- 修復問題: executeGrep/executeGlob 使用同步 readdirSync/readFileSync
- 根因: walkDir 輔助函式為同步

## What to do
在 `packages/tools/eval/test/isolation.test.js` 中新增源碼審查測試：

```javascript
it('REGTEST-05: executeGrep/executeGlob should not use sync I/O', () => {
  const source = fs.readFileSync(
    new URL('../../isolation.ts', import.meta.url), 'utf-8'
  );

  // Find executeGrep and executeGlob functions
  // These should NOT contain readdirSync or readFileSync
  const grepStart = source.indexOf('function executeGrep');
  const grepEnd = grepStart + 5000; // approx
  const grepBody = source.slice(grepStart, grepEnd);

  assert.ok(
    !grepBody.includes('readdirSync'),
    'executeGrep should not use readdirSync (use async readdir)'
  );
  assert.ok(
    !grepBody.includes('readFileSync'),
    'executeGrep should not use readFileSync (use async readFile)'
  );

  const globStart = source.indexOf('function executeGlob');
  const globEnd = globStart + 5000;
  const globBody = source.slice(globStart, globEnd);

  assert.ok(
    !globBody.includes('readdirSync'),
    'executeGlob should not use readdirSync (use async readdir)'
  );
});
```

## Scope
- 允許修改: `packages/tools/eval/test/isolation.test.js`
- 禁止修改: 所有源碼檔案

## Verify
- `node --test "packages/tools/eval/test/isolation.test.js"`
- 預期: REGTEST-05 通過
```

---

#### REGTEST-06: SIGINT 不導致 stale lock（關聯 FIX-G）

```
## Mission
為 FIX-G（SIGINT handler stale lock）建立回歸測試。

## Context
- 修復問題: SIGINT handler 的 process.exit(1) 跳過 executor finally 區塊
- 根因: index.ts 和 executor.ts 的清理邏輯未協調

## What to do
在 `packages/tools/eval/test/index.test.js` 中新增源碼審查測試：

```javascript
it('REGTEST-06: SIGINT handler should not cause stale exec lock', () => {
  const indexSource = fs.readFileSync(
    new URL('../../index.ts', import.meta.url), 'utf-8'
  );

  // Verify SIGINT handler exists
  const sigintIndex = indexSource.indexOf('SIGINT');
  assert.ok(sigintIndex >= 0, 'Source must have SIGINT handling');

  // Check for exec lock cleanup in executor.ts
  const execSource = fs.readFileSync(
    new URL('../../executor.ts', import.meta.url), 'utf-8'
  );

  // The exec.ts should have lock cleanup in finally block
  const finallyIndex = execSource.indexOf('finally {');
  assert.ok(finallyIndex >= 0, 'Executor must have finally block for lock cleanup');

  // The finally block should contain rm(lockPath) or similar cleanup
  const finallySection = execSource.slice(finallyIndex, finallyIndex + 300);
  assert.ok(
    finallySection.includes('lockPath') || finallySection.includes('exec-lock'),
    'Finally block should clean up exec lock'
  );
});
```

## Scope
- 允許修改: `packages/tools/eval/test/index.test.js`
- 禁止修改: 所有源碼檔案

## Verify
- `node --test "packages/tools/eval/test/index.test.js"`
- 預期: REGTEST-06 通過
```

---

## 7. Fix Batch Schedule

### Batch 1 — 全部修復並行派發（Worker A–D）

- **Workers**: WORKER-A (isolation.ts), WORKER-B (optimizer.ts + reporter.ts + lib/constants.ts), WORKER-C (index.ts + executor.ts), WORKER-D (scorer.ts + reporter.ts + lib/promise-pool.ts + lib/constants.ts + CI)
- **Strategy**: 4 個 worker 全部並行派發（檔案範圍互斥）
- **Depends on**: 無
- **注意**: WORKER-B 和 WORKER-D 都涉及 `lib/constants.ts` 建立和 `reporter.ts` 修改。WORKER-B 負責建立 `lib/constants.ts` + 修改 `optimizer.ts`；WORKER-D 負責修改 `reporter.ts`（從 `lib/constants.ts` import）。兩者對 `reporter.ts` 的修改無衝突（WORKER-B 不改 reporter.ts 的 SEVERITY_RANK import 部分，WORKER-D 只改 reporter.ts 的 SEVERITY_RANK import）。若有衝突，協調器手動解決。
- **Gate**:
  - [ ] WORKER-A 回報成功（Bash 安全 + async I/O + 死碼）
  - [ ] WORKER-B 回報成功（isAllowedFile + 常數抽取 + 備份清理 + Jaccard）
  - [ ] WORKER-C 回報成功（dry-run + SIGINT + 死碼 + 磁碟訊息）
  - [ ] WORKER-D 回報成功（cleanup + 型別安全 + 常數 + evidence + CI）
  - [ ] TypeScript: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
  - [ ] 現有測試: `node --test "packages/tools/eval/test/*.test.js"` → 全部通過

---

### Batch 2 — 回歸測試

- **Tasks**: REGTEST-01 ~ REGTEST-06
- **Strategy**: 6 個 worker 全部並行派發
  - REGTEST-01: index.test.js（關聯 FIX-A）
  - REGTEST-02: isolation.test.js（關聯 FIX-B）
  - REGTEST-03: isolation.test.js（關聯 FIX-C — 與 REGTEST-02 同檔案，需合併至一個 worker 或 sequential）
  - REGTEST-04: isolation.test.js（關聯 FIX-D — 同上，三個 REGTEST 都在 isolation.test.js）
  - REGTEST-05: isolation.test.js（關聯 FIX-E）
  - REGTEST-06: index.test.js（關聯 FIX-G）
- **檔案重疊處理**: REGTEST-02/03/04/05 都在 `isolation.test.js`，合併為一個 worker；REGTEST-01 + REGTEST-06 都在 `index.test.js`，合併為一個 worker
- **最終**: 2 個回歸測試 worker 並行派發
- **Depends on**: Batch 1 全部通過
- **Gate**:
  - [ ] REGTEST-01: dry-run 不傳 emptyPlan（index.test.js）
  - [ ] REGTEST-02: find -exec 攔截（isolation.test.js）
  - [ ] REGTEST-03: 絕對路徑攔截（isolation.test.js）
  - [ ] REGTEST-04: [Simulated] 標記移除（isolation.test.js）
  - [ ] REGTEST-05: async I/O（isolation.test.js）
  - [ ] REGTEST-06: SIGINT stale lock（index.test.js）
  - [ ] 全部新增回歸測試通過
  - [ ] 現有測試無退化

---

### Batch Final — 收尾整合

- **Tasks**: 最終驗證
- **Strategy**: 循序（由協調器自己執行）
- **Depends on**: Batch 1 + Batch 2 全部通過
- **Gate**:
  - [ ] 完整測試套件: `node --test "packages/tools/eval/test/*.test.js"` → 全部通過
  - [ ] TypeScript: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
  - [ ] 對照 REPORT.md，確認所有 20 個問題已處理

---

## 8. Regression Test Inventory

| 測試 ID | 關聯修復 | 測試類型 | 測試位置 | 測試場景摘要 |
|---|---|---|---|---|
| `REGTEST-01` | FIX-A | 源碼審查 | `test/index.test.js` | Dry-run 分支不傳 emptyPlan、呼叫 loadAllScores |
| `REGTEST-02` | FIX-B | 單元 | `test/isolation.test.js` | GIVEN find -exec WHEN dispatch THEN 攔截不執行 |
| `REGTEST-03` | FIX-C | 單元 | `test/isolation.test.js` | GIVEN cat /etc/passwd WHEN dispatch THEN 攔截絕對路徑 |
| `REGTEST-04` | FIX-D | 源碼審查 | `test/isolation.test.js` | isolation.ts 不含 [Simulated] 字串 |
| `REGTEST-05` | FIX-E | 源碼審查 | `test/isolation.test.js` | executeGrep/executeGlob 不含 readdirSync/readFileSync |
| `REGTEST-06` | FIX-G | 源碼審查 | `test/index.test.js` | executor.ts finally 區塊含 lockPath 清理 |

---

## 9. Verification Checkpoints

### Checkpoint 1 — 全部修復批次完成後
- `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- `node --test "packages/tools/eval/test/*.test.js"` → 現有測試全部通過

### Checkpoint 2 — 回歸測試實現後
- `node --test "packages/tools/eval/test/*.test.js"` → 全部 6 個新增回歸測試通過 + 現有測試無退化
- 邏輯檢查: REGTEST-02/03 在修復前的代碼上應失敗（find -exec 未被攔截、cat /etc/passwd 真實執行）

### Checkpoint 3 — 最終驗證
- 完整測試套件: `node --test "packages/tools/eval/test/*.test.js"`
- TypeScript: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
- 對照 REPORT.md，確認所有 20 個問題已處理

---

## 10. Error Recovery

| 失敗場景 | 處理方式 |
|---|---|
| 修復 worker 回報失敗 | 用 worker 已有的上下文繼續它（不要新建），給予更具體的指令。最多再試一次 |
| 修復 worker 兩次嘗試後仍失敗 | 暫停整個流程，保留同批次其他成功 worker 的結果。向用戶報告 |
| 回歸測試 worker 回報失敗 | 檢查是測試代碼有誤還是修復不完整。若測試代碼有誤，繼續該 worker 修正。若修復不完整，回到對應的修復 worker 繼續修復 |
| 回歸測試在修復前代碼上也能通過 | 測試設計無效 — 重新設計 oracle，派發新的 worker |
| 合併衝突（WORKER-B/D 都建立 lib/constants.ts） | 協調器解決：保留一份 lib/constants.ts，確認兩個 worker 的 import 都正確 |
| 修復導致現有測試退化 | 暫停，向用戶報告：哪個測試失敗、由哪個 worker 的變更引起 |
| TypeScript 編譯錯誤 | 檢查是哪個 worker 的修改引起的，繼續該 worker 修復型別錯誤。最多再試一次 |

---

## 11. Fix History

> **2026-05-29 (Round 1)**: 首次修復 — 25 個問題。核心：isolation.ts 整合、JSONL 行號、getProjectRoot、磁碟檢查、執行鎖。Commit `91863d7`。
>
> **2026-05-29 (Round 2)**: 第二輪修復 — 12 個問題。核心：isolation.ts 真實讀取、Message 型別擴展、reporter Set 去重、promise-pool guard。Commit `5f2061b`。
>
> **2026-05-29 (Round 3)**: 第三輪修復 — 18 個問題。核心：EVAL_MIN_SCORE/EVAL_MAX_P0 接入、死碼移除、型別安全。Commit `484913c`。
>
> **2026-05-29 (Round 4)**: 第四輪修復 — 26 個問題。核心：LLM 變體生成、[simulated] 移除、isAllowedFile、dedup pair cap、async I/O。Commit `a5f6db3` + `569335b`。
>
> **2026-05-29 (Round 5)**: 第五輪修復 — 32 個問題。核心：Bash 讀寫分離、評分鎖定原子性、isAllowedFile 路徑、備份還原、全域驗證限定、execSync 移除、死碼清理。Commit `372484f`。全部 verified fixed，53/53 測試通過。
>
> **2026-05-29 (Round 6 — 本次)**: 第六輪修復 — 20 個問題（0 P0 + 3 P1 + 5 P2 + 12 P3）。核心目標：dry-run 產出實際 diff、Bash 安全加固（find -exec 攔截 + 路徑穿越防護）、Bash 模擬透明度、async I/O 完成、死碼清理。

---

## 12. Boundaries

### ALWAYS

- 每個批次完成後立即執行 Gate 驗證
- Worker prompt 必須從 Section 6 原樣擷取，不要自己改寫
- Worker 回報後，先消化結果再決定下一步
- 修復不得與 spec 原始需求衝突
- 回歸測試必須在修復批次全部通過後才能開始派發
- 對照 REPORT.md 確認所有 issues 已處理

### ASK FIRST — 暫停並向用戶確認

- 修復方案與 spec 設計意圖衝突時
- 需要新增外部依賴（如 npm package）
- Worker 兩次嘗試失敗後
- 測試回歸無法快速定位原因
- WORKER-B 和 WORKER-D 的合併衝突超出 lib/constants.ts 範圍

### NEVER

- 協調器自己編輯原始碼或測試檔案
- 讓 worker 生成子 worker
- 跳過驗證直接進入下一批次
- 變更 spec 文檔
- 在修復未全部完成前開始回歸測試

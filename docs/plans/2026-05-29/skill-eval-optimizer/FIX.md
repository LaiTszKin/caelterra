# Fix Coordinator Prompt: skill-eval-optimizer (Round 5)

- **Date**: 2026-05-29
- **Source REPORT**: `docs/plans/2026-05-29/skill-eval-optimizer/REPORT.md`
- **Source Spec**: `docs/plans/2026-05-29/skill-eval-optimizer/`
- **Total Issues**: 0 P0 + 6 P1 + 14 P2 + 12 P3 = 32
- **Total Workers**: 6 fix (A–F) + 5 regression (REGTEST-01 ~ REGTEST-06)
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
- Handle lightweight coordination tasks: resolving merge conflicts, committing results

### What you NEVER do

- Write, edit, or modify any source-code or test file directly
- Skip a verification checkpoint
- Proceed to the next batch when the current batch has not passed verification
- Delegate comprehension — digest every worker result yourself before deciding next steps
- Let workers spawn their own workers (workers are leaf nodes)
- Start regression tests before all fixes in scope are verified

---

## 2. Mission

修復 Round 5 審查發現的 32 個問題（0 P0 + 6 P1 + 14 P2 + 12 P3）。

**核心目標**：

1. **Bash 工具隔離符合 R4 讀寫分離**（P1）→ 引入唯讀 Bash 模式或自訂 Bash-readonly，確保 `ls`/`cat` 等命令真實執行
2. **評分鎖定覆蓋 judge API 呼叫**（P1）→ 將 lock 範圍擴大到包含 judge API 呼叫，防止並發場景下的重複 API 浪費
3. **`isAllowedFile` 路徑安全**（P1）→ ALLOWED_FILES 中的相對路徑模式先用 `path.resolve` 轉絕對再比較
4. **崩潰後備份還原可靠**（P1）→ 使用唯一備份名或 timestamp，避免重試時覆蓋原始備份
5. **全域 frontmatter 驗證限定為當前技能**（P1）→ 驗證命令加入 `--skill` 限定，避免無關技能的既有問題引發誤還原
6. **`execSync` 改為非同步**（P1）→ 使用 `execFile` 或 `spawn` 搭配 Promise 包裝，消除 30s 事件迴圈凍結
7. **清理死碼與優化**（P2+P3）→ supplyQuestions 整合至 pipeline、appendTrace buffer、messages 截斷等

**Success looks like**: REPORT.md 中 32 個問題全部修復，6 個回歸測試通過，完整測試套件通過，`tsc --noEmit` 零錯誤。

---

## 3. Issue Inventory

| Issue ID | 等級 | 問題簡述 | 涉及檔案 | 審查維度 | 複雜度 |
|---|---|---|---|---|---|
| **A** | P1 | **Bash 全部視為寫入操作違反 R4 讀寫分離** — WRITE_TOOLS 含 'Bash' 導致 `ls`/`cat` 等唯讀命令被 mock | `isolation.ts` | 實作偏移 | 簡單 |
| **B** | P1 | **評分鎖定無法防止重複 judge API 呼叫** — API 呼叫在 lock 取得前執行；`.scored` 先於 `score.json` 寫入 | `scorer.ts` | 架構瑕疵 | 複雜 |
| **C** | P1 | **`isAllowedFile` ALLOWED_FILES 路徑模式未 resolve 為絕對路徑** — 相對路徑與絕對路徑 mixed 導致 path.relative 行為不可預測 | `optimizer.ts` | 架構瑕疵 | 簡單 |
| **D** | P1 | **崩潰後備份還原失效** — `.bak` 每次從當前內容建立，重試時覆蓋原始備份 | `optimizer.ts` | 架構瑕疵 | 簡單 |
| **E** | P1 | **全域 frontmatter 驗證導致錯誤還原** — `validate-skill-frontmatter` 無技能限定，其他技能的既有問題引發誤還原 | `optimizer.ts` | 架構瑕疵 | 簡單 |
| **F** | P1 | **`execSync` 阻塞事件迴圈 30 秒** — 同步執行 `validate-skill-frontmatter` | `optimizer.ts` | 性能隱患 | 簡單 |
| **G** | P2 | **LLM 變體生成存在但無法觸發** — `supplyQuestions` 無生產路徑呼叫；`generateVariants` 僅被死碼呼叫 | `question-loader.ts`, `lib/question-utils.ts` | 冗余代碼、實作偏移 | 簡單 |
| **H** | P2 | **JSONL 軌跡損壞仍呼叫 judge API** — `hasCorruption` 檢查後仍執行 `callJudgeModel` | `scorer.ts` | 實作偏移 | 簡單 |
| **I** | P2 | **Dry-run 模式仍有檔案/API 副作用** — `generateOptimizationPlan` 在 dry-run 時仍寫入檔案；上游 judge 呼叫仍產生成本 | `optimizer.ts`, `index.ts` | 架構瑕疵 | 簡單 |
| **J** | P2 | **`appendTrace` 順序 I/O 瓶頸** — tool-use loop 中無 write buffer，每次追加個別 `await appendFile` | `executor.ts` | 性能隱患 | 簡單 |
| **K** | P2 | **messages 陣列無限制增長** — 20 輪 tool-use + 多個大型 Read 結果累積數 MB | `executor.ts` | 性能隱患 | 簡單 |
| **L** | P2 | **Exec lock 錯誤訊息誤導** — `mkdir(lockPath)` 無 recursive，首次 eval 噴 ENOENT | `executor.ts` | 架構瑕疵 | 簡單 |
| **M** | P2 | **Grep/Glob 靜默跳過不可讀目錄** — catch 區塊為空，被測模型不知檔案被略過 | `isolation.ts` | 架構瑕疵 | 簡單 |
| **N** | P2 | **`scanForDone` 同步函式死碼** + **reporter fallback 死碼** + **optimizer dry-run/judge-unavailable 重複** — 累計 ~70 行 | `scorer.ts`, `reporter.ts`, `optimizer.ts` | 冗余代碼 | 簡單 |
| **O** | P2 | **`parse_error` 事件缺 JSONL 行號** — `_lineNumber` 僅在成功解析行設定 | `scorer.ts` | 實作偏移 | 簡單 |
| **P** | P2 | **PR gate 結果寫入 workflow summary 而非 PR comment** | `.github/workflows/eval.yml` | 實作偏移 | 簡單 |
| **Q** | P2 | **未使用的匯入** — `EnvConfig` 在 `question-loader.ts`、`Question` 在 `index.ts` | `question-loader.ts`, `index.ts` | 冗余代碼 | 簡單 |
| **R–W** | P3 | **12 個輕微問題** — existsSync 同步、jaccard 未選小集合、順序 LLM 呼叫、重複 filter、不安全斷言、promisePool 脆弱、磁碟檢查跳過、同模型警告、貪婪正則等 | 多檔案 | 性能/架構 | 簡單 |

---

## 4. Fix Dependency Analysis

### Dependency graph

```
All FIX workers (A–F) are INDEPENDENT — no logical dependency between them.
Each worker touches a disjoint set of files.

All REGTEST workers depend on the corresponding FIX being completed first.
```

### File overlap detection

| 重疊組 | 問題 ID | 共享檔案 | 處理方式 |
|---|---|---|---|
| 重疊組 1 | **A**, **M** | `isolation.ts` | 同一 Worker A |
| 重疊組 2 | **B**, **H**, **O** | `scorer.ts` | 同一 Worker B |
| 重疊組 3 | **C**, **D**, **E**, **F**, **N** (opt) | `optimizer.ts` | 同一 Worker C |
| 重疊組 4 | **I**, **J**, **K**, **L**, **Q** (index), **P** | `index.ts`, `executor.ts`, `.github/workflows/eval.yml` | 同一 Worker D |
| 重疊組 5 | **G**, **Q** (q-loader) | `question-loader.ts`, `lib/question-utils.ts` | 同一 Worker E |
| 重疊組 6 | **N** (scorer/reporter) | `scorer.ts`, `reporter.ts` | 同一 Worker E |
| 無重疊 | **R–W** | 各檔案 | 併入各對應 Worker |

**結論**：所有 Worker 的檔案範圍彼此互斥，可全部並行派發。

---

## 5. Fix Details (with Regression Test Design)

### FIX-A: Bash 工具隔離違反 R4 讀寫分離 (P1)

| 欄位 | 內容 |
|---|---|
| **根因** | `WRITE_TOOLS` 集合（isolation.ts L84-89）包含 `'Bash'`。所有 Bash 命令（含 `ls`、`cat`、`pwd` 等唯讀命令）一律回傳模擬結果，違反 SPEC R4「讀取類工具真實執行、寫入類工具模擬」。另 Bash mock 回傳格式為 `Written {path} ({length} bytes)` 與真實 stdout 差異明顯 |
| **涉及檔案** | `isolation.ts` > `WRITE_TOOLS`（L84-89）、`buildWriteResponse`（L107-117）、`dispatch`（L396-424） |
| **修復方式** | 1. 將 `'Bash'` 從 `WRITE_TOOLS` 移除，加入 `WORKSPACE_TOOLS` 或建立獨立的 `EXEC_TOOLS` 集合<br>2. 在 `dispatch` 中對 Bash 工具調用 `execSync`/`exec` 在 workspace 內執行命令（或使用 `executeInWorkspace` 模式的擴展）<br>3. 若完全在 workspace 內執行 Bash 可能不安全，改為只模擬明顯有副作用的命令（`rm`、`mv`、`write` 等），對唯讀命令（`ls`、`cat`、`grep`、`pwd`）真實執行<br>4. Mock 回傳格式用 `buildReadResponse` 而非 `buildWriteResponse` |
| **複雜度** | 簡單 |

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | `REGTEST-01` |
| **測試類型** | 單元測試 |
| **測試位置** | `packages/tools/eval/test/isolation.test.js` — 新測試函式 |
| **測試場景** | GIVEN `createToolDispatcher({ workspaceDir })` WHEN `dispatch({ tool: 'Bash', params: { command: 'ls' } })` THEN Bash 命令真實執行而非回傳模擬結果 |
| **Oracle** | Bash 結果包含 workspace 目錄的真實檔案列表，而非 `Written ...` 格式的回傳 |

---

### FIX-B: 評分鎖定無法防止重複 judge API 呼叫 (P1)

| 欄位 | 內容 |
|---|---|
| **根因** | `scoreSingleTest` 中，judge model API 呼叫（L344）在 `.scoring-lock` 獲取（L381）**之前**。並發場景中兩行程都通過 `isAlreadyScored` 檢查、各自完成 API 呼叫，然後才競爭寫入鎖。此外 `.scored` marker 在 `score.json` 之前寫入（L394-395），若 L394 後崩潰則永久標記已評分 |
| **涉及檔案** | `scorer.ts` > `scoreSingleTest`（L310-408） |
| **修復方式** | 1. 將 lock 獲取移到 Judge API 呼叫之前：acquire lock → re-check `.scored` → call API → write score.json → write .scored → release lock<br>2. 反轉寫入順序：先寫 `score.json`，再寫 `.scored` marker<br>3. 在 lock 獲取失敗時（另一行程持有鎖），直接回傳 `skipped` 不阻塞等待 |
| **複雜度** | 複雜 — 涉及調整 `scoreSingleTest` 的整個臨界區段範圍 |

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | `REGTEST-02` |
| **測試類型** | 單元測試（mock API + 檔案系統） |
| **測試位置** | `packages/tools/eval/test/scorer.test.js` |
| **測試場景** | GIVEN `scoreSingleTest` 對某 test 呼叫 WHEN 兩個並發進程同時評分 THEN 只有第一個進程執行 judge API 呼叫，第二個進程跳過（API 僅被呼叫一次） |
| **Oracle** | 在 mock judge API 中設置呼叫計數器，確認 judge API 僅被呼叫一次 |

---

### FIX-C: `isAllowedFile` ALLOWED_FILES 路徑模式未 resolve (P1)

| 欄位 | 內容 |
|---|---|
| **根因** | `ALLOWED_FILES`（optimizer.ts L119-124）中的目錄模式為相對路徑（如 `skills/<name>/scripts/`），但傳入的 `filePath` 是絕對路徑。`path.relative(resolved, normalized)` 中 `resolved` 是相對路徑，行為依賴 CWD |
| **涉及檔案** | `optimizer.ts` > `isAllowedFile`（L359-373） |
| **修復方式** | 在 `isAllowedFile` 開頭，對每個 pattern 用 `path.resolve(pattern.replace(/<name>/g, skillName))` 轉為絕對路徑後再比較。同時確保路徑結尾有 `/` 分隔符以避免前綴誤判 |
| **複雜度** | 簡單 |

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | `REGTEST-04` |
| **測試類型** | 單元測試 |
| **測試位置** | `packages/tools/eval/test/optimizer.test.js` — 新測試函式 |
| **測試場景** | GIVEN 各種 CWD 和 `filePath` 組合（含含 `..` 的路徑）WHEN `isAllowedFile` 檢查 THEN 正確判斷（CWD 不影響結果） |
| **Oracle** | 在 mock 的 CWD 下，`isAllowedFile('/project/skills/spec/SKILL.md', 'spec')` → true；不論 `/tmp` 或 `/project` 作為 CWD 結果應一致 |

---

### FIX-D: 崩潰後備份還原失效 (P1)

| 欄位 | 內容 |
|---|---|
| **根因** | `optimizeSkillMd` 中備份路徑固定為 `skillMdPath + '.bak'`（L1235）。若第一次運行在 judge API 後、驗證前崩潰，重試時 `.bak` 被當前已修改內容覆蓋，原始內容永久遺失 |
| **涉及檔案** | `optimizer.ts` > `optimizeSkillMd`（L1234-1298） |
| **修復方式** | 1. 備份路改為含時間戳：`skillMdPath + '.bak.' + Date.now()` 或 `skillMdPath + '.bak.' + new Date().toISOString().replace(/[:.]/g, '-')`<br>2. 若舊備份已存在，不覆蓋（僅首次建立備份） |
| **複雜度** | 簡單 |

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | `REGTEST-05` |
| **測試類型** | 單元測試 |
| **測試位置** | `packages/tools/eval/test/optimizer.test.js` — 新測試函式 |
| **測試場景** | GIVEN `optimizeSkillMd` 執行優化（mock 環境）WHEN 檢查備份檔案 THEN 備份檔案存在且內容與優化前的 SKILL.md 一致 |
| **Oracle** | 備份檔案路徑包含時間戳或用戶 ID，不與其他運行衝突 |

---

### FIX-E: 全域 frontmatter 驗證導致錯誤還原 (P1)

| 項位 | 內容 |
|---|---|
| **根因** | `optimizeSkillMd` 中驗證命令 `node dist/bin/apollo-toolkit.js validate-skill-frontmatter`（L1266）無技能名稱限定，驗證**所有**技能的 frontmatter。若另一個不相關的技能有既存 frontmatter 問題，當前技能的合法優化被錯誤還原 |
| **涉及檔案** | `optimizer.ts` > `optimizeSkillMd`（L1263-1291） |
| **修復方式** | 將驗證範圍限定為僅驗證被優化的技能：`node dist/bin/apollo-toolkit.js validate-skill-frontmatter --skill <skillName>` 或在 CLI 不支援此選項時直接解析當前 SKILL.md 的 frontmatter（用 regex 提取 YAML 區塊檢查有效性） |
| **複雜度** | 簡單 |

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | 與 REGTEST-05 合併 |
| **測試類型** | 單元測試 + 源碼審查 |
| **測試位置** | `packages/tools/eval/test/optimizer.test.js` |
| **測試場景** | GIVEN optimizer.ts 原始碼 WHEN 驗證 `optimizeSkillMd` 中的 frontmatter 驗證命令 THEN 命令中不含 `--skill` 限定且非 `validate-skill-frontmatter` 全域呼叫 |
| **Oracle** | 驗證命令應限於當前技能，或使用內聯 frontmatter 解析 |

---

### FIX-F: `execSync` 阻塞事件迴圈 30 秒 (P1)

| 欄位 | 內容 |
|---|---|
| **根因** | `optimizeSkillMd`（L1266）使用 `execSync`，timeout 30s。在執行期間 Node.js 事件迴圈完全凍結，所有並行 promise 無法進展 |
| **涉及檔案** | `optimizer.ts` > `optimizeSkillMd`（L1264-1270） |
| **修復方式** | 替換為 `execFile`（非同步）搭配 `Promise` 包裝：`import { execFile } from 'node:child_process'; import { promisify } from 'node:util'; const execFileAsync = promisify(execFile);` |
| **複雜度** | 簡單 |

**Regression test design:**

| 欄位 | 內容 |
|---|---|
| **測試 ID** | 與 REGTEST-05 合併 |
| **測試類型** | 源碼審查 |
| **測試位置** | `packages/tools/eval/test/optimizer.test.js` |
| **測試場景** | GIVEN optimizer.ts 原始碼 WHEN 搜尋 `execSync` THEN 在 `optimizeSkillMd` 函式中無 `execSync` 呼叫 |
| **Oracle** | `execSync` 不應出現在 `optimizeSkillMd` 中 |

---

### FIX-G ~ FIX-Q: P2 / P3 修復

(詳細修復方案見 Section 6 Worker Prompt — 所有 P2/P3 修復已合併入各 Worker 的指令中，此處不再重複結構化表格)

---

## 6. Worker Prompt Library

### Fix Worker Prompts

---

#### WORKER-A: isolation.ts 修復 — Bash 讀寫分離 + Grep/Glob 靜默跳過 (FIX-A + FIX-M)

```
## Mission
修復 isolation.ts 中的兩個問題：
1. (P1) Bash 工具違反 R4 讀寫分離 — WRITE_TOOLS 含 'Bash'
2. (P2) Grep/Glob 靜默跳過不可讀目錄 — catch 區塊為空

## Context
- 審查維度: 實作偏移 + 架構瑕疵
- SPEC 需求: optimize-and-integrate R4.1「讀取類工具真實執行，寫入類工具模擬」

## Input
- 閱讀 `packages/tools/eval/isolation.ts`（完整閱讀）

## What to do

### 修正 1: Bash 讀寫分離 (P1)

在 `isolation.ts` 中：

1. **將 `'Bash'` 從 `WRITE_TOOLS` 移除**（L84-89）：
```typescript
const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'Write',
  'Edit',
  'NotebookEdit',
  // 'Bash' — 已移除：Bash 需要支援唯讀命令的真實執行
]);
```

2. **在 `dispatch` 中對 Bash 處理**（在 `WRITE_TOOLS.has(tool)` 檢查之前，新增 Bash 分支）：
```typescript
if (tool === 'Bash' && workspaceDir) {
  // 在 workspace 內真實執行 Bash 命令
  result = await executeBash(workspaceDir, params);
} else if (WORKSPACE_TOOLS.has(tool) && workspaceDir) {
  result = await executeInWorkspace(tool, workspaceDir, params);
} // ...
```

3. **新增 `executeBash` 函式**（放在 `executeGlob` 之後）：
```typescript
/**
 * 在 workspace 內真實執行 Bash 命令（唯讀安全子集）。
 * 使用 execFile 而非 execSync 以避免阻塞。
 * 只允許預先定義的安全命令清單（ls, cat, pwd, echo, head, tail, wc, find, grep, sort, uniq, which, date）。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

const SAFE_BASH_COMMANDS = new Set([
  'ls', 'cat', 'pwd', 'echo', 'head', 'tail', 'wc', 'find',
  'grep', 'sort', 'uniq', 'which', 'date', 'printf', 'tree',
]);

async function executeBash(
  workspaceDir: string,
  params: Record<string, unknown>,
): Promise<MockToolResult> {
  const command = typeof params.command === 'string' ? params.command.trim() : '';
  if (!command) {
    return { success: false, data: 'Error: No command provided for Bash', tool: 'Bash' };
  }

  // Extract the base command name
  const baseCmd = command.split(/\s+/)[0];
  if (!SAFE_BASH_COMMANDS.has(baseCmd)) {
    // Unsafe command: simulate (record intent, return mock)
    console.warn(`[isolation] Unsafe Bash command intercepted: ${baseCmd}`);
    return { success: true, data: `[Simulated] ${command} completed.`, tool: 'Bash' };
  }

  try {
    const { stdout, stderr } = await execFileAsync(baseCmd, command.split(/\s+/).slice(1), {
      cwd: workspaceDir,
      timeout: 5000,
    });
    const output = stderr ? `${stdout}\n${stderr}` : stdout;
    return { success: true, data: output || '(no output)', tool: 'Bash' };
  } catch (err) {
    return {
      success: false,
      data: `Error: ${err instanceof Error ? err.message : String(err)}`,
      tool: 'Bash',
    };
  }
}
```

4. **注意 import 更新**：加入 `import { execFile } from 'node:child_process';` 和 `import { promisify } from 'node:util';`

### 修正 2: Grep/Glob 靜默跳過記錄 (P2)

在 `executeGrep`（L224）和 `executeGlob`（L316-317）的 catch 區塊中：
1. 將空的 catch 改為記錄跳過資訊到結果中
2. 在結果中加入 `[skipped X unreadable paths]` 警告

```typescript
// executeGrep L224 附近:
let skippedCount = 0;
// ... walkDir 中:
try {
  entries = readdirSync(dir, { withFileTypes: true });
} catch {
  skippedCount++;
  return;
}
// 在結果中新增:
if (skippedCount > 0) {
  results.push(`[isolation] Warning: ${skippedCount} path(s) could not be read (permission denied or unavailable)`);
}
```

3. `executeGlob` 也做相同修改（L316-317）。

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/isolation.ts`
- 禁止修改的檔案:
  - 所有其他檔案

## Output
完成後回報：
- Bash 是否已從 WRITE_TOOLS 移除
- executeBash 函式的實作方式和安全命令清單
- Grep/Glob 的 catch 區塊修改後的程式碼
- tsc 編譯結果
- 測試執行結果

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- 執行: `node --test "packages/tools/eval/test/isolation.test.js"` → 全部通過
- 手動檢查: `grep "'Bash'" packages/tools/eval/isolation.ts` → 不應在 WRITE_TOOLS 內

## Boundaries
- Bash 的安全命令清單應覆蓋常用唯讀命令但不包含 rm/mv/chmod 等有副作用的命令
- executeBash 必須使用 execFile（非 execSync）以避免阻塞事件迴圈
- 不可修改 isolation.ts 以外的檔案
```

---

#### WORKER-B: scorer.ts 修復 — 評分鎖定原子性 + 損壞跳過 + 行號 (FIX-B + FIX-H + FIX-O)

```
## Mission
修復 scorer.ts 中的 3 個問題：
1. (P1) 評分鎖定無法防止重複 judge API 呼叫 — lock 範圍需覆蓋 API 呼叫
2. (P2) JSONL 軌跡損壞仍呼叫 judge API — 應提早跳過
3. (P2) parse_error 事件缺少 JSONL 行號

## Context
- 審查維度: 架構瑕疵 + 實作偏移
- 系統不變量 #1: 每題至少執行一次才評分
- 系統不變量 #4: 已評分的題目不重複評分

## Input
- 閱讀 `packages/tools/eval/scorer.ts`（完整閱讀，特別關注 L310-408）

## What to do

### 修正 1: 鎖定範圍擴大到 API 呼叫 (P1)

在 `scoreSingleTest` 函式（L310-408）中重新排列順序：

**修改前（當前）**：
```
1. readTrace → 2. getScoringCriteria → 3. buildJudgePrompt → 4. callJudgeModel (API!) → 5. acquire lock → 6. write .scored → 7. write score.json → 8. release lock
```

**修改後**：
```
1. readTrace → 2. hasCorruption? → 3. getScoringCriteria → 4. buildJudgePrompt → 5. acquire lock → 6. re-check .scored (double-check!) → 7. callJudgeModel (API!) → 8. write score.json → 9. write .scored → 10. release lock
```

具體步驟：
1. 將 lock 獲取（L379-386）移到 `callJudgeModel`（L344-345）之前
2. 在 lock 獲取之後、API 呼叫之前，加入 double-check：重新確認 `.scored` 不存在（避免 race condition）
3. 反轉 `.scored` 和 `score.json` 的寫入順序：先寫 `score.json`，再寫 `.scored`
4. Lock 失敗時（Mkdir EEXIST）仍回傳 `skipped: true`

```typescript
// 修改後的 scoreSingleTest 核心流程 (L310-408)：

// Atomic write: use mkdir as mutex
const lockDir = join(resultsDir, '.scoring-lock');
try {
  await mkdir(lockDir);
} catch {
  console.warn(`${testNo}: scoring lock held by another process, skipping`);
  return { testId: testNo, score: null, skipped: true };
}

try {
  // Double-check: another process might have scored this while we waited
  try {
    await access(scoredPath);
    console.warn(`${testNo}: already scored (detected after lock acquisition), skipping`);
    return { testId: testNo, score: null, skipped: true };
  } catch { /* .scored not found — safe to score */ }

  // Build judge prompt (inside critical section but before API call)
  const prompt = buildJudgePrompt(trace, scoringCriteria, testNo, skillName);
  const timeoutMs = env.JUDGE_TIMEOUT > 0 ? env.JUDGE_TIMEOUT * 1000 : 120_000;
  const judgment = await callJudgeModel(prompt, env, { timeoutMs });

  // ... process judgment into ScoreResult ...

  // Write score.json FIRST, then .scored marker
  await writeFile(scorePath, JSON.stringify(score, null, 2), 'utf-8');
  
  const scoredData = JSON.stringify({
    testId: testNo,
    scoredAt: score.scoredAt,
    overallScore: score.overallScore,
  });
  await writeFile(scoredPath, scoredData, 'utf-8');
} finally {
  // Release lock
  try {
    await rm(lockDir, { recursive: true });
  } catch (err) {
    console.error(`[scorer] Failed to remove scoring lock at ${lockDir}: ${err instanceof Error ? err.message : String(err)}`);
    try { await rmdir(lockDir); } catch { /* ignore fallback failure */ }
  }
}
```

### 修正 2: JSONL 損壞提早跳過 (P2)

在 `callJudgeModel` 呼叫之前（修正 1 後的 Lock 內部），加入：
```typescript
// Skip if trace has corruption — don't waste judge API calls
if (hasCorruption) {
  const score: ScoreResult = {
    testId: testNo,
    overallScore: 0,
    dimensions: [],
    issues: [{
      severity: 'P2',
      category: 'other',
      description: '軌跡檔案損壞，無法評分',
      evidence: `Trace file contains corrupted JSON lines`,
    }],
    summary: '無法評分：軌跡檔案損壞',
    scoredAt: new Date().toISOString(),
    scorable: false,
    scoringNote: '無法評分：軌跡檔案損壞',
  };
  await writeFile(scorePath, JSON.stringify(score, null, 2), 'utf-8');
  await writeFile(scoredPath, JSON.stringify({ testId: testNo, scoredAt: score.scoredAt }), 'utf-8');
  return { testId: testNo, score };
}
```

### 修正 3: parse_error 行號 (P2)

在 `readTrace` 中（L86-103），將 `parse_error` 事件加上 `_lineNumber`：
```typescript
const parseErrorEvent: TraceEventWithLine = {
  type: 'parse_error',
  timestamp: new Date().toISOString(),
  data: { line: i + 1, raw: line.substring(0, 200), error: (err as Error).message },
};
parseErrorEvent._lineNumber = i + 1; // 設定行號
events.push(parseErrorEvent);
```

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/scorer.ts`
- 禁止修改的檔案:
  - 所有其他檔案

## Output
完成後回報：
- 修改後的 scoreSingleTest 流程（特別是 lock 範圍和 double-check）
- 損壞跳過邏輯的程式碼
- parse_error 行號修正
- tsc 編譯結果
- 測試執行結果

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- 執行: `node --test "packages/tools/eval/test/scorer.test.js"` → 全部通過

## Boundaries
- 僅修改 scorer.ts
- 不可改變 score.json 的結構（需保持向後兼容）
- 保留 `scorable` 和 `scoringNote` 欄位的語義
```

---

#### WORKER-C: optimizer.ts 修復 — 路徑安全 + 備份 + 驗證 + execSync + 重複代碼 (FIX-C + D + E + F + N 部分)

```
## Mission
修復 optimizer.ts 中的 5 個問題：
1. (P1) isAllowedFile ALLOWED_FILES 模式未 resolve 為絕對路徑
2. (P1) 崩潰後備份還原失效（.bak 覆蓋）
3. (P1) 全域 frontmatter 驗證誤還原
4. (P1) execSync 阻塞事件迴圈 30 秒
5. (P2) dry-run/judge-unavailable 40 行重複代碼

## Context
- 審查維度: 架構瑕疵 + 性能隱患 + 冗余代碼
- 系統不變量 #5: 優化 diff 不修改技能目錄外的檔案
- 系統不變量 #6: 備份在修改前必定存在

## Input
- 閱讀 `packages/tools/eval/optimizer.ts`（完整閱讀，特別關注 L359-373, L1060-1302）

## What to do

### 修正 1: isAllowedFile ALLOWED_FILES resolve 為絕對路徑 (P1)

修改 `isAllowedFile` 函式（L359-373）：

```typescript
export function isAllowedFile(filePath: string, skillName: string): boolean {
  const normalized = resolve(filePath).replace(/\\/g, '/');
  for (const pattern of ALLOWED_FILES) {
    // 重要: 先用 path.resolve 將相對模式轉為絕對路徑，確保 path.relative 行為正確
    const resolved = resolve(pattern.replace(/<name>/g, skillName)).replace(/\\/g, '/');
    if (resolved.endsWith('/') || resolved.endsWith('/' + skillName + '/SKILL.md')) {
      // 檢查 resolved 自身確保正確處理
    }
    if (resolved.endsWith('/')) {
      // Directory pattern
      const rel = relative(resolved, normalized);
      if (!rel.startsWith('..') && rel !== normalized) return true;
    } else {
      // File pattern
      if (normalized.endsWith('/' + resolved) || normalized === resolved) return true;
    }
  }
  return false;
}
```

實際上更簡單的做法是：保持現有的 `ALLOWED_FILES` 相對路徑定義，但在比較前對兩邊都 resolve：

```typescript
export function isAllowedFile(filePath: string, skillName: string): boolean {
  const normalized = resolve(filePath).replace(/\\/g, '/');
  for (const pattern of ALLOWED_FILES) {
    // 將 mode 轉為絕對路徑後再 compare
    const resolvedPath = resolve(pattern.replace(/<name>/g, skillName)).replace(/\\/g, '/');
    const resolvedDir = resolvedPath.endsWith('/') ? resolvedPath : resolvedPath + '/';
    
    if (resolvedDir.endsWith('/')) {
      const rel = relative(resolvedDir, normalized);
      if (!rel.startsWith('..') && rel !== normalized) return true;
    } else {
      if (normalized === resolvedPath || normalized.endsWith('/' + resolvedPath)) return true;
    }
  }
  return false;
}
```

### 修正 2: 備份使用唯一名稱 (P1)

將備份路徑從固定 `.bak` 改為含時間戳的格式（L1235-1236）：

```typescript
// 1. Backup — use unique timestamp to prevent overwrite on retry
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const bakPath = skillMdPath + '.bak.' + timestamp;
copyFileSync(skillMdPath, bakPath);
console.log(`Backup created: ${bakPath}`);

// 保留一個可預測的 restore 路徑（symlink 或記錄最新備份）
const latestBakPath = skillMdPath + '.bak';
copyFileSync(skillMdPath, latestBakPath); // 也保留最新的（衝突時用 timestamp 版）
```

在還原時（L1277, L1286, L1298），使用 `latestBakPath` 或 `bakPath`（timestamp 版）都可以。

### 修正 3: 全域 frontmatter 驗證限定當前技能 (P1)

在 L1263-1291 的驗證區塊中，改為只驗證當前技能檔案：

**方式 A**（如果 CLI 支援 `--skill` 參數）：
```typescript
try {
  const root = getProjectRoot();
  // 只驗證當前技能，不驗證所有技能
  await execFileAsync('node', [
    'dist/bin/apollo-toolkit.js',
    'validate-skill-frontmatter',
    '--skill', resolvedSkillName,
  ], { cwd: root, timeout: 30000 });
  console.log('Frontmatter validation: PASSED');
} catch (valErr) { ... }
```

**方式 B**（內聯解析 frontmatter，更可靠）：
```typescript
try {
  // 內聯驗證：直接用 regex 解析 frontmatter 的基本結構
  const frontmatterMatch = newContent.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('Missing or malformed YAML frontmatter (--- delimiters not found)');
  }
  const frontmatter = frontmatterMatch[1];
  // 驗證 frontmatter 不為空且有基本欄位
  if (frontmatter.trim().length === 0 || !/^[a-zA-Z]/.test(frontmatter)) {
    throw new Error('Frontmatter appears empty or malformed');
  }
  console.log('Frontmatter validation: PASSED (inline)');
  
  // Markdown structure validation (已存在)
  const mdValidation = validateMarkdownStructure(newContent);
  if (!mdValidation.valid) {
    console.error('Markdown structure validation FAILED. Restoring backup...');
    copyFileSync(latestBakPath, skillMdPath);
    return { success: false, message: '...' };
  }
} catch (valErr) {
  ...
}
```

推薦方式 B（無外部 CLI 依賴，不需要 `execSync`/`execFileAsync` 的開銷）。

### 修正 4: execSync → execFileAsync (P1)

在檔案頂部加入（或使用 `node:util` 的 `promisify`）：
```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
```

然後在 L1264-1270 替換 `execSync` 為 `execFileAsync`（僅若選擇方式 A 時需要）。若選擇方式 B（內聯解析），則完全不需要 `execSync`。

### 修正 5: 消除 dry-run/judge-unavailable 重複代碼 (P2)

將 L1145-1186（dry-run）和 L1190-1230（!judgeAvailable）的 40 行重複代碼提取為共用函式：

```typescript
function buildTemplatePatch(
  skillIssues: OptimizationPlan['issues'],
  date: string,
  message: string,
): string {
  const patchLines: string[] = [
    '# SKILL.md Optimization Suggestions',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Source: ${skillMdPath}`,
    `Issues analyzed: ${skillIssues.length}`,
    '',
    '---',
    '',
    '## Identified Issues',
    '',
  ];
  for (const issue of skillIssues) {
    patchLines.push(`### ${issue.id}: ${issue.severity} - ${issue.description.substring(0, 120)}`);
    patchLines.push('');
    patchLines.push(`- **Frequency**: ${issue.frequency} tests affected`);
    patchLines.push(`- **Affected Tests**: ${issue.affectedTests.join(', ')}`);
    patchLines.push(`- **Evidence**: ${issue.evidence.join('; ') || '(none)'}`);
    patchLines.push(`- **Suggested Fix**: ${issue.suggestedFix || '(none)'}`);
    patchLines.push('');
  }
  patchLines.push('---', '', '## Template-Based Suggestions', '');
  patchLines.push(generateSkillTemplateChanges(skillIssues));
  
  const root = getProjectRoot();
  const resultsDir = resolve(root, 'results', 'spec', date);
  mkdirSync(resultsDir, { recursive: true });
  const patchPath = join(resultsDir, 'skill-optimization-patch.md');
  writeFileSync(patchPath, patchLines.join('\n'), 'utf-8');
  
  return patchPath;
}
```

然後在兩個分支中簡化為：
```typescript
if (dryRun) {
  const patchPath = buildTemplatePatch(skillIssues, date);
  return { success: true, message: `Dry-run patch written to ${patchPath}` };
}
if (!judgeAvailable) {
  const patchPath = buildTemplatePatch(skillIssues, date);
  return { success: true, message: `Judge model unavailable. Template-based patch written to ${patchPath}` };
}
```

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/optimizer.ts`
- 禁止修改的檔案:
  - 所有其他檔案

## Output
完成後回報：
- 每個修正的變更摘要（行號、修改方式）
- tsc 編譯結果
- 測試執行結果

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- 執行: `node --test "packages/tools/eval/test/optimizer.test.js"` → 全部通過（現有測試）
- 執行: `node --test "packages/tools/eval/test/*.test.js"` → 全部通過

## Boundaries
- 僅修改 optimizer.ts
- 不要修改 `SEVERITY_RANK` 常數（與 reporter 的重複在下個 Worker 處理）
- 備份時間戳使用 ISO 格式，確保跨平台相容
```

---

#### WORKER-D: index.ts + executor.ts + .github/workflows 修復 (FIX-I + J + K + L + P + Q 部分)

```
## Mission
修復以下檔案中的多個 P2/P3 問題：
1. (P2) Dry-run 仍呼叫 judge API / 寫入 optimization-plan.json — index.ts
2. (P2) appendTrace 順序 I/O 瓶頸 — executor.ts
3. (P2) messages 陣列無限制增長 — executor.ts
4. (P2) Exec lock 錯誤訊息誤導 — executor.ts
5. (P2) PR gate 結果寫入 summary 而非 comment — .github/workflows/eval.yml
6. (P2) 未使用的匯入 — index.ts

## Context
- 審查維度: 架構瑕疵 + 性能隱患 + 實作偏移 + 冗余代碼
- SPEC 需求: optimize-and-integrate R1.3 (dry-run 零副作用), R3 (PR 評論)

## Input
- 閱讀 `packages/tools/eval/index.ts`
- 閱讀 `packages/tools/eval/executor.ts`
- 閱讀 `.github/workflows/eval.yml`

## What to do

### 修正 1: Dry-run 不寫入 optimization-plan.json (P2)

在 `index.ts` L313-343 的 optimize 路徑中：

1. 將 `dryRun` 參數傳遞到 `deduplicateIssues` 和 `generateSuggestedFix`
   — 或者更簡單：在 dry-run 模式下跳過這兩個耗費 API 的步驟，只生成 template-based patch

2. 將 `generateOptimizationPlan`（L333）移到 `dryRun` 檢查內：

```typescript
if (optimize) {
  stderr.write('[7/7] Generating optimisation plan...\n');
  
  if (dryRun) {
    // Dry-run: skip judge API calls, only template-based suggestions
    stderr.write('[7/7] Dry-run mode: using template-based suggestions (no API calls)\n');
    const optResult = await optimizeSkillMd(
      { date: today, summary: { totalScores: 0, totalIssues: 0, dedupedIssues: 0 }, issues: [] } as OptimizationPlan,
      skillMdPath,
      env,
      true,  // dryRun
      today,
      false, // judgeAvailable = false to skip API
    );
    stderr.write(`[7/7] ${optResult.message}\n`);
  } else {
    // Full optimization with judge API
    const allScores = await loadAllScores(today);
    const rawIssues = extractIssues(allScores);
    const deduped = await deduplicateIssues(rawIssues, env);
    stderr.write(`[7/7] Generating suggested fixes for ${deduped.length} issues...\n`);
    const fixResults = await promisePool(
      deduped,
      async (issue) => { issue.suggestedFix = await generateSuggestedFix(issue, env); },
      env.JUDGE_CONCURRENCY,
    );
    const plan = generateOptimizationPlan(deduped, today, allScores);
    stderr.write('[7/7] Optimising SKILL.md...\n');
    const optResult = await optimizeSkillMd(plan, skillMdPath, env, false, today, true);
    stderr.write(`[7/7] ${optResult.message}\n`);
  }
}
```

### 修正 2: appendTrace 寫入緩衝 (P2)

在 `executor.ts` 中實作 write buffer：

1. 在 `executeSingleTest` 中（約 L200）建立緩衝陣列：
```typescript
const traceBuffer: string[] = [];
let traceBufferSize = 0;
const MAX_BUFFER_SIZE = 10; // 每 10 行 flush 一次

async function appendTraceBuffered(event: TraceEvent): Promise<void> {
  traceBuffer.push(JSON.stringify(event) + '\n');
  traceBufferSize++;
  if (traceBufferSize >= MAX_BUFFER_SIZE) {
    await appendFile(tracePath, traceBuffer.join(''), 'utf-8');
    traceBuffer.length = 0;
    traceBufferSize = 0;
  }
}

async function flushTraceBuffer(): Promise<void> {
  if (traceBuffer.length > 0) {
    await appendFile(tracePath, traceBuffer.join(''), 'utf-8');
    traceBuffer.length = 0;
    traceBufferSize = 0;
  }
}
```

2. 將所有 `await appendTrace(tracePath, ...)` 替換為 `await appendTraceBuffered(...)`
3. 在 `executeSingleTest` 返回前（L385 和 L419）加入 `await flushTraceBuffer();`

### 修正 3: messages 截斷 (P2)

在 `executor.ts` 中，對大型 tool result 進行截斷：

在 L335-339 的 `messages.push({ role: 'tool', ... })` 之前加入：
```typescript
// Truncate large tool results to prevent unbounded growth
const MAX_RESULT_LENGTH = 5000;
let resultStr = JSON.stringify(result);
if (resultStr.length > MAX_RESULT_LENGTH) {
  resultStr = resultStr.substring(0, MAX_RESULT_LENGTH) + '..." (truncated)';
  // 仍保留原 result 的結構，只截斷 data 欄位
  if (result.data && typeof result.data === 'string' && result.data.length > MAX_RESULT_LENGTH) {
    result = { ...result, data: result.data.substring(0, MAX_RESULT_LENGTH) + '...(truncated)' };
  }
}
```

### 修正 4: Exec lock 合理錯誤 (P2)

在 `executor.ts` L490-499 修改：
```typescript
// 執行階段並發鎖 (FIX-11)
const lockPath = resolve(resultsBase, '.exec-lock');
try {
  // 使用 recursive: true 確保 resultsBase 存在
  await mkdir(lockPath, { recursive: true });
} catch (err: unknown) {
  const nodeErr = err as NodeJS.ErrnoException;
  if (nodeErr.code === 'EEXIST') {
    throw new Error('Another eval is already in progress');
  }
  // 其他錯誤（權限等）應給出合理訊息
  throw new Error(`Cannot create exec lock at ${lockPath}: ${nodeErr.message}`);
}
```

### 修正 5: PR gate 結果寫入 PR comment (P2)

在 `.github/workflows/eval.yml` L53-64 修改：

```yaml
      - name: Post result to PR comment
        if: always() && steps.check-secrets.outputs.skip != 'true'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          if [ "${{ steps.skill-eval.outcome }}" = "success" ]; then
            gh pr comment ${{ github.event.number }} --body "✅ **Skill Eval Gate**: Evaluation passed"
          else
            gh pr comment ${{ github.event.number }} --body \
              "❌ **Skill Eval Gate**: Evaluation failed or encountered errors

          See [workflow run](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}) for details."
          fi
      - name: Write workflow summary
        if: always()
        run: |
          echo "## Skill Eval Gate Results" >> $GITHUB_STEP_SUMMARY
          if [ "${{ steps.check-secrets.outputs.skip }}" = "true" ]; then
            echo "⚠️ Eval skipped: secrets not configured." >> $GITHUB_STEP_SUMMARY
          elif [ "${{ steps.skill-eval.outcome }}" = "success" ]; then
            echo "✅ Evaluation passed" >> $GITHUB_STEP_SUMMARY
          else
            echo "❌ Evaluation failed or encountered errors" >> $GITHUB_STEP_SUMMARY
          fi
```

（保留 workflow summary 並新增 PR comment step）

### 修正 6: 移除未使用的 import (P2)

在 `index.ts` L27 移除：
```typescript
import type { Question } from './question-loader.js';
// 這行未被使用 — Question 在 index.ts 中從未被引用
```

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/index.ts`
  - `packages/tools/eval/executor.ts`
  - `.github/workflows/eval.yml`
- 禁止修改的檔案:
  - 所有其他檔案

## Output
完成後回報：
- 每個修正的變更摘要
- tsc 編譯結果
- 測試執行結果

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- 執行: `node --test "packages/tools/eval/test/*.test.js"` → 全部通過

## Boundaries
- 修改 `.github/workflows/eval.yml` 時確保 YAML 語法正確
- Exec lock 的 `recursive: true` 不會改變鎖定語意（mkdir 對已存在目錄拋 EEXIST 的行為不變）
- 不要修改 executor.ts 中與 traceBuffer 不相關的部分
```

---

#### WORKER-E: Dead code + reporter 死碼 + P3 清理 (FIX-G + N + Q + R-W)

```
## Mission
清理 eval 模組中的死碼和進行 P3 級別的小幅改善。

## Context
- 審查維度: 冗余代碼 + 性能隱患 + 架構瑕疵
- 合計約 7 個 P2/P3 子任務

## Input
- 閱讀以下檔案:
  - `packages/tools/eval/question-loader.ts`
  - `packages/tools/eval/lib/question-utils.ts`
  - `packages/tools/eval/scorer.ts`
  - `packages/tools/eval/reporter.ts`
  - `packages/tools/eval/lib/promise-pool.ts`
  - `packages/tools/eval/lib/judge-api.ts`

## What to do

### 任務 1: supplyQuestions 整合 (P2 — question-loader.ts + lib/question-utils.ts)

`question-loader.ts` 中的 `supplyQuestions` 和 `lib/question-utils.ts` 中的 `generateVariants` 已有完整實作但從未被生產路徑呼叫。在 `index.ts` 的 pipeline 中接上：

在 `index.ts`（雖非本 Worker 範圍，但協調器可處理）或 `question-loader.ts` 中新增一個自動整合。

最低入侵做法：在 `question-loader.ts` 的 `loadQuestions` 函式中，當題庫數量不足目標模式時自動呼叫 `supplyQuestions`。

因 `loadQuestions` 目前是同步函式，改為 async 或新增上層呼叫鏈。更簡單的做法：在 `index.ts` 中 `loadQuestions` 後面加入：

```typescript
// 在 index.ts L264 之後:
// 若題庫不足，嘗試用 LLM 生成變體補充（僅非 dry-run 模式）
```

但 index.ts 不屬於本 Worker 範圍。改在 `question-loader.ts` 中新增一個導向函式。

或者：保留 `supplyQuestions` 和 `generateVariants` 的 export，確保它們可被外部使用，但不在本輪 pipeline 中整合（因為需要 async 改寫，scope 較大）。改為移除 `supplyQuestions` 的 export — 因為它不完全實作。

**建議**: 暫不移除 `supplyQuestions` 的 export。改在 `lib/question-utils.ts` 中確認 `generateVariants` 被測試檔案使用（REGTEST-F 已對其測試）。這兩個函式保留為「可用但尚未串接」的狀態，留待下一輪決定。

### 任務 2: scanForDone 同步函式死碼 (P2 — scorer.ts)

在 `scorer.ts` 中：
1. `scanForDone` 函式（L492-509）目前是 `function scanForDone`（未 export），已被 `scanForDoneAsync` 取代
2. 確認生產程式碼中無任何呼叫 → 直接移除

### 任務 3: reporter.ts fallback 迴圈死碼 (P2 — reporter.ts)

在 `reporter.ts` 中：
1. L100-110 的第二個維度收集迴圈永遠不會被執行
2. 直接移除 L99-110 的 `if (dimNames.length === 0) { ... }` 區塊

### 任務 4: optimizer.ts duplicate code (P2)
此任務在 Worker-C 中已處理。

### 任務 5: 未使用的 import (P2)
`question-loader.ts:19` 的 `EnvConfig` — 若 `supplyQuestions` 保留則保留。

### 任務 6: P3 改善 (lib/judge-api.ts)

貪婪正則 `[\s\S]*`（L148）改為 `[\s\S]*?`（非貪婪）：
```typescript
const match = content.match(/\{[\s\S]*?\}/);
```

### 任務 7: P3 改善 (lib/promise-pool.ts)

在 `promise-pool.ts` 中的共享 `index` 變數（L21-28）加上註解說明：
```typescript
let index = 0;
// 重要：index++ 和 await fn() 之間不可插入其他 await
// 否則共享 mutable 變數在並行上下文中會產生 race
```

### 任務 8: P3 改善 (scorer.ts — existsSync)

`isAlreadyScored` 函式（L518-521）中的 `existsSync` 改為 async：
但此函式在 `scoreAllTests`（非同步函式）中被呼叫，可在呼叫端使用 `access` 替代。

實際上 `isAlreadyScored` 目前是同步函式且只在 `scoreAllTests` 中被呼叫（L426）。但 `filter` callback 不是 async。改為：

```typescript
// 將 L426 改為 async filter
const scoredStatus = await Promise.all(
  doneTests.map(async (t) => ({ testNo: t, scored: await isAlreadyScoredAsync(resultsBase, t) }))
);
const unscoredTests = scoredStatus.filter(s => !s.scored).map(s => s.testNo);
```

新增：
```typescript
async function isAlreadyScoredAsync(resultsBase: string, testNo: string): Promise<boolean> {
  const scoredPath = join(resultsBase, `test_${testNo}`, '.scored');
  try { await access(scoredPath); return true; } catch { return false; }
}
```

### 任務 9: P3 改善 (jaccardSimilarity — 選較小集合)

在 `optimizer.ts` L334-347 中（此任務由 Worker-C 處理或在此處理）：

在 `jaccardSimilarity` 開頭加入：
```typescript
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  // 迭代較小的集合以取得較佳效能
  if (setA.size > setB.size) [setA, setB] = [setB, setA];
  // ... 其餘邏輯不變
```

（注意：此任務若由 Worker-C 處理更好，因為屬同檔案。在此標記為由 Worker-C 處理。）

### 任務 10: P3 改善 (disk check 時機)

在 `executor.ts` L475-487 中，`statfsSync(resultsBase)` 在目錄不存在時被靜默跳過。修復：先確保目錄存在：

```typescript
// 磁碟空間檢查 — 先確保目錄存在
try {
  await mkdir(resultsBase, { recursive: true });
  const stats = statfsSync(resultsBase);
  // ... 其餘不變
```

（注意：此任務由 Worker-D 處理更方便）

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/scorer.ts`（僅移除 scanForDone）
  - `packages/tools/eval/reporter.ts`（僅移除死碼區塊）
  - `packages/tools/eval/lib/judge-api.ts`（僅改正則）
  - `packages/tools/eval/lib/promise-pool.ts`（僅加註解）
- 禁止修改的檔案:
  - 所有其他檔案（特別是 index.ts, executor.ts, optimizer.ts）
  - 測試檔案（除非特別說明）

## Output
完成後回報：
- 每個檔案的變更摘要
- 移除的行數統計
- tsc 編譯結果
- 測試執行結果

## Verify
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- 執行: `node --test "packages/tools/eval/test/*.test.js"` → 全部通過

## Boundaries
- 只移除確定死碼的函式和區塊。若有疑問，保留並註解標記
- 不移除已被匯出的函式（保留向後兼容）
- 不可修改測試檔案的通過條件
```

---

### Regression Test Worker Prompts

#### REGTEST-01: Bash 隔離 R4 讀寫分離（關聯 FIX-A）

```
## Mission
為 FIX-A（Bash 讀寫分離）建立回歸測試。

## Context
- 修復問題: Bash 全部視為寫入操作違反 R4 讀寫分離
- 根因: isolation.ts WRITE_TOOLS 包含 'Bash'

## Input
- 閱讀 `packages/tools/eval/isolation.ts`
- 閱讀 `packages/tools/eval/test/isolation.test.js`

## What to do
在 `packages/tools/eval/test/isolation.test.js` 中新增測試函式：

```javascript
it('REGTEST-01: should execute safe Bash commands in workspace, not simulate', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regtest01-'));
  const testFile = path.join(tmpDir, 'hello.txt');
  fs.writeFileSync(testFile, 'world', 'utf-8');
  
  const dispatcher = createToolDispatcher({ workspaceDir: tmpDir });
  
  // "ls" is a safe read-only command — should execute for real
  const lsResult = await dispatcher.dispatch({
    tool: 'Bash',
    params: { command: 'ls' },
  });
  assert.ok(lsResult.success);
  assert.ok(lsResult.data.includes('hello.txt'),
    `ls output should include hello.txt, got: "${lsResult.data}"`);
  
  // "cat" should also execute for real
  const catResult = await dispatcher.dispatch({
    tool: 'Bash',
    params: { command: 'cat hello.txt' },
  });
  assert.ok(catResult.success);
  assert.ok(catResult.data.includes('world'),
    `cat output should include "world", got: "${catResult.data}"`);
  
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/test/isolation.test.js`
- 禁止修改的檔案:
  - 所有源碼檔案

## Verify
- 執行: `node --test "packages/tools/eval/test/isolation.test.js"`
- 預期: REGTEST-01 通過
```

#### REGTEST-02: 評分鎖定原子性（關聯 FIX-B）

```
## Mission
為 FIX-B（評分鎖定範圍擴大）建立回歸測試。

## Context
- 修復問題: Judge API 呼叫在 lock 取得前執行
- 根因: scoreSingleTest 中 lock 範圍不足

## Input
- 閱讀 `packages/tools/eval/scorer.ts`
- 閱讀 `packages/tools/eval/test/scorer.test.js`

## What to do
此測試驗證 lock 獲取發生在 judge API 呼叫之前。使用源碼審查方式：

在 `packages/tools/eval/test/scorer.test.js` 中新增：

```javascript
it('REGTEST-02: scoreSingleTest should acquire lock before calling judge API', async () => {
  const source = await fs.readFile(
    new URL('../../scorer.ts', import.meta.url), 'utf-8'
  );
  
  // In the source, find 'mkdir(lockDir)' (lock acquisition) and 'callJudgeModel' (API call)
  const mkdirLockIndex = source.indexOf('mkdir(lockDir)');
  const callJudgeIndex = source.indexOf('callJudgeModel(prompt');
  
  assert.ok(mkdirLockIndex >= 0, 'Source must contain mkdir(lockDir)');
  assert.ok(callJudgeIndex >= 0, 'Source must contain callJudgeModel');
  assert.ok(
    mkdirLockIndex < callJudgeIndex,
    'Lock acquisition (mkdir) must occur BEFORE judge API call (callJudgeModel)'
  );
  
  // Also verify .scored is written after score.json
  const scoredWriteIndex = source.indexOf('scoredPath');
  const scoreWriteIndex = source.indexOf('scorePath');
  assert.ok(
    scoreWriteIndex < scoredWriteIndex,
    'score.json must be written BEFORE .scored marker'
  );
});
```

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/test/scorer.test.js`
- 禁止修改的檔案:
  - 所有源碼檔案

## Verify
- 執行: `node --test "packages/tools/eval/test/scorer.test.js"`
- 預期: REGTEST-02 通過
```

#### REGTEST-03: JSONL 損壞跳過（關聯 FIX-B）

```
## Mission
為 FIX-B（JSONL 損壞提早跳過）建立回歸測試。

## Context
- 修復問題: 軌跡損壞仍呼叫 judge API
- 根因: hasCorruption 檢查後未提早返回

## Input
- 閱讀 `packages/tools/eval/scorer.ts`
- 閱讀 `packages/tools/eval/test/scorer.test.js`

## What to do
在 `packages/tools/eval/test/scorer.test.js` 中新增：

```javascript
it('REGTEST-03: should skip judge API call when trace has corruption', async () => {
  const source = await fs.readFile(
    new URL('../../scorer.ts', import.meta.url), 'utf-8'
  );
  
  // Find the corruption skip logic
  const corruptionCheck = source.indexOf('hasCorruption');
  assert.ok(corruptionCheck >= 0, 'Source must have hasCorruption check');
  
  // Find the early return after corruption check
  const sectionAfterCorruption = source.slice(corruptionCheck, corruptionCheck + 1000);
  
  // Should return early without calling judge model when corrupted
  // Check that callJudgeModel is NOT called in the corruption branch
  const corruptionBranchEnd = sectionAfterCorruption.indexOf('return { testId');
  assert.ok(corruptionBranchEnd >= 0, 'Corruption branch should return early');
  
  // Verify no callJudgeModel in corruption handling section
  const noJudgeCall = !sectionAfterCorruption.slice(0, corruptionBranchEnd).includes('callJudgeModel');
  assert.ok(noJudgeCall, 'Corruption branch should NOT call judge model');
});
```

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/test/scorer.test.js`
- 禁止修改的檔案:
  - 所有源碼檔案

## Verify
- 執行: `node --test "packages/tools/eval/test/scorer.test.js"`
- 預期: REGTEST-03 通過
```

#### REGTEST-04: isAllowedFile CWD 獨立性（關聯 FIX-C）

```
## Mission
為 FIX-C（isAllowedFile ALLOWED_FILES resolve 為絕對路徑）建立回歸測試。

## Context
- 修復問題: ALLOWED_FILES 為相對路徑導致 path.relative 行為依賴 CWD
- 根因: pattern 未先 path.resolve

## Input
- 閱讀 `packages/tools/eval/optimizer.ts`（L359-373）
- 閱讀 `packages/tools/eval/test/optimizer.test.js`

## What to do
在 `packages/tools/eval/test/optimizer.test.js` 中新增：

```javascript
it('REGTEST-04: isAllowedFile should be CWD-independent', () => {
  const originalCwd = process.cwd();
  try {
    // Test with different CWDs to verify path resolution works regardless of current directory
    
    // Case 1: CWD = /tmp
    process.chdir('/tmp');
    assert.ok(
      isAllowedFile('/any/project/skills/spec/SKILL.md', 'spec'),
      'SKILL.md in skills/spec/ should be allowed regardless of CWD'
    );
    assert.ok(
      !isAllowedFile('/any/project/skills/spec/SKILL.md.backup', 'spec'),
      '.backup should be rejected regardless of CWD'
    );
    assert.ok(
      !isAllowedFile('/any/project/skills/special-tool/SKILL.md', 'spec'),
      'different skill dir should be rejected regardless of CWD'
    );
    
    // Case 2: CWD = / (root)
    process.chdir('/');
    assert.ok(
      isAllowedFile('/any/project/skills/spec/SKILL.md', 'spec'),
      'Should still allow SKILL.md when CWD=/'
    );
    
  } finally {
    process.chdir(originalCwd);
  }
});
```

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/test/optimizer.test.js`
- 禁止修改的檔案:
  - 所有源碼檔案

## Verify
- 執行: `node --test "packages/tools/eval/test/optimizer.test.js"`
- 預期: REGTEST-04 通過
```

#### REGTEST-05: 備份唯一性 + 非同步驗證（關聯 FIX-D + FIX-E + FIX-F）

```
## Mission
為 FIX-D（備份唯一性）、FIX-E（限定驗證範圍）、FIX-F（execSync → 非同步）建立合併回歸測試。

## Context
- 修復問題: 備份覆蓋 + 全域驗證誤還原 + execSync 阻塞
- 根因: 固定 .bak 名稱、無技能限定驗證命令、同步執行

## Input
- 閱讀 `packages/tools/eval/optimizer.ts`
- 閱讀 `packages/tools/eval/test/optimizer.test.js`

## What to do
在 `packages/tools/eval/test/optimizer.test.js` 中新增：

```javascript
it('REGTEST-05: optimizer backup should use unique names and avoid execSync', async () => {
  const source = await fs.readFile(
    new URL('../../optimizer.ts', import.meta.url), 'utf-8'
  );
  
  // 1. Backup should use dynamic name (not fixed .bak)
  const bakPattern = "skillMdPath + '.bak'";
  // The source should NOT use the old fixed pattern
  assert.ok(
    !source.match(/skillMdPath\s*\+\s*'\.bak'/),
    'Backup path should not be fixed .bak — use timestamp'
  );
  
  // 2. Validation should be skill-scoped or inline
  // Check that validate-skill-frontmatter command uses --skill flag
  // or that frontmatter is validated inline
  const hasSkillFlag = source.includes('--skill') || source.includes('resolvedSkillName');
  const hasInlineValidation = source.includes('frontmatterMatch') || source.includes('---');
  
  assert.ok(
    hasSkillFlag || hasInlineValidation,
    'Frontmatter validation should be skill-scoped or inline'
  );
  
  // 3. No execSync in optimizeSkillMd
  // Find optimizeSkillMd function
  const funcStart = source.indexOf('export async function optimizeSkillMd');
  const funcEnd = funcStart + source.slice(funcStart).indexOf('}\n') + 1;
  const funcBody = source.slice(funcStart, funcEnd);
  
  assert.ok(
    !funcBody.includes('execSync'),
    'optimizeSkillMd should not use execSync (use execFile or inline validation)'
  );
});
```

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/test/optimizer.test.js`
- 禁止修改的檔案:
  - 所有源碼檔案

## Verify
- 執行: `node --test "packages/tools/eval/test/optimizer.test.js"`
- 預期: REGTEST-05 通過
```

#### REGTEST-06: Dry-run 零檔案副作用（關聯 FIX-I）

```
## Mission
為 FIX-I（dry-run 零副作用）建立回歸測試。

## Context
- 修復問題: Dry-run 仍寫入 optimization-plan.json、呼叫 judge API
- 根因: index.ts 中 dryRun 旗標未向下傳遞

## Input
- 閱讀 `packages/tools/eval/index.ts`（L312-347）

## What to do
在現有 `packages/tools/eval/test/index.test.js` 中新增：

```javascript
it('REGTEST-06: dry-run mode should not write optimization-plan.json', async () => {
  const source = await fs.readFile(
    new URL('../../index.ts', import.meta.url), 'utf-8'
  );
  
  // Find the optimize block
  const optimizeStart = source.indexOf('if (optimize)');
  assert.ok(optimizeStart >= 0);
  
  const optimizeSection = source.slice(optimizeStart, optimizeStart + 2000);
  
  // In dry-run mode, the optimization plan should NOT be generated
  // (generateOptimizationPlan writes to disk)
  // Check that when dryRun is true, optimization-plan is not written
  if (optimizeSection.includes('generateOptimizationPlan')) {
    // Verify that generateOptimizationPlan is called inside a non-dry-run branch
    const planCallIndex = optimizeSection.indexOf('generateOptimizationPlan');
    const sectionBeforePlan = optimizeSection.slice(0, planCallIndex);
    
    assert.ok(
      sectionBeforePlan.includes('} else {') || !sectionBeforePlan.includes('dryRun'),
      'generateOptimizationPlan should be in the non-dry-run path'
    );
  }
});
```

## Scope
- 允許修改的檔案:
  - `packages/tools/eval/test/index.test.js`（若存在，否則在 `packages/tools/eval/test/` 下新建）
- 禁止修改的檔案:
  - 所有源碼檔案

## Verify
- 執行: `node --test "packages/tools/eval/test/index.test.js"`（或對應檔案）
- 預期: REGTEST-06 通過
```

---

## 7. Fix Batch Schedule

### Batch 1 — 全部修復並行派發（Worker A–E）

- **Workers**: WORKER-A (isolation.ts), WORKER-B (scorer.ts), WORKER-C (optimizer.ts), WORKER-D (index.ts+executor.ts+.github), WORKER-E (dead code cleanup)
- **Strategy**: 5 個 worker 全部並行派發（檔案範圍互斥）
- **Depends on**: 無
- **Gate**:
  - [ ] WORKER-A 回報成功（Bash R4 + Grep/Glob catch）
  - [ ] WORKER-B 回報成功（scoring lock + corruption skip + parse_error line）
  - [ ] WORKER-C 回報成功（isAllowedFile + backup + validation + execSync + duplicate code）
  - [ ] WORKER-D 回報成功（dry-run plan + appendTrace + messages + exec lock + PR gate + unused import）
  - [ ] WORKER-E 回報成功（dead code removal + P3 cleanup）
  - [ ] TypeScript 編譯通過: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
  - [ ] 現有測試套件通過: `node --test "packages/tools/eval/test/*.test.js"`

---

### Batch 2 — 回歸測試

- **Tasks**: REGTEST-01 ~ REGTEST-06
- **Strategy**: 6 個 worker 全部並行派發（無檔案重疊或可合併至同檔案）
- **Depends on**: Batch 1 全部通過
- **Gate**:
  - [ ] REGTEST-01: isolation.test.js — Bash 讀寫分離（關聯 FIX-A）
  - [ ] REGTEST-02: scorer.test.js — 評分鎖定原子性（關聯 FIX-B）
  - [ ] REGTEST-03: scorer.test.js — JSONL 損壞跳過（關聯 FIX-B，與 REGTEST-02 同檔案）
  - [ ] REGTEST-04: optimizer.test.js — isAllowedFile CWD 獨立性（關聯 FIX-C）
  - [ ] REGTEST-05: optimizer.test.js — 備份唯一性 + 驗證範圍（關聯 FIX-D/E/F）
  - [ ] REGTEST-06: index.test.js — Dry-run 零副作用（關聯 FIX-I）
  - [ ] 全部新增回歸測試通過
  - [ ] 現有測試套件通過（確認無退化）

---

### Batch Final — 收尾整合

- **Tasks**: 最終驗證
- **Strategy**: 循序（由協調器自己執行）
- **Depends on**: Batch 1 + Batch 2 全部通過
- **Gate**:
  - [ ] 完整測試套件: `node --test "packages/tools/eval/test/*.test.js"` → 全部通過
  - [ ] TypeScript: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
  - [ ] 對照 REPORT.md，確認所有 32 個問題已處理

---

## 8. Regression Test Inventory

| 測試 ID | 關聯修復 | 測試類型 | 測試位置 | 測試場景摘要 |
|---|---|---|---|---|
| `REGTEST-01` | FIX-A | 單元 | `test/isolation.test.js` | GIVEN workspace + Bash ls WHEN dispatch THEN 真實執行 |
| `REGTEST-02` | FIX-B | 源碼審查 | `test/scorer.test.js` | GIVEN 原始碼 WHEN 檢查 THEN lock 在 API 前獲取、score.json 先寫 |
| `REGTEST-03` | FIX-B | 源碼審查 | `test/scorer.test.js` | GIVEN hasCorruption 路徑 WHEN 檢查 THEN 不呼叫 judge API |
| `REGTEST-04` | FIX-C | 單元 | `test/optimizer.test.js` | GIVEN 不同 CWD WHEN isAllowedFile THEN 結果一致 |
| `REGTEST-05` | FIX-D/E/F | 源碼審查 | `test/optimizer.test.js` | GIVEN 原始碼 WHEN 檢查 THEN 備份含時間戳、驗證非全域、無 execSync |
| `REGTEST-06` | FIX-I | 源碼審查 | `test/index.test.js` | GIVEN dry-run 路徑 WHEN 檢查 THEN 不產生 optimization-plan.json |

---

## 9. Verification Checkpoints

### Checkpoint 1 — 全部修復批次完成後
- 執行: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
- 執行: `node --test "packages/tools/eval/test/*.test.js"` → 現有測試全部通過

### Checkpoint 2 — 回歸測試實現後
- 執行: `node --test "packages/tools/eval/test/*.test.js"` → 全部 6 個新增回歸測試通過 + 現有測試無退化
- 邏輯檢查: REGTEST-01 在修復前的代碼上（Bash 為 WRITE 工具）應失敗 → 修復後通過

### Checkpoint 3 — 最終驗證
- 執行完整測試套件: `node --test "packages/tools/eval/test/*.test.js"`
- TypeScript 檢查: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
- 對照 REPORT.md，確認所有 32 個問題已處理

---

## 10. Error Recovery

| 失敗場景 | 處理方式 |
|---|---|
| 修復 worker 回報失敗 | 用 worker 已有的上下文繼續它（不要新建），給予更具體的指令。最多再試一次。 |
| 修復 worker 兩次嘗試後仍失敗 | 暫停整個流程，保留同批次其他成功 worker 的結果。向用戶報告。 |
| 回歸測試 worker 回報失敗（測試無法通過） | 檢查是測試代碼有誤還是修復不完整。若測試代碼有誤，繼續該 worker 修正。若修復不完整，回到對應的修復 worker 繼續修復。 |
| 回歸測試在修復前代碼上也能通過 | 測試設計無效 — 重新設計 oracle，派發新的 worker。 |
| 合併衝突 | 協調器自己解決衝突（本輪所有 Worker 檔案範圍互斥，衝突機率低）。解決後重新執行 Gate 驗證。 |
| 修復或回歸測試導致現有測試退化 | 暫停，向用戶報告：哪個測試失敗、由哪個 worker 的變更引起。 |
| TypeScript 編譯錯誤 | 檢查是哪個 worker 的修改引起的，繼續該 worker 修復型別錯誤。最多再試一次。 |

---

## 11. Fix History

> **2026-05-29 (Round 1)**: 首次修復 — 25 個問題。核心：isolation.ts 整合至 executor tool-use loop、JSONL 行號註解、getProjectRoot 共用、磁碟檢查、執行鎖。Commit `91863d7`。全部 verified fixed。
>
> **2026-05-29 (Round 2)**: 第二輪修復 — 12 個問題。核心：isolation.ts 真實讀取、Message 型別擴展移除不安全轉型、reporter Set 去重、promise-pool guard。14 個新測試。Commit `5f2061b`。
>
> **2026-05-29 (Round 3)**: 第三輪修復 — 18 個問題（1 P0 + 7 P1 + 6 P2 + 4 P3）。核心：EVAL_MIN_SCORE / EVAL_MAX_P0 接入、~205 行死碼移除、型別安全修復。Commit `484913c`。
>
> **2026-05-29 (Round 4)**: 第四輪修復 — 26 個問題（6 P1 + 11 P2 + 9 P3）。核心：LLM 變體生成、[simulated] 移除、isAllowedFile path.relative、dedup pair cap、async I/O 遷移、~298 行死碼移除。Commit `a5f6db3` + `569335b`。全部 verified fixed，47/47 測試通過。

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
- 某個 worker 的變更意外影響了其他 worker 的檔案範圍

### NEVER

- 協調器自己編輯原始碼或測試檔案
- 讓 worker 生成子 worker
- 跳過驗證直接進入下一批次
- 變更 spec 文檔（除非修復過程中發現 spec 錯誤需回報）
- 在修復未全部完成前開始回歸測試

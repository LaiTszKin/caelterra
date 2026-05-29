# Fix Coordinator Prompt: skill-eval-optimizer (Round 7)

- **Date**: 2026-05-29
- **Source REPORT**: `docs/plans/2026-05-29/skill-eval-optimizer/REPORT.md`
- **Source Spec**: `docs/plans/2026-05-29/skill-eval-optimizer/`
- **Total Issues**: 1 P0 + 3 P1 + 8 P2 + 8 P3 = 20
- **Total Workers**: 4 fix (A–D) + 1 regtest
- **Total Regression Tests**: 4

---

## 1. Your Role

你是一個**修復協調器 (Fix Coordinator)**。你的任務是協調修復 worker 完成 Round 7 的 20 個問題修復。

**核心規則:**
- 你**不寫程式碼** — worker 寫
- 你派發 worker、等待結果、檢查、驗證、合併、提交
- 你從 Section 6 擷取預先寫好的 worker prompt，原樣派發給 worker
- 你嚴格按照 Section 7 的批次排程執行
- 遇到阻礙時按 Section 10 錯誤恢復策略處理

---

## 2. Mission

修復 REPORT.md Round 7 發現的 20 個問題，優先處理 **P0: SIGINT handler 衝突導致 exec-lock 永久洩漏**。

**判決**: Needs Work → 目標: Ready to Merge

---

## 3. Issue Inventory

| ID | Sev | 問題 | 檔案 |
|----|-----|------|------|
| FIX-01 | **P0** | SIGINT handler 順序衝突 → exec-lock 永久洩漏 | index.ts, executor.ts |
| FIX-02 | **P1** | exec-lock 無陳舊鎖偵測 | executor.ts |
| FIX-03 | **P1** | scoring-lock 相同陳舊鎖問題 | scorer.ts |
| FIX-04 | **P1** | 中間 tool-use 回應未記錄到軌跡 | executor.ts |
| FIX-05 | **P2** | Dry-run 產出模板建議而非 diff | index.ts, optimizer.ts |
| FIX-06 | **P2** | supplyQuestions 死函式 + judge API 耦合 | question-loader.ts, question-utils.ts |
| FIX-07 | **P2** | Phase 1 去重為詞彙相似度(Jaccard) | optimizer.ts |
| FIX-08 | **P2** | Bash 路徑穿越防護不一致 | isolation.ts |
| FIX-09 | **P2** | executeInWorkspace default 死路徑 | isolation.ts |
| FIX-10 | **P2** | getRecords() 死方法 | isolation.ts |
| FIX-11 | **P2** | scorer.ts 重複 score/scored 寫入邏輯 | scorer.ts |
| FIX-12 | **P2** | optimizer.ts 大量 sync I/O | optimizer.ts |
| FIX-13 | **P3** | env-utils.ts 未使用 import getProjectRoot | lib/env-utils.ts |
| FIX-14 | **P3** | _suggestedFix 從未被賦值 | optimizer.ts |
| FIX-15 | **P3** | _cluster 只寫不讀 | optimizer.ts |
| FIX-16 | **P3** | 不安全 err as NodeJS.ErrnoException | executor.ts, env-utils.ts |
| FIX-17 | **P3** | --output-dir 允許任意路徑寫入 | index.ts |
| FIX-18 | **P3** | 分數門檻檢查 scores 為空時跳過 | index.ts |
| FIX-19 | **P3** | executeGrep 全檔案讀入記憶體 | isolation.ts |
| FIX-20 | **P3** | API 回應 as 斷言缺執行期驗證 | scorer.ts |

---

## 4. Fix Dependency Analysis

### 4.1 檔案重疊矩陣

```
                  index  exec  scorer  isolation  optimizer  q-loader  q-utils  env-utils
FIX-01 (P0)        X      X
FIX-02 (P1)               X
FIX-03 (P1)                      X
FIX-04 (P1)               X
FIX-05 (P2)         X                                      X
FIX-06 (P2)                                                      X        X
FIX-07 (P2)                                                X
FIX-08 (P2)                               X
FIX-09 (P2)                               X
FIX-10 (P2)                               X
FIX-11 (P2)                      X
FIX-12 (P2)                                                X
FIX-13 (P3)                                                                    X
FIX-14 (P3)                                                X
FIX-15 (P3)                                                X
FIX-16 (P3)               X                                              X
FIX-17 (P3)         X
FIX-18 (P3)         X
FIX-19 (P3)                               X
FIX-20 (P3)                      X
```

### 4.2 依賴關係

- **FIX-01 → FIX-02 邏輯相依**: P0 修復後 SIGINT 正常清理 lock，但 SIGKILL 仍需 FIX-02 防禦。
- **FIX-01 跨檔案**: 同時觸及 index.ts + executor.ts → 必須同一 worker。
- **index.ts 重疊**: FIX-01 + FIX-05 + FIX-17 + FIX-18 都觸及 index.ts → 合併到 WORKER-A 和 WORKER-C，但避免同時修改相同行範圍。
- **executor.ts 重疊**: FIX-01 + FIX-02 + FIX-04 + FIX-16 都觸及 executor.ts → FIX-01/02 在 lock 區域 (L508-526)，FIX-04 在 tool-use loop (L255-375)，FIX-16 在 L514。無直接行號衝突，但需依序執行。
- **isolation.ts 重疊**: FIX-08 + FIX-09 + FIX-10 + FIX-19 → 全部在 WORKER-D。
- **optimizer.ts 重疊**: FIX-07 + FIX-12 + FIX-14 + FIX-15 → 全部在 WORKER-D（加上 FIX-05 的 optimizer 部分）。

### 4.3 Worker 分配

| Worker | 修復 | 涉及檔案 |
|--------|------|---------|
| **WORKER-A** | FIX-01, FIX-02, FIX-03 | index.ts, executor.ts, scorer.ts |
| **WORKER-B** | FIX-04, FIX-16 | executor.ts, env-utils.ts |
| **WORKER-C** | FIX-05, FIX-17, FIX-18, FIX-20 | index.ts, optimizer.ts, scorer.ts |
| **WORKER-D** | FIX-06~15, FIX-19 | question-loader.ts, question-utils.ts, optimizer.ts, isolation.ts, scorer.ts, env-utils.ts |

---

## 5. Fix Details & Regression Test Design

### FIX-01 (P0): SIGINT handler 衝突 → exec-lock 永久洩漏

- **根因**: `index.ts:245` 透過 `process.on('SIGINT', ...)` 先註冊 handler，其 `process.exit(1)` (L240) 阻止 `executor.ts:526` 的 `process.once('SIGINT', ...)` cleanup handler 執行。Node.js signal listener 按註冊順序同步呼叫，第一個 handler 的 `process.exit()` 終止程序後，後續 listener 永不執行。
- **修復方案**: 移除 `index.ts` SIGINT handler 中的 `process.exit(1)`。僅保留 `sigintReceived` flag 設定和 stderr 訊息。在 index.ts 的 finally block 中，若 `sigintReceived` 為 true，在清理完成後呼叫 `process.exit(1)`。讓 executor.ts 的 SIGINT handler 能正常觸發並清理 exec-lock。
- **驗證**: TSC 零錯誤；現有測試全部通過
- **複雜度**: 複雜（跨模組 SIGINT 信號流）
- **回歸測試**: REGTEST-01 (源碼靜態分析 — index.ts SIGINT handler 不含 process.exit)

### FIX-02 (P1): exec-lock 無陳舊鎖偵測

- **根因**: `mkdir` 作為互斥鎖，無 PID/timestamp 檢查。SIGKILL/崩潰後鎖永久存在。
- **修復方案**: 在 `executor.ts:513-518` 的 EEXIST 處理中加入陳舊鎖檢查：若 `.exec-lock` 目錄 mtime 超過 5 分鐘 (STALE_LOCK_MS = 300000)，自動刪除並重建；否則保持原有拋錯。
- **驗證**: TSC 零錯誤
- **複雜度**: 簡單
- **回歸測試**: REGTEST-02 (模擬陳舊 exec-lock → 自動清除)

### FIX-03 (P1): scoring-lock 相同陳舊鎖問題

- **根因**: 與 FIX-02 相同，`.scoring-lock` 崩潰殘留導致該測試永久無法評分。
- **修復方案**: 在 `scorer.ts:348-354` 套用與 FIX-02 相同的陳舊鎖偵測邏輯。
- **驗證**: TSC 零錯誤
- **複雜度**: 簡單
- **回歸測試**: REGTEST-03 (模擬陳舊 scoring-lock → 自動清除)

### FIX-04 (P1): 中間 tool-use 回應未記錄到軌跡

- **根因**: `executor.ts` tool-use loop (L255-375) 中，當 `finishReason === 'tool_calls'` 時，LLM API 回應的 token 用量和中間思考內容不記錄到 trace。
- **修復方案**: 在每個 tool-use 回合記錄一個 `type: 'round'` trace event，包含 `model`、`usage`、`finish_reason`、`content`（截斷至 2000 chars）、`round`。保持最終 `type: 'response'` event 不變（向後相容）。
- **驗證**: TSC 零錯誤；scorer readTrace 能安全跳過新 event type
- **複雜度**: 中等
- **回歸測試**: REGTEST-04 (多輪 tool-use trace 含 N 個 round event)

### FIX-05 ~ FIX-20 (P2/P3): 手動檢查

P2/P3 修復僅需手動檢查確認。詳見各 worker prompt。

---

## 6. Worker Prompt Library

### WORKER-A Prompt (FIX-01 P0 + FIX-02 P1 + FIX-03 P1)

```
## Mission
修復 SIGINT handler 衝突導致的 exec-lock 永久洩漏 (P0)，以及 exec-lock/scoring-lock 陳舊鎖偵測缺失 (P1)。

## Context
- FIX-01 (P0): index.ts:245 process.on('SIGINT', ...) 先註冊 handler，內部 process.exit(1) 阻止
  executor.ts:526 process.once('SIGINT', ...) cleanup handler 執行。
  Node.js signal listener 按註冊順序同步呼叫，第一個的 process.exit() 終止程序後續 listener 永不執行。
  結果: Ctrl+C 後 .exec-lock 殘留，所有後續 eval 失敗 "Another eval is already in progress"。
- FIX-02 (P1): executor.ts:509-519 mkdir-based mutex 無陳舊鎖偵測。SIGKILL/崩潰後鎖永久存在。
- FIX-03 (P1): scorer.ts:347-355 相同 mkdir-based mutex 問題。

## Input
- 閱讀 packages/tools/eval/index.ts (L230-250, L380-400): SIGINT handler + finally
- 閱讀 packages/tools/eval/executor.ts (L508-564): exec-lock + SIGINT handler + finally
- 閱讀 packages/tools/eval/scorer.ts (L340-360): scoring-lock

## What to do

### FIX-01 (index.ts L236-242):
1. 找到 sigintHandler 函式
2. 移除 `process.exit(1)` 呼叫
3. 僅保留 `sigintReceived = true` + stderr 訊息
4. 在 index.ts finally block (L384-395) 中，若 sigintReceived，在所有清理後呼叫 process.exit(1)

### FIX-02 (executor.ts L513-518):
1. 在 EEXIST 分支中加入陳舊鎖檢查
2. 使用 fs.statSync(lockPath).mtimeMs 取得修改時間
3. 若 Date.now() - mtime > 5 * 60 * 1000 (5分鐘) → 刪除舊鎖，重新 mkdir
4. 否則保持原拋錯行為
5. 提取常數 STALE_LOCK_MS = 5 * 60 * 1000

### FIX-03 (scorer.ts L348-354):
1. 套用與 FIX-02 相同的陳舊鎖偵測
2. 使用相同 STALE_LOCK_MS 常數

## Scope
- 允許修改: index.ts, executor.ts, scorer.ts
- 禁止修改: 其他檔案、測試檔案

## Output
回報: 每個 FIX 的具體修改 + TSC 結果 + 測試結果

## Verify
- npx tsc --noEmit -p packages/tools/eval/tsconfig.json (零錯誤)
- node --test packages/tools/eval/test/*.test.js (全部通過)

## Boundaries
- executor.ts finally block (L559-563) 保持不變
- index.ts sigintReceived flag 邏輯保持不變
- 不修改 SPEC/DESIGN/REPORT/FIX 文件
```

### WORKER-B Prompt (FIX-04 P1 + FIX-16 P3)

```
## Mission
- FIX-04 (P1): 記錄中間 tool-use 回合的 LLM 回應到 trace JSONL
- FIX-16 (P3): 修復不安全的 err as NodeJS.ErrnoException 斷言

## Context
- FIX-04: executor.ts L255-375 tool-use loop 中，finishReason='tool_calls' 時 API 回應(token 用量、
  思考內容)不記錄到 trace。僅最終 stop 回合被記錄。Spec R2.1 要求完整軌跡。
- FIX-16: executor.ts L514 + env-utils.ts L97 將 err: unknown 直接斷言為 NodeJS.ErrnoException，
  若 err 無 .code 屬性，錯誤訊息變成 "undefined"。

## Input
- 閱讀 packages/tools/eval/executor.ts (L255-375, L510-518)
- 閱讀 packages/tools/eval/lib/env-utils.ts (L90-100)
- 閱讀 packages/tools/eval/scorer.ts (L76-108): readTrace 如何解析 event types

## What to do

### FIX-04:
1. 在每個 LLM API 呼叫後，不論 finish_reason，記錄 trace event
2. 新增 event type 'round': { model, usage, finish_reason, content (截斷至2000), round }
3. 保持最終 'response' event 不變
4. 確保 scorer.ts readTrace 安全跳過未知 event type

### FIX-16:
1. executor.ts L514: 改為 `if (err && typeof err === 'object' && 'code' in err) { ... }`
2. env-utils.ts L97: 相同修改

## Scope
- 允許修改: executor.ts, lib/env-utils.ts
- 禁止修改: 其他檔案

## Output
回報修改摘要 + TSC + 測試結果

## Verify
- npx tsc --noEmit -p packages/tools/eval/tsconfig.json
- node --test packages/tools/eval/test/*.test.js
```

### WORKER-C Prompt (FIX-05 P2 + FIX-17 P3 + FIX-18 P3 + FIX-20 P3)

```
## Mission
- FIX-05 (P2): 改善 dry-run 輸出格式為 diff 風格
- FIX-17 (P3): 限制 --output-dir 在專案目錄內
- FIX-18 (P3): 修正 scores 為空時門檻檢查被跳過
- FIX-20 (P3): API 回應 as 斷言加入執行期型別檢查

## Input
- 閱讀 packages/tools/eval/index.ts (L300-400): output-dir, scores gate, dry-run
- 閱讀 packages/tools/eval/optimizer.ts (L1150-1192): dry-run optimizeSkillMd
- 閱讀 packages/tools/eval/scorer.ts (L390-425): score 建構中的 as 斷言

## What to do

### FIX-05:
1. 在 optimizeSkillMd 的 dryRun 路徑，改變輸出格式
2. 每個建議使用 FIND/REPLACE block + diff header
3. 文件頭加 "DRY RUN — 以下變更未實際寫入"

### FIX-17:
1. 在 outputDir 使用前，檢查 resolve(outputDir) 是否在 getProjectRoot() 內
2. 若不在 → console.warn 並 fallback 到預設目錄

### FIX-18:
1. L379-382: scores.length === 0 時檢查 testResults 是否有失敗
2. 若有失敗 → exit code 1 + 警告訊息

### FIX-20:
1. scorer.ts L396-418: dimensions 讀取前檢查 Array.isArray
2. issues 讀取前同樣檢查
3. 各欄位加入 typeof 檢查

## Scope
- 允許: index.ts, optimizer.ts (dry-run部分), scorer.ts
- 禁止: 其他檔案

## Output
回報修改摘要 + TSC + 測試結果

## Verify
- npx tsc --noEmit -p packages/tools/eval/tsconfig.json
- node --test packages/tools/eval/test/*.test.js
```

### WORKER-D Prompt (FIX-06~15 + FIX-19: Dead code, refactoring, consistency)

```
## Mission
修復 11 個 P2/P3 問題: 死碼移除、代碼一致性、sync I/O 轉換、性能改善。

## Context

### 死碼移除:
- FIX-06 (P2): question-loader.ts L152-168 supplyQuestions 被 export 但 eval pipeline 無呼叫者。
  question-utils.ts 因 generateVariants 導入 callJudgeModelRaw → 工具模組不必要耦合到 API 層。
  修復: 移除 supplyQuestions 的 export (保留內部函式供未來使用)。
  注意: generateVariants 必須保留 (被 REGTEST-F 測試，對應 Spec R1.3)。
- FIX-09 (P2): isolation.ts L485-487 default 分支不可達 (WORKSPACE_TOOLS 三值全覆蓋)。
  修復: 移除 default 或替換為 assertNever。
- FIX-10 (P2): isolation.ts L51 + L544-546 getRecords() 永遠返回 []，無呼叫者。
  修復: 從 ToolDispatcher interface 和實作中移除 getRecords()。
- FIX-13 (P3): env-utils.ts L20 import { getProjectRoot } 未被使用。修復: 移除。
- FIX-14 (P3): optimizer.ts L78,767 _suggestedFix 定義但從未被賦值 (?? '' 永遠生效)。
  修復: 移除屬性宣告，讀取點直接使用 ''。
- FIX-15 (P3): optimizer.ts L738 _cluster 只寫不讀。修復: 移除屬性宣告和賦值。

### 代碼一致性:
- FIX-07 (P2): optimizer.ts L653-785 Phase 1 去重用 Jaccard 詞彙相似度。Spec R1.1 要求語意相似度。
  兩階段設計合理但閾值偏高。修復: 降低 Jaccard 閾值 0.35 → 0.15 (讓更多候選對進入 Phase 2 LLM 語意判斷)。
- FIX-08 (P2): isolation.ts L441-447 executeBash 路徑防護用字串比對，但 executeRead L150-158 用 resolve+relative。
  修復: 將 executeBash 改為與 executeRead 一致的 resolve + relative + startsWith('..')。
- FIX-11 (P2): scorer.ts L382-388 和 L425-432 兩分支重複 7 行 score/scored 寫入邏輯。
  修復: 提取為 async function writeScoreFiles(score, testId, scorePath, scoredPath)。

### 性能改善:
- FIX-12 (P2): optimizer.ts 大量 sync I/O (readFileSync, writeFileSync, mkdirSync)。
  修復: generateOptimizationPlan (L899) writeFileSync → writeFile; optimizeSkillMd (L1179,1208,1213,1236,1275) sync → async。
  isAllowedFile 中的 realpathSync 可保留 (被 sync 驗證函式呼叫)。
- FIX-19 (P3): isolation.ts L237-243 executeGrep 全檔案 readFile → split → 逐行比對。
  修復: 加入檔案大小檢查 (>1MB 跳過並警告)。

## Input
- 閱讀 packages/tools/eval/question-loader.ts (L150-170)
- 閱讀 packages/tools/eval/lib/question-utils.ts (L315-365)
- 閱讀 packages/tools/eval/isolation.ts (L128-190, L208-275, L287-363, L414-500, L540-550)
- 閱讀 packages/tools/eval/optimizer.ts (L75-80, L310-350, L650-790, L730-745, L760-770, L890-910, L1170-1280)
- 閱讀 packages/tools/eval/scorer.ts (L375-435)
- 閱讀 packages/tools/eval/lib/env-utils.ts (L18-22)

## What to do
逐一修復上述 11 個問題。各修復獨立，不互相衝突。

## Scope
- 允許: question-loader.ts, lib/question-utils.ts, isolation.ts, optimizer.ts, scorer.ts, lib/env-utils.ts
- 禁止: index.ts, executor.ts, reporter.ts, lib/constants.ts, 測試檔案

## Output
回報所有修復摘要 + TSC + 測試結果

## Verify
- npx tsc --noEmit -p packages/tools/eval/tsconfig.json
- node --test packages/tools/eval/test/*.test.js

## Boundaries
- 不移除 generateVariants (被 REGTEST-F 測試)
- 不改變公開 API 簽章 (除非移除死碼)
- isAllowedFile 中的 realpathSync 可保留
```

---

## 7. Fix Batch Schedule

### Batch 1: P0 修復 (SIGINT + locks)
| Worker | 修復 | Gate |
|--------|------|------|
| WORKER-A | FIX-01, FIX-02, FIX-03 | TSC 零錯誤 + 所有測試通過 |

### Batch 2: P1+P2+P3 並行修復
| Worker | 修復 | 檔案 (無衝突) |
|--------|------|-------------|
| WORKER-B | FIX-04, FIX-16 | executor.ts, env-utils.ts |
| WORKER-C | FIX-05, FIX-17, FIX-18, FIX-20 | index.ts, optimizer.ts, scorer.ts |
| WORKER-D | FIX-06~15, FIX-19 | question-loader.ts, question-utils.ts, isolation.ts, optimizer.ts, scorer.ts, env-utils.ts |

**注意**: WORKER-B/C/D 無檔案重疊（涉及的 executor.ts 修改在 Batch 1 已完成），可並行。

**Gate**: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json && node --test packages/tools/eval/test/*.test.js`

### Batch 3: 回歸測試
| Worker | 測試 | 驗證 |
|--------|------|------|
| REGTEST-WORKER | REGTEST-01~04 | 測試通過 |

### Batch 4: 收尾驗證
- 完整測試套件: `node --test packages/tools/eval/test/*.test.js`
- TSC: `npx tsc --noEmit -p packages/tools/eval/tsconfig.json`
- 確認 20 個問題已處理 → 提交

---

## 8. Regression Test Inventory

| ID | 關聯 | 類型 | 檔案 | 描述 |
|----|------|------|------|------|
| REGTEST-01 | FIX-01 (P0) | 靜態分析 | test/index.test.js | index.ts SIGINT handler 不含 process.exit(1) |
| REGTEST-02 | FIX-02 (P1) | 單元 | test/executor.test.js | 陳舊 exec-lock (>5min) 自動清除 |
| REGTEST-03 | FIX-03 (P1) | 單元 | test/scorer.test.js | 陳舊 scoring-lock 不導致 skipped |
| REGTEST-04 | FIX-04 (P1) | 單元 | test/executor.test.js | 中間回合記錄到 trace |

---

## 9. Verification Checkpoints

### 每批次 Gate:
1. `npx tsc --noEmit -p packages/tools/eval/tsconfig.json` → 零錯誤
2. `node --test packages/tools/eval/test/*.test.js` → 全部通過

### 最終 Gate:
1. 完整測試通過 + TSC 零錯誤
2. 對照 REPORT.md 確認 20 個問題已處理

---

## 10. Error Recovery

- **Worker 失敗**: 繼續該 worker (保留上下文) → 重試一次 → 暫停並報告
- **修復導致回歸**: 暫停批次，檢查 diff，決定回滾或修正
- **合併衝突**: 協調器手動解決

---

## 11. Boundaries

### ALWAYS:
- 保留現有測試語義
- 保留 generateVariants 及其 REGTEST-F 測試
- 所有修復後 TSC + 完整測試
- 僅全部批次通過後提交一次

### NEVER:
- 修改 SPEC/DESIGN/CHECKLIST
- 修改現有測試預期行為
- 移除 generateVariants
- 未通過 Gate 進入下一批次

### ASK FIRST:
- 修復需重構 >50 行
- 改變公開 API 行為
- 無法解決的測試失敗

---

## Fix History

> **Round 1**: 25 issues (2 P0 + 13 P1 + 9 P2 + 1 P3). Commit: `91863d7`.
>
> **Round 2**: 12 issues (4 P1 + 8 P2/P3). Commit: merged.
>
> **Round 3**: 18 issues (1 P0 + 7 P1 + 6 P2 + 4 P3). Commit: `5f2061b`.
>
> **Round 4**: 26 issues (6 P1 + 11 P2 + 9 P3). Commits: `a5f6db3` + `569335b`.
>
> **Round 5**: 32 issues (6 P1 + 14 P2 + 12 P3). Commit: `372484f`.
>
> **Round 6**: 20 issues (3 P1 + 5 P2 + 12 P3). Commit: `5d92280`.
>
> **Round 7 (本次)**: 20 issues (**1 P0** + 3 P1 + 8 P2 + 8 P3). 核心: SIGINT handler 衝突 → exec-lock 永久洩漏。

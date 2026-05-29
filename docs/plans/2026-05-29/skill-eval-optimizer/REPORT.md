# Review Report

- **Spec**: skill-eval-optimizer (eval-core + optimize-and-integrate)
- **Date**: 2026-05-29
- **Reviewer**: Claude Code Review Agent (6 parallel agents)
- **Verdict**: Needs Work

---

## 判決說明

**Verdict**: Needs Work

Round 6 修復（commit `5d92280`）成功解決了上一輪全部 20 個問題 — dry-run diff 產出、Bash `find -exec` 攔截、workspace 路徑穿越防護、`[Simulated]` 移除、Grep/Glob async I/O、symlink 解析、SIGINT lock 清理、死碼移除等核心修復已確認到位。幻覺代碼審查零發現，Spec 實作遺漏審查確認全部 28 個需求與 14 個錯誤案例已實作（維持 100% 覆蓋率）。

本輪發現 1 個 P0 問題 — **SIGINT handler 註冊順序衝突導致 exec-lock 永久洩漏**（index.ts 的 `process.exit(1)` 阻止 executor.ts 的 SIGINT handler 清理鎖定目錄）。此外有 3 個 P1、8 個 P2 和 8 個 P3 問題，涵蓋陳舊鎖偵測缺失、軌跡記錄不完整、死碼殘留、sync I/O、路徑安全等層面。

---

## 發現的問題

### P0 — 阻塞問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 1 | **SIGINT handler 註冊順序衝突導致 exec-lock 永久洩漏**：`index.ts:245` 透過 `process.on('SIGINT', ...)` 先註冊 handler（呼叫 `process.exit(1)`），`executor.ts:526` 透過 `process.once('SIGINT', ...)` 後註冊 cleanup handler（清除 `.exec-lock` 目錄）。Node.js 按註冊順序呼叫 signal listener — 第一個 handler 的 `process.exit(1)` 立即終止程序，第二個 handler 永遠不會被呼叫。Ctrl+C 中斷後 `.exec-lock` 目錄殘留，所有後續 eval 執行立即失敗顯示 "Another eval is already in progress"。 | 每次 Ctrl+C 中斷後需手動刪除 `.exec-lock` 才能再次執行評測 | `index.ts`, `executor.ts` | index:236-245, exec:522-526 | 架構瑕疵 |

### P1 — 重要問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 2 | **exec-lock 無陳舊鎖偵測與清理機制**：`mkdir` 作為互斥鎖，無 PID 驗證、無 timestamp 過期機制。若程序被 SIGKILL 終止、發生未捕獲例外崩潰、或 `process.exit(1)` 跳過 finally 區塊，鎖目錄永久存在。 | 一次崩潰永久阻塞 eval 工具，唯一恢復方法是手動刪除 `.exec-lock` | `executor.ts` | 509-519 | 架構瑕疵 |
| 3 | **scoring-lock 有相同陳舊鎖問題**：`scorer.ts:347-355` 使用與 exec-lock 相同的 `mkdir`-based mutex。若評分程序在持有 `.scoring-lock` 時崩潰，該測試永久無法再次評分（鎖殘留 → 跳過 → 不建立 `.scored` marker → 永遠卡在「未評分但不可評分」狀態）。 | 單一測試評分鎖崩潰使該測試永久失去評分能力 | `scorer.ts` | 347-355 | 架構瑕疵 |
| 4 | **中間 tool-use 回合的 LLM 回應未記錄到軌跡（違反 Spec R2.1）**：當 LLM 以 `finish_reason: 'tool_calls'` 回應時（即要求呼叫工具的中間回合），該次 API 呼叫的回應不會被記錄為 `response` 事件 — token 用量（`usage`）遺失、模型的中間思考內容（`assistantMessage.content`）遺失。只有最終 `finish_reason: 'stop'` 的回應被記錄。 | 軌跡遺漏多次 LLM API 呼叫的 token 用量與思考內容；評分模型無法看到完整執行過程 | `executor.ts` | 255-375 | 實作偏移 |

### P2 — 一般問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 5 | **Dry-run 產出模板建議而非結構化 diff（spec R1.3 語意偏移）**：dry-run 路徑跳過 LLM 呼叫（`deduplicateIssues` + `generateSuggestedFix`），使用模板產生純 markdown 建議文件（`skill-optimization-patch.md`），而非機器可套用的 unified diff 格式。雖然產出內容基於真實評分數據，但品質和形式與正式執行不同。 | Dry-run 預覽與正式執行產出在品質和格式上不一致 | `index.ts`, `optimizer.ts` | index:313-339, opt:1150-1192 | 實作偏移 |
| 6 | **`supplyQuestions` 死函式 + `question-utils` 不必要依賴 judge API**：`question-loader.ts` 匯出 `supplyQuestions` 但 eval pipeline（`index.ts`）中無任何呼叫點。`question-utils.ts` 因 `generateVariants`（被 `supplyQuestions` 呼叫）而匯入 `callJudgeModelRaw`，造成工具模組對 API 層的不必要耦合。 | 死碼增加維護認知負擔；違反依賴倒置原則 | `question-loader.ts`, `question-utils.ts` | loader:152-168, utils:21,317-365 | 冗余代碼、架構瑕疵 |
| 7 | **主要去重機制為詞彙相似度而非語意相似度（Spec R1.1 偏移）**：Phase 1 使用 Jaccard 相似度 + 詞幹提取（stemming）進行去重，屬於詞彙層面比對。Phase 2 雖使用 LLM 語意精煉，但僅處理通過 Phase 1 詞彙閾值（`descSim > 0.35`）的配對 — 詞彙不相似但語意相似的兩個問題將在 Phase 1 被錯誤判定為不同問題，永遠無法到達 Phase 2。 | 語意相似但用詞不同的重複問題無法被合併 | `optimizer.ts` | 653-785 | 實作偏移 |
| 8 | **Bash 路徑穿越防護與 executeRead 不一致**：`executeRead`（L150-158）使用嚴謹的 `resolve` + `relative` + `startsWith('..')` 防護，但 `executeBash`（L441-447）使用脆弱的字串前綴比對（`startsWith('/')`, `startsWith('~/')`, `includes('..')`）。若未來 `SAFE_BASH_COMMANDS` 擴充（如新增 `ln`），symlink 可繞過字串比對。 | 實作不一致；維護者可能在不知情下引入安全漏洞 | `isolation.ts` | 441-447 | 架構瑕疵 |
| 9 | **`executeInWorkspace` 中 `default` 分支為不可達死路徑**：`WORKSPACE_TOOLS` 僅含 `Read`/`Grep`/`Glob` 三個值，switch 語句對三者均有明確 case。`default` 分支永遠無法被控制流進入。 | 殘留防禦性程式碼，可能誤導維護者 | `isolation.ts` | 485-487 | 冗余代碼 |
| 10 | **`getRecords()` 死方法**：`ToolDispatcher` 介面宣告 `getRecords()`（JSDoc 說明為「取得所有已記錄的工具調用記錄」），實作永遠回傳空陣列 `[]`。整個 eval pipeline 無任何呼叫者。 | 殘留的未實作介面方法 | `isolation.ts` | 51, 544-546 | 冗余代碼 |
| 11 | **`scorer.ts` 重複的 score/scored 寫入邏輯**：`scoreSingleTest` 的軌跡損壞分支（L382-388）和正常評分分支（L425-432）包含完全相同的 7 行程式碼（寫入 `scorePath` → 序列化 `.scored` 資料 → 寫入 `scoredPath`），違反 DRY 原則。 | 重複程式碼增加維護成本 | `scorer.ts` | 382-388, 425-432 | 冗余代碼 |
| 12 | **`optimizer.ts` 大量同步 I/O 在 async 函式中**：`generateOptimizationPlan`、`optimizeSkillMd`、`isAllowedFile` 等 async 函式大量使用 `readFileSync`、`writeFileSync`、`copyFileSync`、`mkdirSync` 等同步 I/O，阻塞事件迴圈。與其他模組使用 `fs/promises` 的模式不一致。 | 大型 SKILL.md 優化時阻塞事件迴圈；風格不一致 | `optimizer.ts` | 899, 1130, 1179, 1208-1275 | 性能隱患 |

### P3 — 建議改善

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 13 | **`env-utils.ts` 未使用的 import `getProjectRoot`**：匯入但檔案內無任何呼叫點。 | 輕微 import 雜訊 | `lib/env-utils.ts` | 20 | 冗余代碼 |
| 14 | **`DedupedIssueInternal._suggestedFix` 從未被賦值**：型別宣告為 `string?` 且有一處讀取（`item._suggestedFix ?? ''`），但整個代碼庫中無任何寫入點，`?? ''` 永遠生效。 | 從 `scripts/optimize.mjs` 遷移時殘留的屬性 | `optimizer.ts` | 78, 767 | 冗余代碼 |
| 15 | **`DedupedIssueInternal._cluster` 只寫不讀**：去重合併時被賦值（L738），但從未被任何代碼讀取。原始 `scripts/optimize.mjs` 用於除錯，遷移後不再需要。 | 殘留屬性與賦值操作 | `optimizer.ts` | 738 | 冗余代碼 |
| 16 | **不安全的 `err as NodeJS.ErrnoException` 斷言**：`executor.ts:514` 和 `env-utils.ts:97` 中捕獲的 `err: unknown` 直接斷言為 `NodeJS.ErrnoException`。若拋出值無 `.code` 屬性（如自訂 Error），`nodeErr.code` 回傳 `undefined`，錯誤訊息變為 `undefined`，誤導除錯。 | 非標準錯誤條件下診斷資訊不可用 | `executor.ts`, `lib/env-utils.ts` | exec:514, env:97 | 架構瑕疵 |
| 17 | **`--output-dir` 允許任意路徑寫入**：使用者可傳入 `--output-dir /etc/some-dir` 或 `--output-dir ../..` 將報告寫入任意可寫入位置，無路徑限制檢查。 | 報告可寫入專案目錄外的任意位置（雖然內容為 Markdown） | `index.ts` | 300-308 | 架構瑕疵 |
| 18 | **分數門檻檢查在 `scores` 為空時被靜默略過**：`scores.length === 0` 時 `avgScore` 為 0，但 `scores.length > 0` 條件阻止門檻檢查，CI 閘門（`EVAL_MIN_SCORE`、`EVAL_MAX_P0`）被跳過。若所有測試已在前次評分完成，重新執行 eval 時評分門檻無法正常運作。 | 部分情境下 CI 門檻防護失效 | `index.ts` | 379-382 | 架構瑕疵 |
| 19 | **`executeGrep` 將整個檔案讀入記憶體**：對每個匹配檔案使用 `readFile(fullPath, 'utf-8')` 完整讀入，再 `split('\n')` 分割後逐行比對。對大型檔案（數 MB）造成不必要的記憶體峰值，且無檔案大小限制。 | 若 workspace 有大型檔案時記憶體使用過高 | `isolation.ts` | 237-243 | 性能隱患 |
| 20 | **API 回應處理中大量 `as` 斷言缺少執行期驗證**：`scorer.ts:396-418` 對 judge model 回應做大量型別斷言（如 `issue.severity as Issue['severity']`），但 `??` 僅處理 `null/undefined`，無法處理型別不符（如 `severity: "CRITICAL"` 而非 `"P0"/"P1"/"P2"`）。 | LLM 回傳偏離預期 schema 時不會有明確錯誤 | `scorer.ts`, `judge-api.ts`, `executor.ts` | scorer:396-418, judge:81-84, exec:273-320 | 架構瑕疵 |

---

## 審查維度摘要

- **幻覺代碼**: 無發現 — 13 個檔案共 25+ imports、30+ 函式呼叫、14 個 env var 引用全部交叉驗證通過；零 `any` 型別使用
- **冗余代碼**: 7 個 finding（P1: supplyQuestions 死函式；P2: default 死路徑 + getRecords 死方法 + scorer 重複邏輯；P3: env-utils 未使用 import + _suggestedFix 未賦值 + _cluster 只寫不讀）
- **實作偏移**: 3 個 finding（P1: 中間 tool-use 回應未記錄；P2: dry-run 非結構化 diff + Phase 1 詞彙去重）
- **實作遺漏**: 無發現 — 全部 28 個需求 + 14 個錯誤案例已實作（100% 覆蓋率）
- **架構瑕疵**: 9 個 finding（P0: SIGINT handler lock 洩漏；P1: exec-lock + scoring-lock 陳舊鎖缺失；P2: Bash 防護不一致 + supplyQuestions 耦合 + err 斷言 + output-dir 穿越 + scores 空陣列跳過；P3: API 回應 as 斷言）
- **性能隱患**: 2 個 finding（P2: optimizer sync I/O；P3: executeGrep 全檔案讀入）

---

## Review History

> **2026-05-29 (Round 1)**: 首次審查 — 發現 25 個問題（2 P0 + 13 P1 + 9 P2 + 1 P3）。核心缺陷為 isolation.ts 未整合至 executor pipeline、軌跡引用未達 JSONL 行號精度。Verdict: Needs Work。
>
> **2026-05-29 (Round 2)**: 修復後再審查（commit `91863d7`）。確認 Round 1 全部 25 個問題已修復。發現 12 個殘留問題（4 P1 + 8 P2/P3）。Verdict: Needs Work。
>
> **2026-05-29 (Round 3)**: 修復後再審查（commit `5f2061b`）。發現 commit message 與實作不一致、死碼模組等 18 個問題（1 P0 + 7 P1 + 6 P2 + 4 P3）。Verdict: Needs Work。
>
> **2026-05-29 (Round 4)**: 修復後再審查（commits `a5f6db3` + `569335b`）。確認 Round 3 全部 18 個問題已修復。新發現 26 個問題（6 P1 + 11 P2 + 9 P3），最關鍵者為 LLM 變體生成缺失、`[simulated]` 標記洩漏。Verdict: Needs Work。
>
> **2026-05-29 (Round 5)**: 修復後再審查（commits `a5f6db3` + `569335b`）。確認 Round 4 全部 26 個問題已正確修復。幻覺代碼零發現。Spec 實作遺漏審查確認全部 20 個需求與 14 個錯誤案例已完成實作（首次達到 100% 覆蓋率）。新發現 32 個問題（0 P0 + 6 P1 + 14 P2 + 12 P3）。Verdict: Needs Work。
>
> **2026-05-29 (Round 6)**: 修復後再審查（commit `372484f`）。確認 Round 5 全部 32 個問題已正確修復。幻覺代碼零發現，實作遺漏零發現（100% 覆蓋率）。新發現 20 個問題（0 P0 + 3 P1 + 5 P2 + 12 P3），最關鍵者為 dry-run 不產出 diff、Bash `find -exec` 繞過白名單、Bash 安全命令缺少 workspace 路徑防護。Verdict: Needs Work。
>
> **2026-05-29 (Round 7 — 本次)**: 修復後再審查（commit `5d92280`）。確認 Round 6 全部 20 個問題已正確修復。幻覺代碼零發現，實作遺漏零發現（100% 覆蓋率）。新發現 **20 個問題（1 P0 + 3 P1 + 8 P2 + 8 P3）**，最關鍵者為 **SIGINT handler 註冊順序衝突導致 exec-lock 永久洩漏**（P0 — 每次 Ctrl+C 後需手動刪除 `.exec-lock`）。Verdict: Needs Work。

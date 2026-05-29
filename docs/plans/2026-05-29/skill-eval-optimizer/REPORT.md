# Review Report

- **Spec**: skill-eval-optimizer (eval-core + optimize-and-integrate)
- **Date**: 2026-05-29
- **Reviewer**: Claude Code Review Agent (6 parallel agents)
- **Verdict**: Needs Work

---

## 判決說明

**Verdict**: Needs Work

Round 3 修復（commits `5f2061b` + `484913c`）成功解決了上一輪全部 18 個問題，CI 閘門機制、死碼移除、型別安全等核心修復已確認到位。幻覺代碼審查為零發現——所有 import、函式呼叫、型別引用均經過交叉驗證正確。

本輪發現 6 個 P1 問題，最關鍵的是：SPEC 明確要求的 **LLM 變體生成（R1.3）從未被實作**，以及 **工具模擬的 `[simulated]` 標記洩漏給被測模型**，違反了 SPEC R4.1 的透明性要求。此外有 11 個 P2 和 9 個 P3 問題，涵蓋冗余導出、同步 I/O 使用、架構防線偏弱等方面。

---

## 發現的問題

### P0 — 阻塞問題

無 P0 發現。

### P1 — 重要問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 1 | **LLM 變體生成完全未被實作**：`packages/tools/eval/` 中不存在任何 LLM 變體生成邏輯。`question-utils.ts` 僅做剝離/取出評分標準的操作，`question-loader.ts` 直接從靜態 JSON 載入題庫。SPEC R1.3 明確要求「LLM 變體生成需保留原題的評分標準，僅改寫場景表述」。 | 缺少整個功能模組；無法透過 LLM 動態擴充題庫，所有題目僅能來自人工維護的靜態 JSON | `question-loader.ts`, `question-utils.ts` | — | 實作遺漏 |
| 2 | **工具模擬透明性洩漏**：`isolation.ts` L408 對 LSP/WebSearch/WebFetch 等模擬工具的回傳值附加 `[simulated]` 前綴，結果直接透過 `executor.ts` 送入被測模型的對話上下文。模型能從內容中識別自己處於模擬環境。違反 SPEC R4.1「工具模擬策略對被評測模型透明」。 | 被測模型可能因感知模擬環境而改變行為模式，評測結果無法反映真實使用場景 | `isolation.ts`, `executor.ts` | isolation:408-412, executor:326-329 | 實作偏移、實作遺漏 |
| 3 | **評分鎖定清理失敗被靜默吞掉**：`scorer.ts` L397-401 在 `finally` 區塊內清理 `.scoring-lock` 目錄，但 `catch` 區塊完全為空（`/* ignore */`）。若 `rm` 因權限或檔案系統錯誤失敗，鎖定目錄永久殘留。由於鎖定以 `mkdir` 的 `EEXIST` 語意實作，後續對該測試的所有評分請求都將被永久跳過。 | 無外部清理機制時，該測試永久無法再被評分，構成不可回復的靜默失敗 | `scorer.ts` | 397-401 | 架構瑕疵 |
| 4 | **`isAllowedFile` 安全邊界使用 `String.includes()` 而非路徑前綴匹配**：`optimizer.ts` L356-363 的 `isAllowedFile` 是 DESIGN.md 不變量 #5（優化 diff 不修改技能目錄外檔案）的唯一防線。它使用 `normalized.includes(resolved)` 做子字串匹配——例如 `skills/spec/SKILL.md` 作為 substring 會匹配到 `skills/spec/SKILL.md.backup` 等非目標檔案。沒有使用 `path.relative` 做真正的路徑邊界檢查。 | 惡意或錯誤的優化 diff 可能繞過白名單限制，修改技能目錄外的檔案 | `optimizer.ts` | 356-363 | 架構瑕疵 |
| 5 | **`deduplicateIssues` Phase 1 無 pair cap**：`optimizer.ts` L670-695 的 Jaccard 相似度聚類巢狀迴圈為無上限 O(n²)。Phase 2 (`refineDedupWithJudge`) 已有 `MAX_PAIRS_PER_CATEGORY = 100` 保護，但 Phase 1 完全無限制。`loadAllScores` 可從多次歷史評測累積數百個 issue，產生數萬次 Jaccard 計算。 | 大量 issue 時效能急劇下降 | `optimizer.ts` | 670-695 | 性能隱患 |
| 6 | **`scanForDone` 同步 I/O 仍是主要路徑**：`scoreAllTests` L422 直接調用同步的 `scanForDone`（`existsSync` + `readdirSync`），在評分批次開始前阻塞事件循環。Round 3 加入的 `scanForDoneAsync`（使用 `fs/promises`）存在但完全未被內部採用，仍是死碼。 | 評分批次啟動延遲，違反 pipeline 的非阻塞設計意圖 | `scorer.ts` | 422, 489-506 | 性能隱患、冗余代碼 |

### P2 — 一般問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 7 | **死碼殘留**：`scanForDoneAsync`（scorer.ts ~16 行）、`ParseErrorResult` 型別（judge-api.ts ~13 行）、`selfTest()` 函式（env-utils.ts ~52 行 + question-utils.ts ~168 行，僅在 `isDirectRun` 檢查觸發）均從未被 eval pipeline 使用。合計 ~250 行死碼。 | 增加維護成本和閱讀干擾 | `scorer.ts`, `lib/judge-api.ts`, `lib/env-utils.ts`, `lib/question-utils.ts` | scorer:531-546, judge-api:31-43, env:220-271, q:324-492 | 冗余代碼 |
| 8 | **9 個僅內部使用的符號被匯出**：`CallOptions`、`JudgeRawResult`、`parseJudgeOutput`（judge-api.ts）、`scoreSingleTest`（scorer.ts）、`MockToolResult`、`ToolCallRecord`（isolation.ts）、`StrippedQuestion`、`StepDefinition`、`ScoringDimensionMeta`（question-utils.ts）均僅在自身模組內部使用，無任何外部 import。 | 不必要的公開 API 增加模組介面複雜度 | `lib/judge-api.ts`, `scorer.ts`, `isolation.ts`, `lib/question-utils.ts` | 多處 | 冗余代碼 |
| 9 | **`optimizeSkillMd` 中技能名稱提取邏輯有 bug**：L1094 的 `split('/').pop()!.replace('/SKILL.md', '')` 永遠不會匹配（`pop()` 回傳 `SKILL.md` 不含前綴 `/`），幸好下一行透過 `includes('/skills/')` 分支正確解析了技能名稱，bug 在多數場景下被遮蔽。當路徑不包含 `/skills/` 時仍會觸發。 | fallback 路徑中 skillName 會變成 `"SKILL.md"`，使 `isAllowedFile` 永遠不匹配 | `optimizer.ts` | 1094 | 架構瑕疵 |
| 10 | **`reporter.ts` 非空斷言（`!`）存取 `Array.find()` 結果**：L115-116 和 L124-125 使用 `.find(...)!` 取值，依賴前一行的 `.some()` / `.filter()` 保證存在。同步鏈中目前安全，但缺少結構化保證，任何未來重構可能導致 `undefined` 崩潰。 | 未來重構時可能觸發 `Cannot read properties of undefined` 執行時期崩潰 | `reporter.ts` | 115-116, 124-125 | 架構瑕疵 |
| 11 | **`executor.ts` 錯誤類型判別使用字串比對**：L467-476 以 `(err as Error).message?.startsWith('Eval aborted')` 區分磁碟空間不足錯誤。應使用自訂錯誤類別（`instanceof`）進行精確判別。 | 非 Error 實例的異常或訊息巧合匹配可能導致誤判 | `executor.ts` | 467-476 | 架構瑕疵 |
| 12 | **CLI 參數解析使用 `as string` 強制轉型**：`index.ts` L128,137 對 `string \| boolean` union 型別的 value 直接斷言為 string。若未來 CLI 參數解析邏輯變更，可能傳入 `true` 導致 `path.resolve(true)` 產生意料外行為。 | 型別安全被繞過，潛在執行時期錯誤 | `index.ts` | 128, 137 | 架構瑕疵 |
| 13 | **dry-run 模式仍呼叫 judge 模型 API**：`optimizer.ts` L1152-1166 在 dry-run 路徑中，當 judge 可用時仍會呼叫 `callJudgeModelRaw` 產生建議再寫入 patch。dry-run 只保證不修改 SKILL.md，但會消耗 API credits。 | 使用者可能誤解 dry-run 為零成本操作 | `optimizer.ts` | 1152-1166 | 架構瑕疵 |
| 14 | **`writeReport` 未用 skillName 建立不同輸出檔名**：`reporter.ts` L338-355 的 `writeReport` 接受 `skillName` 參數但未使用，多技能同日評測時報告會互相覆蓋。自訂 `--output-dir` 路徑有包含 skillName，但預設路徑沒有。 | 同日多次評測會遺失先前報告 | `reporter.ts` | 338-355 | 實作偏移 |
| 15 | **題目數量不足僅警告未中止**：`question-utils.ts` L262-264 在 `questions.length < 100` 時僅 `console.warn`，之後繼續返回題目陣列。SPEC 錯誤案例要求「提示使用者需先建立題庫，不執行評測」。 | 題庫不完整時仍執行評測，結果覆蓋率不足 | `lib/question-utils.ts` | 262-264 | 實作偏移 |
| 16 | **無效 skill_name 未列出可用技能**：`index.ts` L220-226 當 SKILL.md 不存在時僅輸出錯誤訊息。SPEC 錯誤案例要求「顯示找不到技能 <name> 並列出可用技能」。對比：空 skill_name 時（L202-215）確實會列出可用技能。 | 使用者需自行猜測/尋找正確的技能名稱 | `index.ts` | 220-226 | 實作遺漏 |
| 17 | **隔離模組熱路徑大量同步 I/O**：`isolation.ts` 的 `executeRead`/`executeGrep`/`executeGlob` 全程使用 `existsSync`/`readFileSync`/`readdirSync`，在 tool-use loop 的每輪迭代中阻塞事件循環。`executeGrep` 和 `executeGlob` 的遞迴 `walkDir` 尤其嚴重。`optimizer.ts` 的 `optimizeSkillMd` 使用 `execSync` 執行子進程，完全凍結事件循環最多 30 秒。 | 並發執行多個測試時吞吐量下降 | `isolation.ts`, `optimizer.ts` | isolation:131-345, optimizer:1228 | 性能隱患 |

### P3 — 建議改善

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 18 | **4 個組合型別僅用於組合其他匯出型別仍被匯出**：`FileContext`、`CheckItem`、`ScoringDimension`（question-utils.ts）、`ScoreDimension`（scorer.ts）僅在各自檔案內被其他匯出型別引用，無外部直接 import。 | 輕微的 API 表面積膨脹 | `lib/question-utils.ts`, `scorer.ts` | 多處 | 冗余代碼 |
| 19 | **`loadSchema` 僅被死碼 `selfTest()` 調用**：eval pipeline 生產路徑從不調用此函式。 | 與 selfTest 耦合的低價值函式 | `lib/question-utils.ts` | 115-124 | 冗余代碼 |
| 20 | **`optimizer.ts` 多處 judge 呼叫未傳遞 timeout**：L477、L803、L1161、L1205 的 `callJudgeModelRaw` 呼叫未傳入 timeout，`callJudgeModelRaw` 內部 `timeoutMs` 預設為 0（無超時）。而 `scorer.ts` 正確使用了 `env.JUDGE_TIMEOUT`。 | judge 模型無回應時永久阻塞 | `optimizer.ts` | 477, 803, 1161, 1205 | 實作偏移 |
| 21 | **`executor.ts` 重試訊息寫入 `console.error` 而非可配置 stderr**：與 `index.ts` 使用 `context.stderr` 的設計模式不一致。 | 無法將 executor 輸出路由到自訂 stderr | `executor.ts` | 155-157 | 實作偏移 |
| 22 | **`dryRun` 與 `judgeAvailable` 被合併為單一布林條件**：`optimizer.ts` L1127 `if (dryRun \|\| !judgeAvailable)` 混淆了兩個正交概念。當 judge 不可用時走 dry-run 路徑但回報訊息固定為 `"Dry-run: patch written"`，誤導使用者。 | 使用者無法區分真正的 dry-run 和因 judge 不可用而降級的 dry-run | `optimizer.ts` | 1127 | 架構瑕疵 |
| 23 | **頂層 catch 只記錄 `err.message` 丟棄 stack trace**：`index.ts` L355-358 的頂層 catch 僅提取 message 屬性寫入 stderr。作為最後防線缺少 stack trace 使非預期錯誤難以定位根因。 | 生產環境除錯困難 | `index.ts` | 355-358 | 架構瑕疵 |
| 24 | **缺少 SIGINT 處理器**：整個 `packages/tools/eval/` 目錄中沒有 `process.on('SIGINT', ...)` 信號處理。雖然 append-only JSONL 設計使已完成結果自然保留，但缺少 graceful shutdown 提示。 | 使用者中斷時無反饋告知已保留進度 | — | — | 實作遺漏 |
| 25 | **優化後驗證僅檢查 YAML frontmatter 未檢查 Markdown 結構**：`optimizer.ts` 修改後僅執行 `validate-skill-frontmatter`。若優化 diff 引入未閉合 code block 或缺少 H2 標題等結構損壞，不會被檢測到也不會觸發回滾。 | Markdown 結構損壞可能通過驗證 | `optimizer.ts` | 1228 | 實作遺漏 |
| 26 | **嚴重度排序對照表重複**：`optimizer.ts` L90 的 `SEVERITY_RANK` 與 `reporter.ts` L139 的 `severityOrder` 完全相同（`{ P0: 0, P1: 1, P2: 2 }`），應提取為共用常數。 | 輕微的維護負擔 | `optimizer.ts`, `reporter.ts` | 90, 139 | 冗余代碼 |

---

## 審查維度摘要

- **幻覺代碼**: 無發現 — 6 agent 獨立交叉驗證，12 個源碼檔案、所有 import 和函式呼叫、型別引用均確認存在，`tsc --noEmit` 零錯誤。
- **冗余代碼**: 6 個 finding（P1: scanForDoneAsync 死碼 × 1；P2: selfTest 死碼族群 + 9 個不必要匯出 × 2；P3: 組合型別匯出 + loadSchema + 重複對照表 × 3）
- **實作偏移**: 5 個 finding（P1: `[simulated]` 透明性洩漏 × 1；P2: writeReport 覆蓋 + 題庫不足未中止 × 2；P3: timeout 缺失 + console.error × 2）
- **實作遺漏**: 4 個 finding（P1: LLM 變體生成缺失 + `[simulated]` 透明性 × 2；P2: skill_name 不列可用技能 × 1；P3: SIGINT + Markdown 驗證 × 2）
- **架構瑕疵**: 9 個 finding（P1: 鎖定清理失敗 + isAllowedFile 邊界 × 2；P2: skillName bug + 非空斷言 + 字串比對 + as string 轉型 + dry-run API 呼叫 × 5；P3: 布林混淆 + stack trace 丟棄 × 2）
- **性能隱患**: 2 個 finding（P1: dedup O(n²) + scanForDone sync I/O × 2；P2: isolation sync I/O + optimizer sync I/O × 1 合併；P3: 無獨立發現）

---

## Review History

> **2026-05-29 (Round 1)**: 首次審查 — 發現 25 個問題（2 P0 + 13 P1 + 9 P2 + 1 P3），涵蓋 6 個審查維度。核心缺陷為 isolation.ts 未整合至 executor pipeline、軌跡引用未達 JSONL 行號精度。Verdict: Needs Work。
>
> **2026-05-29 (Round 2)**: 修復後再審查（commit `91863d7` 修復了 Round 1 全部 25 個問題）。確認核心 tool-use loop、JSONL 行號、getProjectRoot 共用、磁碟檢查、執行鎖、非同步 I/O 等修復已正確實作。發現 4 個 P1 殘留問題（讀取工具 mock 策略偏移、CI 門檻不可配置、Exit code 缺 P0 檢查、Judge prompt 缺完整 trace）及 7 個 P2/P3 項目。Verdict: Needs Work。
>
> **2026-05-29 (Round 3)**: 修復後再審查（commit `5f2061b` 宣稱修復了 Round 2 全部 12 個問題）。發現 commit message 與實際代碼變更不一致：EVAL_MIN_SCORE / EVAL_MAX_P0 接入在 commit 中宣稱已修復，但 index.ts 和 env-utils.ts 在該 commit 中完全未被修改。另發現 2 個完全死碼模組（generateVariant + watchMode，共 ~190 行）、judge prompt 資訊傳遞不足等。共計 1 P0 + 7 P1 + 6 P2 + 4 P3 = 18 個問題。Verdict: Needs Work。
>
> **2026-05-29 (Round 4 — 本次)**: 修復後再審查（commits `5f2061b` + `484913c`）。確認 Round 3 全部 18 個問題已正確實作修復，`tsc --noEmit` 零錯誤，35/35 測試通過。幻覺代碼為零發現。本輪新發現 6 個 P1 問題（LLM 變體生成缺失、工具模擬 `[simulated]` 標記洩漏、評分鎖定清理失敗靜默、isAllowedFile 安全邊界偏弱、dedup O(n²)、scanForDone sync I/O）、11 個 P2 問題、9 個 P3 問題。共計 0 P0 + 6 P1 + 11 P2 + 9 P3 = 26 個問題。Verdict: Needs Work。

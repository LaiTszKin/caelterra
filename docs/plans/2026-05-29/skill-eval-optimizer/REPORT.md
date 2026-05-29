# Review Report

- **Spec**: skill-eval-optimizer (eval-core + optimize-and-integrate)
- **Date**: 2026-05-29
- **Reviewer**: Claude Code Review Agent (6 parallel agents)
- **Verdict**: Needs Work

---

## 判決說明

**Verdict**: Needs Work

Round 4 修復（commits `a5f6db3` + `569335b`）成功解決了上一輪全部 26 個問題——LLM 變體生成、`[simulated]` 標記移除、死碼清理、型別安全等核心修復已確認到位。幻覺代碼審查零發現。

本輪發現 6 個 P1 問題，最關鍵的是：**Bash 工具隔離違反 R4 讀寫分離**（全部 Bash 命令被當作寫入操作 mock，包括 `ls`/`cat` 等唯讀命令）、**評分鎖定無法防止重複 API 呼叫**（judge API 呼叫在 lock 取得前執行）、以及 **`isAllowedFile` 路徑淨化鏈在跨平台情境下不可靠**。此外有 14 個 P2 和 12 個 P3 問題，涵蓋死碼殘留、同步 I/O 使用、dry-run 副作用不完全等層面。

---

## 發現的問題

### P0 — 阻塞問題

無 P0 發現。

### P1 — 重要問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 1 | **Bash 全部視為寫入操作違反 R4 讀寫分離**：`WRITE_TOOLS` 集合包含 `'Bash'`（L84-89），所有 Bash 命令（含 `ls`、`cat`、`pwd` 等唯讀操作）一律回傳 mock 結果。Spec R4 明確要求「讀取類工具真實執行，寫入類工具模擬」。此外 Bash mock 回傳格式 (`Written {path}...`) 與真實 Bash stdout 差異明顯，違反 R4.1 透明性要求。 | 被測模型無法透過 Bash 進行檔案系統導航/驗證；mock 格式洩漏可能讓模型感知模擬環境，評測結果失真 | `isolation.ts` | 84-89, 107-117 | 實作偏移 |
| 2 | **評分鎖定無法防止重複 judge API 呼叫**：`scoreSingleTest` 中 judge model API 呼叫（L344）發生在 `.scoring-lock` 獲取（L381）**之前**。兩行程並發評分時，兩者都通過 `isAlreadyScored` 檢查、各自完成 API 呼叫，然後才競爭寫入鎖。同時 `.scored` marker 先於 `score.json` 寫入（L389-395），若 L394 後行程崩潰則永久標記為已評分但 score.json 不完整。 | 並發場景下 judge API 被重複呼叫浪費成本；崩潰後該題永久無法被重新評分 | `scorer.ts` | 344-395 | 架構瑕疵、實作偏移 |
| 3 | **`isAllowedFile` 路徑淨化鏈在跨平台情境下不可靠**：`ALLOWED_FILES` 目錄模式為相對路徑（如 `skills/<name>/scripts/`），但 `filePath` 是絕對路徑。`path.relative(resolved, normalized)` 輸入兩者型別不一致，在 POSIX 上將相對路徑視為 CWD 相對，白名單校驗結果依賴 CWD。`skillMdPath` 在使用 `endsWith`/`split` 前未 `path.resolve()` 標準化，含 `..` 的路徑可繞過檢查。 | Invariant 5 的白名單防線在特定 CWD 或路徑包含 `..` 時可能被繞過 | `optimizer.ts` | 359-373, 1113-1116 | 架構瑕疵 |
| 4 | **崩潰恢復後備份內容已非原始版本**：`optimizeSkillMd` 每次執行都從**當前的** `skillMdPath` 建立 `.bak` 備份。若第一次運行在 judge API 之後、驗證之前崩潰，重試時備份覆蓋為修改後的內容。此時若再次失敗，從備份還原的是已修改版本而非原始版本，原始內容永久遺失。 | 違反 Invariant 6（備份在修改前必定存在）— crash-recover 情境下無法可靠還原原始 SKILL.md | `optimizer.ts` | 1235-1236 | 架構瑕疵 |
| 5 | **全域 frontmatter 驗證導致正確優化被錯誤還原**：post-optimization 驗證 (`validate-skill-frontmatter`) 無限定技能名稱，驗證的是**所有**技能的 frontmatter。若另一個不相關的技能有既存 frontmatter 問題，當前技能的合法優化被錯誤地復原備份。 | 嚴重的誤報問題；使用者困惑且無法理解為什麼 SKILL.md 沒有被修改 | `optimizer.ts` | 1264-1272 | 架構瑕疵 |
| 6 | **`execSync` 阻塞事件迴圈 30 秒**：`optimizeSkillMd` 使用 `execSync` 同步執行驗證命令，timeout 30 秒。在此期間整個 Node.js 事件迴圈被凍結，所有並行的 promise（含進行中的評分請求）都無法取得進展。 | 嚴重效能瓶頸；並行評分在這 30 秒內完全停擺 | `optimizer.ts` | 1264-1270 | 性能隱患 |

### P2 — 一般問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 7 | **LLM 變體生成功能存在但無法被 CLI pipeline 觸發**：`supplyQuestions`（利用 `generateVariants` 透過 LLM 生成題目變體）已完整實作，但 `index.ts` 從未呼叫它。當題庫數量不足時系統直接拋錯中止，而非嘗試自動生成補足。`supplyQuestions`、`generateVariants`、`EnvConfig` 引入均無生產路徑引用（僅測試檔案使用）。 | R1.3 變體生成形同虛設；使用者無法體驗 LLM 動態擴充題庫的能力，題庫不足時只能手動補充 | `question-loader.ts`, `lib/question-utils.ts`, `index.ts` | q-loader:152-168, q-utils:317-365, index:264 | 冗余代碼、實作偏移 |
| 8 | **JSONL 軌跡損壞仍呼叫 judge API**：`readTrace` 回傳 `hasCorruption` 標誌後，`scoreSingleTest` 仍繼續呼叫 `buildJudgePrompt` + `callJudgeModel`，僅在結果中設 `scorable: false`。Spec 錯誤案例要求「跳過並在報告中標記」。 | 每次損壞軌跡浪費一次 judge API 呼叫 | `scorer.ts` | 324-376 | 實作偏移 |
| 9 | **Dry-run 模式仍有檔案/API 副作用**：`--dry-run` 模式下，`generateOptimizationPlan` 仍透過 `mkdirSync` + `writeFileSync` 寫入 `optimization-plan.json`（無 dryRun 檢查）。此外 `deduplicateIssues`（含 judge API 呼叫）和 `generateSuggestedFix`（含 judge API 呼叫）在 dry-run 模式的全路徑中仍被執行。`judgeAvailable` 在 `index.ts` 被硬編碼為 `true`，dry-run 路徑因此避免使用 judge API 但 template-based patch 也遺失了上游已計算的 LLM 建議。 | 使用者可能誤解 dry-run 為零成本/零副作用操作；違反 Invariant 8 | `optimizer.ts`, `index.ts` | opt:892-900, idx:315-343 | 架構瑕疵 |
| 10 | **`executeGrep`/`executeGlob` 同步 I/O 阻塞事件迴圈**：兩者使用 `readdirSync`/`readFileSync` 遞迴掃描目錄。在 `promisePool` 並行執行多個 test 時，任一個 test 觸發 Grep/Glob 都會阻塞所有並行 test 的進展。 | 並行測試吞吐量下降；大 workspace 時尤為明顯 | `isolation.ts` | 204-265, 277-347 | 性能隱患 |
| 11 | **`appendTrace` 順序 I/O 瓶頸**：tool-use loop 中每個 tool call 產生 2 次 `await appendFile`。20 輪 x 多個 tool calls = 大量順序檔案 append 操作。無 write buffer 機制。 | 單 test 執行時間因大量檔案 I/O 而延長 | `executor.ts` | 321-332 | 性能隱患 |
| 12 | **messages 陣列無限制增長**：隨 tool-use loop 進行持續增長，20 輪 x 多個 tool result（含大型 Read 結果）可能累積數 MB。每次 API 呼叫都完整序列化傳輸。 | API 傳輸延遲增加；記憶體使用線性增長 | `executor.ts` | 237, 335, 338 | 性能隱患 |
| 13 | **Exec lock 在目錄不存在時給出誤導性錯誤**：`.exec-lock` 使用非遞迴 `mkdir`（`recursive: false`），首次 eval 時 `results/spec/{date}/` 不存在 → `ENOENT` → 使用者看到「no such file or directory」。 | 初次使用時困惑；無法正確理解執行衝突 | `executor.ts` | 490-499 | 架構瑕疵 |
| 14 | **Grep/Glob 靜默跳過不可讀目錄**：`walkDir` 的 `readdirSync`/`readFileSync` catch 區塊為空（`catch { return; }`/`catch { }`），被測模型無法得知部分檔案因權限被略過。 | 被測模型基於不完整的搜尋結果做出錯誤決策 | `isolation.ts` | 224, 247-248, 316-317 | 架構瑕疵 |
| 15 | **`scanForDone` 同步函式死碼**：完整定義但從未被任何生產程式碼呼叫。主路徑使用 `scanForDoneAsync`。 | 約 18 行死碼，增加維護負擔 | `scorer.ts` | 492-509 | 冗余代碼 |
| 16 | **reporter.ts fallback 迴圈永遠不會被執行**：第二個維度收集迴圈（L101-110）被 `dimNames.length === 0` 保護，但第一個迴圈（L88-98）已掃描所有非空維度。若第一個迴圈找到任何維度則保護條件為 false 跳過；若沒找到則內層也無資料可收集。 | 約 10 行死碼 | `reporter.ts` | 101-110 | 冗余代碼 |
| 17 | **optimizer.ts dry-run/judge-unavailable 路徑 40 行重複代碼**：兩個分支幾乎完全相同，僅回傳訊息字串不同。應提取為共用函式。 | 違反 DRY 原則；修改其中一個容易忘記同步另一個 | `optimizer.ts` | 1146-1230 | 冗余代碼 |
| 18 | **未使用的匯入**：`question-loader.ts` L19 的 `EnvConfig` 僅用於死碼 `supplyQuestions`；`index.ts` L26 的 `Question` 型別無任何使用。 | 輕微的 import 雜訊 | `question-loader.ts`, `index.ts` | q-loader:19, idx:26 | 冗余代碼 |
| 19 | **PR gate 結果寫入 workflow summary 而非 PR comment**：Spec R3 要求「CI 失敗時在 PR 評論中張貼評測報告摘要」，但 workflow 使用 `$GITHUB_STEP_SUMMARY`（workflow run 摘要頁面），非 PR comment。 | 開發者需手動進入 workflow 頁面查看結果；與 spec 描述不一致 | `.github/workflows/eval.yml` | 53-63 | 實作偏移 |
| 20 | **`parse_error` 事件缺少 JSONL 行號**：`_lineNumber` 僅在成功解析的行上設定。損壞行顯示為 `L?: parse_error`，違反 R3.3「軌跡引用精確到 JSONL 行號」。 | 報告中無法定位損壞行 | `scorer.ts` | 85-103 | 實作偏移 |

### P3 — 建議改善

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 21 | `scorer.ts` 中 `isAlreadyScored` 使用同步 `existsSync`，可在並行評分路徑中以 async `access` 替代 | 輕微的同步 I/O | `scorer.ts` | 427, 518-521 | 性能隱患 |
| 22 | `loadAllScores` 中同步 `existsSync` 在 async IIFE 內部 | 少量 tests 影響可忽略 | `optimizer.ts` | 237-238 | 性能隱患 |
| 23 | 多處 async pipeline 中使用 `writeFileSync`/`mkdirSync` 違反一致性 | 非熱路徑，不影響效能 | `index.ts`, `reporter.ts`, `optimizer.ts` | 多處 | 性能隱患 |
| 24 | `generateOptimizationPlan` 中 `totalIssues` 重複遍歷已在 `extractIssues` 完成的資料 | 輕微的重複計算 | `optimizer.ts` | 877-879 | 性能隱患 |
| 25 | `jaccardSimilarity` 未選擇較小集合迭代（O(min(\|A\|,\|B\|)) 最佳化） | 關鍵字集合通常很小 | `optimizer.ts` | 334-347 | 性能隱患 |
| 26 | `supplyQuestions` 中 `for...await` 順序呼叫 `generateVariants`，可使用 `Promise.all` 並行化 | 非熱路徑，僅題庫不足時觸發 | `question-loader.ts` | 161-165 | 性能隱患 |
| 27 | `index.ts` L273 重複 3 次 `sampled.filter()` 遍歷統計難度分佈，可用單次 `reduce` 替代 | sampled 僅 3-12 題 | `index.ts` | 273 | 性能隱患 |
| 28 | `tool_call id` 使用 `as string` 不安全型別斷言，若 API 返回異常格式 `id` 為 undefined | 多數 provider 提供字串型別 id | `executor.ts` | 306 | 架構瑕疵 |
| 29 | `promisePool` 中 worker 間共享 mutable `index` 變數，模式脆弱 | 目前正確但未來維護者可能在 `await` 前讀取 `index` | `lib/promise-pool.ts` | 21-28 | 架構瑕疵 |
| 30 | 磁碟空間檢查時機過早：`statfsSync(resultsBase)` 在目錄不存在時拋 ENOENT，被 catch 後靜默跳過 | 首次 eval 時磁碟保護不生效 | `executor.ts` | 475-487 | 架構瑕疵 |
| 31 | `EXEC_MODEL === JUDGE_MODEL` 時僅 `console.warn` 被動提醒，無強制隔離 | 使用者可選擇忽略警告，評分偏見風險 | `lib/env-utils.ts` | 187-194 | 架構瑕疵 |
| 32 | 貪婪正則 `[\s\S]*` 在極端大型 judge 輸出上可能災難性回溯 | 實務中 judge 輸出受 timeout/prompt 限制風險極低 | `lib/judge-api.ts` | 148 | 性能隱患 |

---

## 審查維度摘要

- **幻覺代碼**: 無發現 — 所有 import/函式呼叫/型別引用/環境變數/檔案路徑/API 端點均經交叉驗證正確
- **冗余代碼**: 5 個 finding（P2: scanForDone 死碼 + reporter fallback 死碼 + supplyQuestions 死碼鏈 + 重複代碼 + 未使用 import × 2）
- **實作偏移**: 5 個 finding（P1: Bash 讀寫分離違反 R4 × 1；P2: JSONL 損壞未跳過 + dry-run 副作用 + PR comment + parse_error 缺行號 × 4）
- **實作遺漏**: 無發現 — 全部 20 個需求與 14 個錯誤案例已完成實作
- **架構瑕疵**: 9 個 finding（P1: 評分鎖定原子性 + isAllowedFile 路徑 + 備份還原 + 全域驗證誤還原 × 4；P2: Exec lock 訊息 + Grep/Glob 靜默跳過 × 2；P3: 型別斷言 + promisePool 脆弱 + 磁碟檢查跳過 + 同模型警告 × 4）
- **性能隱患**: 8 個 finding（P1: execSync 30s 阻塞 × 1；P2: isolation sync I/O + appendTrace I/O + messages 增長 × 3；P3: existsSync + sync writes + 重複遍歷 + Jaccard + 順序 LLM + filter + 正則 × 7）

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
> **2026-05-29 (Round 5 — 本次)**: 修復後再審查（同上 commits）。確認 Round 4 全部 26 個問題已正確修復。幻覺代碼零發現。Spec 實作遺漏審查確認全部 20 個需求與 14 個錯誤案例已完成實作（首次達到 100% 覆蓋率）。本輪新發現 6 個 P1 問題（Bash 讀寫分離違反 R4、評分鎖定原子性不足、isAllowedFile 路徑淨化不可靠、崩潰後備份失效、全域驗證誤還原、execSync 30s 阻塞）、14 個 P2 問題、12 個 P3 問題。共計 0 P0 + 6 P1 + 14 P2 + 12 P3 = 32 個問題。Verdict: Needs Work。

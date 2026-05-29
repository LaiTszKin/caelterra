# Review Report

- **Spec**: skill-eval-optimizer (eval-core + optimize-and-integrate)
- **Date**: 2026-05-29
- **Reviewer**: Claude Code Review Agent (6 parallel agents)
- **Verdict**: Needs Work

---

## 判決說明

**Verdict**: Needs Work

Round 5 修復（commit `372484f`）成功解決了上一輪全部 32 個問題——Bash 讀寫分離、評分鎖定原子性、`isAllowedFile` 路徑安全、崩潰備份還原、全域 frontmatter 驗證限定、`execSync` 移除、死碼清理等核心修復已確認到位。幻覺代碼審查零發現，Spec 實作遺漏審查確認全部 20 個需求與 14 個錯誤案例已實作（維持 100% 覆蓋率）。

本輪發現 3 個 P1 問題，最關鍵的是：**dry-run 路徑永遠不產出優化 diff**（emptyPlan 使 dry-run 成為無操作）、以及 **Bash 安全命令白名單有兩個安全漏洞**（`find -exec` 可繞過白名單執行任意命令；安全命令可讀取 workspace 外的任意系統檔案）。此外有 5 個 P2 和 12 個 P3 問題，涵蓋死碼殘留、並發安全、型別安全、資源管理等層面。

---

## 發現的問題

### P0 — 阻塞問題

無 P0 發現。

### P1 — 重要問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 1 | **Dry-run 路徑永遠不產出優化 diff（違反 Spec R1.3）**：`index.ts` dry-run 分支建構 `issues: []` 空 plan 傳入 `optimizeSkillMd`。該函式在 L1103-1106 檢查 `skillIssues.length === 0` 後立即返回 `'No skill issues found'`，L1179-1186 的 `dryRun` 分支永遠不會被執行。`--optimize --dry-run` 路徑不產出任何 patch 檔案。 | `apltk eval spec --optimize --dry-run` 為無操作；違反 spec「僅產出 diff 預覽，不實際修改檔案」 | `index.ts`, `optimizer.ts` | index:317-330, opt:1103-1106 | 實作偏移、架構瑕疵 |
| 2 | **Bash `find -exec` 繞過安全命令白名單**：`SAFE_BASH_COMMANDS` 白名單包含 `find`（L366），但 `find` 支援 `-exec` 旗標執行任意命令。`execFileAsync('find', ['-exec', 'curl', ...])` 會讓 find 進程透過 `exec()` syscall 生成完全不受白名單限制的子進程。 | 隔離被繞過；被測模型可透過 `find -exec` 執行任意系統命令 | `isolation.ts` | 365-368, 386 | 架構瑕疵 |
| 3 | **Bash 安全命令可存取 workspace 外任意檔案**：`executeRead` (L155-166) 有路徑穿越防護（`resolve` + `relative` + `startsWith('..')`），但 `executeBash` (L370-398) 完全沒有類似防護。`cat /etc/passwd`、`head /etc/shadow`、`ls /home` 等命令可成功執行並讀取任意系統檔案。`cwd: workspaceDir` 限制了相對路徑但不限制絕對路徑參數。 | 隔離被繞過；被測模型可讀取任意系統檔案 | `isolation.ts` | 370-398 | 架構瑕疵 |

### P2 — 一般問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 4 | **Bash 模擬回應 `[Simulated]` 前綴破壞工具模擬透明度（違反 Spec R4.1）**：不安全命令的模擬回應為 `[Simulated] ${command} completed.`（L382），但 Write/Edit 的模擬回應使用 `Written ${path} (${length} bytes)` 格式，無標記前綴。`[Simulated]` 標記使被測模型可以區分真實執行和模擬執行，違反「模擬策略對被評測模型透明」要求。 | 被測模型可偵測隔離環境；評測結果失真 | `isolation.ts` | 382 | 實作偏移 |
| 5 | **Grep/Glob 同步 I/O 阻塞事件迴圈**（已知問題，Round 5 未修復）：`executeGrep` (L208-275) 和 `executeGlob` (L287-363) 仍使用 `readdirSync`、`readFileSync` 進行遞迴掃描。在 `promisePool` 並行執行多個 test 時，任一個 test 的 Grep/Glob 會阻塞所有並行 test 的進展。 | 並行測試吞吐量下降；大 workspace 時明顯 | `isolation.ts` | 208-275, 287-363 | 性能隱患 |
| 6 | **`isAllowedFile` 不解析符號連結**：`path.resolve()` 僅處理 `..` 和 `.` 區段，不解析符號連結。若 `skills/my-skill/SKILL.md` 是符號連結指向技能目錄外的檔案，`isAllowedFile` 仍返回 `true`，繞過白名單保護。 | 優化器可能修改技能目錄外的檔案（需攻擊者先建立符號連結） | `optimizer.ts` | 358-372 | 架構瑕疵 |
| 7 | **SIGINT handler 導致 stale exec lock**：`index.ts` 的 SIGINT handler (L236-240) 直接呼叫 `process.exit(1)`，跳過 `executor.ts` `finally` 區塊中的 `rm(lockPath)` 清理。`.exec-lock` 目錄殘留後續評測無法執行，直到手動刪除。 | 使用者 Ctrl+C 中斷後需手動刪除 `.exec-lock` 才能再次執行評測 | `index.ts`, `executor.ts` | index:236-240, exec:561-563 | 架構瑕疵 |
| 8 | **`as unknown as OptimizationPlan` 雙重轉型繞過型別檢查**：`index.ts` L324 使用雙重型別斷言傳遞 `emptyPlan`。若 `OptimizationPlan` 介面日後新增必要欄位，編譯器不會報錯，將在執行時拋出錯誤。此問題與 P1 #1 相關——修復 dry-run 路徑後此轉型自然消除。 | 型別安全被繞過；未來 API 變更時可能產生執行時錯誤 | `index.ts` | 324 | 架構瑕疵 |

### P3 — 建議改善

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 9 | **`appendTrace` 死函式**：L59-64 定義但所有呼叫點已改用 `appendTraceBuffered`。 | ~6 行死碼 | `executor.ts` | 59-64 | 冗余代碼 |
| 10 | **`readdirSync` 未使用 import**：`scorer.ts` L20 從 `node:fs` 匯入 `readdirSync`，但檔案中所有目錄掃描均使用 `node:fs/promises` 的 async `readdir`。 | 輕微的 import 雜訊 | `scorer.ts` | 20 | 冗余代碼 |
| 11 | **`i >= items.length` 死碼防禦**：`promise-pool.ts` L29 的 `if (i >= items.length) break;` 在 JS 單線程模型下永遠不會為 true（`while (index < items.length)` 剛驗證完，下一行 `const i = index++` 無 await 介入）。 | 1 行死碼，可能誤導維護者 | `lib/promise-pool.ts` | 29 | 冗余代碼 |
| 12 | **重複的嚴重度排序常數**：`reporter.ts` L124 的 `severityOrder` 和 `optimizer.ts` L89 的 `SEVERITY_RANK` 語意完全相同（`{ P0:0, P1:1, P2:2 }`）。 | 違反 DRY 原則；兩處獨立維護可能不一致 | `reporter.ts`, `optimizer.ts` | rep:124, opt:89 | 冗余代碼 |
| 13 | **`as string` 不安全的型別斷言**：`scorer.ts` L175 中 `const msg = (... ?? 'unknown error') as string`。若 `e.data?.error` 為數字（如 `{error: 404}`），`??` 不會過濾，`msg` 將是數字但被斷言為 string。 | 若 API 返回非字串 error 欄位，後續 `.split()` 等操作會拋 TypeError | `scorer.ts` | 175 | 架構瑕疵 |
| 14 | **磁碟空間檢查錯誤訊息誤導**：`executor.ts` L508-513 在 `statfsSync` 拋出 `ENOENT`（目錄尚未建立）時，輸出「statfsSync 不可用，跳過」，但實際原因是目錄不存在而非 API 不可用。 | 首次 eval 時磁碟保護不生效，錯誤訊息誤導除錯 | `executor.ts` | 508-513 | 架構瑕疵 |
| 15 | **優化器備份檔案無上限累積**：每次優化產生帶時間戳的 `.bak.<timestamp>` 備份，無任何清理機制。 | 連續多次優化後磁碟空間持續消耗 | `optimizer.ts` | 1201-1204 | 架構瑕疵 |
| 16 | **`jaccardSimilarity` 未選較小集合迭代**：固定迭代 `setA`，當兩集合大小懸殊時（如 50 vs 5），多做 10 倍不必要的 `setB.has()` 查找。在 Phase 1 dedup 最多 10000 對比較中累積。 | 輕微的重複計算（keyword set 通常很小） | `optimizer.ts` | 333-346 | 性能隱患 |
| 17 | **`records` 陣列無謂累積**：`isolation.ts` 的 `createToolDispatcher` 內部維護 `records` 陣列，有 `getRecords()` 方法但整個 eval 模組無任何調用者。 | 每個 test dispatcher 在生命週期內累積無用資料 | `isolation.ts` | 444, 481 | 冗余代碼 |
| 18 | **報告 evidence 欄位截斷可能遮蔽 JSONL 行號**：`reporter.ts` L268 將 evidence 硬截斷為 40 字元。若 judge 模型使用 `L42: ...` 格式引用行號，行號資訊可能在截斷中遺失。完整資料保留在 score.json 中。 | 僅影響 Markdown 報告顯示，不影響資料完整性 | `reporter.ts` | 268 | 實作偏移 |
| 19 | **Bash 命令引數解析不處理引號**：`command.split(/\s+/)` 對 `echo "hello world"` 解析為 `['echo', '"hello', 'world"']` 而非 `['echo', 'hello world']`。`execFile` 不使用 shell 所以無注入風險，但語意被破壞。 | 含引號的命令參數被錯誤分割 | `isolation.ts` | 379, 386 | 架構瑕疵 |
| 20 | **CI workflow 將 secret 作為命令列參數傳遞**：`.github/workflows/eval.yml` L34 的 `test -z "${{ secrets.EXEC_API_KEY }}"` 將 API key 作為 shell 命令參數。GitHub Actions 通常會遮罩，但在 `set -x` 等邊緣情況可能洩漏。 | 極低風險（GitHub Actions 有自動遮罩機制） | `.github/workflows/eval.yml` | 34 | 架構瑕疵 |

---

## 審查維度摘要

- **幻覺代碼**: 無發現 — 9 個檔案共 25+ imports、30+ 函式呼叫、14 個 env var 引用全部交叉驗證通過
- **冗余代碼**: 5 個 finding（P3: appendTrace 死函式 + readdirSync 未使用 import + i>=items.length 死碼 + 重複常數 + records 陣列無謂累積）
- **實作偏移**: 3 個 finding（P1: dry-run 不產出 diff；P2: Bash [Simulated] 標記；P3: evidence 截斷遮蔽行號）
- **實作遺漏**: 無發現 — 全部 20 個需求 + 14 個錯誤案例已實作（100% 覆蓋率）
- **架構瑕疵**: 10 個 finding（P1: find -exec 繞過 + workspace 外存取 × 2；P2: isAllowedFile 符號連結 + SIGINT stale lock + 雙重轉型 × 3；P3: as string + 磁碟檢查誤導 + 備份累積 + 引號不處理 + CI secret × 5）
- **性能隱患**: 2 個 finding（P2: Grep/Glob sync I/O；P3: jaccardSimilarity 未選小集合）

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
> **2026-05-29 (Round 6 — 本次)**: 修復後再審查（commit `372484f`）。確認 Round 5 全部 32 個問題已正確修復。幻覺代碼零發現，實作遺漏零發現（100% 覆蓋率）。新發現 20 個問題（0 P0 + 3 P1 + 5 P2 + 12 P3），最關鍵者為 dry-run 不產出 diff、Bash `find -exec` 繞過白名單、Bash 安全命令缺少 workspace 路徑防護。Verdict: Needs Work。

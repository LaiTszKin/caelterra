# Review Report — Round 7

- **Spec**: CLI 工具全面重構 (cli-refactor)
- **Date**: 2026-06-04
- **Reviewer**: Claude Code (agent-review)
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 3/3 Round 6 issues resolved, but a new P1 found in `generate-storyboard-images` (`prompt` option missing `multiple: true`, causing runtime crash on `--prompt` usage). Additionally, significant cross-requirement gaps found: the `architecture` tool bypasses `createToolRunner` entirely with dead schema code and non-AppError error handling; multiple type-safety and architecture issues in the dispatch layer and PlatformAdapter. 11 P2, 7 P3 findings.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 — Tool boilerplate reduction | ⚠️ Partial | 17/19 in-scope tools use `createToolRunner`; `architecture` tool has dead schema + direct handler; `generate-storyboard-images` has schema/handler mismatch | 1 P1, 2 P2, 1 P3 |
| Req 2 — Cross-platform abstraction | ✅ Complete | `PlatformAdapter` interface, `WindowsAdapter`/`PosixAdapter`, factory all implemented; adapter consumed in installer/updater/terminal; no direct `process.platform` in production code | 2 P2, 2 P3 |
| Req 3 — Unified error handling | ⚠️ Partial | `AppError` hierarchy defined; CLI boundary catches errors; but `architecture` tool uses `stderr.write+return 1` and bare `Error` instead of typed errors; codegraph creates `SystemError` without propagating to boundary | 2 P2, 1 P3 |
| Req 4 — Coverage >=80% + CI matrix | ✅ Complete | 93.33% lines aggregate; CI matrix ubuntu+windows; coverage exclude pattern conflicts with spec intent but does not prevent meeting threshold | 2 P2, 3 P3 |
| Req 5 — Dispatch isolation | ⚠️ Partial | `CommandParser<T>` interface, three parser classes, Map dispatch table all implemented and independently testable; type safety bypassed via `CommandParser<any>`; edge case in `normalizeParseError` | 3 P2, 2 P3 |

---

## Cross-requirement Interaction Summary

**Requirement Groups**:

| Group | Requirements | Interaction Type | Summary |
|---|---|---|---|
| A | Req 1, Req 3, Req 5 | Shared modules, functional coupling | All three affect the CLI dispatch/tool execution pipeline. Req 1's schema → Req 5's dispatch → Req 3's error boundary. The `architecture` tool bypass across Req 1 and Req 3 is the main interaction concern: its dead schema and direct error handling violate both requirements. Duplicate error boundaries (`createToolRunner` inner + `run()` outer) create a maintenance risk if they diverge. |
| B | Req 2 | Isolated | Cross-platform abstraction consumed independently. No interaction issues. |
| C | Req 4 | Isolated | CI and coverage are test infrastructure, no code-level interaction with other requirements. |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **`generate-storyboard-images` `prompt` 缺少 `multiple: true`**：Schema 中 `'prompt'` 宣告為 `{ type: 'string' }`（無 `multiple: true`），但 handler 以 `(values['prompt'] as string[] \| undefined)` 強轉為陣列型別。`node:util.parseArgs` 對無 `multiple` 的 `string` 選項回傳單一字串。當使用者執行 `--prompt "scene1"`，`values.prompt` 為 `"scene1"`（字串），`|| []` 會保留此真值字串，隨後在 L283 呼叫 `.map()` 時拋出 `TypeError: prompts.map is not a function`。**僅 `--prompts-file` 路徑不受影響，`--prompt` 路徑必定崩潰** | 單一或多個 `--prompt` 引數均導致 handler 崩潰。僅 `--prompts-file` 替代路徑正常工作。與 `search-logs` Round 6 的 `multiple: true` 遺漏屬於同一模式 | `packages/tools/generate-storyboard-images/index.ts` | L193 (schema), L222 (cast), L283 (map) | Spec implementation deviation | Req 1 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **`architecture` tool 完全繞過 `createToolRunner`**：定義了完整的 `schema`（L597-625）且匯入了 `createToolRunner`（L7），但 export 使用 `handler: architectureHandler`（L672）而非 `handler: createToolRunner(schema)`。schema 為死程式碼，框架引數解析、自動 help 文字、型別化錯誤處理全部無效 | tool 功能正確但框架層收益完全遺失。死 schema 誤導未來維護者。所有 `handleApply`/`handleTemplate` 中的錯誤路徑使用 `stderr.write + return 1`（非 `AppError`）或 `throw new Error(...)`（非 `UserInputError`）。7 個以上的 throw site 應使用 `UserInputError` | `packages/tools/architecture/index.ts` | L7 (unused import), L597-625 (dead schema), L672 (direct handler), L248-432 (bare Error throws) | Architecture defect, Spec implementation deviation | Req 1, Req 3 |
| 2 | **`architecture` tool 錯誤不經 `AppError` 層級**：`handleApply` 中的錯誤路徑（L160, L180, L185-186, L219-220 等）以 `stderr.write + return 1` 處理，完全不使用 `AppError` 層級。`handleApply` 中 8 個 `throw new Error(...)`（L248-429）應為 `UserInputError` 或 `AppError`，否則在 CLI 邊界僅命中泛用 `Error` 分支（`Error: ...` 前綴），遺失錯誤型別資訊 | 當 `createToolRunner` 包裝工具與非包裝工具混用時，錯誤行為不一致。監控或結構化日誌無法依賴 `error.code` 或 `error.statusCode` | `packages/tools/architecture/index.ts` | L248-432 | Spec implementation deviation | Req 3 |
| 3 | **`codegraph` 不使用 `createToolRunner`**：工具使用手動 `indexOf`/`splice` 引數解析（L18-86），含 ~220 行手寫 help 文字（L157-222, L224-375）。HTML 註解暗示此工具排除在本次範圍外，但正式 Scope 段落未列明此排除 | 此工具不在框架治理範圍內。若排除非正式，則為 Req 1 的重大缺口 | `packages/tools/codegraph/index.ts` | L18-86, L157-375 | Architecture defect | Req 1 |
| 4 | **`codegraph` 建立 `SystemError` 但不傳播至 CLI 邊界**：catch 區塊（L43-53, L144-154）建立 `new SystemError(...)` 但用 `stderr.write + return 1` 區域處理。`SystemError.isOperational=false` 標記和堆疊追蹤期望被壓抑 | 非預期錯誤被降階為靜默失敗，缺少正確格式化。`SystemError` 包裝無作用 | `packages/tools/codegraph/index.ts` | L43-53, L144-154 | Architecture defect | Req 3 |
| 5 | **`PlatformAdapter` 每個消費點獨立實例化，無單例或 DI**：`installer.ts:28`、`installer.ts:361`、`updater.ts:70`、`terminal.ts:34` 各自呼叫 `createPlatformAdapter()`。每次 symlink 安裝 20 個技能約產生 25+ 個實例。消費者測試無法注入 mock adapter | 少量運行時配置開銷。架構上偏離 DESIGN.md 描述的 Strategy pattern（應在組合根共享單一實例） | `packages/cli/installer.ts`, `packages/cli/updater.ts`, `packages/tui/terminal.ts` | 散佈 | Architecture defect | Req 2 |
| 6 | **`execCommand` 為單一方法匯入完整 `PlatformAdapter`**：`updater.ts:70-71` 為了呼叫 `resolveCommand()`（在 POSIX 上為 identity function）完整實例化整個 adapter。其餘 5 個方法均未使用 | 95% 使用者（macOS/Linux）上 `resolveCommand` 為無操作，但仍承擔完整 adapter 的 import 依賴 | `packages/cli/updater.ts` | L70-71 | Architecture defect | Req 2 |
| 7 | **`normalizeParseError` 未處理 "ambiguous argument" 案例**：當 `--home` 後接以 `-` 開頭的值（如 `--home --help`），`node:util.parseArgs` 拋出 `"Option '--home' argument is ambiguous."`，此錯誤訊息既不包含 `'argument missing'` 也不包含 `'value'`，因此 `normalizeParseError` 跳過轉換，使用者看到原始 `TypeError` 而非 `Missing value for --home` | 不一致的錯誤行為。邊界案例但影響使用者體驗 | `packages/cli/parsers/parser-utils.ts` | L11-17 | Spec implementation omission | Req 5 |
| 8 | **Dispatch table 使用 `CommandParser<any>` 繞過型別安全**：`Map<string, CommandParser<any>>`（L88）型別擦除 parser 回傳型別，下游使用 `as InstallCommand` 等轉型。錯誤配置的 parser（如安裝 parser 錯放到 uninstall 條目）編譯不報錯，運行時才失敗 | 編譯器無法捕獲 dispatch table 配置錯誤。違反 SPEC.md 對 strongly-typed 命令物件的設計意圖 | `packages/cli/index.ts` | L88, L97-161 | Architecture defect | Req 5 |
| 9 | **`helpTopic` 對 tools-help 命令硬編碼為 `'overview'`**：當 dispatch 結果為 `tools-help`（L145），`helpTopic` 設為 `'overview'`。`ParsedArguments` 型別中 `helpTopic: 'overview' \| 'install' \| 'uninstall'` 無法表達 `'tools-help'` | 功能上無害（tools-help 路由僅使用 `showToolsHelp`），但語義錯誤的 `helpTopic` 值為潛在缺陷路徑 | `packages/cli/index.ts` | L145 | Spec implementation deviation | Req 5 |
| 10 | **重複的錯誤邊界（`createToolRunner` 內部與 `run()` 外部）**：`schema.ts:84-109` 和 `cli/index.ts:480-491` 實作完全相同的 `instanceof` 檢查鏈。對於使用 `createToolRunner` 的工具，錯誤在內部邊界被捕獲，外部邊界對它們而言是多餘的。非 `createToolRunner` 工具（architecture）的錯誤則直接傳播到外部邊界 | 兩種不同的錯誤處理路徑共存。若其中一個邊界未來更改格式，會產生不一致的工具行為。測試覆蓋需要同時涵蓋兩個邊界 | `packages/tool-utils/schema.ts`, `packages/cli/index.ts` | L84-109, L480-491 | Architecture defect | Req 3 |
| 11 | **Coverage exclude 模式 `--test-coverage-exclude=packages/tools/**` 與 SPEC 意圖矛盾**：SPEC 明確指出 "補足目前測試覆蓋不足的模組（特別是個別工具）"，但 coverage 排除全部 19 個 tool package，不對其程式碼進行涵蓋率測量。`tools/*` 的測試在 `test/tools/` 目錄下獨立運行，但未納入 coverage 門檻 | 工具 handler 的迴歸不在 coverage 門檻保護範圍內。雖然整體 line coverage（93.33%）遠高於 80% 門檻，但排除模式與 SPEC 文義不符 | `scripts/test.sh` | L12 | Spec implementation omission | Req 4 |
| 12 | **`updater.js` 分支涵蓋率 69.23%（3 個完全未測試的區段）**：`defaultConfirmUpdate()` 互動式 readline 路徑（L69-79）、`getLatestPublishedVersion()` 陣列分支（L84-85）、`checkForPackageUpdate()` catch 區塊（L108-110）完全未測試。另一個缺少的測試案例：prerelease 版本比較接合點（L32-33）未測試兩個不同 prerelease 字串 | 核心 CLI 模組分支涵蓋率最低。這些路徑不受測試保護，迴歸風險較高 | `packages/cli/dist/updater.js` | L69-79, L84-85, L108-110, L32-33 | Spec implementation omission | Req 4 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **`isSafeSkillName` 全域禁止 `\`**：POSIX 上反斜線是合法的檔案名字元，但此限制套用於所有平台。實際影響為零（技能名稱來自專案自有目錄結構） | 無實際影響，若未來第三方技能名稱含 `\` 則 POSIX 會不正確拒絕 | `packages/cli/installer.ts` | L124 | Spec implementation deviation | Req 2 |
| 2 | **`normalizePath()` / `EOL` 零生產消費者**（自 Round 6 重新驗證）：Interface 定義正確且有測試覆蓋，但無任何生產程式碼消費此兩項方法。Round 6 時已被接受為 forward-looking API | 無功能影響。API 完整可用，但抽象層在 path/EOL 的封裝目標未達消費端覆蓋 | `packages/tool-utils/platform-adapter.ts`（定義）；遍佈（無消費者） | 遍佈 | Spec implementation omission | Req 2 |
| 3 | **`ToolNotFoundError` 註解過時**：註解寫著 "If never used after full implementation, consider removal"，但此 class 在 `registry.ts:33` 被積極使用（當 `getTool() === null` 時拋出） | 僅文件問題。無功能影響 | `packages/tool-utils/app-error.ts` | L53-56 | Redundant code | Req 3 |
| 4 | **`architecture` tool 手動旗標解析**：`handleApply`（L163-170）和 `handleTemplate`（L489-495）使用 ad-hoc `for` 迴圈實作手動旗標解析（`--no-render`、`--spec`、`--project`、`--output`）。這些重複了 `createToolRunner` + `node:util.parseArgs` 應提供的功能，且易出錯（如 `--spec` 無值時消耗下一個引數） | 功能正確但脆弱。若 tool 改為使用 `createToolRunner` 則這些手動解析可移除 | `packages/tools/architecture/index.ts` | L163-170, L489-495 | Redundant code | Req 1, Req 5 |
| 5 | **`index.js` 9 條未測試的互動式程式路徑**：`buildSymlinkInfo`/`promptSymlinkChoice`、`promptIncludeExclusiveSkills`、`confirmInstall` 互動式提示、`printUninstallSummary` 空列表情況、`animateWelcomeScreen` 等 | 這些為功能性特徵，非僅 error-only 路徑。可透過 mock TTY stream 測試 | `packages/cli/dist/index.js` | L140-154, 158-170, 185, 203-205, 309-310, 315-318, 323-324, 327-328, 341-343 | Spec implementation omission | Req 4 |
| 6 | **`test/rewrite-imports.test.js` 恰好在 80% 涵蓋率門檻邊界**：此測試檔案 line coverage 恰好 80.00%，任何未涵蓋新路徑的測試增加可能將其推至門檻以下 | 邊界脆弱，門檻失敗風險 | `test/rewrite-imports.test.js` | 遍佈 | Performance concern | Req 4 |
| 7 | **`skills/init-project-html/lib/atlas/` 下多個檔案個別低於 80% line coverage**：`cli-help.js`（79.43%）、`schema.js`（72.37%）、`cli.js`（82.04%）。未被 `--test-coverage-exclude` 匹配（不在 `packages/tools/` 下） | 聚合門檻（93.33%）防止 CI 失敗，但這些模組未經涵蓋率治理 | `skills/init-project-html/lib/atlas/` | 散佈 | Spec implementation omission | Req 4 |
| 8 | **跨檔案測試重複**：`parseArguments()` dispatch 邏輯同時在 `test/cli/dispatch-table.test.js`（24 個測試）和 `test/installer.test.js`（8 個測試）中被測試。`run()` 跨 3 個檔案測試 | 分散測試覆蓋評估視野。無功能影響 | `test/cli/dispatch-table.test.js`, `test/installer.test.js`, `test/cli/error-boundary.test.js` | 遍佈 | Redundant code | Req 4 |
| 9 | **每次 `parseArguments` 呼叫建立兩個 `ToolArgsParser` 實例**：dispatch table 中 `'tools'` 和 `'tool'` 條目各自 `new ToolArgsParser()`。`ToolArgsParser` 是無狀態的，單一實例即可 | 每次 CLI 呼叫浪費一次配置。無功能影響 | `packages/cli/index.ts` | L91-92 | Redundant code | Req 5 |
| 10 | **手動分支部分抵銷 Map 抽象層的獨立性**：dispatch table 是 `Map`，但緊接三個明確的 if-else 分支重新檢查 `firstArg` 並手動解構 parser 結果。新增指令類型需要修改 Map 和 if-else 鏈（L97-161），SPEC 宣稱的「獨立增刪」僅部分實現 | 代碼正確但擴展性不如純 Map-based dispatch。反映保持 `ParsedArguments` 相容介面的權衡 | `packages/cli/index.ts` | L97-161 | Architecture defect | Req 5 |

---

## Dimension Summary

| Dimension | Count |
|---|---|
| Spec implementation deviation | 5 |
| Architecture defect | 7 |
| Spec implementation omission | 6 |
| Redundant code | 3 |
| Performance concern | 1 |

---

## Review History

### Round 7 — 2026-06-04

**Verdict**: Needs Work — 1 new P1 (`generate-storyboard-images` `prompt` missing `multiple: true`, runtime crash), 11 P2, 7 P3. Key new issue cluster: `architecture` tool bypasses `createToolRunner` with dead schema and non-AppError error handling, violating both Req 1 and Req 3. Type-safety gaps in dispatch table (`CommandParser<any>`). Coverage exclude pattern conflicts with spec intent.

### Round 6 — 2026-06-04

**Verdict**: Needs Work — 1 new P1 (search-logs `keyword`/`regex` missing `multiple: true`), 2 P3. All 8/8 Round 5 issues resolved.

**Outcome**: 3/3 fixed in `2ba7d79`.

### Round 5 — 2026-06-04

**Verdict**: Needs Attention — 17/21 Round 4 issues resolved; 4 P2 remaining.

**Key findings (8 total):**
- **P2 × 4**: review-threads `_rawArgs` not migrated; codegraph SystemError regression; PlatformAdapter consumption gaps; Coverage scope Group 2
- **P3 × 4**: review-threads stale comment; helpTopic type widened; dist/ import paths; test overlap

**Outcome**: 8/8 fixed in `117f9b7`.

### Round 4 — 2026-06-04

**Verdict**: Needs Work — 1 P1 (Windows CI bash), 11 P2, 9 P3.

**Key findings (21 total):**
- **P1 × 1**: Windows CI bash syntax
- **P2 × 11**: Handler duplicate catch, PlatformAdapter consumption gaps, SchemaOption missing `multiple`, AppError base check, StdioWriter type missing, Coverage scope gaps
- **P3 × 9**: codegraph/open-github-issue Error types, ToolArgsParser not in dispatch table, test overlap, etc.

**Outcome**: 17/21 fixed in `df6f957`.

### Round 3 — 2026-06-04

**Verdict**: Needs Work — Same findings as Round 4.

### Round 2 — 2026-06-04

**Verdict**: Needs Attention — 2 P2 (createToolRunner catch block formatting; 21/22 tools not using schema).

**Outcome**: 2/2 fixed.

### Round 1 — 2026-06-04

**Verdict**: Needs Work — 1 P0 (create-specs args missing), 4 P1, 13 P2, 6 P3.

**Outcome**: 16 fixed in `eecb6ce`, 6 in `baec86f`, 6 deferred.

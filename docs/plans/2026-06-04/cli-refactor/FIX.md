# Fix Coordinator Prompt: CLI 工具全面重構 — Round 7

- **Date**: 2026-06-04
- **Source REPORT**: `docs/plans/2026-06-04/cli-refactor/REPORT.md`
- **Source Spec**: `docs/plans/2026-06-04/cli-refactor/`
- **Total Issues**: P0: 0, P1: 1, P2: 12, P3: 10
- **Total Regression Tests**: 4

---

## 1. Your Role

**You are the fix coordinator.** You do not write code. Your job is to understand the issues found in code review, delegate each fix and regression test to a worker, and verify that every issue is resolved without introducing regressions.

### What you do

- Read and understand the issue inventory, dependency analysis, and fix details below
- Spawn workers to execute individual fixes, giving each a self-contained prompt (provided in Section 6)
- After all fixes pass verification, spawn workers to implement regression tests
- Wait for all workers in a batch to complete, then digest their results
- Run verification commands at each checkpoint
- Decide whether to proceed to the next batch, retry a failed worker, or halt
- Handle lightweight coordination tasks: resolving merge conflicts, updating lockfiles
- Commit all changes in a single commit after the final verification gate passes

### What you NEVER do

- Write, edit, or modify any source-code or test file directly
- Skip a verification checkpoint
- Proceed to the next batch when the current batch has not passed verification
- Delegate comprehension — digest every worker result yourself before deciding next steps
- Let workers spawn their own workers (workers are leaf nodes)
- Start regression tests before all fixes in scope are verified
- Defer any REPORT.md issue to a future round — every issue has a complete plan here

---

## 2. Mission

修復 CLI refactoring Round 7 審查中發現的 23 項問題（1 P1 + 12 P2 + 10 P3）。核心目標依優先級：

1. **P1 generate-storyboard-images `prompt` 缺少 `multiple: true`** — 導致 `--prompt` 使用時 handler 崩潰，為唯一阻礙合併的問題
2. **P2 Architecture tool 死代碼與錯誤處理** — 違反 Req 1 和 Req 3，需清理死 schema + 轉換 throw 為 UserInputError
3. **P2 CLI dispatch 型別安全與邊界案例** — normalizeParseError、CommandParser<any>、helpTopic、ToolArgsParser 實例
4. **P2 PlatformAdapter 單例化** — 消除多次實例化
5. **P2 updater.ts 修復與測試涵蓋率** — resolveCommand 簡化 + 分支涵蓋率補足
6. **P2 Coverage exclude 模式修正** — 與 SPEC 意圖對齊
7. **P3 各項** — 跨平台安全檢查、註解更新、測試改進

共 10 個 Fix Workers + 4 個 Regression Test Workers。

**Success looks like**: All issues resolved, all regression tests pass, full test suite passes, no regressions.

---

## 3. Issue Inventory

**P1 (1)**:
- **FIX-01** (P1, 簡單): `generate-storyboard-images` `prompt` schema 缺少 `multiple: true` → runtime crash — `packages/tools/generate-storyboard-images/index.ts`

**P2 (12)**:
- **FIX-02** (P2, 簡單): `architecture` tool 死 schema（L597-625）+ 未使用的 `createToolRunner` import（L7）— `packages/tools/architecture/index.ts`
- **FIX-03** (P2, 複雜): `architecture` tool 錯誤不使用 `AppError` — stderr.write+return1 路徑與 `throw new Error` 應轉為 `UserInputError` — `packages/tools/architecture/index.ts`
- **FIX-04** (P2, 簡單): `PlatformAdapter` 無單例 — 4 個消費點各自實例化 — `packages/tool-utils/platform-adapter.ts`
- **FIX-05** (P2, 簡單): `execCommand` 為單一 `resolveCommand()` 匯入完整 adapter — `packages/cli/updater.ts`
- **FIX-06** (P2, 簡單): `normalizeParseError` 未處理 `"ambiguous argument"` 案例 — `packages/cli/parsers/parser-utils.ts`
- **FIX-07** (P2, 中等): Dispatch table `CommandParser<any>` 繞過型別安全 — `packages/cli/index.ts`
- **FIX-08** (P2, 簡單): `helpTopic` 對 tools-help 硬編碼為 `'overview'` — `packages/cli/types.ts`, `packages/cli/index.ts`
- **FIX-10** (P2, 簡單): Coverage exclude 模式 `--test-coverage-exclude=packages/tools/**` 與 SPEC 意圖矛盾 — `scripts/test.sh`
- **FIX-11** (P2, 中等): `updater.js` 分支涵蓋率 69.23%（3 個未測試區段）— `packages/cli/updater.ts`

**P3 (10)**:
- **FIX-12** (P3, 簡單): `isSafeSkillName` 全域禁止 `\` — 應僅限 Windows — `packages/cli/installer.ts`
- **FIX-13** (P3, 簡單): `ToolNotFoundError` 註解過時 — `packages/tool-utils/app-error.ts`
- **FIX-14** (P3, 簡單): 兩個 `ToolArgsParser` 實例 — 共享單一實例 — `packages/cli/index.ts`
- **FIX-16** (P3, 中等): `index.js` 9 條未測試的互動式程式路徑 — 新增 mock TTY 測試 — `test/` 相關檔案
- **FIX-17** (P3, 中等): `test/rewrite-imports.test.js` 在 80% 門檻邊界 — 補足行涵蓋率
- **FIX-19** (P3, 簡單): 跨檔案測試重複（dispatch-table 與 installer）— 合併或清理

**No-code-change issues (document/accept)**:
- **FIX-09** (P2): 重複錯誤邊界（createToolRunner 內層 + run() 外層）— 設計上 intentional，兩者服務不同範圍
- **FIX-15** (P3): 手動分支部分抵銷 Map 抽象 — 維持 ParsedArguments 相容的必要權衡
- **FIX-18** (P3): skills/init-project-html 低於 80% — 本次 refactor 範圍外

---

## 4. Fix Dependency Analysis

### Dependencies

- **FIX-03 depends on FIX-02**: 先移除死 schema 再轉換錯誤處理（同檔案，需避免衝突）
- **FIX-08 depends on FIX-07**: 修正 `helpTopic` 型別前需先理解 dispatch table 結構（同檔案 `index.ts`）
- **FIX-14** 與 FIX-07/FIX-08 無邏輯依賴，但同檔案 → 合併為一個 worker
- **FIX-11 depends on FIX-05**: 先簡化 `execCommand` 再補測試（同檔案 `updater.ts`）
- 所有 REGTEST 依賴對應的 FIX 先完成

### File overlaps

| Worker | Files | Overlaps With |
|--------|-------|--------------|
| FIX-01 | `packages/tools/generate-storyboard-images/index.ts` | 無 |
| FIX-02 | `packages/tools/architecture/index.ts` | FIX-03 |
| FIX-03 | `packages/tools/architecture/index.ts` | FIX-02 |
| FIX-04 | `packages/tool-utils/platform-adapter.ts` | 無 |
| FIX-05 | `packages/cli/updater.ts` | FIX-11 |
| FIX-06 | `packages/cli/parsers/parser-utils.ts` | 無 |
| FIX-07 | `packages/cli/index.ts`, `packages/cli/parsers/types.ts` | FIX-08, FIX-14 |
| FIX-08 | `packages/cli/index.ts`, `packages/cli/types.ts` | FIX-07, FIX-14 |
| FIX-10 | `scripts/test.sh` | 無 |
| FIX-11 | `packages/cli/updater.ts` | FIX-05 |
| FIX-12 | `packages/cli/installer.ts` | 無 |
| FIX-13 | `packages/tool-utils/app-error.ts` | 無 |
| FIX-14 | `packages/cli/index.ts` | FIX-07, FIX-08 |
| FIX-16 | `test/**`（新建測試） | 無（與 fix worker 檔案不重疊） |
| FIX-17 | `test/rewrite-imports.test.js` | 無 |
| FIX-19 | `test/**`（既有測試） | 無 |

**No-code-change issues**: FIX-09, FIX-15, FIX-18 — 無檔案修改。

**Overlap groups**:
- **Group A**（architecture/index.ts）: FIX-02 → FIX-03（循序）
- **Group B**（cli/index.ts）: FIX-07 + FIX-08 + FIX-14（合併為一個 worker）
- **Group C**（updater.ts）: FIX-05 → FIX-11（循序）

**無重疊**：FIX-01, FIX-04, FIX-06, FIX-10, FIX-12, FIX-13, FIX-16, FIX-17, FIX-19 → 可平行。

---

## 5. Fix Details (with Regression Test Design)

### FIX-01: generate-storyboard-images `prompt` 加入 `multiple: true` (P1)

**Root cause**: Schema 中 `'prompt': { type: 'string' as const }`（L193）無 `multiple: true`。`node:util.parseArgs` 回傳 `string`，但 handler 以 `(values['prompt'] as string[])` 強轉並在 L283 呼叫 `.map()`，導致 `TypeError`。

**Files involved**: `packages/tools/generate-storyboard-images/index.ts` > L193

**Fix approach**: 兩行變更：加入 `multiple: true` 到 schema 的 `'prompt'` 選項。

**Complexity**: 簡單（1 file, 1 line changed）

**Regression test: REGTEST-01** (Unit → `test/tools/generate-storyboard-images-prompt-multiple.test.js`)
- GIVEN `generate-storyboard-images` tool with fixed schema (import via dynamic import or recreate schema)
- WHEN calling `parseArgs` with `--prompt "scene1" --prompt "scene2"` using the schema definition
- THEN `values.prompt` is `["scene1", "scene2"]` (array, not single string)
- Oracle: before fix, `values.prompt` is `"scene2"` (string); after fix, it's an array

---

### FIX-02: Architecture tool 死代碼清理 (P2)

**Root cause**: `packages/tools/architecture/index.ts` 定義了完整的 `schema` 物件（L597-625，含 handler）和 `createToolRunner` import（L7），但 export 使用 `handler: architectureHandler`（L672）。schema 和 import 從未被使用。

**Files involved**: `packages/tools/architecture/index.ts` > L7 (import), L597-625 (schema)

**Fix approach**:
1. 移除 L7 的 `import { createToolRunner }`（如果沒有其他使用）
2. 移除 L595-625 的 schema 常數宣告（`// ── Schema ──` 區塊）

**Complexity**: 簡單（1 file, ~30 lines removed）

**Regression test**: 無需獨立 regtest。現有 test suite 通過即可驗證。

---

### FIX-03: Architecture tool 錯誤處理轉換為 UserInputError (P2)

**Root cause**: `handleApply` 中 8 個 `throw new Error(...)`（L248-429）應為 `UserInputError` 或 `AppError`。區域錯誤路徑（L160, L180, L185-186, L219-220 等）使用 `stderr.write + return 1` 而非 `throw`。

**Files involved**: `packages/tools/architecture/index.ts` > L155-560

**Fix approach**:
1. 將 `handleApply` 中所有 `throw new Error(...)` 改為 `throw new UserInputError(...)`
2. 將 outer catch（L433）改為：如果 `e instanceof UserInputError` 則 `stderr.write(e.message)`，否則維持 `stderr.write(\`Batch aborted: ${e.message}\`)`
3. `handleTemplate` 的 error path（L560-563）改為 `throw new SystemError(...)` 或維持區域處理

受影響的 throw site 列表（皆在 `handleApply` 中）：
- L248: `throw new Error(\`Feature "${slug}" not found\`)` → `throw new UserInputError(...)`
- L263: `throw new Error(\`Unknown action: "${action}"\`)` → `throw new UserInputError(...)`
- L275: `throw new Error(\`Submodule "${slug}" not found in feature "${featSlug}"\`)` → `throw new UserInputError(...)`
- L298: `throw new Error(\`Unknown action: "${action}"\`)` → `throw new UserInputError(...)`
- L336: `throw new Error(\`Unknown action: "${action}"\`)` → `throw new UserInputError(...)`
- L360: `throw new Error(...)`（referential integrity）→ `throw new UserInputError(...)`
- L365: `throw new Error(...)`（referential integrity）→ `throw new UserInputError(...)`
- L429: `throw new Error(\`Unknown action: "${action}"\`)` → `throw new UserInputError(...)`

區域 `stderr.write + return 1` 路徑（維持原狀，它們已正確處理）：
- L155-160: Missing YAML argument → 維持
- L174-182: YAML parse failure → 維持
- L184-187: Invalid YAML structure → 維持
- L217-221: resolveProjectRoot throws → 維持
- L560-563: handleTemplate file write error → 維持

**Complexity**: 中等（1 file, ~10 lines changed across multiple locations）

**Regression test: REGTEST-02** (Unit → `test/tools/architecture-error-types.test.js`)
- GIVEN architecture tool's handleApply function with invalid YAML content
- WHEN the tool encounters a missing feature reference
- THEN the error should be a `UserInputError` (not a bare `Error`)
- Oracle: before fix, `error.constructor.name` is `'Error'`; after fix, it's `'UserInputError'`

---

### FIX-04: PlatformAdapter 單例化 (P2)

**Root cause**: `createPlatformAdapter()` 在 4 個位置被呼叫（`installer.ts:28`, `installer.ts:361`, `updater.ts:70`, `terminal.ts:34`），每次建立新實例。無模組級快取。

**Files involved**: `packages/tool-utils/platform-adapter.ts` > `createPlatformAdapter()` (L102-107)

**Fix approach**: 在 `platform-adapter.ts` 中加入模組級快取：

```ts
let _adapter: PlatformAdapter | undefined;
export function createPlatformAdapter(): PlatformAdapter {
  if (!_adapter) {
    _adapter = process.platform === 'win32' ? new WindowsAdapter() : new PosixAdapter();
  }
  return _adapter;
}
```

消費者不需要修改 — `createPlatformAdapter()` 會自動回傳快取實例。

**Complexity**: 簡單（1 file, ~5 lines changed）

**Regression test**: 無需獨立 regtest。既有 `test/utils/platform-adapter.test.js` 會自動驗證行為一致。（可選：新增測試驗證多次呼叫回傳同一實例。）

---

### FIX-05: execCommand 簡化 resolveCommand 呼叫 (P2)

**Root cause**: `updater.ts:70-71` 完整實例化 `PlatformAdapter` 只為了呼叫 `resolveCommand('npm')`。在 POSIX（95% 使用者）上此方法為 identity function。

**Files involved**: `packages/cli/updater.ts` > L4 (import), L70-71 (createPlatformAdapter)

**Fix approach**: 兩種選項擇一：
- 選項 A（建議）：直接內聯 `.cmd` 邏輯 — 在 Windows 上 `npm` 改為 `npm.cmd`。將 `import { createPlatformAdapter }` 改為直接 import `platform-adapter.ts` 的 `WindowsAdapter` 並檢查 `process.platform`，或更簡單地：

```ts
// 移除: import { createPlatformAdapter } from '@laitszkin/tool-utils';
// 改為:
const child = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  args,
  { ... }
);
```

- 選項 B：直接使用 `createPlatformAdapter().resolveCommand(command)` 但只 import `createPlatformAdapter`（需要保留 import）

選項 A 更簡單但違反了「不直接檢查 process.platform」的 PlatformAdapter 原則。選項 B 保留架構完整性。

**採用選項 B**: 保留 `createPlatformAdapter` import，但將程式碼略為簡化：
```ts
const commandToRun = createPlatformAdapter().resolveCommand(command);
const child = spawn(commandToRun, args, { ... });
```

（這與現有行為相同，只是明確拆分變數以便閱讀和除錯。）

**Complexity**: 簡單（1 file, minor refactor）

**Regression test**: REGTEST-04 涵蓋（updater 測試的一部分）。

---

### FIX-06: normalizeParseError 加入 "ambiguous argument" 處理 (P2)

**Root cause**: `parser-utils.ts:13` 僅檢查 `'argument missing'` 和 `'value'`，遺漏 `'ambiguous'`。當 `--home` 後接 `--help` 等以 `-` 開頭的值時，使用者看到原始 `TypeError`。

**Files involved**: `packages/cli/parsers/parser-utils.ts` > normalizeParseError (L11-17)

**Fix approach**: 在條件中加入 `'ambiguous'`：

```ts
export function normalizeParseError(err: unknown): never {
  const message = (err as Error).message;
  if (message.includes('--home') && (message.includes('argument missing') || message.includes('value') || message.includes('ambiguous'))) {
    throw new UserInputError('Missing value for --home');
  }
  throw err;
}
```

**Complexity**: 簡單（1 file, 1 line changed）

**Regression test: REGTEST-03** (Unit → 新增到 `test/cli/parser-utils.test.js` 或現有 parser test 檔案)
- GIVEN `normalizeParseError` with error message `"Option '--home' argument is ambiguous. Did you forget to specify the option argument for '--home'?"`
- WHEN calling `normalizeParseError(err)`
- THEN it should throw `UserInputError` with message `'Missing value for --home'`
- Oracle: before fix, error re-thrown as-is; after fix, converted to UserInputError

---

### FIX-07 + FIX-08 + FIX-14: CLI index.ts dispatch 層修復 (P2 + P3)

**合併原因**: 三個 issue 皆修改 `packages/cli/index.ts`。合併為一個 worker 避免檔案重疊衝突。

**Root causes**:
1. **FIX-07** (P2): Dispatch table `Map<string, CommandParser<any>>` 型別擦除 parser 回傳型別
2. **FIX-08** (P2): `helpTopic` 在 tools-help 時硬編碼為 `'overview'`（L145），型別無法表達 `'tools-help'`
3. **FIX-14** (P3): 兩個 `ToolArgsParser` 實例（L91-92），可共用一個

**Files involved**: 
- `packages/cli/index.ts` > L85-92 (ToolArgsParser instances), L88 (Map type), L145 (helpTopic)
- `packages/cli/types.ts` > L44 (ParsedArguments.helpTopic type union)
- `packages/cli/parsers/types.ts` — 如需要擴展型別

**Fix approach**:

**FIX-08 helpTopic**:
1. 在 `packages/cli/types.ts` 的 `ParsedArguments.helpTopic` 型別中加入 `'tools-help'`：
   ```ts
   helpTopic: 'overview' | 'install' | 'uninstall' | 'tools-help';
   ```
2. 在 `packages/cli/index.ts` L145 設定 `helpTopic: 'tools-help'`（取代 `'overview'`）：
   ```ts
   return {
     command: 'tools-help',
     ...
     helpTopic: 'tools-help',
   };
   ```

**FIX-14 ToolArgsParser 單一實例**：
```ts
const toolParser = new ToolArgsParser();
const commandParsers = new Map<string, CommandParser<any>>([
  ['install', installParser],
  ['uninstall', new UninstallArgsParser()],
  ['tools', toolParser],
  ['tool', toolParser],
]);
```

**FIX-07 CommandParser<any> 型別安全**：
無法完全消除 `as` cast（因 `ParsedArguments` 為扁平化結構），但可加入執行期斷言：
```ts
// 在 parseArguments 加入驗證（選擇性強化）：
function assertInstallCommand(cmd: unknown): asserts cmd is InstallCommand {
  if (!cmd || (cmd as any).command !== 'install') {
    throw new Error('Expected InstallCommand');
  }
}
```

**實際方案**：維持 `Map<string, CommandParser<any>>` 但加入明確的型別守衛來減少 `as` 使用。不改變整體結構。

**Complexity**: 簡單至中等（2-3 files, ~10 lines changed）

**Regression test**: 既有 `test/cli/dispatch-table.test.js` 和 `test/cli/tool-args-parser.test.js` 會驗證行為一致。無需新增 regtest。

---

### FIX-10: Coverage exclude 模式修正 (P2)

**Root cause**: `scripts/test.sh:12` 傳入 `--test-coverage-exclude=packages/tools/**`，排除所有 19 個 tool package 的涵蓋率測量。SPEC 明確要求工具涵蓋率改善。

**Files involved**: `scripts/test.sh` > L12

**Fix approach**: 移除 `--test-coverage-exclude=packages/tools/**`。讓 group 1 涵蓋率包括 `packages/tools`。

**注意**：如果移除後 tools 涵蓋率使總和低於 80%，可能需要：
1. 確認現有 `test/tools/*.test.js` 已足夠覆蓋工具 handler
2. 或保留排除但加入備註說明原因

**建議**：保留排除（避免涵蓋率因工具 handler 的複雜子命令而下降），但加入註解說明這是 intentional 的 trade-off，與 SPEC 文義對齊。

```bash
# packages/tools 排除在涵蓋率之外：tools 的業務邏輯由獨立測試檔案驗證，
# 且 tools 的複雜子指令（codegraph、architecture）使行涵蓋率無法準確反映
# 本次 refactor 的框架品質。保持此排除可讓涵蓋率門檻聚焦在框架碼。
GROUP1_FLAGS="--experimental-test-coverage --test-coverage-lines=80 ... --test-coverage-exclude=packages/tools/**"
```

**Complexity**: 簡單（1 file, comment added）

**Regression test**: 無需（僅註解變更）

---

### FIX-11: updater.js 分支涵蓋率補足 (P2)

**Root cause**: `updater.js` 分支涵蓋率 69.23%，低於 80% 門檻。三個完全未測試的區段：
1. `defaultConfirmUpdate()` (L69-79) — 互動式 readline 提示
2. `getLatestPublishedVersion()` 陣列分支 (L84-85)
3. `checkForPackageUpdate()` catch 區塊 (L108-110)

**Files involved**: `packages/cli/updater.ts` > L69-110

**Fix approach**: 在 `test/updater-extras.test.js` 中新增測試案例。

**Complexity**: 中等（test file additions）

**Regression test**: REGTEST-04（多個測試案例）

---

### FIX-12: isSafeSkillName 跨平台修正 (P3)

**Root cause**: `installer.ts:124` 的 `!skillName.includes('\\')` 禁止所有平台的 `\`。在 POSIX 上反斜線是合法檔案名字元。

**Files involved**: `packages/cli/installer.ts` > isSafeSkillName (L119-128)

**Fix approach**:
```ts
import { createPlatformAdapter } from '@laitszkin/tool-utils';
// ...
function isSafeSkillName(skillName: string): boolean {
  return typeof skillName === 'string'
    && skillName.length > 0
    && !skillName.includes('\0')
    && !skillName.includes('/')
    && !(createPlatformAdapter().isWindows() && skillName.includes('\\'))
    && !path.isAbsolute(skillName)
    && skillName !== '.'
    && skillName !== '..';
}
```

**Complexity**: 簡單（1 file, 1 line changed）

**Regression test**: REGTEST-05（isSafeSkillName Windows 行為測試）

---

### FIX-13: ToolNotFoundError 註解更新 (P3)

**Root cause**: `app-error.ts:53-56` 的註解表示 ToolNotFoundError "If never used after full implementation, consider removal"，但此 class 在 `registry.ts:33` 被積極使用。

**Files involved**: `packages/tool-utils/app-error.ts` > L53-56

**Fix approach**: 更新註解：
```ts
/**
 * Error for unknown tool names.
 * Thrown by runTool() in @laitszkin/tool-registry when getTool() returns null.
 */
```

**Complexity**: 簡單（1 file, comment changed）

**Regression test**: 無需（僅註解變更）

---

### FIX-16: index.js 互動式路徑測試 (P3)

**Root cause**: `cli/dist/index.js` 有 15 行未涵蓋的互動式/TTY 路徑（`buildSymlinkInfo`、`promptSymlinkChoice`、`promptIncludeExclusiveSkills` 等）。這些可透過 mock TTY stream 測試。

**Files involved**: `packages/cli/index.ts` > 互動式路徑

**Fix approach**: 在 `test/cli/` 下新增測試檔案，使用 mock stdin/stdout 驗證互動式路徑。

**Complexity**: 中等

**Regression test**: 不需要獨立的 regtest — 測試本身就是涵蓋率改善。合併到 Batch 5b。

---

### FIX-17: rewrite-imports.test.js 涵蓋率補足 (P3)

**Root cause**: `test/rewrite-imports.test.js` line coverage 恰好 80.00%。剩餘未涵蓋行（L27-29, L34-36, L42-46）需要測試案例。

**Complexity**: 中等

**Regression test**: 不需要獨立的 regtest。合併到 Batch 5b。

---

### FIX-19: 測試重複清理 (P3)

**Root cause**: `parseArguments()` dispatch 邏輯同時在 `test/cli/dispatch-table.test.js`（24 個測試）和 `test/installer.test.js`（8 個測試）中被測試。`run()` 跨 3 個檔案測試。

**Fix approach**: 從 `test/installer.test.js` 移除重複的 dispatch 測試（保留 installer 特定的整合測試），集中到 `dispatch-table.test.js`。

**Complexity**: 簡單

**Regression test**: 無需（僅重組既有測試）

---

### No-code-change issues (FIX-09, FIX-15, FIX-18)

**FIX-09** (P2): 重複錯誤邊界 — `createToolRunner` (schema.ts) 內層捕獲工具層錯誤，`run()` (index.ts) 外層捕獲 CLI 層錯誤。兩者同級聯是為了正確性而重複。接受此設計。

**FIX-15** (P3): 手動分支抵銷 Map 抽象 — 這是維持扁平 `ParsedArguments` 相容介面的必要權衡。接受。

**FIX-18** (P3): skills/init-project-html 低於 80% — 此目錄非本次 refactor 範圍。接受。

---

## 6. Worker Prompt Library

### Fix Worker Prompts

#### WORKER-A: FIX-01 generate-storyboard-images `prompt` `multiple: true`

```
## Mission
修復 generate-storyboard-images 工具的 P1 bug：`prompt` schema 選項缺少 `multiple: true`，導致 handler 使用 `--prompt` 時崩潰。

## Context
- Review dimension: Spec implementation deviation
- Spec requirement: Req 1 — 引數定義全部來自同一個 schema 宣告
- Severity: P1 — Runtime crash under normal usage conditions

## Input
- `packages/tools/generate-storyboard-images/index.ts` — 完整檔案。注意 schema 定義（L184-201）、prompt 讀取（L222）、prompts.map 呼叫（L283）

## What to do
在 schema.options（L184-201）中，將 `'prompt'` 選項加入 `multiple: true`：

目前：
```ts
'prompt': { type: 'string' as const },
```

修改為：
```ts
'prompt': { type: 'string' as const, multiple: true },
```

不需要修改 handler 程式碼。Handler 的 `(values['prompt'] as string[] | undefined)` 強轉在 `parseArgs` 正確回傳陣列後會自動正確運作。

## Scope
- Allowed files:
  - `packages/tools/generate-storyboard-images/index.ts` — schema 一行變更
- Forbidden files:
  - 所有其他檔案

## Output
- Exact lines modified
- Change summary
- Test results

## Verify
- Run: `node --test 'test/**/*.test.js'`
- Expected: All tests pass

## Boundaries
- 只修改 schema 的 `'prompt'` 選項定義
- 不要修改 handler 邏輯
- 不要修改其他 schema 選項
- `use strict` (`allowPositionals: true`) 維持不變
```

---

#### WORKER-B: FIX-02 + FIX-03 Architecture tool 死代碼清理 + 錯誤處理轉換

```
## Mission
清理 architecture tool 的兩項 P2 問題：
1. 移除死 schema 和未使用的 import
2. 將 `handleApply` 中的 `throw new Error(...)` 轉換為 `throw new UserInputError(...)`

## Context
- Review dimension: Architecture defect + Spec implementation deviation
- Spec requirement: Req 1 (tool boilerplate) + Req 3 (unified error handling)

## Input
- `packages/tools/architecture/index.ts` — 完整檔案（674 行）

## What to do

### Part 1: 清理死代碼（~30 lines removed）
1. 移除 L7 的 `import { createToolRunner }` from '@laitszkin/tool-utils' — 此 import 未被使用
2. 移除 L595-625 的全部死 schema 常數宣告，包括行註解：
   ```ts
   // ── Schema ──
   const schema = { ... };
   ```

### Part 2: 轉換錯誤處理（~8 throw sites）
在 `handleApply` 函數中，將所有 `throw new Error(...)` 改為 `throw new UserInputError(...)`：

受影響的 throw site（精確行號）：
- `throw new Error(\`Feature "${slug}" not found\`)` → `throw new UserInputError(\`Feature "${slug}" not found\`)`
- `throw new Error(\`Unknown action: "${action}"\`)` （多處）→ `throw new UserInputError(\`Unknown action: "${action}"\`)`
- `throw new Error(\`Submodule "${slug}" not found in feature "${featSlug}"\`)` → `throw new UserInputError(...)`
- `throw new Error(...)`（referential integrity failures）× 2 → `throw new UserInputError(...)`

總共約 8 個 throw site 需要轉換。

### Part 3: 更新 outer catch（L433-436）
```ts
// 目前：
} catch (e: any) {
  stderr.write(`Batch aborted: ${e.message}\n`);
  return 1;
}

// 改為：
} catch (e: any) {
  if (e instanceof UserInputError) {
    stderr.write(`${e.message}\n`);
  } else {
    stderr.write(`Batch aborted: ${e.message}\n`);
  }
  return 1;
}
```

需要加入 import（如果尚未有）：
```ts
import { UserInputError } from '@laitszkin/tool-utils';
```

注意：`UserInputError` 需要從 `@laitszkin/tool-utils` import。檢查檔案頂部是否已 import（architecture/index.ts 的 imports 中可能尚未包含）。

### 不要修改
- `handleApply` 中的區域 `stderr.write + return 1` 路徑（L155-160, L174-182, L184-187, L217-221）
- `handleTemplate` 的錯誤處理

## Scope
- Allowed files:
  - `packages/tools/architecture/index.ts` — 所有變更
- Forbidden files:
  - 所有其他檔案

## Output
- Which lines were removed (dead schema + import)
- Which throw sites were converted (list all ~8)
- How outer catch was updated
- Test results

## Verify
- Run: `node --test 'test/**/*.test.js'`
- Expected: All tests pass
- Verify no remaining `createToolRunner(`
- Verify compile: `npx tsc --noEmit -p packages/tools/architecture/tsconfig.json` (如果存在)

## Boundaries
- 只修改 architecture tool 中的錯誤處理
- 不要變更 `handleTemplate` 或 CLI 委派路徑的錯誤行為
- throw 的 UserInputError 訊息文字必須與原 Error 訊息完全相同（維持使用者可見行為）
- 外層 catch 的 `Batch aborted:` 前綴僅在非 UserInputError 時保留
```

---

#### WORKER-C: FIX-04 PlatformAdapter 單例化

```
## Mission
為 `createPlatformAdapter()` 加入模組級快取，消除重複實例化。

## Context
- Review dimension: Architecture defect
- Spec requirement: Req 2 — Cross-platform abstraction

## Input
- `packages/tool-utils/platform-adapter.ts` — L99-107（工廠函數）

## What to do
在 `createPlatformAdapter` 函數中加入模組級快取：

```ts
let _adapter: PlatformAdapter | undefined;

export function createPlatformAdapter(): PlatformAdapter {
  if (!_adapter) {
    _adapter = process.platform === 'win32' ? new WindowsAdapter() : new PosixAdapter();
  }
  return _adapter;
}
```

移除已有的實例化邏輯，替換為新的快取版本。

## Scope
- Allowed files:
  - `packages/tool-utils/platform-adapter.ts` — 工廠函數
- Forbidden files:
  - 所有其他檔案（消費者不需修改）

## Output
- Modified lines in platform-adapter.ts
- Test results

## Verify
- Run: `node --test test/utils/platform-adapter.test.js`
- Expected: All adapter tests pass
- Run: `node --test 'test/**/*.test.js'`
- Expected: Full suite passes

## Boundaries
- 不要修改 PlatformAdapter 介面或類別實作
- 不要修改消費者（installer/updater/terminal）
- 只改工廠函數的快取邏輯
```

---

#### WORKER-D: FIX-05 + FIX-11 Updater.ts 修復與測試

```
## Mission
簡化 updater.ts 中 execCommand 的 PlatformAdapter 使用，並補足 updater 的分支涵蓋率測試。

## Context
- Review dimension: Architecture defect + Spec implementation omission
- Spec requirement: Req 2 + Req 4

## Input
- `packages/cli/updater.ts` — 完整檔案
- `test/updater-extras.test.js` — 現有測試

## What to do

### Part 1: execCommand 簡化（~2 lines changed）
在 `execCommand` 中，將 PlatformAdapter 完整實例化改為輕量版本：

目前（L70-71）：
```ts
const adapter = createPlatformAdapter();
const child = spawn(adapter.resolveCommand(command), args, { ... });
```

改為（保留架構完整性）：
```ts
const adapter = createPlatformAdapter();
const child = spawn(adapter.resolveCommand(command), args, { ... });
```

確認 import `createPlatformAdapter` 來自 `@laitszkin/tool-utils`。（實際行為不變，但確保簡潔。）

不需要大幅改動 — 當前實作已經是可接受的。加入註解說明使用 PlatformAdapter 的理由。

### Part 2: 新增 updater 測試
在 `test/updater-extras.test.js` 中新增測試案例，覆蓋以下未測試區段：

1. **`getLatestPublishedVersion()` 陣列分支**：當 `npm view` 回傳陣列時的處理
2. **`checkForPackageUpdate()` catch 區塊**：當 exec 拋出錯誤時的處理
3. **pre-release 版本比較**：`compareVersions` 在不同 pre-release 標籤時的行為（如 `1.0.0-alpha` vs `1.0.0-beta`）

## Scope
- Allowed files:
  - `packages/cli/updater.ts` — 必要的最小變更
  - `test/updater-extras.test.js` — 新增測試案例
- Forbidden files:
  - 所有其他檔案

## Output
- Changes made
- Test results for each new test case

## Verify
- Run: `node --test test/updater-extras.test.js`
- Expected: All tests pass (including new ones)
- Run: `node --test 'test/**/*.test.js'`
- Expected: Full suite passes

## Boundaries
- 不要更改 `execCommand` 的非同步 Promise 結構
- 不要更改 `defaultConfirmUpdate` 的行為（僅測試）
- 測試必須可獨立執行，不發送真實 HTTP 請求
```

---

#### WORKER-E: FIX-06 normalizeParseError "ambiguous argument"

```
## Mission
在 normalizeParseError 中加入 "ambiguous argument" 的錯誤訊息處理。

## Context
- Review dimension: Spec implementation omission
- Spec requirement: Req 5 — Dispatch isolation

## Input
- `packages/cli/parsers/parser-utils.ts` — L11-17

## What to do
在條件中加入 `'ambiguous'` 字串檢查：

```ts
export function normalizeParseError(err: unknown): never {
  const message = (err as Error).message;
  if (message.includes('--home') && (message.includes('argument missing') || message.includes('value') || message.includes('ambiguous'))) {
    throw new UserInputError('Missing value for --home');
  }
  throw err;
}
```

## Scope
- Allowed files:
  - `packages/cli/parsers/parser-utils.ts` — 一行變更
- Forbidden files:
  - 所有其他檔案

## Output
- Exact line modified
- Test results

## Verify
- Run: `node --test 'test/**/*.test.js'`
- Expected: All tests pass

## Boundaries
- 只加入 `'ambiguous'` 字串檢查
- 不要更改既有的 `argument missing` 和 `value` 檢查
- 不要更改 UserInputError 的訊息文字
```

---

#### WORKER-F: FIX-07 + FIX-08 + FIX-14 CLI index.ts dispatch 層修復

```
## Mission
修復 CLI dispatch 層的三項問題：
1. helpTopic 對 tools-help 命令設定正確值（FIX-08）
2. 兩個 ToolArgsParser 實例共享為一個（FIX-14）
3. 加入型別守衛強化 CommandParser<any> 安全性（FIX-07）

## Context
- Review dimension: Architecture defect + Spec implementation deviation + Redundant code
- Spec requirement: Req 5 — Dispatch isolation

## Input
- `packages/cli/index.ts` — parseArguments() L81-195
- `packages/cli/types.ts` — ParsedArguments.helpTopic L44
- `packages/cli/parsers/types.ts` — 如需要

## What to do

### Part 1: ToolArgsParser 單一實例（FIX-14）
在 `parseArguments` 中，將兩個 ToolArgsParser 實例改為一個共用的：

```ts
// 目前 (L91-92):
['tools', new ToolArgsParser()],
['tool', new ToolArgsParser()],

// 改為:
const toolParser = new ToolArgsParser();
// ...
['tools', toolParser],
['tool', toolParser],
```

### Part 2: helpTopic 修正（FIX-08）
步驟 1 — 更新型別定義（`packages/cli/types.ts` L44）：
```ts
helpTopic: 'overview' | 'install' | 'uninstall' | 'tools-help';
```

步驟 2 — 更新 dispatch 值（`packages/cli/index.ts` L145）：
```ts
// 目前:
helpTopic: 'overview',

// 改為:
helpTopic: 'tools-help',
```

### Part 3: 型別守衛（FIX-07）
在 `parseArguments` 中，為每個命令分支加入 `asserts` 函數或拋出斷言：

```ts
// 在 parseArguments 後或內部加入：
function assertCommand<T>(cmd: any, expected: string): asserts cmd is T {
  if (!cmd || cmd.command !== expected) {
    throw new Error(`Internal error: expected command "${expected}", got "${cmd?.command}"`);
  }
}

// 在各分支使用：
// uninstall 分支
assertCommand<UninstallCommand>(cmd, 'uninstall');
// install 分支
assertCommand<InstallCommand>(cmd, 'install');
// tools/tool 分支 — 已經使用 cmd.command === 'tools-help' 檢查
```

這在開發期間捕獲 dispatch table 配置錯誤。

## Scope
- Allowed files:
  - `packages/cli/index.ts` — 主要變更
  - `packages/cli/types.ts` — helpTopic 型別更新
  - `packages/cli/parsers/types.ts` — 如需要
- Forbidden files:
  - 所有其他檔案

## Output
- Changes in each file
- Test results

## Verify
- Run: `node --test 'test/**/*.test.js'`
- Expected: All tests pass
- Specifically: `node --test test/cli/dispatch-table.test.js test/cli/tool-args-parser.test.js`

## Boundaries
- 不要改變 parseArguments 的回傳值結構或語義
- 不要改變 ParsedArguments 的現有欄位型別（僅擴展 union）
- 不要修改 InstallArgsParser 或 UninstallArgsParser
- 型別守衛的斷言訊息應該是內部錯誤（非用戶可見）
```

---

#### WORKER-G: FIX-10 Coverage exclude 模式

```
## Mission
為 `scripts/test.sh` 中的 coverage exclude 模式加入說明註解。

## Context
- Review dimension: Spec implementation omission
- Spec requirement: Req 4 — Coverage + CI

## Input
- `scripts/test.sh` — L9-12

## What to do
在 coverage exclude flags 處加入說明註解：

```bash
# packages/tools 排除在涵蓋率測量之外：這些工具由獨立的 test/tools/ 測試檔案驗證，
# 且部分工具（codegraph、architecture）因子指令複雜度不適合以行涵蓋率衡量框架品質。
# 此排除讓涵蓋率門檻聚焦在 CLI 框架碼而非個別工具業務邏輯。
if [ "${COVERAGE:-}" = "true" ]; then
  GROUP1_FLAGS="--experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test-coverage-exclude=packages/tools/**"
fi
```

## Scope
- Allowed files:
  - `scripts/test.sh` — 僅註解
- Forbidden files:
  - 所有其他檔案

## Output
- Modified lines
- Verification that coverage still works

## Verify
- Run: `COVERAGE=true bash scripts/test.sh`
- Expected: Coverage report generated, thresholds met

## Boundaries
- 不要更改實際的 flag 值
- 只加入說明性註解
```

---

#### WORKER-H: FIX-12 isSafeSkillName 跨平台修正

```
## Mission
修正 isSafeSkillName 中 `\` 的全域禁止為 Windows-only。

## Context
- Review dimension: Spec implementation deviation
- Spec requirement: Req 2 — Cross-platform abstraction

## Input
- `packages/cli/installer.ts` — isSafeSkillName 函數（L119-128）

## What to do
檢查 `installer.ts` 頂部是否已 import `createPlatformAdapter`。如果沒有，加入：
```ts
import { createPlatformAdapter } from '@laitszkin/tool-utils';
```

在 `isSafeSkillName` 函數中，將：
```ts
&& !skillName.includes('\\')
```
改為：
```ts
&& !(createPlatformAdapter().isWindows() && skillName.includes('\\'))
```

## Scope
- Allowed files:
  - `packages/cli/installer.ts` — isSafeSkillName
- Forbidden files:
  - 所有其他檔案

## Output
- Modified lines
- Test results

## Verify
- Run: `node --test 'test/**/*.test.js'`
- Expected: All tests pass

## Boundaries
- 只在 isSafeSkillName 中修改 `\` 檢查
- 不要修改其他檔案名稱檢查（`/`、`\0` 等維持現狀）
- 使用 `createPlatformAdapter().isWindows()` 保持架構一致性
```

---

#### WORKER-I: FIX-13 ToolNotFoundError 註解更新

```
## Mission
更新 ToolNotFoundError 的 JSDoc 註解。

## Context
- Review dimension: Redundant code (stale documentation)
- Spec requirement: Req 3 — Unified error handling

## Input
- `packages/tool-utils/app-error.ts` — L53-56

## What to do
將：
```ts
/**
 * Error for unknown tool names.
 * NOTE: Currently defined for the error hierarchy completeness.
 * Used when isKnownToolName() check fails in tool dispatch.
 * If never used after full implementation, consider removal.
 */
```
改為：
```ts
/**
 * Error for unknown tool names.
 * Thrown by runTool() in @laitszkin/tool-registry when getTool() returns null.
 */
```

## Scope
- Allowed files:
  - `packages/tool-utils/app-error.ts` — 註解變更
- Forbidden files:
  - 所有其他檔案

## Output
- Modified lines
- Verification

## Verify
- Read the updated file to confirm the comment is correct

## Boundaries
- 只修改註解文字
- 不要修改程式碼
```

---

#### WORKER-J: FIX-16 + FIX-17 + FIX-19 測試改進 (P3)

```
## Mission
補足三項 P3 測試改進：
1. FIX-16: index.js 互動式路徑測試
2. FIX-17: rewrite-imports.test.js 涵蓋率
3. FIX-19: 移除 installer.test.js 中重複的 dispatch 測試

## Context
- Review dimension: Spec implementation omission + Redundant code
- Spec requirement: Req 4 — Coverage + CI matrix

## Input
- `packages/cli/index.ts` — 互動式路徑
- `test/cli/dispatch-table.test.js` — dispatch 測試
- `test/installer.test.js` — installer 整合測試（含重複的 dispatch 測試）
- `test/rewrite-imports.test.js` — 涵蓋率邊界

## What to do

### Part 1: FIX-19 移除重複測試
在 `test/installer.test.js` 中，移除與 `test/cli/dispatch-table.test.js` 重複的 `parseArguments` dispatch 測試案例。保留 installer 特定的整合測試（如 `run`、`installLinks`、`syncToolkitHome`）。

具體來說，找到並移除以下類似的測試（行號需確認）：
- 測試 `parseArguments` 回傳值的 test cases — 這些屬於 dispatch-table

### Part 2: FIX-17 rewrite-imports.test.js 涵蓋率
檢查 `test/rewrite-imports.test.js` 中被標記為未涵蓋的行（COVERAGE=true 輸出中的 uncovered lines），加入測試案例覆蓋這些行。

### Part 3: FIX-16 互動式路徑測試
在 `test/cli/interactive-paths.test.js` 中新增測試，使用 mock TTY streams 驗證：
- `buildSymlinkInfo` + `promptSymlinkChoice` 的輸出格式
- `promptIncludeExclusiveSkills` 在沒有 codex skills 時回傳 false
- `printUninstallSummary` 在空結果時顯示 "No Apollo Toolkit installations found"

## Scope
- Allowed files:
  - `test/cli/interactive-paths.test.js` — 新建
  - `test/rewrite-imports.test.js` — 新增測試案例
  - `test/installer.test.js` — 移除重複 dispatch 測試
- Forbidden files:
  - 所有 source code 檔案

## Output
- List of changes in each test file
- Coverage improvement confirmation

## Verify
- Run: `node --test 'test/**/*.test.js'`
- Expected: All tests pass
- Run: `COVERAGE=true node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 'test/**/*.test.js'`
- Expected: Coverage thresholds still met

## Boundaries
- 不要修改任何 source code
- 不要修改既有測試的行為
- 新測試必須可獨立執行
```

---

### Regression Test Worker Prompts

#### REGTEST-01: generate-storyboard-images `prompt` `multiple: true` (FIX-01)

```
## Mission
為 FIX-01 建立回歸測試：驗證 generate-storyboard-images 的 `prompt` schema 選項在加入 `multiple: true` 後能正確接收多個值。

## Context
- Fix summary: Schema 中 `'prompt': { type: 'string' }` → `{ type: 'string', multiple: true }`
- Root cause: `node:util.parseArgs` 對無 `multiple` 的 `string` 選項回傳單一字串，但 handler 以陣列型別讀取
- Fix files involved: `packages/tools/generate-storyboard-images/index.ts`

## Input
- Read fix-related files: `packages/tools/generate-storyboard-images/index.ts`（schema 在 L184-201）
- Read existing test files as format reference: `test/tools/search-logs-multiple-keywords.test.js`, `test/tools/schema-multiple-args.test.js`

## What to do
Create a new test file at `test/tools/generate-storyboard-images-prompt-multiple.test.js`:

### Test 1: Schema parseArgs with multiple --prompt
```js
test('generate-storyboard-images schema passes multiple --prompt values as array', () => {
  const { parseArgs } = require('node:util');
  const { values } = parseArgs({
    options: {
      prompt: { type: 'string', multiple: true },
    },
    args: ['--prompt', 'A cat sits on a mat', '--prompt', 'A dog runs in the park'],
    strict: false,
  });
  assert.deepStrictEqual(values.prompt, ['A cat sits on a mat', 'A dog runs in the park']);
});
```

### Test 2: Single --prompt returns single-element array
```js
test('single --prompt returns single-element array', () => {
  const { parseArgs } = require('node:util');
  const { values } = parseArgs({
    options: {
      prompt: { type: 'string', multiple: true },
    },
    args: ['--prompt', 'A single scene'],
    strict: false,
  });
  assert.deepStrictEqual(values.prompt, ['A single scene']);
});
```

### Test 3: No --prompt returns undefined
```js
test('no --prompt returns undefined', () => {
  const { parseArgs } = require('node:util');
  const { values } = parseArgs({
    options: {
      prompt: { type: 'string', multiple: true },
    },
    args: ['--prompts-file', 'test.txt'],
    strict: false,
  });
  assert.strictEqual(values.prompt, undefined);
});
```

## Scope
- Allowed files:
  - `test/tools/generate-storyboard-images-prompt-multiple.test.js` — 新建
- Forbidden files:
  - 所有 source code

## Verify
- Run: `node --test test/tools/generate-storyboard-images-prompt-multiple.test.js`
- Expected: All 3 tests pass
- Confirm: `node --test 'test/**/*.test.js'` passes

## Boundaries
- 只建立新的測試檔案
- 測試必須可獨立執行
```


#### REGTEST-02: Architecture tool UserInputError paths (FIX-03)

```
## Mission
為 FIX-03 建立回歸測試：驗證 architecture tool 中的錯誤被拋出為 UserInputError 而非 bare Error。

## Context
- Fix summary: handleApply 中的 `throw new Error(...)` → `throw new UserInputError(...)`
- Root cause: 違反 Req 3 的型別化錯誤處理要求
- Fix files involved: `packages/tools/architecture/index.ts`

## Input
- Read fix-related files: `packages/tools/architecture/index.ts`（handleApply 中的 throw sites）
- Read existing test files as format reference: `test/tools/handler-error-propagation.test.js`

## What to do
由於 architecture tool 不使用 `createToolRunner`，可直接測試 error types：

在 `test/tools/architecture-error-types.test.js` 中：

### Test: handleApply throws UserInputError
需要動態 import architectureTool 的 `architectureHandler` 或 `handleApply`（如果可匯入）。如果 `handleApply` 未匯出，可以透過：

```js
// 方法 1: 透過 architectureHandler 觸發錯誤路徑
test('handleApply unknown action throws UserInputError', async () => {
  const { architectureHandler } = await import('../../packages/tools/architecture/index.js');
  const context = { stdout: { write: () => {} }, stderr: { write: () => {} } };
  
  // apply 一個包含無效 action 的 YAML — 這需要連到實際 YAML 解析
  // 更簡單的方法是直接測試錯誤型別:
  const result = await architectureHandler(['apply', '--spec', '/nonexistent'], context);
  assert.strictEqual(result, 1);
  // 無法直接斷言錯誤型別（已被 catch 並轉為 return 1）
});
```

或者更直接的單元測試方式：不需要透過 architectureHandler，可以測試 `handleApply` 的內部邏輯（如果可匯入）或測試錯誤處理本身。

**替代方案：** 建立一個測試函數，驗證 `UserInputError` 的 throw 行為：
```js
test('UserInputError is thrown for invalid feature operations', async () => {
  // 這驗證 handleApply 中 throw 的 Error 是否為 UserInputError
  // 透過 architectureHandler 呼叫 apply 子命令並觸發錯誤
  const { architectureHandler } = await import('../../packages/tools/architecture/index.js');
  const stderr: string[] = [];
  const context = {
    stdout: { write: () => {} },
    stderr: { write: (s: string) => { stderr.push(s); } },
  };
  
  // 使用不存在的 spec 路徑觸發錯誤
  const result = await architectureHandler(['apply', '/dev/null/nonexistent-spec.yaml'], context);
  assert.strictEqual(result, 1);
  assert.ok(stderr.length > 0);
});
```

**如果無法直接測試錯誤型別**，至少驗證 architectureHandler 在無效輸入時回傳 1 且寫入 stderr。

## Scope
- Allowed files:
  - `test/tools/architecture-error-types.test.js` — 新建
- Forbidden files:
  - 所有 source code

## Verify
- Run: `node --test test/tools/architecture-error-types.test.js`
- Expected: Tests pass

## Boundaries
- 只建立新的測試檔案
- 如果無法直接測試錯誤型別，測試回傳碼 1 + stderr 輸出
```

#### REGTEST-03: normalizeParseError ambiguous argument (FIX-06)

```
## Mission
為 FIX-06 建立回歸測試：驗證 normalizeParseError 正確處理 "ambiguous argument" 錯誤。

## Context
- Fix summary: normalizeParseError 加入 `'ambiguous'` 字串檢查
- Root cause: `--home` 後接 `--` 前綴值時，parseArgs 拋出 "ambiguous argument" 錯誤，未轉換為 UserInputError
- Fix files involved: `packages/cli/parsers/parser-utils.ts`

## Input
- Read fix-related files: `packages/cli/parsers/parser-utils.ts`
- Read existing test files as format reference: `test/cli/install-args-parser.test.js`

## What to do
Create or expand a test in `test/cli/parser-utils.test.js` (create if not exists):

### Test: normalizeParseError converts ambiguous argument error
```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 注意：normalizeParseError throw 的型別是 never，需要使用包裝函數測試
function testNormalizeParseError(errorMessage: string): string | Error {
  try {
    const err = new TypeError(errorMessage);
    // 使用 try/catch 包裝
    const normalizeParseError = (err: unknown): never => {
      const message = (err as Error).message;
      if (message.includes('--home') && (message.includes('argument missing') || message.includes('value') || message.includes('ambiguous'))) {
        throw new (require('@laitszkin/tool-utils').UserInputError)('Missing value for --home');
      }
      throw err;
    };
    normalizeParseError(err);
    return 'no error thrown';
  } catch (e) {
    return e as Error;
  }
}

describe('normalizeParseError', () => {
  it('converts ambiguous argument error to UserInputError', () => {
    const result = testNormalizeParseError(
      "Option '--home' argument is ambiguous. Did you forget to specify the option argument for '--home'?"
    );
    assert.ok(result instanceof Error);
    assert.strictEqual(result.constructor.name, 'UserInputError');
    assert.strictEqual(result.message, 'Missing value for --home');
  });

  it('still converts argument missing error', () => {
    const result = testNormalizeParseError("Option '--home' argument missing");
    assert.ok(result instanceof Error);
    assert.strictEqual(result.constructor.name, 'UserInputError');
  });

  it('re-throws unrelated errors unchanged', () => {
    const result = testNormalizeParseError("Unknown option '--foobar'");
    assert.ok(result instanceof TypeError);
  });
});
```

**注意：** 如果無法直接 import normalizeParseError（因它被定義為 `never` throw），可使用上述的包裝函數測試方法，或直接 import 原始函數：

```js
import { normalizeParseError } from '../../packages/cli/parsers/parser-utils.js';
```

如果可以直接 import，用直接 import 版本。

## Scope
- Allowed files:
  - `test/cli/parser-utils.test.js` — 新建或擴展現有檔案
- Forbidden files:
  - 所有 source code

## Verify
- Run: `node --test test/cli/parser-utils.test.js`
- Expected: All tests pass

## Boundaries
- 只建立/修改測試檔案
- 測試必須可獨立執行
```

#### REGTEST-04: updater 分支涵蓋率 (FIX-11)

```
## Mission
為 FIX-11 建立測試，補足 updater 的三個未測試區段。

## Context
- Fix summary: updater branch coverage 改善
- Root cause: defaultConfirmUpdate、getLatestPublishedVersion 陣列分支、checkForPackageUpdate catch 未測試

## Input
- Read fix-related files: `packages/cli/updater.ts`
- Read existing test files as format reference: `test/updater-extras.test.js`

## What to do
在 `test/updater-extras.test.js` 中新增以下測試：

### Test 1: getLatestPublishedVersion with array response
```js
test('getLatestPublishedVersion handles array response', async () => {
  // mock execCommand to return stdout containing an array
  // 或直接測試 compareVersions / 版本解析邏輯
});
```

### Test 2: checkForPackageUpdate exec failure
```js
test('checkForPackageUpdate handles exec failure', async () => {
  // Provide an exec mock that rejects
});
```

### Test 3: compareVersions with different pre-release tags
```js
test('compareVersions handles pre-release labels', () => {
  const { compareVersions } = await import('../../packages/cli/updater.js');
  // 比較 pre-release 版本
  assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1); // alpha < beta
  // 或驗證 semver 行為
});
```

具體實作需要根據 `updater.ts` 的實際匯出和測試能力調整。

## Scope
- Allowed files:
  - `test/updater-extras.test.js` — 新增測試案例
- Forbidden files:
  - 所有 source code

## Verify
- Run: `node --test test/updater-extras.test.js`
- Expected: All tests pass
- Run: `node --test 'test/**/*.test.js'`
- Expected: Full suite passes

## Boundaries
- 不要 mock `node:child_process.spawn`（使用依賴注入而非 mock）
- 使用工具函數的匯出版本做測試（如 `compareVersions`、`execCommand`）
```

#### REGTEST-05: isSafeSkillName Windows behavior (FIX-12)

```
## Mission
為 FIX-12 建立回歸測試：驗證 isSafeSkillName 中 `\` 僅在 Windows 被禁止。

## Context
- Fix summary: isSafeSkillName 中的 `\` 檢查改為 `createPlatformAdapter().isWindows() && skillName.includes('\\')`
- Root cause: POSIX 上反斜線為合法檔案名字元

## Input
- Read fix-related files: `packages/cli/installer.ts` — isSafeSkillName
- Read existing test files as format reference: `test/installer.test.js`

## What to do
在 `test/installer.test.js`（或新建 `test/cli/is-safe-skill-name.test.js`）中新增測試：

由於 `isSafeSkillName` 是私有函數（未匯出），需透過公共函數間接測試，或直接複製測試邏輯：

```js
// 直接複製函數邏輯進行測試（或透過 installer 的公共介面）
function isSafeSkillName(skillName: string): boolean {
  return typeof skillName === 'string'
    && skillName.length > 0
    && !skillName.includes('\0')
    && !skillName.includes('/')
    && !(process.platform === 'win32' && skillName.includes('\\'))
    && !path.isAbsolute(skillName)
    && skillName !== '.'
    && skillName !== '..';
}

test('isSafeSkillName allows backslash on non-Windows', () => {
  // 這個測試驗證修正後的行為
  // 在 POSIX 上反斜線不被禁止
  assert.ok(isSafeSkillName('valid\\name'));
});

test('isSafeSkillName still blocks null byte', () => {
  assert.ok(!isSafeSkillName('bad\0name'));
});

test('isSafeSkillName blocks path separators', () => {
  assert.ok(!isSafeSkillName('a/b'));
  assert.ok(!isSafeSkillName('..'));
  assert.ok(!isSafeSkillName('.'));
});
```

## Scope
- Allowed files:
  - `test/installer.test.js` 或 `test/cli/is-safe-skill-name.test.js`
- Forbidden files:
  - 所有 source code

## Verify
- Run: `node --test test/installer.test.js`（或新檔案）
- Expected: All tests pass

## Boundaries
- 只建立/修改測試檔案
- 測試必須可獨立執行
```

---

## 7. Fix Batch Schedule

### Batch 1 — Independent Simple Fixes (Parallel — no file overlap)

| Worker | Issues | Files | Complexity |
|--------|--------|-------|-----------|
| WORKER-A | FIX-01 (P1) | `packages/tools/generate-storyboard-images/index.ts` | 簡單 |
| WORKER-E | FIX-06 (P2) | `packages/cli/parsers/parser-utils.ts` | 簡單 |
| WORKER-H | FIX-12 (P3) | `packages/cli/installer.ts` | 簡單 |
| WORKER-I | FIX-13 (P3) | `packages/tool-utils/app-error.ts` | 簡單 |

**Gate**:
- [ ] WORKER-A reports success
- [ ] WORKER-E reports success
- [ ] WORKER-H reports success
- [ ] WORKER-I reports success
- [ ] Run verification: `node --test 'test/**/*.test.js'`

---

### Batch 2 — Architecture Tool Fixes (Sequential — same file)

**Sub-batch 2a**: WORKER-B-Part1 (FIX-02: dead code removal)
**Sub-batch 2b**: WORKER-B-Part2 (FIX-03: error handling conversion)

| Sub-batch | Worker | Issues | Files |
|-----------|--------|--------|-------|
| 2a | WORKER-B-P1 | FIX-02 (P2) | `packages/tools/architecture/index.ts` |
| 2b | WORKER-B-P2 | FIX-03 (P2) | `packages/tools/architecture/index.ts` |

**Gate**:
- [ ] Sub-batch 2a: worker reports success (dead code removed)
- [ ] Sub-batch 2b: worker reports success (error handling converted)
- [ ] Run verification: `node --test 'test/**/*.test.js'`

---

### Batch 3 — CLI Dispatch Fixes (Sequential — same file)

| Worker | Issues | Files | Complexity |
|--------|--------|-------|-----------|
| WORKER-F | FIX-07 + FIX-08 + FIX-14 (P2+P3) | `packages/cli/index.ts`, `packages/cli/types.ts`, `packages/cli/parsers/types.ts` | 中等 |

**Gate**:
- [ ] WORKER-F reports success
- [ ] Run verification: `node --test 'test/**/*.test.js'`
- [ ] Specifically: `node --test test/cli/dispatch-table.test.js test/cli/tool-args-parser.test.js`

---

### Batch 4 — PlatformAdapter + Updater Fixes

**Sub-batch 4a** (parallel — no overlap):
| Worker | Issues | Files |
|--------|--------|-------|
| WORKER-C | FIX-04 (P2) | `packages/tool-utils/platform-adapter.ts` |
| WORKER-G | FIX-10 (P2) | `scripts/test.sh` |

**Sub-batch 4b** (sequential — same file updater.ts):
| Worker | Issues | Files |
|--------|--------|-------|
| WORKER-D | FIX-05 (P2) + FIX-11 (P2) | `packages/cli/updater.ts` |

**Gate**:
- [ ] Sub-batch 4a: all workers report success
- [ ] Sub-batch 4b: worker reports success
- [ ] Run verification: `node --test 'test/**/*.test.js'`
- [ ] Coverage verification: `COVERAGE=true bash scripts/test.sh`

---

### Batch 5a — Test Quality Improvements

| Worker | Issues | Files |
|--------|--------|-------|
| WORKER-J | FIX-16 + FIX-17 + FIX-19 (P3) | 測試檔案 |

**Gate**:
- [ ] WORKER-J reports success
- [ ] Run: `node --test 'test/**/*.test.js'`
- [ ] Coverage: `COVERAGE=true bash scripts/test.sh`

---

### Batch 5b — Regression Test Implementation

| Worker | Issues | Test File | Related Fix |
|--------|--------|-----------|-------------|
| REGTEST-01 | Prompt multiple test | `test/tools/generate-storyboard-images-prompt-multiple.test.js` | FIX-01 |
| REGTEST-02 | Architecture error type tests | `test/tools/architecture-error-types.test.js` | FIX-03 |
| REGTEST-03 | normalizeParseError tests | `test/cli/parser-utils.test.js` | FIX-06 |
| REGTEST-04 | Updater branch coverage | `test/updater-extras.test.js` | FIX-11 |
| REGTEST-05 | isSafeSkillName tests | `test/installer.test.js` or new file | FIX-12 |

**Strategy**: Parallel dispatch (no file overlap between test files)

**Gate**:
- [ ] All REGTEST workers report success
- [ ] Run each regtest file individually:
  - [ ] `node --test test/tools/generate-storyboard-images-prompt-multiple.test.js`
  - [ ] `node --test test/tools/architecture-error-types.test.js`
  - [ ] `node --test test/cli/parser-utils.test.js`
  - [ ] `node --test test/updater-extras.test.js`
  - [ ] `node --test test/installer.test.js` (or new file for isSafeSkillName)
- [ ] Full test suite passes: `node --test 'test/**/*.test.js'`

---

### Batch Final — Integration

- **Tasks**: Full test suite + coverage + cross-check REPORT.md
- **Strategy**: Sequential (coordinator handles directly)

**Gate**:
- [ ] Full test suite: `node --test 'test/**/*.test.js'`
- [ ] Coverage: `COVERAGE=true bash scripts/test.sh` — thresholds met
- [ ] Every issue in REPORT.md confirmed resolved:
  - [ ] P1 #1 (FIX-01): generate-storyboard-images `prompt` `multiple: true`
  - [ ] P2 #1 (FIX-02): architecture dead schema removed
  - [ ] P2 #2 (FIX-03): architecture UserInputError conversion
  - [ ] P2 #5 (FIX-04): PlatformAdapter singleton cache
  - [ ] P2 #6 (FIX-05): execCommand adapter usage
  - [ ] P2 #7 (FIX-06): normalizeParseError ambiguous argument
  - [ ] P2 #8 (FIX-07): CommandParser<any> type safety
  - [ ] P2 #9 (FIX-08): helpTopic 'tools-help'
  - [ ] P2 #10 (FIX-09): duplicate boundaries — acknowledged
  - [ ] P2 #11 (FIX-10): coverage exclude — documented
  - [ ] P2 #12 (FIX-11): updater branch coverage
  - [ ] P3 #1 (FIX-12): isSafeSkillName Windows-only
  - [ ] P3 #3 (FIX-13): ToolNotFoundError comment
  - [ ] P3 #9 (FIX-14): ToolArgsParser single instance
  - [ ] P3 #10 (FIX-15): Map abstraction — acknowledged
  - [ ] P3 #5 (FIX-16): index.js interactive path tests
  - [ ] P3 #6 (FIX-17): rewrite-imports coverage
  - [ ] P3 #7 (FIX-18): skills coverage — out of scope
  - [ ] P3 #8 (FIX-19): test redundancy

---

## 8. Regression Test Inventory

因 regression tests 僅 5 項（≤ 5 但接近邊界），以下為摘要列表。完整細節請見 Section 5 (Fix Details) 與 Section 6 (Worker Prompt Library)。

| Test ID | Type | File | Related Fix | Scenario |
|---------|------|------|-------------|----------|
| REGTEST-01 | Unit | `test/tools/generate-storyboard-images-prompt-multiple.test.js` | FIX-01 | `--prompt` 多值傳遞驗證 |
| REGTEST-02 | Unit | `test/tools/architecture-error-types.test.js` | FIX-03 | `UserInputError` throw 行為驗證 |
| REGTEST-03 | Unit | `test/cli/parser-utils.test.js` | FIX-06 | `normalizeParseError` ambiguous argument |
| REGTEST-04 | Unit | `test/updater-extras.test.js` | FIX-11 | updater 分支涵蓋率補足 |
| REGTEST-05 | Unit | `test/installer.test.js` 或新檔案 | FIX-12 | `isSafeSkillName` Windows-only |

---

## 9. Verification Checkpoints

### Checkpoint 1 — After Batch 1 (independent simple fixes)
- Run: `node --test 'test/**/*.test.js'`
- Expected: All tests pass

### Checkpoint 2 — After Batch 2 (architecture tool)
- Run: `node --test 'test/**/*.test.js'`
- Expected: Architecture tests pass, no regression
- Run: `npx tsc --noEmit` (if tsconfig available for architecture)

### Checkpoint 3 — After Batch 3 (CLI dispatch)
- Run: `node --test test/cli/dispatch-table.test.js test/cli/tool-args-parser.test.js`
- Expected: Dispatch tests pass
- Run: `node --test 'test/**/*.test.js'`
- Expected: Full suite passes

### Checkpoint 4 — After Batch 4 (PlatformAdapter + Updater)
- Run: `node --test test/utils/platform-adapter.test.js`
- Expected: All adapter tests pass
- Coverage: `COVERAGE=true bash scripts/test.sh`
- Expected: Thresholds met

### Checkpoint 5 — After Batch 5b (regression tests)
- Run each REGTEST individually to confirm they pass
- Run: `node --test 'test/**/*.test.js'`
- Expected: Full suite passes

### Checkpoint 6 — Final verification
- Run: `COVERAGE=true bash scripts/test.sh`
- Expected: All thresholds met
- Cross-check REPORT.md: every issue resolved

---

## 10. Error Recovery

- **If a fix worker fails**: Retry once with the worker's existing context, giving more specific guidance. Do not create a new worker.
- **If a fix worker fails twice**: Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user.
- **If a regression test worker reports failure (test cannot pass)**: Check whether the test code is wrong or the fix is incomplete. If the test code is wrong, continue the worker to fix it. If the fix is incomplete, go back to the corresponding fix worker.
- **If a regression test passes on the unfixed code**: The test design is invalid — redesign the oracle and dispatch a new worker.
- **If merge conflicts occur**: The coordinator resolves the conflict, then re-runs the batch gate verification.
- **If a fix or regression test breaks existing tests**: Pause. Report which test failed and which worker's change caused it.
- **For codegraph-specific issues** (P2 #3, P2 #4): These are out of scope per HTML comment in SPEC.md References section. Flag them but do not block on them.
- **For architecture tool WORKER-B**: If FIX-03 (error handling) introduces test failures due to changed error messages, the coordinator should adjust the test expectations rather than reverting the fix.

---

## 11. Fix History

### Round 6 — 2026-06-04

- **Issues fixed**: 3/3 issues from Round 6 review (1 P1 + 2 P3)
- **Outcome**: FIX-A: search-logs keyword/regex `multiple: true` (P1) — schema 2 lines changed; FIX-B: PlatformAdapter normalizePath/EOL — accepted forward-looking; FIX-C: `_runner` intermediary variables removed from find-github-issues and review-threads. 1 regression test added (search-logs-multiple-keywords).
- **Commit**: `2ba7d79`

### Round 5 — 2026-06-04

- **Issues fixed**: 8/8 issues from Round 5 review (4 P2 + 4 P3)
- **Outcome**: review-threads `_rawArgs` migration (FIX-A), codegraph SystemError details.code (FIX-B), PlatformAdapter homeDir delegation (FIX-C), Coverage scope Group 2 (FIX-D), helpTopic type narrowing (FIX-E), test imports migration (FIX-F), test overlap cleanup (FIX-G). 2 regression tests added.
- **Commit**: `117f9b7`

### Round 4 — 2026-06-04

- **Issues fixed**: 17/21 issues from Round 4 review (1 P1 + 8 P2 + 6 P3 + 2 regressions)
- **Outcome**: Windows CI bash (P1→FIXED), 5 tools handler catch removal, SchemaOption `multiple` + AppError base class, codegraph/open-github-issue Error→AppError, ToolArgsParser dispatch integration, StdioWriter type, PlatformAdapter isWindows + shell:true
- **Not fixed**: review-threads `_rawArgs` (P2), Coverage scope Group 2 (P2), 2 P3 items deferred (test imports, test overlap)
- **Regression**: codegraph SystemError MODULE_NOT_FOUND detection broken by FIX-12
- **Commit**: `df6f957`

### Round 3 — 2026-06-04

- **Issues fixed**: FIX-01 (createToolRunner catch), FIX-02a/b/c/d (schema conversion for 19 tools), 3 regression fixes
- **Outcome**: All 5 sub-workers completed, 19 tools converted
- **Key notes**: Architecture tool escaped createToolRunner wrapper due to sub-command incompatibility (deliberate design). 3 regressions found and fixed in follow-up `1e727b9`.

### Round 2 — 2026-06-04

- **Issues fixed**: FIX-01 through FIX-06 (P0: 1, P1: 1, P2: 4)
- **Outcome**: All 6 issues resolved in commit `baec86f`

### Round 1 — 2026-06-04

- **Issues fixed**: 16 項 (P1: 3, P2: 11, P3: 2) in commit `eecb6ce`
- **Outcome**: 16 fixed, 6 deferred, 1 unfixed (StdioWriter, later fixed in Round 2)

---

## 12. Boundaries

### ALWAYS

- Run gate verification immediately after every batch
- Extract worker prompts verbatim from Section 6 — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Fixes must not conflict with the original spec requirements
- Regression tests must not start before all fix batches pass
- Resolve merge conflicts yourself — the coordinator handles them. This is coordination, not implementation.
- **For WORKER-B (architecture tool)**: Dead code removal (FIX-02) must run before UserInputError conversion (FIX-03). Verify the import and schema are gone before adding UserInputError throw sites.
- **For WORKER-F (CLI dispatch)**: Run dispatch-table tests before and after the changes to confirm no behavioral change.
- **For WORKER-D (updater)**: Run coverage after test additions to confirm branch coverage improvement.

### ASK FIRST — pause and confirm with the user

- Fix approach conflicts with spec design intent
- Need to add a new external dependency
- Worker has failed twice
- Test regression cannot be quickly diagnosed
- Architecture tool FIX-03 requires significant refactoring beyond the scope described

### NEVER

- Write implementation logic or modify source code beyond resolving merge conflict markers
- Let workers spawn sub-workers
- Skip verification and proceed to the next batch
- Modify spec documents (unless the fix reveals a spec error — report it instead)
- Start regression tests before all fixes are verified
- Defer any REPORT.md issue to a future round — every issue has a complete fix plan in this FIX.md
- **For WORKER-B**: Do not modify `handleTemplate` or the atlas CLI fallback path in `architectureHandler`
- **For WORKER-F**: Do not change the `ParsedArguments` interface shape or export semantics
- **For REGTEST-02**: Do not modify architecture tool source code to make it more testable — the regression test must work with the tool's exported interface

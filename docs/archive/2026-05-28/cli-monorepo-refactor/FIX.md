# Fix Plan: CLI Monorepo Refactor

- **Date**: 2026-05-29
- **Source REPORT**: `docs/plans/2026-05-28/cli-monorepo-refactor/REPORT.md`
- **Source Spec**: `docs/plans/2026-05-28/cli-monorepo-refactor/`
- **Total Issues**: P1: 3, P2: 9, P3: 4

---

## 1. Fix Summary

本次修復範圍涵蓋 REPORT.md 中 16 個問題 (3 P1 + 9 P2 + 4 P3)，分五個批次執行。P3 問題多為文檔不一致或死代碼中的邊界情況，不納入修復範圍（留待 spec 更新時一併處理）。

核心策略：
- **FIX-01 (yargs 清理)**：不移除後重新整合 yargs（那是新 spec 的範圍），而是移除所有 yargs 死代碼與未使用依賴，讓代碼庫誠實反映當前狀態
- **FIX-02 (tsconfig references)**：補齊根 tsconfig 與 cli tsconfig 對工具 package 的 references
- **FIX-03 (extract-codex-conversations)**：在 extract-conversations 的 ToolDefinition 加入 aliases，由 registerTool 自動處理別名註冊
- **FIX-04 (延遲載入)**：將 `registerAllTools()` 移入 `run()` 內部，僅在工具分發路徑上才載入

---

## 2. Issue Inventory

| Issue ID | 等級 | 問題簡述 | 涉及檔案 | 審查維度 | 複雜度 |
|---|---|---|---|---|---|
| `FIX-01` | P1 | yargs 列為依賴但完全未使用；所有 19 個 `yargsCommand` 匯出為死代碼 | `packages/cli/package.json`, `packages/tools/*/index.ts` (19 個) | 實作偏移、幻覺代碼、架構 | 簡單 |
| `FIX-02` | P1 | 根 `tsconfig.json` 未納入 19 個工具 package 的 project references | `tsconfig.json`, `packages/cli/tsconfig.json` | 實作遺漏、架構 | 簡單 |
| `FIX-03` | P1 | `extract-codex-conversations` 別名未註冊 | `packages/tools/extract-conversations/index.ts` | 實作遺漏 | 簡單 |
| `FIX-04` | P2 | CLI 啟動時靜態載入全部 19 個工具 | `packages/cli/tool-registration.ts`, `packages/cli/index.ts` | 性能 | 複雜 |
| `FIX-05` | P2 | 15 個工具 package 宣告了未使用的 `@laitszkin/tool-utils` 依賴 | `packages/tools/{15 個}/package.json` | 冗余代碼 | 簡單 |
| `FIX-06` | P2 | `validate-openai-agent-config` import `js-yaml` 但未在 package.json 宣告 | `packages/tools/validate-openai-agent-config/package.json` | 架構瑕疵 | 簡單 |
| `FIX-07` | P2 | `js-yaml` 錯誤列為 `packages/cli` 的依賴 | `packages/cli/package.json` | 冗余代碼 | 簡單 |
| `FIX-08` | P2 | 遺留舊建置產物: `bin/apollo-toolkit.js` + `dist/lib/` | `bin/apollo-toolkit.js`, `dist/lib/` (目錄) | 冗余代碼 | 簡單 |
| `FIX-09` | P2 | `elkjs` 未被任何 monorepo package 使用 | `package.json` (根) | 冗余代碼、性能 | 簡單 |
| `FIX-10` | P2 | `buildToolOverview` / `buildToolExamples` 為死導出 | `packages/tool-registry/registry.ts`, `index.ts` | 幻覺代碼 | 簡單 |
| `FIX-11` | P2 | 5 個工具的 `yargsCommand.handler` 使用 `process.argv` 而非 `argv` | `packages/tools/{5 個}/index.ts` | 幻覺代碼 | 由 FIX-01 解決 |
| `FIX-12` | P2 | `architecture` yargsCommand.handler 跳過 `argv._` 位置參數 | `packages/tools/architecture/index.ts` | 幻覺代碼 | 由 FIX-01 解決 |

> **注意**: FIX-11 和 FIX-12 被 FIX-01 完全覆蓋（移除 yargsCommand 即同時消除這些 bug）。不單獨處理。

P3 問題（文檔不一致、空 context 傳遞、SPEC 內部矛盾）不納入本次修復範圍。

---

## 3. Fix Dependency Analysis

### 3.1 依賴圖

```
FIX-08 ── (獨立)
FIX-09 ── (獨立)
FIX-05 ── (獨立)
FIX-06 ── (獨立)
FIX-02 ── (獨立)
FIX-10 ── (獨立)
FIX-03 ──→ FIX-04  (FIX-03 在 extract-conversations 加 aliases，
                      FIX-04 重構 tool-registration.ts 載入機制，
                      必須確認 FIX-03 的 alias 在延遲載入後仍正確註冊)
FIX-01 ──             (19 個工具 yargsCommand 移除，含 extract-conversations；
          │            與 FIX-03 觸及同檔 extract-conversations/index.ts)
          └── FIX-07  (同檔 packages/cli/package.json)
```

### 3.2 檔案重疊檢測

| 衝突組 | 問題 ID | 共享檔案 | 處理方式 |
|---|---|---|---|
| 重疊組 1 | FIX-01, FIX-03 | `packages/tools/extract-conversations/index.ts` | 分至不同批次：FIX-03 (Batch 3) → FIX-01 (Batch 5) |
| 重疊組 2 | FIX-01, FIX-07 | `packages/cli/package.json` | 合併至同一批次 (Batch 5) 一併修改 |
| 重疊組 3 | FIX-03, FIX-04 | `packages/cli/tool-registration.ts` (間接：FIX-03 新增 alias，FIX-04 重構載入邏輯要能載入 alias) | FIX-03 → FIX-04 順序 |
| 無重疊 | FIX-02, FIX-05, FIX-06, FIX-08, FIX-09, FIX-10 | — | 可並行 |

---

## 4. Fix Batch Schedule

### Batch 1 — 簡單獨立修復（並行）

**執行方式**: 直接編輯（無需 subagent）
**問題**: FIX-05 ∥ FIX-06 ∥ FIX-08 ∥ FIX-09

**完成條件**:
- [x] FIX-05: 15 個工具的 package.json 移除 `@laitszkin/tool-utils` 依賴
- [x] FIX-06: validate-openai-agent-config/package.json 加入 `js-yaml` 依賴
- [x] FIX-08: 刪除 `bin/apollo-toolkit.js` 和 `dist/lib/` 目錄
- [x] FIX-09: 根 package.json 移除 `elkjs` 依賴
- [x] `npm install` 成功（確保依賴樹一致）
- [x] `tsc --build` 通過

---

### Batch 2 — 基礎設施修復（並行）

**執行方式**: 直接編輯
**問題**: FIX-02 ∥ FIX-10

**完成條件**:
- [x] FIX-02: 根 tsconfig 與 cli tsconfig 補齊 references
- [x] FIX-10: 移除 `buildToolOverview` / `buildToolExamples` 死導出
- [x] `tsc --build` 零錯誤
- [x] `npm test` 全部通過

---

### Batch 3 — 別名修復（循序）

**執行方式**: 直接編輯
**問題**: FIX-03
**依賴**: Batch 2 完成（需要 tsconfig references 正確以編譯工具）

**完成條件**:
- [x] extract-conversations ToolDefinition 加入 aliases
- [x] 驗證: `apltk extract-codex-conversations --help` 可被識別
- [x] `tsc --build` 通過

---

### Batch 4 — 延遲載入重構（循序）

**執行方式**: 直接編輯（單一檔案涉及但需謹慎處理執行路徑）
**問題**: FIX-04
**依賴**: Batch 3 完成（FIX-03 的 alias 需要在延遲載入下正確運作）

**完成條件**:
- [x] `registerAllTools()` 從模組頂層移入 `run()` 內部
- [x] 僅在 `command === 'tool'` 或 `command === 'tools-help'` 路徑上呼叫
- [x] `parseArguments` 中的 `getToolCommand(firstArg)` 需改用延遲檢查（先比對工具名稱列表再查 registry）
- [x] `npm test` 全部通過
- [x] CLI 基本命令測試: `node dist/bin/apollo-toolkit.js --help`、`node dist/bin/apollo-toolkit.js filter-logs --help`

---

### Batch 5 — yargs 死代碼清理 + 依賴修正（循序）

**執行方式**: 直接編輯（大量檔案但修改模式一致）
**問題**: FIX-01 + FIX-07（合併處理，因共享 packages/cli/package.json）
**依賴**: Batch 4 完成（確保 FIX-03 對 extract-conversations/index.ts 的修改不與此批次衝突）

**完成條件**:
- [x] 19 個工具 `index.ts` 中移除 `export const yargsCommand = {...}` 區塊
- [x] `packages/cli/package.json` 移除 `yargs` 和 `js-yaml` 依賴
- [x] `tsc --build` 零錯誤（確認無殘留的 yargs import）
- [x] `npm test` 全部通過
- [x] `npm ls yargs` 確認不再存在（除非為間接依賴）

---

## 5. Subagent Routing

本次所有修復均為直接編輯，無需 subagent 並行處理。原因：
- 各批次內的問題數量少（最多 4 個）
- 多數修改為簡單的刪除或單行變更
- FIX-04 為唯一複雜修復，需要單一開發者理解完整執行路徑

---

## 6. Per-Issue Fix Details

### FIX-01: 移除 yargs 死代碼與依賴 (P1)

- **審查維度**: 實作偏移、幻覺代碼、架構瑕疵
- **涉及檔案**:
  - `packages/cli/package.json` — 移除 `"yargs": "^18.0.0"` (L41)
  - `packages/tools/*/index.ts` (19 個) — 移除 `export const yargsCommand = {...}` 區塊（每個檔案最後約 20-30 行）
- **根因**: DESIGN.md 規劃了 yargs 整合但在實作中被跳過（可能因工作量過大）。工具層定義了 yargsCommand 但 CLI 層從未使用。
- **修復方案**:
  1. 對 19 個 `packages/tools/*/index.ts`，移除 `export const yargsCommand = {...};` 及前面可能有的空行
  2. 在 `packages/cli/package.json` 移除 `"yargs"` 依賴行
  3. 確認沒有殘留的 `import ... from 'yargs'` 或 `import type { Argv } from 'yargs'`（grep 驗證）
- **修改範圍**: 跨 20 個檔案 (1 package.json + 19 index.ts)
- **複雜度**: 簡單（機械式刪除）
- **驗證方式**:
  - `grep -rn "yargsCommand" packages/tools/` 應無結果
  - `grep -rn "from 'yargs'" packages/` 應無結果
  - `tsc --build` 零錯誤
  - `npm test` 全部通過
- **風險標記**: 無

### FIX-02: 補齊 tsconfig project references (P1)

- **審查維度**: 實作遺漏、架構瑕疵
- **涉及檔案**:
  - `tsconfig.json` (根) L18-23 — 參考陣列僅有 4 個核心 package
  - `packages/cli/tsconfig.json` L19-22 — 參考陣列僅有 tui + tool-registry
- **根因**: 建立工具 package 時未同步更新 tsconfig references。工具 package 各自有 `composite: true`，但根 tsconfig 未宣告對它們的依賴。
- **修復方案**:
  1. 在根 `tsconfig.json` 的 `references` 陣列中加入所有 19 個工具 package 的路徑
  2. 在 `packages/cli/tsconfig.json` 的 `references` 陣列中加入所有 19 個工具 package 的路徑（因為 cli/tool-registration.ts import 它們）
- **修改範圍**: 2 個 tsconfig.json
- **複雜度**: 簡單（在 references 陣列中加入 19 個條目）
- **驗證方式**:
  - `tsc --build` 零錯誤，確認所有 tool package 均被編譯
  - `ls packages/tools/*/dist/index.js` 確認每個工具的 dist 產出存在
- **風險標記**: 無

### FIX-03: 加入 extract-codex-conversations 別名 (P1)

- **審查維度**: 實作遺漏
- **涉及檔案**: `packages/tools/extract-conversations/index.ts` L121-126
- **根因**: 原始 CLI 中 `extract-codex-conversations` 和 `extract-skill-conversations` 是 `extract-conversations` 的別名。重構後 extract-conversations 的 ToolDefinition 未宣告 aliases 欄位。
- **修復方案**:
  在 ToolDefinition 中加入 aliases:
  ```typescript
  export const tool: ToolDefinition = {
    name: 'extract-conversations',
    category: 'Codex memory & learning',
    description: 'Extract recent Codex sessions for memory updates.',
    aliases: ['extract-codex-conversations', 'extract-skill-conversations'],
    handler: extractConversationsHandler,
  };
  ```
  `registerTool()` 已在 registry.ts L7-9 中處理 aliases（為每個 alias 建立 Map entry），無需額外修改。
- **修改範圍**: 僅 1 個檔案，1 行新增
- **複雜度**: 簡單
- **驗證方式**:
  - `tsc --build` 通過
  - 執行期驗證: `getTool('extract-codex-conversations')` 應返回 extract-conversations 的 ToolDefinition
  - `listTools()` 不應包含 alias 條目（僅返回 canonical tools）
- **風險標記**: 無

### FIX-04: 延遲載入工具 package (P2)

- **審查維度**: 性能隱患
- **涉及檔案**:
  - `packages/cli/tool-registration.ts` — 靜態 import 全部 19 個工具
  - `packages/cli/index.ts` L27-30 — 模組頂層呼叫 `registerAllTools()`
  - `packages/cli/index.ts` L263 — `parseArguments` 中 `getToolCommand(firstArg)` 在工具載入前被呼叫
- **根因**: `tool-registration.ts` 在 import 時就會解析全部 19 個工具 package。`index.ts` 在模組載入時立即呼叫 `registerAllTools()`。即使執行 `apltk install`，不需要任何工具定義，也會載入全部 19 個工具。
- **修復方案**:
  1. **`tool-registration.ts`**: 將頂層 import 改為動態 import，`registerAllTools()` 改為 async：
     ```typescript
     export async function registerAllTools(): Promise<void> {
       const modules = await Promise.all([
         import('@laitszkin/tool-filter-logs'),
         import('@laitszkin/tool-search-logs'),
         // ... 全部 19 個
       ]);
       for (const mod of modules) {
         registerTool(mod.tool);
       }
     }
     ```
  2. **`index.ts` L30**: 移除 `registerAllTools()` 頂層呼叫
  3. **`index.ts` `run()` 函數**: 在 `parseArguments` 之前，先快速判斷是否為工具命令（檢查第一個參數是否為已知工具名稱），僅在需要時才 `await registerAllTools()`
  4. **`parseArguments`**: 在 `getToolCommand(firstArg)` (L263) 前確保工具已註冊
- **修改範圍**: `tool-registration.ts` 重寫 + `index.ts` 兩處修改
- **複雜度**: 複雜（需確保執行路徑正確，安裝/卸載/help 路徑不應觸發工具載入）
- **驗證方式**:
  - `tsc --build` 零錯誤
  - `npm test` 全部通過
  - 手動測試: `node dist/bin/apollo-toolkit.js --help` 應快速返回（不載入工具）
  - 手動測試: `node dist/bin/apollo-toolkit.js filter-logs --help` 正確輸出
  - 確認 `parseArguments` 能在工具載入前正確識別 `install`/`uninstall`/`tools` 命令（不依賴 registry）
- **風險標記**: 無

### FIX-05: 移除 15 個工具的冗余 tool-utils 依賴 (P2)

- **審查維度**: 冗余代碼
- **涉及檔案**: 15 個 `packages/tools/<name>/package.json`
- **根因**: 工具 package 建立時統一模板包含了 `@laitszkin/tool-utils` 依賴，但只有 4 個工具實際使用它（filter-logs、search-logs、validate-skill-frontmatter、validate-openai-agent-config）。
- **修復方案**: 對以下 15 個工具的 `package.json`，從 `dependencies` 中移除 `"@laitszkin/tool-utils": "*"`：
  architecture, create-review-report, create-specs, docs-to-voice, enforce-video-aspect-ratio, extract-conversations, extract-pdf-text, find-github-issues, generate-storyboard-images, open-github-issue, read-github-issue, render-error-book, render-katex, review-threads, sync-memory-index
- **修改範圍**: 15 個 package.json，每個刪除 1 行
- **複雜度**: 簡單
- **驗證方式**:
  - `npm install` 成功
  - `tsc --build` 零錯誤（確認不是隱藏依賴）
  - `npm test` 全部通過
- **風險標記**: 無

### FIX-06: validate-openai-agent-config 補齊 js-yaml 依賴 (P2)

- **審查維度**: 架構瑕疵
- **涉及檔案**: `packages/tools/validate-openai-agent-config/package.json`
- **根因**: 該工具在 index.ts L3 import js-yaml，但其 package.json 未宣告。當前因根 package.json 有 js-yaml (hoisted) 而巧合可用。
- **修復方案**: 在 `dependencies` 中加入 `"js-yaml": "^4.1.1"`
- **修改範圍**: 1 個 package.json，1 行新增
- **複雜度**: 簡單
- **驗證方式**:
  - `npm install` 成功
  - `tsc --build` 通過
- **風險標記**: 無

### FIX-07: 移除 packages/cli 中的 js-yaml 錯誤依賴 (P2)

- **審查維度**: 冗余代碼
- **涉及檔案**: `packages/cli/package.json` L42
- **根因**: `js-yaml` 被加入 cli 的 dependencies，但 cli 中沒有檔案 import js-yaml。該依賴實際屬於 validate-openai-agent-config（FIX-06）。
- **修復方案**: 從 `dependencies` 中移除 `"js-yaml": "^4.1.1"`
- **修改範圍**: 1 行刪除
- **複雜度**: 簡單
- **驗證方式**:
  - `tsc --build` 零錯誤
  - `npm test` 全部通過
- **風險標記**: 無
- **注意**: 與 FIX-01 合併在 Batch 5 一起處理（同檔 packages/cli/package.json）

### FIX-08: 清理遺留建置產物 (P2)

- **審查維度**: 冗余代碼
- **涉及檔案**:
  - `bin/apollo-toolkit.js` — CJS 舊入口（引用已不存在的 `lib/cli`）
  - `dist/lib/` 目錄 — 已刪除源的殘留建置產物
- **根因**: 重構後舊的 CJS 入口和建置產物未被清理。
- **修復方案**:
  1. `rm bin/apollo-toolkit.js`
  2. `rm -rf dist/lib/`
- **修改範圍**: 檔案系統清理
- **複雜度**: 簡單
- **驗證方式**:
  - `ls bin/apollo-toolkit.js` 應回報不存在
  - `ls dist/lib/` 應回報不存在
  - `tsc --build` 零錯誤（新的建置不依賴這些遺留檔案）
- **風險標記**: 無

### FIX-09: 移除 elkjs 未使用依賴 (P2)

- **審查維度**: 冗余代碼、性能隱患
- **涉及檔案**: `package.json` (根) L46
- **根因**: `elkjs` 僅在舊的 `skills/init-project-html/lib/atlas/layout.js` 中被引用（非 workspace package），monorepo package 無任何 import。
- **修復方案**: 從根 `package.json` 的 `dependencies` 中移除 `"elkjs": "^0.11.1"`。同時檢查 `devDependencies` 是否有 `@types/elkjs` 需移除。
- **修改範圍**: 1 行刪除
- **複雜度**: 簡單
- **驗證方式**:
  - `npm install` 成功
  - `npm test` 全部通過（尤其確認 atlas 相關測試不受影響 — atlas 使用自己的依賴路徑）
  - `npm ls elkjs` 確認不再為直接依賴
- **風險標記**: 無

### FIX-10: 移除 buildToolOverview / buildToolExamples 死導出 (P2)

- **審查維度**: 幻覺代碼
- **涉及檔案**:
  - `packages/tool-registry/registry.ts` L59-91 — 函數定義
  - `packages/tool-registry/index.ts` — 重新導出
- **根因**: 這些函數從舊 `lib/tool-runner.ts` 遷移過來，但新的 CLI 從未使用它們（幫助文字由 CLI 層的 `buildHelpText` 等函數產生）。
- **修復方案**:
  1. 從 `registry.ts` 移除 `buildToolOverview` (L59-85) 和 `buildToolExamples` (L87-91)
  2. 從 `index.ts` 移除對應的 export 語句
- **修改範圍**: 2 個檔案
- **複雜度**: 簡單
- **驗證方式**:
  - `tsc --build` 零錯誤
  - `npm test` 全部通過
  - `grep -rn "buildToolOverview\|buildToolExamples" packages/` 應無結果
- **風險標記**: 無

---

## 7. Regression Test Strategy

- **必須通過的現有測試**:
  - `npm test` — 涵蓋 CLI 解析、工具執行、安裝/卸載流程、TUI、tool-registry
  - 特別關注: `test/tool-runner.test.js` (工具分發), `test/cli-parsing.test.js` (命令解析), `test/installer.test.js` (安裝流程)
- **新增回歸測試**:
  - [x] FIX-03: 在 `test/tool-runner.test.js` 中確認 `getTool('extract-codex-conversations')` 返回正確工具
  - [x] FIX-04: 確認 `apltk --help` / `apltk install --help` 在未觸發工具載入時仍正常運作
- **Property-based 測試**: N/A — 本次為清理性修復，不改變業務邏輯

---

## 8. Verification Checkpoints

### Checkpoint 1 — Batch 1 完成後
- 執行: `npm install && tsc --build`
- 預期: 依賴樹一致，編譯零錯誤

### Checkpoint 2 — Batch 2 完成後
- 執行: `tsc --build && npm test`
- 預期: 所有 package 編譯成功 (含 19 個工具)，174 測試通過

### Checkpoint 3 — Batch 3 完成後
- 執行: `tsc --build`
- 預期: 編譯成功，alias 正確註冊

### Checkpoint 4 — Batch 4 完成後
- 執行: `npm test`
- 預期: 174 測試通過
- 手動驗證: `node dist/bin/apollo-toolkit.js --help` (快速返回), `node dist/bin/apollo-toolkit.js filter-logs --help` (正確輸出)

### Checkpoint 5 — Batch 5 完成後 (最終驗證)
- 執行: `tsc --build && npm test`
- 預期: 零錯誤，全部通過
- 確認 `grep -rn "yargsCommand\|from 'yargs'" packages/` 無結果
- 確認 `npm ls yargs` yargs 不為直接依賴

---

## 9. Boundaries

### Always
- [x] 每個批次完成後執行對應的驗證 checkpoint
- [x] 修復不得變更現有 CLI 命令名稱、參數格式或輸出格式
- [x] `tsc --build` 必須在每個批次後通過

### Ask First
- [ ] 若發現修復方案需要修改 spec 定義的行為
- [ ] 若 `npm test` 出現非預期的回歸失敗

### Never
- [ ] 新增或刪除 CLI 工具（僅加入別名）
- [ ] 修改工具 handler 的業務邏輯
- [ ] 變更 `ToolDefinition` 介面定義
- [ ] 在未通過驗證 checkpoint 的情況下進入下一批次

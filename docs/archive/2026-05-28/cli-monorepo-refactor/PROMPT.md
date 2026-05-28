# Implementation Plan: CLI Monorepo Refactor

- **Date**: 2026-05-29
- **Type**: Batch Spec
- **Source Spec(s)**:
  - `docs/plans/2026-05-28/cli-monorepo-refactor/package-architecture-foundation/`
  - `docs/plans/2026-05-28/cli-monorepo-refactor/tool-decoupling-dependencies/`

---

## 1. Executive Summary

將 `@laitszkin/apollo-toolkit` 從單體 CommonJS 專案重構為 **npm workspaces monorepo + ESM**，引入 `yargs` / `chalk` / `@inquirer/prompts` 替換手寫實作，並將 20 個 CLI 工具拆分為獨立 package。

**整體策略**: 五個批次，由底層向上建構。先建立 workspace 基礎設施與核心 package（tui / tool-registry / cli），再並行遷移 20 個工具 package，最後整合驗證。

**Spec 依賴**: Spec 1 (架構基礎) → Spec 2 (工具遷移)。Spec 2 的每個工具依賴 Spec 1 的 `tool-registry` 型別與 `tool-utils` 共用代碼。

---

## 2. Dependency Graph

### 2.1 工作單元定義

| 工作單元 ID | 對應範圍 | 目標 | 依賴 |
|---|---|---|---|
| `W1` | Spec 1 — Workspace 基礎 | 根 package.json / tsconfig.json / ESM / 所有子 package 腳手架 | — |
| `W2` | Spec 1 — packages/tui | 從 `lib/utils/terminal.ts` + `lib/cli.ts` 動畫部分 實作 | W1 |
| `W3` | Spec 1 — packages/tool-registry | 從 `lib/types.ts` + `lib/tool-runner.ts` 實作 | W1 |
| `W4` | Spec 1 — packages/cli | 從 `lib/cli.ts` + `lib/installer.ts` + `lib/updater.ts` 實作 | W2, W3 |
| `W5` | Spec 1 — 清理與整合 | 刪除舊檔案、更新 bin 入口、更新測試 import | W4 |
| `W6` | Spec 2 — 共用基礎 | `packages/tool-utils` + 安裝外部依賴 | W5 |
| `W7` | Spec 2 — 工具遷移群組 A | 5 個工具 package (Observability + maintenance) | W6 |
| `W8` | Spec 2 — 工具遷移群組 B | 5 個工具 package (GitHub workflows + 驗證) | W6 |
| `W9` | Spec 2 — 工具遷移群組 C | 5 個工具 package (Rendering & media 前半) | W6 |
| `W10` | Spec 2 — 工具遷移群組 D | 5 個工具 package (Rendering & media 後半 + planning) | W6 |
| `W11` | Spec 2 — 最終整合 | 註冊所有工具、驗證測試、golden snapshot | W7, W8, W9, W10 |

### 2.2 依賴圖

```
W1 (Workspace 基礎)
├── W2 (packages/tui) ──────────────┐
└── W3 (packages/tool-registry) ────┤
                                     ├── W4 (packages/cli) ── W5 (清理整合)
                                     │                        │
                                     │                        ├── W6 (tool-utils + deps)
                                     │                        │   ├── W7 (工具 A: 5 tools)
                                     │                        │   ├── W8 (工具 B: 5 tools)
                                     │                        │   ├── W9 (工具 C: 5 tools)
                                     │                        │   └── W10 (工具 D: 5 tools)
                                     │                        │        │
                                     │                        └── W11 (整合驗證)
```

**關鍵依賴原因**:
- W2 ∥ W3: 無共享檔案，`tui` 和 `tool-registry` 互不依賴
- W4 依賴 W2 + W3: `cli` import `tui` (INT-003) 和 `tool-registry` (INT-005)
- W7-W10 依賴 W6: 工具 package 依賴 `tool-utils` 共用代碼 (INT-013) 及 `tool-registry` 型別 (INT-012)
- W7 ∥ W8 ∥ W9 ∥ W10: 每個工具 package 修改互不重疊的檔案

---

## 3. Batch Schedule

### Batch 1 — Workspace 基礎設施

**執行方式**: 循序 (主流程)
**工作單元**: W1
**依賴**: 無

**任務清單**:
- [x] T1.1 修改根 `package.json`: 加入 `"workspaces": ["packages/*", "packages/tools/*"]`, 設 `"type": "module"`, 更新 `scripts.build` 為 `tsc --build`
- [x] T1.2 修改根 `tsconfig.json`: 改為 project references 模式 (`"files": []`, `"references": [...]`), `"module": "NodeNext"`, `"target": "ES2022"`
- [x] T1.3 建立 `packages/tui/package.json` + `packages/tui/tsconfig.json` (設 `"composite": true`)
- [x] T1.4 建立 `packages/tool-registry/package.json` + `packages/tool-registry/tsconfig.json`
- [x] T1.5 建立 `packages/cli/package.json` + `packages/cli/tsconfig.json` (含 `bin` 指向, `dependencies` 含 yargs)

**完成條件**:
- [x] `npm install` 成功 (workspace symlinks 正確建立)
- [x] 目錄結構驗證: `ls packages/tui/package.json packages/tool-registry/package.json packages/cli/package.json`

---

### Batch 2 — 核心 Package 實作

**執行方式**: 並行 (2 subagents) → 循序
**工作單元**: W2 ∥ W3 → W4
**依賴**: Batch 1 完成

#### Phase 2a: 並行實作 tui + tool-registry

**完成條件**:
- [x] `packages/tui/index.ts` 匯出所有公開 API (UT-03 ~ UT-06)
- [x] `packages/tool-registry/index.ts` 匯出所有公開 API (UT-07 ~ UT-09)

#### Phase 2b: 實作 cli (依賴 2a)

**完成條件**:
- [x] `packages/cli/index.ts` 匯出 `run()` (UT-01)
- [x] `packages/cli/installer.ts` 從 `lib/installer.ts` 遷移
- [x] `packages/cli/updater.ts` 從 `lib/updater.ts` 遷移

---

### Batch 3 — 清理與整合

**執行方式**: 循序 (主流程)
**工作單元**: W5
**依賴**: Batch 2

**任務清單**:
- [x] T5.1 更新 `bin/apollo-toolkit.ts` import 路徑指向 `packages/cli` (UT-02)
- [x] T5.2 刪除已遷移的舊檔案: `lib/cli.ts`, `lib/installer.ts`, `lib/updater.ts`, `lib/types.ts`, `lib/tool-runner.ts`, `lib/utils/terminal.ts`, `lib/utils/format.ts`
- [x] T5.3 更新 `lib/utils/skill-discovery.ts` → `packages/tool-utils/skill-discovery.ts` (Batch 4 前移)
- [x] T5.4 更新測試檔案 import 路徑 (從 `dist/lib/...` → 新路徑)

**完成條件**:
- [x] `tsc --build` 成功 (IT-02)
- [x] `npm test` 通過 (IT-03)

---

### Batch 4 — 工具 Package 遷移

**執行方式**: 並行 (4 subagents)
**工作單元**: W6 (主流程) → W7 ∥ W8 ∥ W9 ∥ W10 (4 subagents)
**依賴**: Batch 3 完成

#### Phase 4a: 共用基礎 (主流程)

- [x] T6.1 建立 `packages/tool-utils/package.json` + `packages/tool-utils/tsconfig.json`
- [x] T6.2 `packages/tool-utils/index.ts` — 從 `lib/tools/log-cli-utils.ts` 遷移所有函數 (UT-12)
- [x] T6.3 `packages/tool-utils/skill-discovery.ts` — 從 `lib/utils/skill-discovery.ts` 遷移
- [x] T6.4 `npm install yargs chalk @inquirer/prompts` (或加入根 package.json)

**完成條件**:
- [x] `packages/tool-utils` 匯出 `extractTimestamp`, `iterInputLines`, `parseCliTimestamp`, `inWindow`, `buildTimezone`, `validateTimeWindow`, `iterSkillDirs`

#### Phase 4b: 工具遷移 (4 subagents 並行)

**完成條件** (每個工具):
- [x] 建立 `packages/tools/<tool-name>/package.json` + `tsconfig.json`
- [x] `packages/tools/<tool-name>/index.ts` 匯出 `tool: ToolDefinition` + `yargsCommand`
- [x] Handler 從 `lib/tools/<tool-name>.ts` 遷移，移除 `@ts-nocheck` (UT-14)
- [x] yargs handler 適配: argv 物件 → string[] 轉換 → 調用原 handler

---

### Batch 5 — 最終整合與驗證

**執行方式**: 循序 (主流程)
**工作單元**: W11
**依賴**: Batch 4

**任務清單**:
- [x] T11.1 `packages/cli/tool-registration.ts` — 匯入所有 20 個工具，逐一 `registerTool()`
- [x] T11.2 `packages/cli/index.ts` — 使用 yargs `.command(tool.yargsCommand)` 註冊所有工具命令
- [x] T11.3 刪除 `lib/tools/*.ts` 舊檔案 (已遷移)
- [x] T11.4 執行 REG-01 (CLI --help golden 比對)
- [x] T11.5 執行 REG-03 (20 個工具 --help golden 比對)
- [x] T11.6 執行 REG-07 (現有測試全部通過)
- [x] T11.7 執行完整測試套件 `npm test`

**完成條件**:
- [x] `tsc --build` 零錯誤
- [x] `npm test` 全部通過
- [x] 所有 golden snapshot 比對一致
- [x] `apltk --help` 輸出與重構前一致

---

## 4. Subagent Assignments

### Batch 2 — Subagent A: packages/tui

- **工作單元**: W2
- **目標**: 從 `lib/utils/terminal.ts` + `lib/cli.ts` 動畫/Banner 部分建立 `packages/tui`
- **工作目錄**: `docs/plans/2026-05-28/cli-monorepo-refactor/package-architecture-foundation/`
- **任務清單**:
  - [x] T2.1: 建立 `packages/tui/index.ts` — 遷移 `color`, `supportsColor`, `clearScreen`, `sleep`, `supportsAnimation` (`lib/utils/terminal.ts:1-23`)
  - [x] T2.2: 加入 `chalk` 包裝層 — 替換 ANSI escape code 拼接
  - [x] T2.3: 遷移 `buildWordmark`, `buildBanner`, `buildWelcomeScreen`, `animateWelcomeScreen` (`lib/cli.ts:27-101`)
  - [x] T2.4: 遷移 `renderSelectionScreen`, `buildSupportedTargetLines` (`lib/cli.ts:357-389`)
  - [x] T2.5: 使用 `@inquirer/prompts` 的 `checkbox` + `confirm` 實作 `promptForModes` + `promptYesNo` (取代 `lib/cli.ts` 的 `promptForSelectableModes` 和 `promptYesNo`)
  - [x] T2.6: 匯出介面: `promptForModes(opts)`, `promptYesNo(opts)`, `buildBanner(opts)`, `buildWelcomeScreen(opts)`, `renderSelectionScreen(opts)`
- **允許修改的檔案**:
  - `packages/tui/package.json`
  - `packages/tui/tsconfig.json`
  - `packages/tui/index.ts`
- **禁止修改的檔案**:
  - `packages/tool-registry/*` (Subagent B)
  - `packages/cli/*` (由 Phase 2b 處理)
  - `lib/` 下的任何檔案 (僅讀取，不修改)
- **風險標記**: 外部 API (@inquirer/prompts 行為可能微調)
- **驗證命令**: `npx tsc --build --project packages/tui/tsconfig.json`

---

### Batch 2 — Subagent B: packages/tool-registry

- **工作單元**: W3
- **目標**: 從 `lib/types.ts` + `lib/tool-runner.ts` 建立 `packages/tool-registry`
- **工作目錄**: `docs/plans/2026-05-28/cli-monorepo-refactor/package-architecture-foundation/`
- **任務清單**:
  - [x] T3.1: 遷移型別定義 (`lib/types.ts` → `packages/tool-registry/types.ts`): `ToolDefinition`, `ToolContext`, `ToolHelp`, `ToolExample`, `InstallMode` 等
  - [x] T3.2: 建立 `registerTool(tool: ToolDefinition): void` (Registration API)
  - [x] T3.3: 建立 `getTool(name: string): ToolDefinition | null` (Lookup API)
  - [x] T3.4: 建立 `listTools(): ToolDefinition[]` (List API)
  - [x] T3.5: 建立 `runTool(name, args, context): Promise<number>` (Dispatch API)
  - [x] T3.6: 遷移 `formatToolList`, `buildToolDiscoveryHelp`, `buildToolOverview`, `buildToolExamples` (`lib/tool-runner.ts:405-468`)
  - [x] T3.7: 遷移 `formatExamples` (`lib/utils/format.ts`)
  - [x] T3.8: `packages/tool-registry/index.ts` 匯出所有公開 API
- **允許修改的檔案**:
  - `packages/tool-registry/package.json`
  - `packages/tool-registry/tsconfig.json`
  - `packages/tool-registry/index.ts`
  - `packages/tool-registry/types.ts`
- **禁止修改的檔案**:
  - `packages/tui/*` (Subagent A)
  - `packages/cli/*` (由 Phase 2b 處理)
  - `lib/` 下的任何檔案 (僅讀取，不修改)
- **風險標記**: 無
- **驗證命令**: `npx tsc --build --project packages/tool-registry/tsconfig.json`

---

### Batch 4 — Subagent A: 工具群組 A (Observability + Catalog)

- **工作單元**: W7
- **目標**: 遷移 5 個工具至獨立 package
- **工作目錄**: `docs/plans/2026-05-28/cli-monorepo-refactor/tool-decoupling-dependencies/`
- **任務清單**:
  - [x] T7.1: `packages/tools/filter-logs` — 遷移 `lib/tools/filter-logs.ts`, 添加 yargsCommand, 移除 @ts-nocheck
  - [x] T7.2: `packages/tools/search-logs` — 遷移 `lib/tools/search-logs.ts`, 添加 yargsCommand, 移除 @ts-nocheck
  - [x] T7.3: `packages/tools/validate-skill-frontmatter` — 遷移 `lib/tools/validate-skill-frontmatter.ts`
  - [x] T7.4: `packages/tools/validate-openai-agent-config` — 遷移 `lib/tools/validate-openai-agent-config.ts`
  - [x] T7.5: `packages/tools/sync-memory-index` — 遷移 `lib/tools/sync-memory-index.ts`
- **允許修改的檔案**:
  - `packages/tools/filter-logs/*`
  - `packages/tools/search-logs/*`
  - `packages/tools/validate-skill-frontmatter/*`
  - `packages/tools/validate-openai-agent-config/*`
  - `packages/tools/sync-memory-index/*`
- **禁止修改的檔案**:
  - 其他 15 個工具 package (Subagent B/C/D)
  - `packages/tui/*`, `packages/tool-registry/*`, `packages/cli/*`, `packages/tool-utils/*`
- **風險標記**: @ts-nocheck 移除 (filter-logs, search-logs)
- **驗證命令**: `npx tsc --build` 針對這 5 個 package

---

### Batch 4 — Subagent B: 工具群組 B (GitHub + Conversations)

- **工作單元**: W8
- **目標**: 遷移 5 個工具至獨立 package
- **工作目錄**: `docs/plans/2026-05-28/cli-monorepo-refactor/tool-decoupling-dependencies/`
- **任務清單**:
  - [x] T8.1: `packages/tools/open-github-issue` — 遷移 `lib/tools/open-github-issue.ts`, 添加 yargsCommand, 移除 @ts-nocheck
  - [x] T8.2: `packages/tools/find-github-issues` — 遷移 `lib/tools/find-github-issues.ts`, 添加 yargsCommand, 移除 @ts-nocheck
  - [x] T8.3: `packages/tools/read-github-issue` — 遷移 `lib/tools/read-github-issue.ts`, 添加 yargsCommand, 移除 @ts-nocheck
  - [x] T8.4: `packages/tools/review-threads` — 遷移 `lib/tools/review-threads.ts`, 添加 yargsCommand, 移除 @ts-nocheck
  - [x] T8.5: `packages/tools/extract-conversations` — 遷移 `lib/tools/extract-conversations.ts`, 處理 extract-codex-conversations + extract-skill-conversations 兩個別名
- **允許修改的檔案**:
  - `packages/tools/open-github-issue/*`
  - `packages/tools/find-github-issues/*`
  - `packages/tools/read-github-issue/*`
  - `packages/tools/review-threads/*`
  - `packages/tools/extract-conversations/*`
- **禁止修改的檔案**: 同 Subagent A 規則
- **風險標記**: @ts-nocheck 移除 (4 個檔案)
- **驗證命令**: `npx tsc --build`

---

### Batch 4 — Subagent C: 工具群組 C (Rendering & Media 前半)

- **工作單元**: W9
- **目標**: 遷移 5 個工具至獨立 package
- **任務清單**:
  - [x] T9.1: `packages/tools/docs-to-voice` — 遷移 `lib/tools/docs-to-voice.ts`
  - [x] T9.2: `packages/tools/render-katex` — 遷移 `lib/tools/render-katex.ts`
  - [x] T9.3: `packages/tools/render-error-book` — 遷移 `lib/tools/render-error-book.ts`
  - [x] T9.4: `packages/tools/generate-storyboard-images` — 遷移 `lib/tools/generate-storyboard-images.ts`
  - [x] T9.5: `packages/tools/enforce-video-aspect-ratio` — 遷移 `lib/tools/enforce-video-aspect-ratio.ts`
- **允許修改/禁止修改的檔案**: 同規則
- **風險標記**: 無 @ts-nocheck (這組無型別問題)
- **驗證命令**: `npx tsc --build`

---

### Batch 4 — Subagent D: 工具群組 D (Planning + PDF)

- **工作單元**: W10
- **目標**: 遷移 5 個工具至獨立 package
- **任務清單**:
  - [x] T10.1: `packages/tools/architecture` — 遷移 `lib/tools/architecture.ts`, 改寫 `require()` 為動態 `import()` + 修復 skills 路徑
  - [x] T10.2: `packages/tools/create-specs` — 遷移 `lib/tools/create-specs.ts`
  - [x] T10.3: `packages/tools/create-review-report` — 遷移 `lib/tools/create-review-report.ts`
  - [x] T10.4: `packages/tools/extract-pdf-text` — 遷移 `lib/tools/extract-pdf-text.ts`
  - [x] T10.5: `packages/tools/extract-codex-conversations` — 建立別名 package (指向 extract-conversations)
- **允許修改/禁止修改的檔案**: 同規則
- **風險標記**: @ts-nocheck 移除 + `require()` → `import()` (architecture.ts)
- **驗證命令**: `npx tsc --build`

---

## 5. File Ownership Map

| 檔案路徑 | 擁有者 | 備註 |
|---|---|---|
| `package.json` (根) | Batch 1 (主流程) | workspace + ESM config |
| `tsconfig.json` (根) | Batch 1 (主流程) | project references |
| `packages/tui/*` | Subagent A (Batch 2) | TUI package |
| `packages/tool-registry/*` | Subagent B (Batch 2) | Tool registry |
| `packages/cli/*` | Phase 2b (主流程) | Depends on tui + tool-registry |
| `packages/cli/installer.ts` | Phase 2b (主流程) | Moved from lib/installer.ts |
| `packages/cli/updater.ts` | Phase 2b (主流程) | Moved from lib/updater.ts |
| `packages/cli/tool-registration.ts` | Batch 5 (主流程) | Imports all tools |
| `packages/tool-utils/*` | Batch 4 Phase 4a (主流程) | Shared utilities |
| `bin/apollo-toolkit.ts` | Batch 3 (主流程) | Entry point update |
| `lib/cli.ts` | 刪除 (Batch 3) | Migrated to packages/cli |
| `lib/installer.ts` | 刪除 (Batch 3) | Migrated to packages/cli/installer.ts |
| `lib/updater.ts` | 刪除 (Batch 3) | Migrated to packages/cli/updater.ts |
| `lib/types.ts` | 刪除 (Batch 3) | Migrated to packages/tool-registry/types.ts |
| `lib/tool-runner.ts` | 刪除 (Batch 3) | Migrated to packages/tool-registry |
| `lib/utils/terminal.ts` | 刪除 (Batch 3) | Migrated to packages/tui |
| `lib/utils/format.ts` | 刪除 (Batch 3) | Migrated to packages/tool-registry |
| `lib/tools/log-cli-utils.ts` | 遷移 (Batch 4a) | → packages/tool-utils |
| `lib/utils/skill-discovery.ts` | 遷移 (Batch 4a) | → packages/tool-utils |
| `lib/tools/*.ts` (20 files) | 各自 Subagent (Batch 4) | 遷移後刪除 (Batch 5) |
| `test/**/*.js` | Batch 3 (主流程) | Import path updates |
| `packages/tools/filter-logs/*` | Subagent A (Batch 4) | — |
| `packages/tools/search-logs/*` | Subagent A (Batch 4) | — |
| `packages/tools/validate-skill-frontmatter/*` | Subagent A (Batch 4) | — |
| `packages/tools/validate-openai-agent-config/*` | Subagent A (Batch 4) | — |
| `packages/tools/sync-memory-index/*` | Subagent A (Batch 4) | — |
| `packages/tools/open-github-issue/*` | Subagent B (Batch 4) | — |
| `packages/tools/find-github-issues/*` | Subagent B (Batch 4) | — |
| `packages/tools/read-github-issue/*` | Subagent B (Batch 4) | — |
| `packages/tools/review-threads/*` | Subagent B (Batch 4) | — |
| `packages/tools/extract-conversations/*` | Subagent B (Batch 4) | — |
| `packages/tools/docs-to-voice/*` | Subagent C (Batch 4) | — |
| `packages/tools/render-katex/*` | Subagent C (Batch 4) | — |
| `packages/tools/render-error-book/*` | Subagent C (Batch 4) | — |
| `packages/tools/generate-storyboard-images/*` | Subagent C (Batch 4) | — |
| `packages/tools/enforce-video-aspect-ratio/*` | Subagent C (Batch 4) | — |
| `packages/tools/architecture/*` | Subagent D (Batch 4) | — |
| `packages/tools/create-specs/*` | Subagent D (Batch 4) | — |
| `packages/tools/create-review-report/*` | Subagent D (Batch 4) | — |
| `packages/tools/extract-pdf-text/*` | Subagent D (Batch 4) | — |
| `lockfile` (`package-lock.json`) | Batch 5 (主流程) | 最終統一更新 |

---

## 6. Lockfile Strategy

由 **Batch 1** 初始生成 (`npm install`)，**Batch 4** 不修改 (subagent 不執行 `npm install`)，**Batch 5** 統一執行 `npm install` 更新 lockfile。

---

## 7. Verification Checkpoints

### Checkpoint 1 — Batch 1 完成後
- 執行: `ls packages/*/package.json && npm install`
- 預期: 所有 package.json 存在，npm install 成功

### Checkpoint 2 — Batch 2 完成後
- 執行: `npx tsc --build`
- 預期: tui + tool-registry + cli 三個 package 編譯成功

### Checkpoint 3 — Batch 3 完成後
- 執行: `npm test`
- 預期: 所有現有測試通過 (import 路徑已更新)

### Checkpoint 4 — Batch 4 完成後
- 執行: `npx tsc --build` (應該無錯誤)
- 預期: 20 個工具 package + tool-utils 編譯成功

### Checkpoint 5 — Batch 5 完成後 (最終驗證)
- 執行: `npx tsc --build && npm test`
- 預期: 全部編譯通過，全部測試通過
- Golden snapshot 檢查: `apltk --help` 與 `apltk <tool> --help` 輸出一致

---

## 8. Error Recovery

| 失敗場景 | 處理方式 |
|---|---|
| Subagent (Batch 2/4) 執行失敗 | 重試一次；再次失敗則暫停，通知用戶 |
| 同批次其他 subagent 成功 | 保留成功結果，不廢棄 |
| `tsc --build` 失敗 | 檢查依賴順序 (tui → tool-registry → cli)，修復循環依賴 |
| 合併衝突 (Batch 5) | 手動解決衝突後重新執行該批次驗證 |
| 測試回歸 (REG-xx) | 暫停，比對 golden snapshot 差異，標記問題後等待決策 |
| @ts-nocheck 移除後型別錯誤 | 修復型別標註，若複雜度過高則標記該檔案延後處理 |

---

## 9. Boundaries

### Always
- [x] 每個批次完成後執行對應的驗證 checkpoint
- [x] 遵循 `DESIGN.md` 定義的模組邊界 (tui ∥ tool-registry → cli → tools)
- [x] 遵循 `ToolDefinition` 介面合約 (`handler: (args: string[], context: ToolContext) => Promise<number>`)
- [x] yargs handler 內部做 argv → string[] 轉換，保持 handler 簽名不變

### Ask First
- [x] 修改 `skills/` 目錄結構
- [x] 變更現有 CLI 命令名稱或參數名稱
- [x] 超出 spec 定義範圍的變更 (如新增工具、改變輸出行為)
- [x] 修改 npm 發布相關的 package.json 欄位

### Never
- [x] 修改其他 subagent 擁有的檔案 (見 File Ownership Map)
- [x] 提交 node_modules 或 dist 目錄
- [x] 跳過驗證 checkpoint 直接進入下一批次
- [x] 在工具 package 中 import 其他工具 package (每個工具獨立)
- [x] 在 `tool-registry` 中 import 特定工具 package

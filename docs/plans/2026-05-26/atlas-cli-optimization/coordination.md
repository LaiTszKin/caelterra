# Coordination: atlas-cli-optimization

- Date: 2026-05-26
- Batch: atlas-cli-optimization

## Business Goals

將六項 `apltk architecture` CLI 優化需求（O1-O6）拆分為四份可獨立實作的 spec，提升 AI agent 使用 atlas CLI 時的準確性與效率。所有實作均在現有 CommonJS 技術棧內完成，不引入新 runtime 依賴。

- Batch members: [[cli-status-and-dry-run], [cli-scan-and-validate], [evidence-and-mode-detection], [dependency-upgrade]]
- Shared outcome: AI agent 能透過程式化介面查詢 atlas 狀態、預覽變更、取得修復建議、標記證據品質，並在不同開發階段自動選擇正確的工作模式
- Out of scope: O7 結構化對話框架（已明確排除）、任何 UI / 前端變更、外部工具整合

## Design Principles

- Current baseline: CommonJS、Node.js >= 18.18、TypeScript 6.0.3 編譯至 ES2022
- Shared invariants: 所有現有 CLI verb 行為保持不變；`npm test` 全部通過；YAML schema 向後相容
- Shared constraints: 零新 runtime 依賴；僅使用 Node.js 內建模組 (`fs`、`path`) 實作新功能；`--dry-run` 不可修改任何 YAML 檔案
- Legacy direction: 自訂 `parseFlags` 保留不變（不引入 Commander/yargs）
- Compatibility window: None — 全部為新增功能，無破壞性變更
- Cleanup after cutover: None

## Spec Boundaries

### Ownership Map

#### Spec Set 1: cli-status-and-dry-run (O1 + O4)
- Primary concern: `status` verb + `--dry-run` global flag
- Allowed touch points: `init-project-html/lib/atlas/cli.js`、`init-project-html/lib/atlas/state.js`、`lib/tools/architecture.ts`
- Must not change: `schema.js`、`render.js`、SKILL.md

#### Spec Set 2: cli-scan-and-validate (O2 + O3)
- Primary concern: `scan` verb + `validate` fix suggestions
- Allowed touch points: `init-project-html/lib/atlas/cli.js`、`init-project-html/lib/atlas/schema.js`、`lib/tools/architecture.ts`
- Must not change: `state.js`、`render.js`、SKILL.md

#### Spec Set 3: evidence-and-mode-detection (O5 + O6)
- Primary concern: `--evidence` flag + mode detection in SKILL.md
- Allowed touch points: `init-project-html/lib/atlas/cli.js`、`init-project-html/lib/atlas/render.js`、`init-project-html/SKILL.md`
- Must not change: `schema.js`、`state.js`

#### Spec Set 4: dependency-upgrade
- Primary concern: package.json 依賴版本升級
- Allowed touch points: `package.json`
- Must not change: 任何 `.js` / `.ts` 原始碼

### Collisions & Integration

- Shared files & edit rules: `cli.js` 被 Spec A、B、C 三方修改。編輯規則 — 各 spec 僅在 `dispatch()` switch 中新增 case、在 `parseFlags` boolean set 中新增 flag、新增獨立 verb 函數（如 `verbStatus`、`verbScan`），不修改現有 verb 函數的內部邏輯
- Shared API / schema freeze: `schema.validate()` 的回傳格式從 `string[]` 改為 `{ errors: string[], fixCommands: string[] }`（Spec B 負責）；Spec C 的 `--evidence` flag 不影響 schema
- Compatibility shim retention: None
- Merge order: D → B → A → C（建議；實際上 A/B/D 獨立，C 依賴 B 的新 validate 回傳格式）
- Integration checkpoints: 全部 spec 合併後，`apltk architecture validate` 報錯附 fix command、`apltk architecture status --json` 輸出正確 JSON、`apltk architecture feature add --dry-run` 不寫入檔案
- Re-coordination trigger: 若 Spec B 的 validate 回傳格式改動影響 Spec C 的 `--evidence` 驗證整合，需重新對齊

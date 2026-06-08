# Architecture Diff: 簡化 apltk architecture 指令

- **Date**: 2026-06-07
- **Baseline**: `resources/project-architecture/atlas/atlas.index.yaml` (2026-06-06)
- **Spec**: `docs/plans/2026-06-07/architecture-simplify/SPEC.md`

---

## System Context (Level 1)

**No change** — 外部 actors (Developer, AI Agent) 與 system boundary 不變。Agent 仍然透過 `apltk architecture <verb>` 與系統互動。

| Actor | Before | After |
|---|---|---|
| Developer / AI Agent | 可呼叫 19+ verbs | 可呼叫 6 verbs: add/remove/open/diff/merge/render |

---

## Container Level (Level 2) — Features

**No change** — 受影響的程式碼全部在現有的 `cli-dispatch` feature 內，不新增或移除 feature。

| Feature | Before | After |
|---|---|---|
| `cli-dispatch` | architecture tool 透過 tool-discovery submodule 註冊 | 同上，僅修改 dispatch 與 help-builder |

---

## Component Level (Level 3) — Submodules

| Submodule | Before | After |
|---|---|---|
| `arg-parser` | 現有 dispatch switch: `case 'feature'`, `'submodule'`, `'function'`, `'variable'`, `'dataflow'`, `'error'`, `'edge'`, `'meta'`, `'actor'` | 新增 `case 'add'` → `verbAdd()` 和 `case 'remove'` → `verbRemove()`。移除 `case 'feature'` 等 fine-grained verbs 的 help 顯示 |
| `tool-discovery` (TS) | `architectureHandler()` intercepts `apply`/`template` | 移除 intercept，全數 delegate 到 cli.js。`apply`/`template` handler 函數保留但不再可從 CLI 到達 |
| `help-builder` | `buildArchitectureHelpPage()` 列出所有 verbs | 白名單制：僅列出 `add`、`remove`、`diff`、`merge`、`render`、`open` |

---

## Code Level (Level 4) — Function Changes

### Added Functions

| Function | Module | Purpose |
|---|---|---|
| `verbAdd(args, flags, projectRoot, io)` → `number` | `cli.js` | 統一 add 指令入口，解析 entity type，map 到對應 verb 函數 |
| `verbRemove(args, flags, projectRoot, io)` → `number` | `cli.js` | 統一 remove 指令入口，同 add pattern |

### Modified Functions

| Function | Module | Change |
|---|---|---|
| `architectureHandler(args, context)` → `number` | `index.ts` | 不再 檢查 `apply`/`template` 作為第一個參數 |
| `buildArchitectureHelpPage(verbs, flagInfos)` → `string` | `cli-help.js` or `help-builder.ts` | 過濾輸出，只顯示白名單 verbs |

### Removed CLI Routes

| CLI Route | Reason |
|---|---|
| `apltk architecture apply <yaml>` | 退役 — agent 改使用 `apltk architecture add` |
| `apltk architecture template --spec <dir> --output <dir>` | 退役 — agent 改使用 `apltk architecture add` |
| `apltk architecture feature <add\|set\|remove>` | 隱藏 — 由 `add feature` / `remove feature` 取代 |
| `apltk architecture submodule <add\|set\|remove>` | 隱藏 — 由 `add module` / `remove module` 取代 |
| `apltk architecture edge <add\|remove>` | 隱藏 — 由 `add relation` / `remove relation` 取代 |
| `apltk architecture function <add\|remove>` | 隱藏 — 超過最小使用範圍 |
| `apltk architecture variable <add\|remove>` | 隱藏 |
| `apltk architecture dataflow <add\|remove\|reorder>` | 隱藏 |
| `apltk architecture error <add\|remove>` | 隱藏 |
| `apltk architecture meta set` | 隱藏 |
| `apltk architecture actor <add\|remove>` | 隱藏 |

---

## 驗證 (Baseline Drift Assessment)

Baseline atlas（atlas.index.yaml dated 2026-06-06）與當前程式碼一致 — feature 清單正確對應到 `packages/` 與 `skills/` 目錄結構。無需 drift correction。

本次 Architecture Diff 可直接疊加在 baseline 之上。

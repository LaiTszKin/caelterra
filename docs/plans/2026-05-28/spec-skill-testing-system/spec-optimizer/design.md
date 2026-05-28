# Design: 優化器

- Date: 2026-05-28
- Feature: 優化器
- Change Name: spec-optimizer

## Traceability

|                             |                                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| Requirement IDs             | R1.1-R1.4, R2.1-R2.3, R3.1-R3.4                                             |
| In-scope modules (≤3)       | `scripts/optimize.mjs`, `skills/spec/SKILL.md`, `lib/tools/create-specs.ts`, `lib/tools/architecture.ts` |
| External systems touched    | 評分模型 API (用於生成 suggestedFix) — see `contract.md`                       |
| Batch coordination          | `../coordination.md`                                                         |

## Target vs baseline

|                       | Baseline (today) | Target (after this change) |
| --------------------- | ---------------- | --------------------------- |
| Structure / ownership | 無自動化優化機制 | 評分→去重→優化→驗證的完整閉環 |

## Boundaries

- Entry surface(s): CLI (`node scripts/optimize.mjs`)
- Trust boundary crossed: 檔案寫入（修改 SKILL.md 和 TypeScript 原始碼）
- Outside → inside (one line): `User runs script` → `loadAllScores()` → `dedup` → `optimize` → `validate`

## Modules (nouns only)

| Module key | Responsibility | Owned artifacts |
| ---------- | -------------- | --------------- |
| `optimize` | 彙整、去重、產出優化計劃並執行優化 | `scripts/optimize.mjs`, `optimization-plan.json` |
| `spec-skill` | spec 技能的 SKILL.md（優化目標） | `skills/spec/SKILL.md` |
| `apltk-tools` | apltk CLI 工具的 TypeScript 原始碼（優化目標） | `lib/tools/create-specs.ts`, `lib/tools/architecture.ts` |

---

## Interaction anchors (`INT-###`)

| ID | Intent | Caller → Callee | Coupling kind | Information crossing | Failure expectation |
| -- | ------ | --------------- | ------------- | -------------------- | ------------------- |
| `INT-001` | 讀取評分結果 | `optimize.mjs` → `results/spec/{date}/` | file read | score.json 陣列 | 缺失或損壞時 skip |
| `INT-002` | 生成修復建議 | `optimize.mjs` → 評分模型 API | HTTP POST | issue + evidence → suggestedFix | 重試 + fallback |
| `INT-003` | 寫入優化後 SKILL.md | `optimize.mjs` → `skills/spec/SKILL.md` | file write | 優化後內容 | 先備份再寫入 |
| `INT-004` | 驗證優化結果 | `optimize.mjs` → `apltk validate` / `npm test` | child_process | exit code | 驗證失敗時保留備份 |

**Ordering / concurrency:** 嚴格順序：讀取 → 去重 → 生成計劃 → 執行優化 → 驗證

## Requirement linkage

### R1 (彙整去重) → R2 (技能優化) + R3 (工具優化)

- Anchor order hint: `INT-001` → `INT-002` → `INT-003` + `INT-004`
- Narrative glue: 去重必須在優化之前完成，以避免重複修改同一位置；優化和驗證必須先備份

## Data & persistence

| Resource | Typical readers/writers | Consistency expectation |
| -------- | ----------------------- | ----------------------- |
| `results/spec/{date}/test_*/score.json` | optimize (讀) | Spec C 定義的 schema |
| `results/spec/{date}/optimization-plan.json` | optimize (寫) | 去重後的唯一問題清單 |
| `skills/spec/SKILL.md` | optimize (讀寫) | 優化前備份 |
| `lib/tools/*.ts` | optimize (讀寫) | 優化後 npm test 通過 |

## Invariants

| Invariant | What breaks it | Symptoms if violated |
| --------- | -------------- | -------------------- |
| 優化不引入新錯誤 | 評分模型生成的修改有 bug | npm test 失敗（由驗證步驟攔截） |
| CLI 向後相容 | 修改了公開介面 | 下游依賴 break |
| 去重不丟失獨特問題 | 相似度門檻過高 | 不同問題被錯誤合併 |

## Tradeoffs inherited by implementation

| Decision | Rejected alternative | Locks in |
| -------- | -------------------- | -------- |
| 產出 patch 供審查（非直接修改源碼） | 直接修改源碼 | 可先人工審查再套用 |
| 評分模型輔助去重 | 純關鍵詞匹配 | 語義相似但措辭不同的問題可識別 |
| 單輪優化 | 多輪迭代優化 | 簡單可控，後續可擴充為迭代模式 |

## Batch-only

score.json 輸入 schema 由 Spec C 定義；優化後的 SKILL.md 和工具源碼需通過 Spec C 的重新測試驗證

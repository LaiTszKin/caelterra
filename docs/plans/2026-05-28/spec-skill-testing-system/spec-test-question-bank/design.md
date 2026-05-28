# Design: 測試題庫

- Date: 2026-05-28
- Feature: 測試題庫
- Change Name: spec-test-question-bank

## Traceability

|                             |                                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| Requirement IDs             | R1.1-R1.4, R2.1-R2.5, R3.1-R3.2                                             |
| In-scope modules (≤3)       | `assets/spec/` 目錄, `scripts/question-utils.mjs`                            |
| External systems touched    | None                                                                         |
| Batch coordination          | `../coordination.md`                                                         |

## Target vs baseline

|                       | Baseline (today) | Target (after this change) |
| --------------------- | ---------------- | --------------------------- |
| Structure / ownership | 無測試題目基礎設施 | `assets/spec/` 下有 schema + 100 道題目 + 工具函數 |

## Boundaries

- Entry surface(s): `scripts/question-utils.mjs` 匯出的 `loadQuestions()`, `stripScoringCriteria()`, `getScoringCriteria()`
- Trust boundary crossed: `None`
- Outside → inside (one line): `測試執行器調用 loadQuestions()` → `stripScoringCriteria()` 剝離敏感欄位 → `傳遞給 agent`

## Modules (nouns only)

| Module key | Responsibility (one sentence) | Owned artifacts |
| ---------- | ---------------------------- | --------------- |
| `question-schema` | 定義題目 JSON 結構與驗證規則 | `assets/spec/question-schema.json` |
| `test-questions` | 100 道測試題目資料 | `assets/spec/{date}/test-questions.json` |
| `question-utils` | 題目載入、剝離、驗證工具函數 | `scripts/question-utils.mjs` |

---

## Interaction anchors (`INT-###`)

| ID | Intent | Caller → Callee | Coupling kind | Information crossing | Failure expectation |
| -- | ------ | --------------- | ------------- | -------------------- | ------------------- |
| `INT-001` | 執行器載入題目 | `run-evals.mjs` → `question-utils.mjs` | sync call (import) | 題目陣列（剝離後） | schema 驗證失敗時報錯退出 |
| `INT-002` | 評分器讀取評分標準 | `score.mjs` → `question-utils.mjs` | sync call (import) | scoringCriteria 物件 | 題目 ID 不存在時報錯 |

**Ordering / concurrency:** Task 1 (schema) → Task 2 (題目內容) → Task 3 (工具函數)

## Requirement linkage

### R1 cluster (Schema) → R2 cluster (題目內容) → R3 cluster (工具函數)

- Anchor order hint: `INT-001` → `INT-002`
- Narrative glue: schema 定義必須先完成，題目內容才能通過驗證；工具函數依賴 schema 做剝離邏輯

## Data & persistence

| Resource | Typical readers/writers | Consistency expectation |
| -------- | ----------------------- | ----------------------- |
| `assets/spec/question-schema.json` | question-utils (讀) | 不可變（schema 變更需向後相容） |
| `assets/spec/{date}/test-questions.json` | run-evals (讀), score (讀) | 每題通過 schema 驗證 |

## Invariants

| Invariant | What breaks it | Symptoms if violated |
| --------- | -------------- | -------------------- |
| 評分標準絕不傳遞給被測 agent | stripScoringCriteria 邏輯錯誤 | agent 知曉評分標準，測試失效 |
| 每題 id 唯一 | 手動編輯重複 | 評分結果無法對應 |

## Tradeoffs inherited by implementation

| Decision | Rejected alternative | Locks in |
| -------- | -------------------- | -------- |
| JSON 格式存題目 | CSV 格式 | 巢狀結構（projectContext, scoringCriteria）可表達 |
| schema 與資料分離 | schema 內嵌在程式碼 | schema 可獨立維護和版本控制 |

## Batch-only

題目 schema（特別是 scoringCriteria 結構）需與 Spec C 的評分器協調，見 `../coordination.md`

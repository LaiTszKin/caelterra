# Design: 測試執行器與評分器

- Date: 2026-05-28
- Feature: 測試執行器與評分器
- Change Name: spec-test-executor-scorer

## Traceability

|                             |                                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| Requirement IDs             | R1.1-R1.3, R2.1-R2.6, R3.1-R3.6, R4.1-R4.2                                  |
| In-scope modules (≤3)       | `scripts/run-evals.mjs`, `scripts/score.mjs`, `scripts/env-utils.mjs`        |
| External systems touched    | 執行模型 API (OpenAI 相容), 評分模型 API (OpenAI 相容) — see `contract.md`    |
| Batch coordination          | `../coordination.md`                                                         |

## Target vs baseline

|                       | Baseline (today) | Target (after this change) |
| --------------------- | ---------------- | --------------------------- |
| Structure / ownership | 無測試基礎設施 | 完整的並行測試執行 + LLM-as-Judge 評分系統 |

## Boundaries

- Entry surface(s): CLI (`node scripts/run-evals.mjs`, `node scripts/score.mjs`)
- Trust boundary crossed: 網路 API 調用（API key 透過 .env 管理）
- Outside → inside (one line): `User runs script` → `loadEnv() 讀 .env` → `API call` → `trace/score written to disk`

## Modules (nouns only)

| Module key | Responsibility | Owned artifacts |
| ---------- | -------------- | --------------- |
| `env-utils` | 讀取並驗證 .env 環境變數 | `scripts/env-utils.mjs` |
| `run-evals` | 並行執行 100 題測試，記錄 JSONL trace | `scripts/run-evals.mjs`, trace files |
| `score` | LLM-as-Judge 多維度評分，產出 score.json | `scripts/score.mjs`, score.json files |

---

## Interaction anchors (`INT-###`)

| ID | Intent | Caller → Callee | Coupling kind | Information crossing | Failure expectation |
| -- | ------ | --------------- | ------------- | -------------------- | ------------------- |
| `INT-001` | 執行器讀取配置 | `run-evals.mjs` → `env-utils.mjs` | sync call (import) | EXEC_* env vars | 缺少必要變數時 exit 1 |
| `INT-002` | 執行器調用執行模型 | `run-evals.mjs` → 外部 API | HTTP POST | prompt + reasoning_effort → 回應 | retry with backoff |
| `INT-003` | 評分器讀取 trace | `score.mjs` → JSONL files | file read | 執行鏈路事件 | 檔案損壞時 skip |
| `INT-004` | 評分器調用評分模型 | `score.mjs` → 外部 API | HTTP POST | trace + scoringCriteria → score JSON | fallback JSON parse |
| `INT-005` | 完成信號觸發評分 | `run-evals.mjs` → `.done` marker → `score.mjs` | file watch | test 完成通知 | 無（best-effort） |

**Ordering / concurrency:** 執行器先啟動；評分器 watch 模式在執行器啟動後立即啟動。同一 test 的評分在執行完成後觸發。不同 test 之間完全並行。

## Requirement linkage

### R1 (.env) → R2 (執行器) + R3 (評分器) → R4 (事件串聯)

- Anchor order hint: `INT-001` → `INT-002` + `INT-004` → `INT-005`
- Narrative glue: 配置必須先載入；執行器和評分器可並行開發；事件串聯是最後的黏合層

## Data & persistence

| Resource | Typical readers/writers | Consistency expectation |
| -------- | ----------------------- | ----------------------- |
| `.env` | env-utils (讀) | 所有必要變數存在 |
| `assets/spec/{date}/test_{no}/` | run-evals (寫), agent (讀寫) | 隔離：agent 僅能在此目錄工作 |
| `results/spec/{date}/test_{no}/trace.jsonl` | run-evals (寫), score (讀) | 每行一個完整 JSON 事件 |
| `results/spec/{date}/test_{no}/score.json` | score (寫), optimize (讀, Spec D) | 符合 schema |

## Invariants

| Invariant | What breaks it | Symptoms if violated |
| --------- | -------------- | -------------------- |
| 被測 agent 僅在隔離目錄工作 | system prompt 未限制工作路徑 | agent 修改其他 test 的檔案 |
| 評分標準不洩漏給被測 agent | stripScoringCriteria 未調用 | agent 行為偏差 |
| score.json schema 穩定 | Spec C 變更 schema 未通知 Spec D | 優化器無法讀取評分結果 |

## Tradeoffs inherited by implementation

| Decision | Rejected alternative | Locks in |
| -------- | -------------------- | -------- |
| 檔案系統隔離（非 Docker） | Docker 容器隔離 | 輕量，但隔離強度較弱 |
| JSONL trace 格式 | 結構化 DB 儲存 | 人類可讀，易於除錯 |
| marker file 事件觸發 | IPC / message queue | 簡單，無外部依賴 |

## Batch-only

與 Spec D（優化器）共享 score.json schema，見 `../coordination.md`

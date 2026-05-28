# Contract: 測試執行器與評分器

- Date: 2026-05-28
- Feature: 測試執行器與評分器
- Change Name: spec-test-executor-scorer

## Scope

- **External deps in this doc:** `2`
- 執行模型 API 和評分模型 API（皆為 OpenAI 相容格式）

## Dependencies

### 執行模型 API (EXEC_MODEL)

#### Evidence

| Primary docs URL(s) | Sections / anchors used |
| ------------------- | ----------------------- |
| https://platform.openai.com/docs/api-reference/chat/create | Chat Completions endpoint |
| https://api-docs.deepseek.com | DeepSeek reasoning_effort 參數 |

**Version revision assumed:** Not fixed（透過 .env 變數靈活配置）

#### Facts we rely on

| Fact / capability needed | Doc location |
| ------------------------ | ------------ |
| OpenAI Chat Completions API: POST /v1/chat/completions | OpenAI API Reference |
| `reasoning_effort` 參數可通過 request body 傳遞 | DeepSeek API Docs |
| 回應格式: `choices[0].message.content` | OpenAI API Reference |

#### Limits & failures

| Category | Doc fact | Meaning while executing |
| -------- | -------- | ----------------------- |
| Rate limit | 依 API provider 而異 | 通過 EXEC_CONCURRENCY 控管並行數 |
| Timeout | 無標準上限 | EXEC_TIMEOUT 預設 600 秒 |
| Errors | HTTP 429 (rate limit), 5xx (server error) | Exponential backoff: 1s, 2s, 4s, 8s, 最多 3 次 |

#### Security & secrets

| Concern | Constraint |
| ------- | ---------- |
| API key | 通過 .env 中的 EXEC_BASE_URL 隱含（或需額外 EXEC_API_KEY 變數），不寫入源碼 |
| Secret keys (names) | `EXEC_API_KEY`（如 API provider 需要） |

### 評分模型 API (JUDGE_MODEL)

#### Evidence

| Primary docs URL(s) | Sections / anchors used |
| ------------------- | ----------------------- |
| https://platform.openai.com/docs/api-reference/chat/create | Chat Completions endpoint |

**Version revision assumed:** Not fixed（透過 .env 變數靈活配置）

#### Facts we rely on

| Fact / capability needed | Doc location |
| ------------------------ | ------------ |
| OpenAI Chat Completions API: POST /v1/chat/completions | OpenAI API Reference |
| `response_format: { type: "json_object" }` 或 `json_schema` 結構化輸出 | OpenAI API Reference |

#### Limits & failures

| Category | Doc fact | Meaning while executing |
| -------- | -------- | ----------------------- |
| Rate limit | 依 API provider 而異 | 通過 JUDGE_CONCURRENCY 控管 |
| JSON 輸出非標準格式 | LLM 可能輸出 markdown 包裹的 JSON | 實作 regex fallback 提取 JSON |

#### Security & secrets

| Concern | Constraint |
| ------- | ---------- |
| API key | 通過 .env 配置，不寫入源碼 |
| Secret keys (names) | `JUDGE_API_KEY`（如 API provider 需要） |

#### Integration anchors (`EXT-###`)

| ID | What we integrate at this boundary | Non-negotiables | Forbidden assumptions |
| -- | --------------------------------- | --------------- | --------------------- |
| `EXT-001` | POST {EXEC_BASE_URL}/v1/chat/completions | 必須支援 reasoning_effort；回應需含 content | 不假設具體的 model 名稱或 provider |
| `EXT-002` | POST {JUDGE_BASE_URL}/v1/chat/completions | 回應需為結構化 JSON；支援 json_object 格式 | 不假設評分模型與執行模型相同 |

#### Trace hooks

- Spec IDs covered: R2.4, R3.2
- Related `design.md` module keys / `INT-###`: INT-002, INT-004
- **Unknown / `TBD`:** DeepSeek reasoning_effort 參數的具體 key name 和有效值需確認 API 文檔

# Contract: 優化器

- Date: 2026-05-28
- Feature: 優化器
- Change Name: spec-optimizer

## Scope

- **External deps in this doc:** `1`
- 評分模型 API（用於生成 suggestedFix 和語義相似度去重）

## Dependencies

### 評分模型 API (JUDGE_MODEL, 復用 Spec C 配置)

#### Evidence

| Primary docs URL(s) | Sections / anchors used |
| ------------------- | ----------------------- |
| https://platform.openai.com/docs/api-reference/chat/create | Chat Completions endpoint |
| 復用 Spec C (spec-test-executor-scorer) 的 .env 配置 | JUDGE_BASE_URL, JUDGE_MODEL |

**Version revision assumed:** Not fixed（復用 .env 中 JUDGE_* 配置）

#### Facts we rely on

| Fact / capability needed | Doc location |
| ------------------------ | ------------ |
| OpenAI Chat Completions API | OpenAI API Reference |
| 模型能分析程式碼並產出 diff | 依賴模型能力，不保證 |

#### Limits & failures

| Category | Doc fact | Meaning while executing |
| -------- | -------- | ----------------------- |
| 優化品質 | 取決於評分模型對程式碼的理解能力 | 優化結果需人工審查把關 |
| Token 限制 | SKILL.md + 工具源碼可能很長 | 需分段傳遞或只傳遞相關部分 |

#### Security & secrets

| Concern | Constraint |
| ------- | ---------- |
| API key | 復用 .env 中 JUDGE_API_KEY（不重複定義） |
| 源碼隱私 | 如果使用外部 API 模型，源碼會被傳送至外部服務 |

#### Integration anchors (`EXT-###`)

| ID | What we integrate at this boundary | Non-negotiables | Forbidden assumptions |
| -- | --------------------------------- | --------------- | --------------------- |
| `EXT-001` | POST {JUDGE_BASE_URL}/v1/chat/completions (用於去重 + suggestedFix) | 必須能分析程式碼差異 | 不假設評分模型能完美理解專案上下文 |

#### Trace hooks

- Spec IDs covered: R1.3, R1.5
- Related `design.md` module keys / `INT-###`: INT-002
- **Unknown / `TBD`:** 語義去重的準確度需實際測試驗證；若評分模型能力不足可能需要改用 embedding 相似度方案

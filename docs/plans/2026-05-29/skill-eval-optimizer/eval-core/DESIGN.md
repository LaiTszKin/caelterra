# Design: 技能評測核心 (Skill Eval Core)

- **Date**: 2026-05-29
- **Feature**: 自動化技能評測 — 出題、執行、評分
- **Source SPEC**: `docs/plans/2026-05-29/skill-eval-optimizer/eval-core/SPEC.md`

> **Purpose:** 技術方案文檔——定義評測核心的架構、外部依賴、資料流、不變量與取捨。

---

## 1. 調研摘要

### 1.1 技術可行性

| 需求編號 | 可行性 | 風險點 |
|---|---|---|
| R1 題庫管理 | 可行 | LLM 變體生成可能偏離原始評分標準語意，需驗證變體保留核心檢查點 |
| R2 評測執行 | 可行 | 現有 `run-evals.mjs` 僅支援純文字對話（無真實工具調用），需擴展為支援工具調用 loop |
| R3 評分與報告 | 可行 | LLM-as-Judge 的評分一致性是已知挑戰（Arize 2026 報告），需使用 boolean/categorical 標籤取代純數值分數 |

**總體判斷**: 全部可行。主要風險在於 R2 的工具調用模擬機制和 R3 的評分穩定性。

### 1.2 現有實現參考

| 參考來源 | 可借鑑的設計模式 |
|---|---|
| Microsoft SkillOpt (arXiv:2605.23904) | 固定 agent + 外部 optimizer 分離；validation gate 只接受嚴格改善的編輯；held-out 驗證集防止 overfitting |
| Arize LLM-as-Judge Guide (2026) | 用 code evaluator 做確定性檢查（schema、tool name），LLM judge 做語意檢查；boolean 標籤優於數值分數；評分標準先於 prompt 設計 |
| AdaRubric (arXiv:2603.21362) | 動態生成 task-specific 評分 rubric，從 task description 自適應生成評分維度 |
| Anthropic skill-creator eval | 三層架構：Grader (斷言驗證) → Comparator (盲測 A/B) → Analyzer (根因分析)；合成查詢測試觸發準確率 |
| 現有 `scripts/run-evals.mjs` + `score.mjs` | 已實作 JSONL 軌跡記錄、四維度評分、並發控制、指數退避重試、watch mode、檔案鎖 |

### 1.3 技術棧兼容性

| 候選技術 | 與 repo 依賴兼容性 | 授權 | 選擇 |
|---|---|---|---|
| Node.js 內建模組 (fs, path, child_process) | 完全兼容（現有腳本已使用） | MIT | 採用 |
| OpenAI-compatible API (執行模型) | 無依賴衝突（HTTP fetch） | N/A | 採用 |
| OpenAI-compatible API (評分模型) | 無依賴衝突 | N/A | 採用 |
| TypeScript (CLI 工具) | 完全兼容（repo 標準） | MIT | 採用 |
| js-yaml (讀取 frontmatter) | 兼容（repo 已依賴） | MIT | 採用 |

---

## 2. 架構總覽

### 2.1 模組清單

| 模組 key | 職責（一句話） | 擁有的產物 |
|---|---|---|
| `eval-question` | 題庫載入、驗證、抽樣、LLM 變體生成 | JSON 題目檔、JSON Schema |
| `eval-executor` | 在隔離環境中執行技能、記錄工具調用軌跡為 JSONL | trace.jsonl、.done marker |
| `eval-scorer` | 調用評分模型對每題從三維度打分，產出結構化評分 JSON | score.json、.scored marker |
| `eval-reporter` | 彙總評分結果產出 Markdown 報告 | REPORT.md |

### 2.2 邊界

- **進入點**: CLI (`apltk eval <skill>`) → `eval-executor` → `eval-scorer` → `eval-reporter`
- **信任邊界**: `.env` 中的 API key（不寫入程式碼或日誌）
- **外部 → 內部**: `User CLI` → `eval-executor` → `OpenAI-compatible API (exec model)` → `eval-scorer` → `OpenAI-compatible API (judge model)` → `eval-reporter` → `Filesystem (報告輸出)`

### 2.3 Target vs Baseline

| | Baseline（現在） | Target（變更後） |
|---|---|---|
| 結構 / 所有權 | `scripts/run-evals.mjs`, `scripts/score.mjs` 為獨立腳本，無 CLI 整合 | `packages/tools/eval/` 下的 `eval-executor`, `eval-scorer` 為正式 CLI 工具，註冊到 tool registry |
| 題庫 | `assets/spec/{date}/test-questions.json` 靜態 JSON | 相同格式，增加 LLM 變體生成支援 |
| 軌跡 | JSONL 僅記錄 system prompt + user prompt + API response | JSONL 擴展為記錄完整工具調用序列（tool name, params, result） |
| 評分 | 四維度 (outcome/process/style/efficiency) | 改為三維度 (指令遵循/工具調用/結果質量)，更貼近 SkillOpt 框架 |

---

## 3. 互動設計

### 3.1 互動錨點 (`INT-###`)

| ID | 意圖 | Caller → Callee | 耦合類型 | 跨越的資訊 / 狀態 | 失敗傳播期望 |
|---|---|---|---|---|---|
| `INT-001` | 載入並驗證題目 | `eval-executor` → `eval-question` | sync call | 題目陣列 (JSON) | 題目無效 → 中止評測，顯示驗證錯誤 |
| `INT-002` | 執行技能並記錄軌跡 | `eval-executor` → Exec Model API | HTTP (OpenAI-compatible) | messages[], trace events | API 錯誤 → 指數退避重試 3 次 → 記錄錯誤並繼續下一題 |
| `INT-003` | 評分單題 | `eval-scorer` → Judge Model API | HTTP (OpenAI-compatible) | trace JSONL + scoring criteria | API 錯誤 → 記錄並跳過該題（保留軌跡供後續評分） |
| `INT-004` | 彙總產出報告 | `eval-reporter` → Filesystem | sync call | score.json[] → REPORT.md | 寫入失敗 → 顯示錯誤並保留內存中的報告內容 |

### 3.2 排序 / 並行約束

- 所有題目可並行執行（無題間依賴），並發數由 `EXEC_CONCURRENCY` 控制
- 評分可並行處理（每題獨立），並發數由 `JUDGE_CONCURRENCY` 控制
- 評分必須在對應題目的執行完成後才能開始（`.done` marker 作為同步點）
- 報告生成在所有評分完成後執行

### 3.3 需求連結

- **R1 集群 (題庫管理)**: `INT-001`
- **R2 集群 (評測執行)**: `INT-002` → file write (trace.jsonl + .done)
- **R3 集群 (評分與報告)**: `.done` detection → `INT-003` → file write (score.json + .scored) → `INT-004`

---

## 4. 外部依賴

### 4.1 依賴總覽

| 外部依賴 | 用途 | 官方文檔 |
|---|---|---|
| OpenAI-compatible Chat Completions API | 執行模型（被評測的模型）和評分模型 | platform.openai.com/docs/api-reference/chat |
| Node.js fs/path/child_process | 檔案操作、目錄管理、CLI 執行 | nodejs.org/api |

### 4.2 Exec Model API (OpenAI-compatible /v1/chat/completions)

#### 事實依據

| 需要的功能 / 能力 | 文檔位置 |
|---|---|
| Chat Completions (non-streaming) | `POST /v1/chat/completions` |
| 自定義 base URL（支援任意 provider） | `EXEC_BASE_URL` env var |
| reasoning_effort 參數（可選） | `EXEC_REASONING_EFFORT` env var |

**版本假設**: OpenAI-compatible API，不固定特定模型版本。

#### 限制與失敗模式

| 類別 | 文檔事實 | 編碼義務 |
|---|---|---|
| 超時 | 無標準上限，由服務端決定 | 可配置 timeout (`EXEC_TIMEOUT`)，預設 600s；超時記錄為 timeout 狀態 |
| 錯誤 / 降級模式 | HTTP 429 (rate limit), 5xx (server error) | 指數退避重試 3 次 (1s/2s/4s)；最終失敗記錄錯誤並繼續 |

#### 安全與密鑰

| 關注點 | 約束 |
|---|---|
| 認證 | Bearer token (`EXEC_API_KEY`) |
| 密鑰名稱 | `EXEC_API_KEY` (env var) |

### 4.3 Judge Model API

與 Exec Model API 相同規格，使用獨立 env var: `JUDGE_BASE_URL`, `JUDGE_MODEL`, `JUDGE_API_KEY`, `JUDGE_REASONING_EFFORT`, `JUDGE_TIMEOUT`.

#### 整合錨點 (`EXT-###`)

| ID | 在此邊界整合的對象 | 不可協商的處理要求 | 禁止的假設 |
|---|---|---|---|
| `EXT-001` | Exec Model `POST /v1/chat/completions` | 重試 (指數退避)、timeout、AbortController | 不假設 response 格式永遠正確（model 可能回非標準 content） |
| `EXT-002` | Judge Model `POST /v1/chat/completions` | JSON parse fallback (direct → ```json block → brace extraction → error structure) | 不假設 judge 一定回合法 JSON |

---

## 5. 資料持久化

| 資源 | 典型讀寫者 | 一致性期望 |
|---|---|---|
| `assets/spec/{date}/test-questions.json` | `eval-question` 讀；人工維護 | 題目 ID 唯一、難度分佈符合預期 |
| `results/spec/{date}/test_{id}/trace.jsonl` | `eval-executor` 寫；`eval-scorer` 讀 | append-only JSONL，每行一個事件；寫入完成以 `.done` marker 保證 |
| `results/spec/{date}/test_{id}/score.json` | `eval-scorer` 寫；`eval-reporter` 讀 | atomic write via `.scoring-lock` mkdir mutex + `.scored` marker |
| `results/spec/{date}/REPORT.md` | `eval-reporter` 寫；User CLI 讀 | 最終產物，在所有 score.json 就緒後一次性寫入 |

---

## 6. 系統不變量

| 不變量 | 架構上破壞它的方式 | 違反的症狀 |
|---|---|---|
| 每題至少執行一次才評分 | 跳過 `.done` 檢查直接評分 | score.json 引用不存在的 trace |
| 評分模型上下文與執行模型上下文隔離 | 將執行模型的對話歷史傳入評分模型 | 評分偏見（評分模型被執行模型的 reasoning 影響） |
| 題目評分標準對被評測模型不可見 | `stripScoringCriteria` 未能完全剝離 scoringCriteria | 模型輸出針對評分標準優化（測驗失真） |
| 已評分的題目不重複評分 | 未檢查 `.scored` marker 即重新評分 | 重複 API 呼叫浪費成本、評分結果不一致 |

---

## 7. 技術取捨

| 決策 | 拒絕的替代方案 | 對實作的鎖定影響 |
|---|---|---|
| JSONL 軌跡格式（append-only） | 結構化 DB（SQLite） | 簡化實作但限制查詢能力；報告生成需全量讀取 JSONL |
| 三維度評分（指令遵循/工具調用/結果質量）vs 現有四維度 | 保留現有四維度 (outcome/process/style/efficiency) | 更貼近 SkillOpt 框架；需更新現有題庫的 scoringCriteria 結構 |
| JSON parse fallback 多層解析 | 強制 judge model 使用 JSON mode (response_format) | 兼容更多 API provider（非所有 provider 支援 json_object mode） |
| 檔案鎖 (mkdir mutex) 防止並發衝突 | proper file locking (flock) | 跨平台兼容（Windows 不支援 flock）；簡單但非原子性 |
| 純 Node.js 內建模組 | 引入 dotenv, ajv, chalk 等 npm 包 | 零外部依賴；手動實作 .env 解析和 schema 驗證 |

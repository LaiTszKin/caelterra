# Tasks: 測試執行器與評分器

- Date: 2026-05-28
- Feature: 測試執行器與評分器

## **Task 1: .env 配置與範本**

Purpose: 建立 .env.example 和環境變數讀取邏輯
Requirements: R1.1, R1.2, R1.3
Scope: repo 根目錄 `.env.example`、`scripts/env-utils.mjs`
Out of scope: 實際 .env 值（由使用者填入）

- T1.1 [ ] **`.env.example`** — 建立環境變數範本，包含 EXEC_BASE_URL, EXEC_MODEL, EXEC_REASONING_EFFORT, JUDGE_BASE_URL, JUDGE_MODEL, JUDGE_REASONING_EFFORT, EXEC_CONCURRENCY, JUDGE_CONCURRENCY, EXEC_TIMEOUT
  - Verify: 檔案存在且有註解說明每個變數用途

- T1.2 [ ] **`scripts/env-utils.mjs`** — 匯出 `loadEnv()` 函數，使用 `fs.readFileSync` 讀取 `.env`，解析為 key-value，驗證必要變數存在
  - Verify: 缺少必要變數時拋出明確錯誤訊息

## **Task 2: 測試執行器實作**

Purpose: 實作並行測試執行引擎
Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6
Scope: `scripts/run-evals.mjs`
Out of scope: 評分邏輯

- T2.1 [ ] **`scripts/run-evals.mjs`** — 匯入 `loadEnv()`, `loadQuestions()`, `stripScoringCriteria()`；讀取題目和環境變數
  - Verify: 腳本啟動時正確載入所有配置

- T2.2 [ ] **`scripts/run-evals.mjs`** — 實作 `initWorkspace(testNo, projectContext)` 函數，在 `assets/spec/{date}/test_{no}/` 建立隔離目錄，初始化 projectContext.files 定義的檔案結構
  - Verify: 目錄結構與 projectContext.files 定義一致

- T2.3 [ ] **`scripts/run-evals.mjs`** — 實作 `callExecModel(messages)` 函數，以 OpenAI 相容格式調用執行模型 API（POST /v1/chat/completions），傳遞 `reasoning_effort` 參數
  - Verify: HTTP request 格式符合 OpenAI Chat Completions API 規範

- T2.4 [ ] **`scripts/run-evals.mjs`** — 實作 `runSingleTest(question, env)` 函數，串聯 workspace 初始化 → API 調用 → JSONL trace 寫入
  - Verify: 單道題目可獨立完成端到端流程

- T2.5 [ ] **`scripts/run-evals.mjs`** — 實作並行控制：使用 Promise pool 模式，限制同時執行數不超過 EXEC_CONCURRENCY（預設 10）
  - Verify: 並行數遵守 EXEC_CONCURRENCY 上限

- T2.6 [ ] **`scripts/run-evals.mjs`** — 實作重試機制：API 調用失敗時 exponential backoff (1s, 2s, 4s, 8s)，最多重試 3 次
  - Verify: 網路錯誤時正確重試，重試間隔呈指數增長

- T2.7 [ ] **`scripts/run-evals.mjs`** — 實作超時處理：超過 EXEC_TIMEOUT 秒（預設 600）未完成時終止，記錄逾時狀態
  - Verify: 逾時測試不阻塞其他測試

## **Task 3: 評分器實作**

Purpose: 實作 LLM-as-Judge 評分引擎
Requirements: R3.1, R3.2, R3.3, R3.4, R3.5
Scope: `scripts/score.mjs`
Out of scope: 測試執行邏輯

- T3.1 [ ] **`scripts/score.mjs`** — 匯入 `loadEnv()`, `getScoringCriteria()`；載入評分模型配置
  - Verify: 腳本啟動時正確載入 JUDGE_* 環境變數

- T3.2 [ ] **`scripts/score.mjs`** — 實作 `readTrace(tracePath)` 函數，讀取 JSONL trace 檔案
  - Verify: 正確解析 JSONL 格式（每行一個 JSON 物件）

- T3.3 [ ] **`scripts/score.mjs`** — 實作 `buildJudgePrompt(trace, scoringCriteria)` 函數，構建評分 prompt（包含完整 trace + 評分標準 + 四維度評分指令 + JSON 輸出格式要求）
  - Verify: prompt 包含 trace 摘要和完整的評分標準

- T3.4 [ ] **`scripts/score.mjs`** — 實作 `callJudgeModel(prompt)` 函數，調用評分模型，要求輸出結構化 JSON（含 overallScore, dimensions, issues）
  - Verify: 輸出符合 score.json schema

- T3.5 [ ] **`scripts/score.mjs`** — 實作 `scoreSingleTest(testNo, date)` 函數，串聯 trace 讀取 → prompt 構建 → API 調用 → score.json 寫入至 `results/spec/{date}/test_{no}/`
  - Verify: 單道題目可獨立完成評分流程

- T3.6 [ ] **`scripts/score.mjs`** — 實作 JSON 解析 fallback：評分模型輸出無法直接解析時，嘗試從文本中提取 JSON 區塊（regex 匹配 ```json ... ```）
  - Verify: 處理常見的非標準 JSON 輸出格式

## **Task 4: 執行→評分事件驅動串聯**

Purpose: 實作完成即觸發評分的機制
Requirements: R4.1, R4.2
Scope: `scripts/run-evals.mjs`, `scripts/score.mjs`
Out of scope: 無

- T4.1 [ ] **`scripts/run-evals.mjs`** — 每個測試完成後，在 `results/spec/{date}/test_{no}/` 寫入 `.done` marker file
  - Verify: 測試完成後 .done 檔案存在

- T4.2 [ ] **`scripts/score.mjs`** — 支援 watch 模式：監控 `.done` marker file，一旦出現立即對該 test 啟動評分；評分完成後寫入 `.scored` marker
  - Verify: 第一個完成的測試立即被評分，不等全部完成

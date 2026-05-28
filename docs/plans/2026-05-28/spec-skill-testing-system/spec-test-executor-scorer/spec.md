# Spec: 測試執行器與評分器

- Date: 2026-05-28
- Feature: 測試執行器與評分器
- Owner: [To be filled]

## Goal

實作測試執行器（隔離環境、API 調用、並行控制）與 LLM-as-Judge 評分器（trace 解析、多維度評分、問題識別），使用兩組獨立模型完成 spec 技能的端到端自動化測試。

## Scope

### In Scope
- `.env` 配置兩組模型（EXEC_* 執行模型 + JUDGE_* 評分模型）
- 測試執行器：讀取題目、建立隔離目錄、調用執行模型 API（OpenAI 相容格式）、記錄完整執行鏈路
- 隔離環境：每個測試在 `assets/spec/{date}/test_{no}/` 下獨立工作
- 並行控制：100 題並行執行，支援併發限額配置
- 評分器：讀取執行鏈路（JSONL trace），調用評分模型進行多維度評分
- 評分結果寫入 `results/spec/{date}/test_{no}/`
- 問題識別：從執行鏈路中自動識別 skill 及 apltk 工具的問題

### Out of Scope
- 測試題目的編寫（屬於 spec-test-question-bank）
- 優化器的實作（屬於 spec-optimizer）
- CI/CD 整合
- Web UI 儀表板

## Functional Behaviors (BDD)

### Requirement 1: .env 模型配置
**GIVEN** 需要兩組獨立的 LLM 模型
**WHEN** 配置 `.env` 檔案
**THEN** 包含執行模型配置：`EXEC_BASE_URL`, `EXEC_MODEL`, `EXEC_REASONING_EFFORT`
**AND** 包含評分模型配置：`JUDGE_BASE_URL`, `JUDGE_MODEL`, `JUDGE_REASONING_EFFORT`
**AND** 兩組配置可指向相同或不同的 API 端點
**AND** 提供 `.env.example` 模板檔案

**Uncertainty Level**: Known

**Requirements**:
- [ ] R1.1 `.env.example` 檔案存在，包含全部 6 個環境變數模板
- [ ] R1.2 `.env` 在 `.gitignore` 中已忽略
- [ ] R1.3 腳本能正確讀取並驗證環境變數（缺少時報錯）

### Requirement 2: 測試執行器
**GIVEN** 100 道測試題目存放於 `assets/spec/{date}/test-questions.json`
**AND** `.env` 已配置執行模型
**WHEN** 執行測試腳本 `node scripts/run-evals.mjs`
**THEN** 為每道題目在 `assets/spec/{date}/test_{no}/` 建立隔離目錄
**AND** 初始化 projectContext 定義的檔案結構
**AND** 以 OpenAI 相容格式調用執行模型 API（包含 `reasoning_effort` 參數）
**AND** 被測 agent 僅能在隔離目錄內工作（透過 system prompt 限制 write 路徑）
**AND** 完整執行鏈路（每步推理、工具調用參數與結果）記錄為 JSONL trace
**AND** 支援並行執行，併發數可透過 `EXEC_CONCURRENCY` 環境變數配置

**Uncertainty Level**: Exploratory（API 的 reasoning_effort 參數格式需確認 DeepSeek API 文檔）

**Requirements**:
- [ ] R2.1 `scripts/run-evals.mjs` 存在且可執行
- [ ] R2.2 正確建立隔離目錄結構 `assets/spec/{date}/test_{no}/`
- [ ] R2.3 projectContext 檔案結構正確初始化
- [ ] R2.4 API 調用使用 OpenAI 相容格式（`POST /v1/chat/completions`）
- [ ] R2.5 執行鏈路以 JSONL 格式記錄（每行一個事件）
- [ ] R2.6 並行控制：遵守 `EXEC_CONCURRENCY` 上限

### Requirement 3: 評分器
**GIVEN** 測試執行完成（JSONL trace 已產生）
**AND** `.env` 已配置評分模型（可不同於執行模型）
**WHEN** 執行評分腳本 `node scripts/score.mjs`
**THEN** 讀取完整執行鏈路 JSONL trace
**AND** 讀取對應題目的評分標準（scoringCriteria）
**AND** 調用評分模型，傳入完整 trace + 評分標準，產出多維度評分
**AND** 評分維度包含 outcome（任務完成度）、process（skill 調用正確性）、style（輸出格式）、efficiency（步驟/ token 效率）
**AND** 每個維度產出 0-100 分數 + 具體問題描述
**AND** 產出寫入 `results/spec/{date}/test_{no}/score.json`

**Uncertainty Level**: Exploratory（LLM-as-Judge 評分的一致性需要通過實驗驗證）

**Requirements**:
- [ ] R3.1 `scripts/score.mjs` 存在且可執行
- [ ] R3.2 評分模型 API 調用使用 OpenAI 相容格式
- [ ] R3.3 每個測試案例產出 `results/spec/{date}/test_{no}/score.json`
- [ ] R3.4 評分結果包含 `overallScore`, `dimensions[]`, `issues[]`
- [ ] R3.5 `issues[]` 中每項包含 `severity`（P0/P1/P2）, `category`（skill/apltk/other）, `description`, `evidence`（引用 trace 中的具體事件）

### Requirement 4: 評分觸發機制
**GIVEN** 100 題並行執行
**AND** 每題完成時間不同
**WHEN** 任一 agent 執行完成（JSONL trace 寫入完畢）
**THEN** 立即觸發該題的評分（不等待全部完成）
**AND** 評分器自身也並行執行（併發數由 `JUDGE_CONCURRENCY` 控制）

**Uncertainty Level**: Known

**Requirements**:
- [ ] R4.1 採用事件驅動：執行完成的信號觸發評分
- [ ] R4.2 評分器併發數由 `JUDGE_CONCURRENCY` 控制

## Error and Edge Cases
- [ ] API 調用失敗時的重試機制（exponential backoff）
- [ ] API 返回非預期格式時的錯誤處理
- [ ] 隔離目錄建立失敗時的處理
- [ ] 執行超時處理（`EXEC_TIMEOUT` 環境變數）
- [ ] 部分題目執行失敗時，不影響其他題目
- [ ] 評分模型輸出無法解析為 JSON 時的 fallback

## Clarification Questions
- 執行模型的 system prompt 如何設計？是否需要模擬 Claude Code / Codex 的 system prompt 風格？
- 執行逾時時間的合理預設值？（建議 10 分鐘/題）
- 並行數的建議預設值？（需確認 API 的 rate limit）
- 評分模型輸出是否需要強制 JSON schema（`response_format: json_schema`）還是依賴 prompt 指令？

## References
- Official docs:
  - OpenAI API 文檔 — Chat Completions 格式
  - DeepSeek API 文檔 — reasoning_effort 參數
- Related code files:
  - `spec/SKILL.md` — 理解被測 skill 的行為預期
  - `lib/tools/create-specs.ts` — apltk CLI 工具

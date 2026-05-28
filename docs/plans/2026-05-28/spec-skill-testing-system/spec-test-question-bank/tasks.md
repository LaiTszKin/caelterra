# Tasks: 測試題庫

- Date: 2026-05-28
- Feature: 測試題庫

## **Task 1: 定義題目 JSON Schema**

Purpose: 建立測試題目的標準化 JSON schema 檔案
Requirements: R1.1, R1.2, R1.3, R1.4
Scope: `assets/spec/` 目錄
Out of scope: 題目內容撰寫

- T1.1 [ ] **assets/spec/question-schema.json** — 建立 JSON Schema 檔案，定義頂層欄位：`id` (string), `userPrompt` (string), `projectContext` (object), `scoringCriteria` (object), `difficulty` (enum: basic/advanced/edge)
  - Verify: 使用 `ajv` 或手動驗證 schema 格式正確

- T1.2 [ ] **assets/spec/question-schema.json** — 定義 `scoringCriteria` 子結構：`outcome`, `process`, `style`, `efficiency`，每個維度含 `weight` (0-1 float) 和 `checks[]`
  - Verify: schema 中每個維度都有 weight 和 checks 欄位

- T1.3 [ ] **assets/spec/question-schema.json** — 定義 `projectContext` 子結構：`files` (檔案列表，含路徑和內容), `description` (專案背景描述)
  - Verify: projectContext schema 支援檔案結構定義

- T1.4 [ ] **assets/spec/question-schema.json** — 定義 `checks[]` 子結構：`id` (string), `description` (string), `passCondition` (string)
  - Verify: 每個 check 有 id, description, passCondition

## **Task 2: 編寫 100 道測試題目**

Purpose: 撰寫覆蓋 spec 技能全工作流程的 100 道測試題目
Requirements: R2.1, R2.2, R2.3, R2.4, R2.5
Scope: `assets/spec/{date}/test-questions.json`
Out of scope: 測試執行器或評分器代碼

- T2.1 [ ] **assets/spec/2026-05-28/test-questions.json** — 編寫 basic 難度題目 40 道，覆蓋 spec 工作流程主要路徑
  - Verify: 40 道 basic 題目，每道通過 schema 驗證

- T2.2 [ ] **assets/spec/2026-05-28/test-questions.json** — 編寫 advanced 難度題目 40 道，覆蓋跨模塊變更、多需求場景
  - Verify: 40 道 advanced 題目，每道通過 schema 驗證

- T2.3 [ ] **assets/spec/2026-05-28/test-questions.json** — 編寫 edge 難度題目 20 道，覆蓋需求不明確、高不確定性、邊界場景
  - Verify: 20 道 edge 題目，每道通過 schema 驗證

- T2.4 [ ] **assets/spec/2026-05-28/test-questions.json** — 編寫反向測試題目 10+ 道（agent 不應調用 spec skill 的場景）
  - Verify: 至少 10 道 `difficulty: "edge"` 且評分標準中 process 維度檢查 "did NOT invoke spec skill"

- T2.5 [ ] **驗證題目覆蓋率** — 產出覆蓋率矩陣：spec 8 步驟 × 題目編號對照表
  - Verify: 每步驟至少 5 道題目

## **Task 3: 實作題目載入與剝離工具函數**

Purpose: 提供工具函數從完整題目中剝離評分標準，僅暴露 userPrompt 和 projectContext 給被測 agent
Requirements: R3.1, R3.2
Scope: `lib/test-runner/` 或 `scripts/` 目錄
Out of scope: 測試執行器核心邏輯

- T3.1 [ ] **scripts/question-utils.mjs** — 匯出 `loadQuestions(filePath)` 函數，讀取並驗證 JSON
  - Verify: 載入測試 JSON，驗證每題符合 schema

- T3.2 [ ] **scripts/question-utils.mjs** — 匯出 `stripScoringCriteria(question)` 函數，僅回傳 `{ id, userPrompt, projectContext }`
  - Verify: 剝離後的物件不含 scoringCriteria 和 difficulty

- T3.3 [ ] **scripts/question-utils.mjs** — 匯出 `getScoringCriteria(question)` 函數，回傳評分標準供評分器使用
  - Verify: 回傳完整的 scoringCriteria 物件

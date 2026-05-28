# Spec: 測試題庫

- Date: 2026-05-28
- Feature: 測試題庫
- Owner: [To be filled]

## Goal

為 spec 技能生成 100 道標準化測試題目，每題包含 user prompt、project context 與多維度評分標準，供測試執行器與評分器使用。

## Scope

### In Scope
- 設計測試題目的 JSON schema（user prompt、project context、scoring criteria）
- 編寫 100 道覆蓋 spec 技能全部工作流程的測試題目
- 定義評分標準維度（Outcome、Process、Style、Efficiency，參考 OpenAI Eval Skills 框架）
- 題目難度分層（基本/進階/邊界）
- 題目存放於 `assets/spec/{date}/` 下

### Out of Scope
- 測試執行器或評分器的實作（屬於 spec-test-executor-scorer）
- 優化器的實作（屬於 spec-optimizer）
- 自動生成題目的邏輯（題目由人工撰寫，本 spec 定義格式和內容）

## Functional Behaviors (BDD)

### Requirement 1: 題目 Schema 定義
**GIVEN** 需要標準化的測試題目格式
**WHEN** 定義題目 JSON schema
**THEN** schema 包含 `id`（題號）、`userPrompt`（使用者輸入）、`projectContext`（模擬專案狀態）、`scoringCriteria`（評分標準）
**AND** `scoringCriteria` 包含四個維度：`outcome`（任務完成）、`process`（skill 調用與工具使用）、`style`（輸出格式）、`efficiency`（步驟/ token 開銷）
**AND** schema 支援 `difficulty` 欄位（basic / advanced / edge）
**AND** 評分標準欄位僅供評分器讀取，不暴露給被測 agent

**Uncertainty Level**: Known

**Requirements**:
- [ ] R1.1 題目 JSON schema 檔案存在於 `assets/spec/` 目錄下（如 `assets/spec/question-schema.json`）
- [ ] R1.2 schema 定義 `id`, `userPrompt`, `projectContext`, `scoringCriteria`, `difficulty` 五個頂層欄位
- [ ] R1.3 `scoringCriteria` 包含 `outcome`, `process`, `style`, `efficiency` 四個維度，每個維度有 `weight`（權重）和 `checks`（檢查項列表）
- [ ] R1.4 每個檢查項包含 `id`, `description`, `passCondition`

### Requirement 2: 100 道測試題目內容
**GIVEN** 已定義題目 schema
**WHEN** 編寫 100 道測試題目
**THEN** 題目覆蓋 spec 技能工作流程的所有階段（理解需求 → 拆分需求 → 拆分任務 → 制定驗收條件 → 查找文檔 → 使用 CLI 工具 → 架構 diff → 自我審查）
**AND** 包含至少 20 道邊界/異常場景題目（如需求不明確、跨模塊變更、高不確定性需求）
**AND** 包含至少 10 道反向測試（agent 不應調用 spec skill 的場景）
**AND** 題目難度分佈：basic 40%、advanced 40%、edge 20%

**Uncertainty Level**: Exploratory（題目品質依賴對 spec 技能的深入理解，需人工審查）

**Requirements**:
- [ ] R2.1 100 道題目以 JSON 陣列格式存放在 `assets/spec/{date}/test-questions.json`
- [ ] R2.2 每道題目通過 schema 驗證
- [ ] R2.3 題目覆蓋率矩陣：spec 工作流程 8 個步驟每步至少 5 道題
- [ ] R2.4 至少 20 道邊界/異常場景題
- [ ] R2.5 至少 10 道反向測試題（不應觸發 spec skill）

### Requirement 3: 評分標準不暴露
**GIVEN** 測試題目包含評分標準
**AND** 被測 agent 讀取題目檔案以獲取 user prompt 和 project context
**WHEN** 測試執行器向 agent 提供題目
**THEN** 僅傳遞 `id`, `userPrompt`, `projectContext` 三個欄位
**AND** `scoringCriteria` 和 `difficulty` 欄位被剝離
**AND** 評分器獨立讀取完整題目（含評分標準）進行評分

**Uncertainty Level**: Known

**Requirements**:
- [ ] R3.1 測試執行器讀取題目時，僅提取 `userPrompt` 和 `projectContext` 傳遞給 agent
- [ ] R3.2 評分器可獨立讀取完整題目（含 `scoringCriteria`）

## Error and Edge Cases
- [ ] 題目 schema 變更向後相容（舊題目仍可被解析）
- [ ] projectContext 包含檔案結構定義時，隔離環境能正確初始化
- [ ] userPrompt 包含特殊字符（換行、引號）時 JSON 正確 escape
- [ ] 題目數量不足 100 時的處理（載入時校驗）
- [ ] 重複 `id` 的檢測與拒絕

## Clarification Questions
- 題目是否需要支援多語言（中文 + 英文）？目前預設為繁體中文 user prompt
- 反向測試的評分標準如何定義？agent 不調用 skill 即滿分，還是需同時檢查 agent 採取了正確的替代方案？

## References
- Official docs:
  - OpenAI Eval Skills 博客 — 四維評分框架（Outcome, Process, Style, Efficiency）
  - SkillsBench 論文 (arxiv.org/abs/2602.12670) — benchmark 設計方法論
- Related code files:
  - `spec/SKILL.md` — spec 技能完整工作流程（8 步驟）
  - `spec/references/create-specs.md` — apltk create-specs 參數
  - `spec/references/architecture.md` — apltk architecture 參數
  - `spec/references/spec-quality-checklist.md` — 交付前審查清單
  - `spec/assets/templates/` — spec 輸出模板

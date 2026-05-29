# Spec: 技能評測核心 (Skill Eval Core)

- Date: 2026-05-29
- Feature: 自動化技能評測 — 出題、執行、評分
- Owner: laitszkin
- Batch: skill-eval-optimizer (Part 1/2)

## Goal

建立一套自動化技能評測流程，能針對 `spec` 技能出題、執行、記錄軌跡、並由評分模型從指令遵循/工具調用/結果質量三個維度打分產出報告。

## Scope

### In Scope

- 題庫管理：維護核心人工題庫（覆蓋關鍵場景），搭配 LLM 動態生成題目變體
- 評測執行：讓模型在隔離環境中執行技能，記錄思考軌跡、工具調用軌跡、最終輸出為 JSONL
- 評分：評分模型對每題從指令遵循度、工具調用質量、結果質量三個維度打分
- 報告輸出：產出結構化評測報告（Markdown），包含每題分數、扣分原因、軌跡摘要
- 題目數量：快速模式 3-5 題，標準模式 8-12 題
- 評測對象：先聚焦 `spec` 技能

### Out of Scope

- 優化 diff 生成與應用（見 Part 2/2 `optimize-and-integrate`）
- CLI 命令介面與 CI/CD 整合（見 Part 2/2 `optimize-and-integrate`）
- 上下文隔離與工具模擬策略（見 Part 2/2 `optimize-and-integrate`）
- `spec` 以外的技能評測
- 深度模式（20+ 題）
- 跨專案的通用評測框架

## Functional Behaviors (BDD)

### Requirement 1: 題庫管理與題目生成

**GIVEN** 系統已初始化且題庫存在核心題目
**AND** 使用者選擇了評測模式（快速 3-5 題 / 標準 8-12 題）
**WHEN** 評測流程啟動
**THEN** 系統從核心題庫中抽取對應數量的題目
**AND** 對於需要變體的題目，由 LLM 基於核心題目生成語意等價但表述不同的變體
**AND** 每道題目包含：場景描述、使用者輸入、期望行為描述
**AND** 題目中的評分標準在執行階段對被評測模型不可見

**Uncertainty Level**: Exploratory

**Requirements**:
- [ ] R1.1 核心題庫以結構化格式（JSON）儲存，每題有唯一 ID
- [ ] R1.2 支援題目難度標記（basic / advanced / edge）
- [ ] R1.3 LLM 變體生成需保留原題的評分標準，僅改寫場景表述
- [ ] R1.4 抽取題目時確保難度分佈合理（不全部是簡單題或困難題）

### Requirement 2: 技能評測執行與軌跡記錄

**GIVEN** 一組已準備好的評測題目
**AND** 被評測的技能已載入
**WHEN** 系統逐題執行評測
**THEN** 每題在隔離環境中執行（不影響真實專案檔案）
**AND** 記錄模型的完整思考過程（think 區塊）
**AND** 記錄每一次工具調用的名稱、參數、回傳值（讀取操作真實執行，寫入操作模擬回傳）
**AND** 記錄模型的最終輸出結果
**AND** 所有記錄寫入結構化 JSONL 軌跡檔案（每行一個事件）
**AND** 執行完成後寫入完成標記（如 `.done` 檔案）

**Uncertainty Level**: Known

**Requirements**:
- [ ] R2.1 JSONL 每行包含：事件類型、時間戳、內容、token 用量（如有）
- [ ] R2.2 執行支援超時控制（可配置 timeout）
- [ ] R2.3 執行失敗（如模型 API 錯誤）時記錄錯誤資訊並繼續下一題
- [ ] R2.4 支援並發執行多道題目（並發數可配置）

### Requirement 3: 評分與結構化報告

**GIVEN** 一組已完成執行的評測軌跡（JSONL 檔案）
**AND** 每題的評分標準（來自題庫）
**WHEN** 評分模型處理每道題目的軌跡
**THEN** 從三個維度對每題打分：
  - 指令遵循度：模型是否準確理解並執行了使用者意圖
  - 工具調用質量：工具選擇是否恰當、參數是否正確、調用順序是否合理
  - 結果質量：最終輸出是否符合業務預期、格式是否正確
**AND** 對每個扣分項記錄具體原因和相關軌跡片段
**AND** 彙總產出結構化評測報告（Markdown 格式），包含：
  - 總分與各維度平均分
  - 每題明細（分數、扣分原因、關鍵軌跡引用）
  - 常見問題模式摘要
**AND** 評分模型的每次呼叫在獨立上下文中進行（不與被評測模型的上下文混合）

**Uncertainty Level**: Exploratory

**Requirements**:
- [ ] R3.1 評分模型可透過配置文件（如 `.env`）指定（API URL、模型名稱、API Key）
- [ ] R3.2 評分輸出為結構化 JSON（含各維度分數、扣分項列表、問題嚴重程度 P0/P1/P2）
- [ ] R3.3 報告中的軌跡引用精確到 JSONL 行號
- [ ] R3.4 支援並發評分多道題目（並發數可配置）
- [ ] R3.5 已完成評分的題目不重複評分（透過標記檔案判斷）

## Error and Edge Cases

- [ ] 題庫為空或題目數量不足：提示使用者需先建立題庫，不執行評測
- [ ] 評分模型 API 不可用：顯示連線錯誤訊息，保留已執行的軌跡檔案供後續評分
- [ ] 被評測模型 API 不可用：記錄錯誤，跳過該題繼續執行
- [ ] JSONL 軌跡檔案損壞或不完整：評分階段跳過並在報告中標記為「無法評分」
- [ ] 評分模型輸出格式不符合預期（非 JSON）：實作多層 fallback 解析（直接解析 → markdown code block 提取 → 正則匹配）
- [ ] 磁碟空間不足無法寫入軌跡：提前檢查可用空間，不足時中止並報錯
- [ ] 使用者中斷評測（Ctrl+C）：保留已完成的軌跡和評分結果

## Clarification Questions

- 核心題庫的初始題目數量和具體場景需要在實作前定義（建議至少 10 題覆蓋 spec 技能的主要工作流程步驟）
- 快速模式 3-5 題的選題策略：是否應按難度分層抽樣，還是隨機抽取？

## References

- 提案文檔: `docs/plans/2026-05-29/skill-eval-optimizer/PROPOSAL.md`
- 現有評測腳本: `scripts/run-evals.mjs`, `scripts/score.mjs`
- 共用函式庫: `scripts/lib/judge-api.mjs`, `scripts/lib/promise-pool.mjs`
- 題目格式定義: `assets/spec/question-schema.json`
- 現有題庫: `assets/spec/2026-05-28/test-questions.json`

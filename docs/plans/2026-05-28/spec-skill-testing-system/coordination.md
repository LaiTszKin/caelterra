# Coordination: spec 技能測試與優化系統

- Date: 2026-05-28
- Batch: spec-skill-testing-system

## Business Goals

建立一套自動化測試與優化系統，對 spec 技能進行大規模、可重複的品質評估，並依據評分結果自動優化技能內容與 apltk 工具。

- Batch members: [spec-test-question-bank, spec-test-executor-scorer, spec-optimizer]
- Shared outcome: 能夠對 spec 技能進行 100 題並行測試，由 LLM-as-Judge 多維度評分，並自動產出優化建議與實作變更
- Out of scope: 對 spec 以外的技能進行測試；CI/CD 整合；GUI 儀表板

## Design Principles

- Current baseline: repo 根目錄下有 42 個技能目錄（含 spec），無測試基礎設施，無 assets/ 或 results/ 目錄
- Shared invariants:
  - .env 配置兩組獨立模型（執行模型 EXEC_* + 評分模型 JUDGE_*），互不干擾
  - 被測 agent 僅能在 `assets/spec/{date}/test_{no}/` 隔離目錄下工作
  - 評分標準不向被測 agent 暴露
  - 每個測試用例的產出獨立存放在 `results/spec/{date}/test_{no}/`
- Shared constraints:
  - 所有腳本使用 Node.js 內建模組（`node:child_process`, `node:fs`, `node:path`），不引入非必要第三方依賴
  - API 調用格式為 OpenAI 相容（支援 base_url, model, reasoning_effort）
  - 並行數量需考慮 API 併發限額
- Legacy direction: None（全新系統）
- Compatibility window: None
- Cleanup after cutover: None

## Spec Boundaries

### Ownership Map

#### Spec Set 1: spec-test-question-bank
- Primary concern: 定義 100 道測試題目的資料結構、內容格式、評分標準綱要
- Allowed touch points: `assets/spec/{date}/` 下的題目 JSON 檔案；題目 schema 定義檔案
- Must not change: 測試執行器代碼、評分器代碼、apltk CLI 工具

#### Spec Set 2: spec-test-executor-scorer
- Primary concern: 測試執行器（隔離環境、API 調用、並行控制）與評分器（trace 解析、多維度評分、報告生成）
- Allowed touch points: `scripts/run-evals.mjs`、`scripts/score.mjs`、`.env.example`
- Must not change: 題目內容、優化器代碼、spec 技能 SKILL.md

#### Spec Set 3: spec-optimizer
- Primary concern: 讀取評分結果、去重歸類問題、對 spec 技能及 apltk 工具進行針對性優化
- Allowed touch points: `scripts/optimize.mjs`、spec 技能 `SKILL.md`、apltk 相關工具原始碼
- Must not change: 測試題庫內容、測試執行器與評分器核心邏輯

### Collisions & Integration

- Shared files & edit rules:
  - `.env` / `.env.example`：Spec B 定義執行模型配置（EXEC_BASE_URL, EXEC_MODEL, EXEC_REASONING_EFFORT），Spec C 定義評分模型配置（JUDGE_BASE_URL, JUDGE_MODEL, JUDGE_REASONING_EFFORT），使用前綴區分
  - `results/spec/{date}/` 目錄結構：Spec C 寫入，Spec D 讀取，輸出 schema 由 Spec C 凍結
- Shared API / schema freeze: Spec C 的評分結果輸出 schema 由 Spec C 定義並凍結，Spec D 以此為合約
- Compatibility shim retention: None
- Merge order: spec-test-question-bank → spec-test-executor-scorer → spec-optimizer（建議順序，非強制依賴；Spec C 可在 Spec B 完成前使用 mock 題目開發）
- Integration checkpoints:
  - Spec B + C：用 5 道題目端到端驗證執行→評分流程
  - Spec C + D：用評分結果驗證優化器能正確讀取並去重
- Re-coordination trigger: 評分結果輸出 schema 變更需通知 Spec D

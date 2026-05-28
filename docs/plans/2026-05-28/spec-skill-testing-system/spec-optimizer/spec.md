# Spec: 優化器

- Date: 2026-05-28
- Feature: 優化器
- Owner: [To be filled]

## Goal

彙整評分結果，對發現的問題去重歸類，並對 spec 技能 SKILL.md 及 apltk 相關工具原始碼進行針對性優化。

## Scope

### In Scope
- 讀取 `results/spec/{date}/` 下全部評分結果
- 對 `issues[]` 進行去重與歸類
- 產出優化優先級報告
- 對 spec 技能 SKILL.md 進行內容優化
- 對 apltk 相關工具（`lib/tools/create-specs.ts`、`lib/tools/architecture.ts` 等）進行優化
- 優化方法論參考 MOCHA 論文（多目標：正確性 × 合規性 × 效率）

### Out of Scope
- 對 spec 以外的技能進行優化
- 自動化優化迴圈（多次執行→優化→再執行的循環，可作為後續迭代）
- 修改 apltk 的核心調度邏輯（`lib/cli.ts`、`lib/tool-runner.ts`）

## Functional Behaviors (BDD)

### Requirement 1: 評分結果彙整與去重
**GIVEN** `results/spec/{date}/` 下存在多個 `test_{no}/score.json` 評分結果
**WHEN** 執行優化腳本 `node scripts/optimize.mjs`
**THEN** 讀取全部評分結果
**AND** 彙整所有 `issues[]` 項目
**AND** 基於 `category` + `description` 相似度進行去重
**AND** 按 `severity`（P0→P1→P2）和出現頻率排序
**AND** 產出去重後的優化清單 `results/spec/{date}/optimization-plan.json`

**Uncertainty Level**: Exploratory（問題相似度去重需要語義匹配，可能需要調用評分模型輔助）

**Requirements**:
- [ ] R1.1 `scripts/optimize.mjs` 存在且可執行
- [ ] R1.2 正確讀取並解析全部 `score.json` 檔案
- [ ] R1.3 產出 `optimization-plan.json` 包含去重後的問題清單
- [ ] R1.4 每個去重問題包含 `category`, `severity`, `frequency`（出現次數）, `affectedTests[]`, `suggestedFix`

### Requirement 2: 技能內容優化
**GIVEN** 去重後的優化清單
**AND** 問題類別為 `skill`（指向 spec 技能本身的缺陷）
**WHEN** 優化器處理 `skill` 類別問題
**THEN** 對 spec 技能的 `SKILL.md` 進行內容優化
**AND** 優化範圍包括：工作流程步驟的清晰度、邊界條件處理、工具使用指引的準確性
**AND** 確保優化後的 SKILL.md 仍符合技能規範（frontmatter 完整、步驟清晰）
**AND** 不引入新的幻覺或錯誤指引

**Uncertainty Level**: Exploratory（自動優化自然語言指引的品質需要人工審查把關）

**Requirements**:
- [ ] R2.1 對 `spec/SKILL.md` 的修改僅限於修復已識別的問題
- [ ] R2.2 優化後的 SKILL.md 通過 `apltk validate-skill-frontmatter` 驗證
- [ ] R2.3 保留優化前的 SKILL.md 備份（或依賴 git）

### Requirement 3: apltk 工具優化
**GIVEN** 去重後的優化清單
**AND** 問題類別為 `apltk`（指向 apltk 工具的缺陷）
**WHEN** 優化器處理 `apltk` 類別問題
**THEN** 對相關 apltk 工具原始碼進行修復
**AND** 修復範圍限於 `lib/tools/create-specs.ts`、`lib/tools/architecture.ts` 等 spec 相關工具
**AND** 修復後 `npm test` 全部通過
**AND** 不改變工具的公開 CLI 介面（向後相容）

**Uncertainty Level**: Known

**Requirements**:
- [ ] R3.1 僅修改 spec 相關的 apltk 工具（`create-specs`, `architecture`）
- [ ] R3.2 修復後現有測試通過
- [ ] R3.3 CLI 介面保持向後相容

## Error and Edge Cases
- [ ] `results/` 目錄為空或不存在時的處理
- [ ] 部分 `score.json` 損壞或格式不符時的跳過機制
- [ ] 去重時語義相似但文字表述完全不同的問題識別
- [ ] 優化後的變更範圍過大時的審查門檻
- [ ] 優化建議互相衝突時的仲裁策略

## Clarification Questions
- 優化後的變更是直接寫入源碼還是產出 patch 檔案供人工審查後合入？（建議後者，降低風險）
- 問題去重的相似度門檻應設在什麼水平？
- 是否需要支援多輪優化（優化後重新測試，迭代改進）？

## References
- Official docs:
  - MOCHA 論文 (arxiv.org/abs/2605.19330) — 多目標 skill 優化方法論
  - OpenAI Eval Skills 博客 — 評分維度定義
- Related code files:
  - `spec/SKILL.md` — 優化目標
  - `lib/tools/create-specs.ts` — apltk create-specs 工具
  - `lib/tools/architecture.ts` — apltk architecture 工具
  - `lib/cli.ts` — CLI 調度（僅供參考，不修改）

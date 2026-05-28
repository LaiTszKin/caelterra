# Tasks: 優化器

- Date: 2026-05-28
- Feature: 優化器

## **Task 1: 評分結果彙整與去重**

Purpose: 讀取全部評分結果，去重歸類問題，產出優化計劃
Requirements: R1.1, R1.2, R1.3, R1.4
Scope: `scripts/optimize.mjs`
Out of scope: 實際修改技能或工具代碼

- T1.1 [ ] **`scripts/optimize.mjs`** — 匯入共用工具函數；實作 `loadAllScores(date)` 函數，掃描 `results/spec/{date}/` 下全部 `test_*/score.json`
  - Verify: 正確載入全部評分結果，缺失檔案時跳過並記錄

- T1.2 [ ] **`scripts/optimize.mjs`** — 實作 `extractIssues(allScores)` 函數，彙整所有 `issues[]`，為每個 issue 附加 `testNo` 來源標記
  - Verify: 每個 issue 可追溯到來源測試編號

- T1.3 [ ] **`scripts/optimize.mjs`** — 實作 `deduplicateIssues(issues)` 函數：相同 `category` + 相似 `description`（基於關鍵詞交集 + 可選的語義匹配）合併為一條，記錄 `affectedTests[]`
  - Verify: 實質相同的問題被合併（如 10 個測試都報告同一問題 → 去重後 1 條）

- T1.4 [ ] **`scripts/optimize.mjs`** — 實作 `generateOptimizationPlan(dedupedIssues)` 函數：按 severity（P0→P1→P2）和 frequency 排序，產出 `results/spec/{date}/optimization-plan.json`
  - Verify: P0 問題排在最前；高頻問題排在前

- T1.5 [ ] **`scripts/optimize.mjs`** — 為每條去重問題調用評分模型生成 `suggestedFix`（基於 issue 的 evidence 和 description）
  - Verify: suggestedFix 具體指向代碼位置和修改方向

## **Task 2: spec 技能 SKILL.md 優化**

Purpose: 依據 skill 類別問題優化 spec 技能的 SKILL.md
Requirements: R2.1, R2.2, R2.3
Scope: `skills/spec/SKILL.md`
Out of scope: 其他技能的 SKILL.md

- T2.1 [ ] **`scripts/optimize.mjs`** — 實作 `optimizeSkillMd(issues, skillMdPath)` 函數：將 `category: skill` 的問題和建議提供給評分模型，生成優化後的 SKILL.md 內容
  - Verify: 優化後的內容與問題清單有明確對應關係

- T2.2 [ ] **`scripts/optimize.mjs`** — 優化後的 SKILL.md 寫入前先備份（複製為 `.bak`）
  - Verify: 備份檔案存在

- T2.3 [ ] **驗證** — 優化後執行 `apltk validate-skill-frontmatter` 確認格式正確
  - Verify: 驗證通過，frontmatter 欄位完整

## **Task 3: apltk 工具優化**

Purpose: 依據 apltk 類別問題優化相關工具原始碼
Requirements: R3.1, R3.2, R3.3
Scope: `lib/tools/create-specs.ts`, `lib/tools/architecture.ts`
Out of scope: CLI 調度核心（`lib/cli.ts`, `lib/tool-runner.ts`）

- T3.1 [ ] **`scripts/optimize.mjs`** — 實作 `optimizeApltkTool(issues, toolSourcePath)` 函數：將 `category: apltk` 的問題映射到具體工具檔案和程式碼位置
  - Verify: 每個 apltk 問題都對應到具體的原始碼檔案

- T3.2 [ ] **`scripts/optimize.mjs`** — 對每個受影響的工具，調用評分模型分析原始碼 + 問題描述，產出具體的程式碼修改（以 unified diff 或 edit 指令格式輸出）
  - Verify: 修復方案有明確的 diff 範圍

- T3.3 [ ] **驗證** — 優化後執行 `npm test` 確認全部測試通過
  - Verify: `npm test` 全部通過

- T3.4 [ ] **CLI 介面驗證** — 確認 `apltk create-specs --help` 和 `apltk architecture --help` 的公開介面不變
  - Verify: CLI 命令參數和輸出行為向後相容

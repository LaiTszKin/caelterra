# Spec: 優化引擎與系統整合 (Optimize & Integrate)

- Date: 2026-05-29
- Feature: 評測結果驅動的優化 diff、CLI 介面、CI/CD 整合
- Owner: laitszkin
- Batch: skill-eval-optimizer (Part 2/2)

## Goal

將評測結果轉化為可執行的優化 diff、提供 CLI 命令讓開發者一鍵觸發評測、並整合為 PR 閘門防止技能品質回歸。

## Scope

### In Scope

- 優化 diff 生成：基於評分報告和軌跡，自動產生針對技能文件的修改建議（diff 格式）
- 修改範圍：可修改技能目錄下的 `SKILL.md`、`scripts/`、`references/`、`assets/`
- CLI 命令：提供 `apltk eval <skill>` 命令，支援快速/標準模式
- PR 閘門：CI/CD 整合，修改技能檔案時自動跑標準模式評測
- 上下文隔離：評分模型的每次呼叫在獨立上下文中進行
- 工具模擬策略：讀取操作真實執行（確保評分能反映定位能力），寫入操作 mock（避免副作用）

### Out of Scope

- 全自動閉環迭代優化（改寫 → 重測 → 再改寫直到分數達標）
- 排程定時評測
- `spec` 以外的技能
- 跨專案的通用 CLI
- 優化 diff 自動合併（不經人工審查直接應用）

## Functional Behaviors (BDD)

### Requirement 1: 優化 diff 生成

**GIVEN** 一份完整的評測報告（含每題分數、扣分原因、軌跡引用）
**AND** 被評測技能的原始檔案（SKILL.md、scripts/、references/、assets/）
**WHEN** 優化器處理評測報告
**THEN** 從扣分項中提取可優化的問題清單
**AND** 對問題去重（相似問題合併，避免重複修改）
**AND** 按優先級排序問題（P0 阻塞 > P1 重要 > P2 改善）
**AND** 針對每個問題生成具體的檔案修改建議（FIND/REPLACE 形式）
**AND** 產出優化 diff（可供人審查的 patch 格式）
**AND** 原始檔案在修改前自動備份

**Uncertainty Level**: Exploratory

**Requirements**:
- [ ] R1.1 問題去重使用語意相似度判斷（非僅關鍵字匹配）
- [ ] R1.2 優化 diff 僅修改技能目錄下的 SKILL.md、scripts/、references/、assets/
- [ ] R1.3 支援 dry-run 模式：僅產出 diff 預覽，不實際修改檔案
- [ ] R1.4 優化後的技能檔案語法保持正確（Markdown 結構完整、YAML frontmatter 有效）
- [ ] R1.5 產出優化計劃摘要（optimization-plan.json），記錄每項修改的原因與優先級

### Requirement 2: CLI 命令與模式選擇

**GIVEN** Apollo Toolkit CLI 已安裝
**WHEN** 使用者執行 `apltk eval <skill_name>`
**THEN** 系統對指定技能執行完整評測流程（出題 → 執行 → 評分 → 報告輸出）
**AND** 預設使用快速模式（3-5 題）
**AND** 評測報告輸出到終端機，同時寫入檔案
**AND** 返回適當的 exit code（0 = 全部通過, 1 = 有錯誤或低分）

**GIVEN** 使用者執行 `apltk eval <skill_name> --mode standard`
**WHEN** 標準模式啟動
**THEN** 使用 8-12 題進行評測
**AND** 完成後顯示評測報告摘要

**GIVEN** 使用者執行 `apltk eval <skill_name> --optimize`
**WHEN** 評測完成
**THEN** 在評測報告之外，額外執行優化 diff 生成
**AND** 優化 diff 顯示在終端機或寫入檔案（取決於是否使用 --dry-run）

**Uncertainty Level**: Known

**Requirements**:
- [ ] R2.1 CLI 命令格式：`apltk eval <skill_name> [--mode fast|standard] [--optimize] [--dry-run]`
- [ ] R2.2 支援 `--output-dir` 指定報告輸出目錄
- [ ] R2.3 評測過程中顯示進度指示（當前第幾題、評分進度）
- [ ] R2.4 不指定 skill_name 時顯示可用技能列表

### Requirement 3: PR 閘門整合

**GIVEN** Repository 設定有 CI/CD 流程
**AND** PR 中包含對技能檔案的修改（skills/<name>/ 下的任何檔案）
**WHEN** CI 觸發技能評測檢查
**THEN** 自動執行標準模式評測（8-12 題）
**AND** 若評測總分低於最低門檻，CI 回報失敗並附上評測報告路徑
**AND** 若評測中出現 P0 級別問題，CI 回報失敗
**AND** CI 失敗時在 PR 評論中張貼評測報告摘要

**Uncertainty Level**: Exploratory

**Requirements**:
- [ ] R3.1 CI 檢查僅在 PR 修改了技能檔案時觸發（不修改技能檔案時跳過）
- [ ] R3.2 分數門檻和 P0 問題數量閾值可配置
- [ ] R3.3 CI 失敗不阻塞非技能相關的 PR
- [ ] R3.4 支援 GitHub Actions 整合（至少提供一個可引用的 workflow 範本）

### Requirement 4: 上下文隔離與工具模擬

**GIVEN** 評測系統正在執行
**WHEN** 被評測模型呼叫工具
**THEN** 讀取類工具（Read、Bash-readonly、Grep/Find 等）真實執行，以反映模型定位資訊的真實能力
**AND** 寫入類工具（Write、Edit、Bash-write、API 呼叫等）不執行真實操作，僅記錄呼叫意圖並返回模擬成功回傳
**AND** 模擬回傳值合理且一致（例如 Write 返回成功，Edit 返回替換成功）

**GIVEN** 評分模型即將對一道題目評分
**WHEN** 評分呼叫發起
**THEN** 評分模型使用全新的獨立上下文（不包含被評測模型的對話歷史）
**AND** 評分模型的輸入僅包含：題目內容、評分標準、被評測模型的軌跡 JSONL、被評測模型的最終輸出
**AND** 不同題目的評分呼叫之間上下文也互相隔離

**Uncertainty Level**: Known

**Requirements**:
- [ ] R4.1 工具模擬策略對被評測模型透明（模型不知道工具被 mock）
- [ ] R4.2 寫入操作的 mock 回傳值包含足夠資訊讓評分模型判斷調用是否「正確」
- [ ] R4.3 上下文隔離的實現不依賴模型本身的記憶或對話管理能力
- [ ] R4.4 評分模型配置與被評測模型配置獨立（可分開設定不同模型）

## Error and Edge Cases

- [ ] 優化器對不存在或不完整的評測報告：提示需先完成評測，不產出無依據的 diff
- [ ] 優化 diff 與原始檔案衝突（檔案已被手動修改）：合併失敗時保留雙方版本，由人解決
- [ ] CLI 收到無效的 skill_name：顯示「找不到技能 <name>」並列出可用技能
- [ ] CI 環境中缺少 `.env` 配置：CI 跳過評測檢查並顯示警告（不阻塞 PR）
- [ ] 優化 diff 導致的語法錯誤（如 YAML frontmatter 損壞）：自動驗證並回滾
- [ ] 同一技能同時有兩個評測進程運行：使用檔案鎖防止並發衝突
- [ ] 評分模型和被評測模型配置指向相同模型：顯示警告但允許繼續（提醒使用者注意上下文隔離）

## Clarification Questions

- PR 閘門的最低分數門檻應設在多少？（建議初期設較低，例如總分 ≥ 60%，P0 = 0，等累積基準線數據後再調整）
- CI workflow 是否需要同時支援 GitHub Actions 和其他 CI 平台（如 GitLab CI）？
- `--dry-run` 模式下優化 diff 的輸出位置：終端機顯示還是寫入檔案，還是兩者都要？

## References

- 提案文檔: `docs/plans/2026-05-29/skill-eval-optimizer/PROPOSAL.md`
- 評測核心 Spec: `docs/plans/2026-05-29/skill-eval-optimizer/eval-core/SPEC.md`
- 現有優化腳本: `scripts/optimize.mjs`
- CLI 工具註冊: `packages/cli/tool-registration.ts`, `packages/tool-registry/registry.ts`
- 現有 CLI 工具範例: `packages/tools/create-specs/index.ts`

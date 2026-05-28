---
name: qa
description: 審查規格文檔相關的程式碼變更。從六個維度產出 code review report：幻覺代碼、冗餘、偏移、遺漏、架構、性能。不用於非 spec 相關的變更審查，不用於直接修改代碼，不用於沒有 spec 的情境。
---

## 目標

輸出一份 spec 相關變更審查報告。
先回答「這次變更是否滿足規劃中的業務要求」。
再補充邊界、安全與代碼審查發現。
每條關鍵需求需給出可追溯的狀態判定、證據來源、缺口說明與剩餘不確定性。
本技能不負責修改代碼或更新規劃文件。

## 驗收條件

- 生成完整的 code review report，內容涵蓋6個維度的代碼審查結果及改進建議。
- 所有 P0-P3 問題的完整解決方案已記錄在 code review report 中。

## 工作流程

### 1. 建立審查範圍

閱讀用戶指定的 spec。
按照其中定義的實作範圍，檢索並閱讀相關代碼。
如果外部環境允許使用 subagents，建議通過並行調度 subagents 完成代碼的深度閱讀。

### 2. 進行多維度審查

對所有實作代碼進行多維度審查，包含以下維度：
- 無幻覺代碼
- 無冗余代碼
- 代碼無與 spec 之間的實作偏移
- 無 spec 實作遺漏
- 無架構瑕疵
- 無性能隱患

若有舊有的 code review report，不閱讀它。
將本次審查當作全新審查處理，避免被舊有結果誤導。
若有代碼違反上述 6 個原則，將其紀錄在案。

如果外部環境允許使用 subagents，必須並行建立以下6個 subagents：
- 幻覺代碼審查 agent
- 冗余代碼審查 agent
- spec 實作偏移審查 agent
- spec 實作遺漏審查 agent
- 架構瑕疵審查 agent
- 性能隱患審查 agent
並讓上述6個 subagents 對該次 spec 涉及的變更範圍進行審查。

當 subagents 完成審查後，檢查各 agent 回報的 findings 之間是否有重疊。
若同一段代碼被多個 agent 標記，合併為單一 finding 並保留各維度的視角。

### 3. 合成審查結果

收集所有 subagents 的 findings 後，按以下程序合成：

1. **Dedup 重疊發現**：跨 agent 的相同問題合併為單一 finding，保留各維度的影響說明。
2. **跨 agent 統一排序**：將所有 findings 按 P0-P3 重新排序（不以各 agent 自排為準）。
3. **折疊乾淨結果**：無 findings 的審查維度僅保留一行摘要，不佔報告篇幅。

### 4. 生成 code review report

使用 `apltk` CLI 工具生成模板。
按模板指示填入審查結果。
報告需包含以下區段：
- **判決**：Ready to Merge（可直接合併）/ Needs Attention（需處理中優先級問題）/ Needs Work（有 P0-P1 問題需先修復）
- **發現的問題**：按 P0-P3 排序的完整問題列表
- **解決方案**：每個問題的修復建議
- **乾淨維度**：無 findings 的維度一行列出

注意，你提出的建議修正方案不可與 spec 本身的需求衝突。

代碼審查只有在完全滿足以下條件時，才可以被視為通過：
- 所有需求已經被正確滿足
- 架構、性能無重大缺陷
- 不存在幻覺代碼

## 參考資料

- `references/create-review-report.md` — apltk create-review-report 工具的完整參數說明。在步驟 4 使用 CLI 產生模板前閱讀。
- `assets/templates/code-review-report.md` - code review report 模板
- `references/halluciation-review-instruction.md` - 幻覺代碼審查建議流程

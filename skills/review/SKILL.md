---
name: review
description: 審查規格文檔相關的程式碼變更。從六個維度產出 code review report（REPORT.md）：僅包含發現的問題清單，不含修復建議。不用於非 spec 相關的變更審查，不用於直接修改代碼，不用於沒有 spec 的情境。
---

## 技能目標

輸出一份 spec 相關變更審查報告（REPORT.md）。
先回答「這次變更是否滿足規劃中的業務要求」。
再補充邊界、安全與代碼審查發現。
每條關鍵需求需給出可追溯的狀態判定、證據來源、缺口說明與剩餘不確定性。

**本技能只輸出發現的問題清單，不包含修復方案。** 修復方案的規劃由 `qa` 技能負責。

## 驗收條件

- 生成 REPORT.md，內容涵蓋 6 個維度的代碼審查結果
- REPORT.md 僅包含判決、發現的問題清單、審查維度摘要
- 不包含修復建議、根因分析、驗證方式

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

若有舊有的 review report，不閱讀它。
將本次審查當作全新審查處理，避免被舊有結果誤導。
若有代碼違反上述 6 個原則，將其紀錄在案。

如果外部環境允許使用 subagents，必須並行建立以下 6 個 subagents：
- 幻覺代碼審查 agent
- 冗余代碼審查 agent
- spec 實作偏移審查 agent
- spec 實作遺漏審查 agent
- 架構瑕疵審查 agent
- 性能隱患審查 agent
並讓上述 6 個 subagents 對該次 spec 涉及的變更範圍進行審查。

當 subagents 完成審查後，檢查各 agent 回報的 findings 之間是否有重疊。
若同一段代碼被多個 agent 標記，合併為單一 finding 並保留各維度的視角。

### 3. 合成審查結果

收集所有 subagents 的 findings 後，按以下程序合成：

1. **Dedup 重疊發現**：跨 agent 的相同問題合併為單一 finding，保留各維度的影響說明。
2. **跨 agent 統一排序**：將所有 findings 按 P0-P3 重新排序（不以各 agent 自排為準）。
3. **折疊乾淨結果**：無 findings 的審查維度僅保留一行摘要，不佔報告篇幅。

### 4. 生成 REPORT.md

使用 `assets/templates/REPORT.md` 模板，填入審查結果。
報告僅包含以下區段：
- **判決**：Ready to Merge / Needs Attention / Needs Work
- **發現的問題**：按 P0-P3 排序的完整問題列表（僅問題描述、影響、檔案、行數、審查維度）
- **審查維度摘要**：各維度的 finding 數量

**報告中不包含修復方案、根因分析、驗證方式等內容。** 這些由後續的 `qa` 技能負責。

代碼審查只有在完全滿足以下條件時，才可以被視為通過：
- 所有需求已經被正確滿足
- 架構、性能無重大缺陷
- 不存在幻覺代碼

## 參考資料

- `references/create-review-report.md` — apltk create-review-report 工具的完整參數說明
- `assets/templates/REPORT.md` — review report 模板
- `references/halluciation-review-instruction.md` — 幻覺代碼審查建議流程

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

### 1. 解析需求與建立審查範圍

閱讀用戶指定的 SPEC.md，解析其中的所有需求：
- 每個 `### Requirement N` 視為一個獨立的審查單位
- 該需求下的子項（RN.M checkboxes）視為同一需求的一部分，不獨立建立 subagent

按照每個需求的實作範圍，結合 File Ownership 與涉及檔案，檢索並閱讀相關代碼。

### 2. 派發 per-requirement subagent

為 SPEC.md 中的每個需求（Requirement N）建立一個 subagent。所有需求的 subagent 可並行派發。

若有舊有的 REPORT.md，先將其判決與發現問題摘要濃縮為一筆歷史記錄，附加到 REPORT.md 的「Review History」區段，保留過去所有輪次的記錄。然後以全新審查覆蓋報告其餘部分（判決說明、發現的問題、審查維度摘要），避免被舊有結果誤導。

每個需求 subagent 的任務：
1. 根據該需求的實作範圍定位相關代碼
2. 對相關代碼進行以下 6 個維度的審查：
   - **幻覺代碼**：是否存在未定義於 spec 的功能或邏輯
   - **冗余代碼**：是否存在未被使用的變數、函式、或重複實作
   - **spec 實作偏移**：代碼行為是否與 spec 定義不一致
   - **spec 實作遺漏**：spec 中的需求是否未被實作
   - **架構瑕疵**：是否符合 DESIGN.md 定義的架構設計
   - **性能隱患**：是否存在明顯的性能問題
3. 回報該需求範圍內的 findings

若同一段代碼對應多個需求，跨 subagent 的 findings 留待合成階段處理。

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

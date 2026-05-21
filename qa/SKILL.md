---
name: qa
description: 審查規格文檔相關的程式碼變更。從六個維度產出 code review report：幻覺代碼、冗餘、偏移、遺漏、架構、性能。
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

對所有實作代碼進行多維度審查，確保代碼：
- 無幻覺代碼
- 無冗余代碼
- 代碼無與 spec 之間的實作偏移
- 無 spec 實作遺漏
- 無架構瑕疵
- 無性能隱患

若有舊有的 code review report，不閱讀它。
將本次審查當作全新審查處理，避免被舊有結果誤導。
若有代碼違反上述 6 個原則，將其紀錄在案。
如果外部環境允許使用 subagents，建議通過並行調度 subagents 完成對代碼的多維度審查，每一個 subagent 審查一個維度。

### 3. 生成 code review report

總結上一步發現的所有問題代碼。
按嚴重程度排序。
使用 `apltk` CLI 工具生成模板。
按模板指示填入審查結果。
注意，你提出的建議修正方案不可與 spec 本身的需求衝突。

## 參考資料

- `assets/templates/code-review-report.md` - code review report 模板
- `apltk create-review-report --help` - cli 工具幫助資訊
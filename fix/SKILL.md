---
name: fix
description: 當你需要修復 code review report 之中發現的問題時，調用這個技能。
---

## 技能目標

遵照 code review report 之中的建議方案，逐一將所有發現的代碼問題修正。

## 驗收條件

- 所有 code review report 之中明確列出的 P0 - P3 問題都已經被完全修復。

## 工作流程

### 1. 完整閱讀 code review report

完整閱讀 code review report，並深入閱讀相關受影響代碼，理解建議修復方案。
如果外部環境允許使用 subagents，建議通過並行調度 subagents 完成對代碼的深度閱讀。

### 2. 修復發現的問題

按照 code review report 之中的嚴重度排序，使用 `systematic-debug` 這個技能，從最高嚴重度的問題開始建議方案修復。
如果外部環境允許使用 subagents，建議將修復任務拆分並分配給多個 subagents 通過 worktree 並行完成，並在結束之後合併回當前分支。
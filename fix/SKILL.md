---
name: fix
description: 依照 code review report 中的建議方案修復代碼問題。P0-P3 等級逐一處理。
---

## 技能目標

遵照 code review report 的建議方案修正代碼問題。
逐一處理所有發現的問題。

## 驗收條件

- 所有 code review report 中明確列出的 P0-P3 問題都已被完全修復。

## 工作流程

### 1. 完整閱讀 code review report

完整閱讀 code review report 及相關受影響代碼，理解建議修復方案。
如果外部環境允許使用 subagents，建議通過並行調度 subagents 完成對代碼的深度閱讀。

### 2. 修復發現的問題

按 code review report 的嚴重度排序。
從最高嚴重度的問題開始修復。
使用 `systematic-debug` 技能。

若外部環境允許使用 subagents，建議按照以下流程加速修復進度：
1. 讀取審查結果所發現的問題，識別每個問題對應的改進建議。
2. 閱讀審查報告標記的相關檔案。
3. 將審查報告標記的問題區分為：
    - 獨立問題：與其他問題之間沒有相依性
    - 非獨立問題：與其他問題之間存在相依性
4. 召喚多個有自己專屬 worktree 的 subagents 對獨立問題進行並行修復。
5. 合併所有獨立問題的修復到當前分支；將非獨立問題按照其相依性切分為多個修復批次，並確保每一個批次之中的任務之間沒有相依性。
6. 按照非獨立問題的修復批次順序，召喚多個有自己專屬 worktree 的 subagents 修復問題。在開始每一個新批次之前，先將相關修復合併回當前分支。
7. 確認所有修復已經合併，且所有修復用 worktree 已經被清理。

如果使用了 subagents 加速修復流程，subagents 需要嚴格按照以下流程工作：
1. 識別修復範圍，閱讀相關代碼檔案。
2. 使用 `systematic-debug` 技能，對問題進行修復。
3. 使用 `commit` 技能，將修復提交到所屬 worktree。
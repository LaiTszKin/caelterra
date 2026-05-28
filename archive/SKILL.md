---
name: archive
description: 將已完成的spec歸檔到 `docs/archive/` 下。當你需要將spec歸檔時，調用這個技能。
---

## 技能目標

把已完成的規劃文件轉成專案的長期文檔資產，讓正式文件反映目前真實系統，而活動中的 planning artifacts 與已消耗完的 spec 能被清楚分離。

## 驗收條件

- `docs/plans/` 目錄下不存在任何完成但未歸檔的spec
- 所有項目文檔已經被維護至最新狀態，對齊repo實作。

## 工作流程

### 1. 盤點現有 spec 的完成狀態

在 `docs/plans/` 目錄下找到現有的所有spec。閱讀每一份spec的 `checklist.md`, `tasks.md`, `spec.md` 並檢查當中的markdown checkboxes是否被全部勾選為完成（除與任務無關的 checkboxes 外，比如 spec 的批准狀態）。
將 `checklist.md`, `tasks.md`, `spec.md` 三份文檔checkboxes皆完成勾選的spec標記為已完成。

### 2. 更新項目文檔及架構圖

使用 `docs-project`, `maintain-project-constraints` 技能，按照這兩個技能之中的指引，更新項目文檔。

使用 `apltk` CLI 工具將 architecture diff 合併回項目架構圖。在操作前先閱讀 `references/architecture.md` 了解 merge 與相關參數的使用方式。

### 3. 歸檔 spec

將完成的spec全部移動到 `docs/archive/`。

## 參考資料索引

- `references/architecture.md` — apltk architecture 工具的完整參數說明。在步驟 2 合併 architecture diff 前閱讀。
- `assets/templates/readme.md`：README.md 模板
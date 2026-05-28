---
name: update-project-html
description: 當項目架構圖與實際程式碼脫節時，增量刷新架構圖資源。包括基礎 atlas 與渲染 HTML。更新前先測量 drift 程度決定更新範圍。
---

## 目標

根據目前分支、工作區或指定提交範圍內的程式碼變更，增量刷新基礎 atlas 與渲染 HTML。
使架構圖持續和實際程式碼保持一致。

## 驗收條件

- 所有子模塊之間的 edge 的定義被更新到貼合最新代碼實踐
- 所有子模塊內部的 edge 的定義被更新到貼合最新代碼實踐
- 架構圖完整展示整個系統之中子模塊之間的關係以及功能模塊之間的關係
- 已測量架構圖與程式碼的 drift 程度，確認更新範圍合理
- diff 中不影響架構的變更（formatting、config-only、test-only）已被過濾

## 工作流程

### 1. 查看現有架構圖

閱讀現有架構圖。
整理功能模塊之間、子模塊之間的關係等重要資訊。

> 只讀取 `atlas.index.yaml` + 受影響 feature 的 YAML 檔案。不讀取無關的 feature 或未變更的模組，以維持 context economy。

### 2. 測量架構 drift

在決定更新範圍前，先比對架構圖與當前程式碼的偏離程度：

- 比較 `atlas.index.yaml` 與當前目錄結構：是否有新增 / 移除的目錄或模組？
- 比較各 feature YAML 中的檔案路徑與實際程式碼：是否有檔案已不存在或搬移？
- 量化 drift：新增 + 移除 + 修改的 entries 數量 / 總 entries 數量

根據 drift 程度決定更新策略：
- **低 drift（< 20%）**：只更新受 diff 影響的 feature
- **高 drift（≥ 20%）**：建議標記為重大偏離，通知用戶後考慮全面重新初始化（使用 `init-project-html`）

### 3. 過濾 diff 噪聲

分析 diff 範圍，過濾不影響架構的變更類型：
- **保留**：新增或修改的 API route、service 邏輯、資料庫操作、模組邊界變更
- **過濾**：formatting 調整、config 值變更（非結構變更）、純測試檔案、型別定義調整（非邊界影響）、註解或文檔變更

將過濾後的 diff hunk 對應到受影響的 feature。

### 4. 對照代碼庫及當前架構圖

閱讀當前 repo 中受影響的部份。
驗證架構圖是否存在錯誤或遺漏。
如果外部環境允許使用 subagents，建議並行調度 subagents 完成代碼與架構圖的對照任務。

### 5. 通過 `apltk` cli 工具更新當前架構圖

使用 `apltk` cli 工具，按照以下流程完成架構圖的更新：

在操作前先閱讀 `references/architecture.md` 了解所有參數細節。
1. 定義功能模塊及其下屬子模塊。
2. 定義子模塊之間的關係、呼叫、錯誤處理、資料流、回滾等架構關係
3. 定義子模塊內部的函數、變數、資料流及錯誤處理。

當從 diff 推斷 component 時，使用 `--evidence inferred` 標記品質等級。例如：
```
apltk architecture function add --feature <slug> --submodule <slug> --name <fn> --evidence "inferred:<source-path>"
```

更新完成後再次測量 drift，確認已降低至可接受範圍。

## 參考資料

- `references/architecture.md` — apltk architecture 工具的完整參數說明。在步驟 5 更新架構圖前閱讀，了解 mutation 指令與 --evidence 旗標的行為。
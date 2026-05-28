---
name: init-project-html
description: 為項目初始化架構圖。透過 apltk CLI 將功能模塊與子模塊的關係轉化為可渲染的 HTML 架構圖，採用 C4 模型層級（Context → Container → Component → Code）。
---

## 技能目標

透過 `apltk` CLI 製作項目架構圖。
幫助用戶理解專案的軟體架構。

## 驗收條件

- 所有子模塊之間的 edge 被完整定義
- 所有子模塊內部的 edge 被完整定義
- 架構圖完整展示整個系統之中子模塊之間的關係以及功能模塊之間的關係
- 每個宣告的 component 皆附有來源程式碼證據；無法確定的標記為 inferred
- 架構圖層級對應 C4 model：功能模塊（Container 層級）→ 子模塊（Component 層級）

## C4 模型對照

本技能的「功能模塊」與「子模塊」對應到 C4 model 的以下層級：

| C4 層級 | 本技能對應 | 說明 | 使用時機 |
|---------|-----------|------|---------|
| System Context | 整體系統 | 系統與外部 actor、外部系統的關係 | 步驟 1 建立基線認知 |
| Container | 功能模塊 | 高階功能邊界（如登入功能、支付功能） | 主要抽象層級 |
| Component | 子模塊 | 功能內部的實作單元（如 controller、service、repository） | 主要詳細層級 |
| Code | function 行 | 函式層級細節 | 只在特定關鍵路徑需要 |

## Mode Detection

At load time, check the project state to select the correct mode:

- **design** — No `resources/project-architecture/atlas/` directory exists.
  Run full C4 initialization. Use `--evidence observed` for source-confirmed components.

- **record** — Atlas directory exists but is near-empty (< 2 features).
  Run quick feature-by-feature recording using `apltk architecture scan` to discover candidates.
  Use `--evidence inferred` for structurally inferred components.

- **update** — Atlas has substantive content and source code has changed.
  Delegate to `update-project-html` skill for drift measurement and incremental update.

- **review** — An `architecture_diff/` overlay directory exists.
  Run diff comparison workflow. If no diff found, fallback to update mode.

- **guard** — If you are explicitly instructed to run design/init mode but the atlas
  directory already exists and is non-empty, pause and ask the user whether to:
  (a) overwrite the existing atlas, (b) switch to update mode, or (c) abort.

## 工作流程

適用模式：design（完整初始化）、record（快速記錄）

### 1. 閱讀並理解代碼庫 — 先建立 System Context

在深入程式碼前，先建立系統的宏觀認知：
- 系統與哪些外部 actor 互動（使用者、第三方服務、其他系統）
- 系統提供哪些高階能力

然後閱讀 `sample-demo/` 了解預期的輸出格式與抽象層級。

按照功能模塊定義，全面檢索代碼庫。
將其拆分為單個或多個功能模塊（對應 C4 Container 層級）。
接著，識別功能模塊下的子模塊（對應 C4 Component 層級），並進行深度閱讀。

如果外部環境允許使用 subagents，建議並行調度 subagents，並為每一個功能模塊分配一個 subagent 進行深度閱讀，要求 subagents 完整列出：
- 該功能模塊與其他功能模塊之間是否存在交互；如有，如何交互。
- 該功能模塊內部存在哪些子模塊，這些子模塊之間如何交互並實現功能模塊的功能。
- 該功能模塊及下屬子模塊的資料流、錯誤處理。

> 每個 subagent 回報的每個宣告都應附上對應的程式碼檔案路徑與行號，作為證據追溯的基礎。

### 2. 使用 `apltk` cli 工具協助生成架構圖

依照 C4 層級逐步產生：
在操作 CLI 前先閱讀 `references/architecture.md` 了解所有參數與 mutation 系列的使用方式。

1. **System Context**：定義外部 actor、系統邊界、跨系統 edge
2. **Container 層級**：定義功能模塊（feature）及其之間的 edge
3. **Component 層級**：定義子模塊（submodule）及其內部元素（function、variable、dataflow、error）
4. **Code 層級**（選擇性）：對關鍵路徑補充函式層級細節

將前一步獲取的代碼庫知識透過 CLI 工具轉化為清晰的架構圖。
完成後驗證架構圖格式正確且可渲染。

## 證據追溯

每個透過 CLI 宣告的 component 應附上對應的來源證據：

- 功能模塊（feature）→ 對應的目錄路徑或 entry point 檔案
- 子模塊（submodule）→ 實作該模組的檔案列表
- function 行 → 函式定義的檔案與行號
- edge → 觸發該呼叫關係的程式碼位置

若因時間或上下文限制無法完整追溯，在 `meta.summary` 中記錄已掃描範圍與已知遺漏。

## 參考資料

- `references/architecture.md` — apltk architecture 工具的完整參數說明。在步驟 2 產生架構圖前閱讀。
- `references/TEMPLATE_SPEC.md`：atlas 欄位、列舉和 CLI 寫入形狀速查表。
- `references/definition.md`: 功能模塊和子模塊的詳細定義。
- `assets/architecture-page.template.html`: 模板 html。
- `references/architecture.css`: 風格模板。
- `sample-demo/`：完整示例輸出，用於理解基礎 atlas 的最終形態與 C4 層級對應。
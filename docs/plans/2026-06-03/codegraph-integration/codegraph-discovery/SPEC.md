# Spec: CodeGraph 架構探索與調查工具

- **Date**: 2026-06-03
- **Feature**: codegraph-discovery
- **Batch**: codegraph-integration

## Goal

提供 LLM agent 一組確定性的架構探索工具，取代現有的 grep/Read 檔案發現流程——讓 LLM 不再需要猜測程式碼結構，而是直接取得由 tree-sitter 解析的結構化資料。

## Scope

### In Scope

- `apltk codegraph explore <query>`：探索符號上下文，返回匹配符號的原始碼（按檔案分組）與關係地圖
- `apltk codegraph survey [dir]`：調查目錄或功能的完整結構，輸出 atlas-compatible 的結構化報告（含 feature、submodule 候選、suggestedEdges）
- `apltk codegraph list-apis [feature]`：列出指定功能模組的公開 API 目錄（entry points + 參數 + 回傳值）
- `apltk codegraph list-apis --all`：列出整個系統的所有公開 API，按 feature 分組
- 所有命令支援 `--feature <slug>` 來指定 atlas feature 對應關係
- 所有命令支援 `--json` 輸出模式，供 LLM 程式化消費

### Out of Scope

- **不**自動寫入 atlas YAML——這些命令是唯讀的，不修改任何檔案
- **不**實作 CodeGraph 的 semantic search（向量搜尋）——只使用 FTS5 全文搜尋
- **不**實作 CodeGraph 的 `getImpactRadius()`——那是修改前的影響評估，不屬於「探索」範疇
- **不**包裝 CodeGraph 的 `buildContext()` 定製格式——直接回傳結構化 JSON

## Functional Behaviors (BDD)

### Requirement 1: 探索符號上下文

**GIVEN** 一個已索引的專案目錄
**WHEN** 使用者執行 `apltk codegraph explore "auth service login"`
**THEN** 回傳所有匹配符號的原始碼（按所屬檔案分組）
**AND** 附上符號之間的關係摘要（呼叫者、被呼叫者）
**AND** 附上每個符號的檔案路徑與行號
**AND** 支援 `--feature auth` 將結果標記為特定 atlas feature

**Uncertainty Level**: Known

### Requirement 2: 調查目錄結構

**GIVEN** 一個已索引的專案目錄
**WHEN** 使用者執行 `apltk codegraph survey src/auth/`
**THEN** 回傳一份結構化調查報告，包含：
  - 目錄下的所有檔案清單與各檔案的函式數量
  - 目錄的 entry points（被外部檔案呼叫的公開函式）
  - 目錄內函式的呼叫者與被呼叫者清單
  - 依目錄結構與呼叫密度建議的 submodule 分組
  - 與其他目錄之間的跨邊界呼叫關係
**AND** 支援 `--feature auth` 指定 atlas feature slug

**Uncertainty Level**: Exploratory — survey 的「建議 submodule 分組」需要決定分組演算法，可能需迭代

### Requirement 3: 列出現有公開 API

**GIVEN** 一個已索引的專案目錄
**WHEN** 使用者執行 `apltk codegraph list-apis user`
**THEN** 回傳 `user` 相關目錄的公開 API 目錄：
  - 每個公開函式的名稱、參數列表、回傳值型別
  - 每個公開函式的檔案路徑與行號
  - 哪些外部函式呼叫了這個 API
**WHEN** 使用者執行 `apltk codegraph list-apis --all`
**THEN** 回傳整個專案所有公開 API，按目錄分組

**Uncertainty Level**: Known — CodeGraph 的 `searchNodes()` + `getCallers()` 已提供所需的原始資料

## Error and Edge Cases

- **索引未建立**：提示「請先執行 `apltk codegraph init --index` 或 `apltk codegraph sync`」
- **搜尋無結果**：回傳空結果與提示「無匹配符號，可嘗試其他關鍵字」
- **目錄不存在**：回傳錯誤「指定目錄不在專案範圍內」
- **Feature slug 對應的目錄無法確認**：`--feature` 僅作為標記使用，不強制目錄與 feature 名稱一致
- **大量結果**：`explore` 和 `survey` 應有預設結果上限（如 50 個符號），防止 CLI 輸出過大

## Clarification Questions

- ~~`survey` 的「建議 submodule 分組」應如何實作？簡單方案是「同一個目錄 = 同一個 submodule」，還是需要更複雜的呼叫密度分析？~~
  ✅ **已決定：使用呼叫密度分析 + 目錄結構的混合策略。** 在同一目錄內，根據函式間的呼叫緊密度（call graph 聚類）進一步細分 submodule，而非單純以目錄為邊界。具體演算法需在設計階段決定。

## References

- `@colbymchenry/codegraph` API: `CodeGraph.searchNodes()`, `getCallers()`, `getCallees()`, `getFiles()`, `buildContext()`
- Related code files:
  - `skills/init-project-html/SKILL.md` — 將會使用 survey 的目標技能
  - `docs/plans/2026-06-03/codegraph-integration/PROPOSAL.md` — survey 與 list-apis 的輸出格式設計

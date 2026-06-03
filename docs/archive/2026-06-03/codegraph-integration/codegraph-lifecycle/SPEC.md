# Spec: CodeGraph 索引生命週期管理

- **Date**: 2026-06-03
- **Feature**: codegraph-lifecycle
- **Batch**: codegraph-integration

## Goal

讓 LLM agent 和開發者能透過 `apltk` CLI 初始化、維護和監控專案的 CodeGraph 知識圖譜索引，作為所有後續架構探索與驗證命令的基礎資料層。

## Scope

### In Scope

- `apltk codegraph init`：在專案目錄中初始化 `.codegraph/` 索引目錄並建立 SQLite 資料庫
- `apltk codegraph init --index`：初始化後立即執行完整索引
- `apltk codegraph sync`：增量掃描工作目錄，僅索引有變更的檔案
- `apltk codegraph status`：顯示索引統計（檔案數、符號數、邊數、資料庫大小、語言分佈）
- `apltk codegraph search <query>`：以 FTS5 全文搜尋符號名稱，支援 `--limit` 與 `--json`
- 以上命令的 `--json` 輸出模式，供 LLM 程式化消費
- 以上命令的適當錯誤處理與使用者提示

### Out of Scope

- **不**取代或複製 CodeGraph 的完整 CLI——只包裝與架構圖生成相關的子集
- **不**實作 CodeGraph 的 file watcher（預設由 MCP server 處理，不在 CLI 範疇）
- **不**實作 `codegraph uninit` 或從專案移除索引的功能
- **不**處理跨專案或多 repo 索引

## Functional Behaviors (BDD)

### Requirement 1: 初始化 CodeGraph 索引

**GIVEN** 一個尚未初始化 CodeGraph 的專案目錄
**AND** `@colbymchenry/codegraph` 已安裝在專案的依賴中
**WHEN** 使用者執行 `apltk codegraph init`
**THEN** 在專案根目錄下建立 `.codegraph/` 目錄
**AND** 系統顯示初始化成功的確認訊息
**AND** 索引檔案尚未建立（需等待 `sync` 或 `init --index`）

**Uncertainty Level**: Known

### Requirement 2: 初始化並立即索引

**GIVEN** 一個尚未初始化 CodeGraph 的專案目錄
**WHEN** 使用者執行 `apltk codegraph init --index`
**THEN** 建立 `.codegraph/` 目錄
**AND** 立即開始掃描專案目錄下的所有支援語言原始碼檔案
**AND** 顯示索引進度（已掃描檔案數 / 總檔案數）
**AND** 索引完成後顯示摘要（檔案數、符號數、耗時）

**Uncertainty Level**: Known

### Requirement 3: 增量更新索引

**GIVEN** 一個已初始化且已索引的專案目錄
**AND** 部分原始碼檔案已被修改、新增或刪除
**WHEN** 使用者執行 `apltk codegraph sync`
**THEN** 掃描工作目錄比對檔案變更
**AND** 僅重新索引有變更的檔案
**AND** 從索引中移除已刪除檔案的符號
**AND** 顯示增量更新摘要（新增/修改/刪除檔案數）

**Uncertainty Level**: Known

### Requirement 4: 查詢索引統計與搜尋

**GIVEN** 一個已索引的專案目錄
**WHEN** 使用者執行 `apltk codegraph status`
**THEN** 顯示索引統計：檔案總數、符號節點總數、邊總數、資料庫大小、支援的語言清單
**WHEN** 使用者執行 `apltk codegraph search "UserService"`
**THEN** 回傳所有名稱包含 "UserService" 的符號、其檔案路徑與行號
**AND** 支援 `--limit N` 限制回傳數量
**AND** 支援 `--json` 以 JSON 格式輸出（供 LLM 解析）

**Uncertainty Level**: Known

## Error and Edge Cases

- **專案已初始化**：`codegraph init` 在 `.codegraph/` 已存在時應顯示錯誤，建議使用者改用 `sync`
- **未初始化時執行 sync/status/search**：顯示明確錯誤「CodeGraph 尚未初始化，請先執行 `apltk codegraph init`」
- **`@colbymchenry/codegraph` 未安裝**：CLI 無法 import 套件時顯示安裝指引（`npm install @colbymchenry/codegraph`）
- **支援語言以外的檔案**：CodeGraph 自動跳過不支援的語言，不報錯
- **資料庫損毀**：偵測到 `.codegraph/codegraph.db` 無法開啟時，提示使用者重新初始化
- **超大專案索引**：索引時間可能較長（~60 files/sec），CLI 必須顯示即時進度，不讓使用者以為卡住

## Clarification Questions

- ~~**專案 Node.js 版本為 >=20.19.0，但 `@colbymchenry/codegraph` 的 programmatic API 需要 Node 22.5+（因 `node:sqlite`）。** 是否需要先升級專案的 Node.js 版本要求，或者改用 CodeGraph 的 CLI 子進程呼叫（而非 programmatic API）作為過渡方案？~~
  ✅ **已決定：升級專案的 Node.js engine 要求至 >=22.5.0。** 此變更需同步更新 `package.json` 的 `engines.node` 欄位，並確認 CI/CD 環境支援。

## References

- Official docs: https://colbymchenry.github.io/codegraph/
- `@colbymchenry/codegraph` npm: https://www.npmjs.com/package/@colbymchenry/codegraph
- Related code files:
  - `packages/tools/architecture/index.ts` — 既有工具的 handler 模式參考
  - `packages/cli/tool-registration.ts` — 工具註冊入口
  - `packages/tool-registry/types.ts` — ToolDefinition 介面

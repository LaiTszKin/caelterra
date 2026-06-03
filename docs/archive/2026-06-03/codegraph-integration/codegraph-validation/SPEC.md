# Spec: 架構驗證、批量操作與工作流程整合

- **Date**: 2026-06-03
- **Feature**: codegraph-validation
- **Batch**: codegraph-integration

## Goal

透過批量操作減少 LLM 的 CLI 呼叫次數，透過確定性驗證消除架構圖中的符號幻覺，並將這些新工具整合進 `design` 與 `init-project-html` 技能的工作流程中。

## Scope

### In Scope

- `apltk codegraph verify --spec <dir>`：驗證 spec overlay 中所有對既有系統的參照（symbol、edge、file path）是否真實存在於 CodeGraph 索引中
- `apltk architecture apply <yaml>`：單次呼叫批量執行多個 atlas mutation（feature add/set/remove、submodule add/remove、edge add/remove 等）
- `apltk architecture template --spec <dir>`：從 SPEC.md 生成空白的 proposal.yaml 骨架（含需求映射，整合點留白）
- 修改 `skills/design/SKILL.md` 步驟 5（Generate Architecture Diff），整合新的工具流程
- 修改 `skills/init-project-html/SKILL.md` 工作流程，讓 subagent 使用 `codegraph survey` 取代 grep/Read

### Out of Scope

- **不**修改現有 atlas YAML schema——`apply` 的 YAML 格式與現有 mutation schema 相容
- **不**修改 ELK.js layout 或 render 管線
- **不**實作 spec overlay 的自動合併——`verify` 只讀取不修改
- **不**實作 git diff 級別的驗證——只驗證 overlay 的最終狀態

## Functional Behaviors (BDD)

### Requirement 1: 驗證架構提案的正確性

**GIVEN** 一個已索引的專案目錄
**AND** 一份 spec overlay（`architecture_diff/atlas/` 下的 YAML 檔案）
**WHEN** 使用者執行 `apltk codegraph verify --spec docs/plans/2026-06-03/password-reset/`
**THEN** 讀取 spec overlay 中的所有 feature、submodule、function、edge 宣告
**AND** 對照 CodeGraph 索引，逐一驗證：
  - 被參照的既有符號是否存在於索引中
  - 被參照的既有 file path 是否存在於索引中
  - 被參照的既有 edge（caller/callee 關係）是否真實存在
**AND** 輸出驗證報告：
  - 通過項數量 / 總檢查項數量
  - 失敗項清單（類型、位置、建議修復方式）
  - 未被驗證的項（如完全不存在的功能，無對應索引）
**AND** 以 exit code 0（全部通過）或 1（有失敗項）結束

**Uncertainty Level**: Known — `searchNodes()` + `getCallers()` 已提供所需的原始資料

### Requirement 2: 批量執行架構變更

**GIVEN** 一份描述多個 atom 變更的 YAML 檔案
**WHEN** 使用者執行 `apltk architecture apply changes.yaml`
**THEN** 一次解析 YAML 中的所有變更宣告
**AND** 依序執行每個 atom mutation（feature add → submodule add → function add → edge add）
**AND** 若中間步驟失敗，顯示錯誤位置並中止後續變更
**AND** 成功完成後自動重新渲染架構圖 HTML

**YAML 格式**：
```yaml
features:
  - slug: password-reset
    title: "Password Reset"
    action: add
    submodules:
      - slug: reset-service
        kind: service
        action: add
        functions:
          - name: requestReset
            in: "email: string"
            out: "void"
            action: add
edges:
  - from: password-reset/reset-service
    to: user/user-repository
    kind: call
    action: add
```

**Uncertainty Level**: Known — 復用現有的 `state.js` mutation 邏輯

### Requirement 3: 從 SPEC.md 生成提案骨架

**GIVEN** 一份 SPEC.md 檔案
**WHEN** 使用者執行 `apltk architecture template --spec docs/plans/2026-06-03/password-reset/SPEC.md --output ./architecture_diff/`
**THEN** 讀取 SPEC.md 的 Goal 與 Scope 章節
**AND** 從 `codegraph list-apis --all` 取得現有系統的公開 API 目錄（若已索引）
**AND** 生成一份 proposal.yaml 骨架，包含：
  - 由 SPEC.md goal 轉換的 feature slug 與 title
  - 空的 submodules 陣列（需 LLM 填寫）
  - 空的 edges 陣列（需 LLM 填寫）
  - 附註現有系統的 API 目錄作為參考
**AND** 將骨架寫入 `--output` 指定的目錄

**Uncertainty Level**: Exploratory — SPEC.md 解析品質依賴 LLM 呼叫，可能需要迭代

### Requirement 4: 更新 design 技能的工作流程

**GIVEN** 以上三個工具已完成實作
**WHEN** 使用者執行 `design` 技能的第 5 步（Generate Architecture Diff）
**THEN** 流程更新為：
  1. 執行 `apltk codegraph list-apis --all` 取得整合面參考（取代 subagent grep）
  2. LLM 做出設計決策後填寫 proposal.yaml
  3. 執行 `apltk architecture apply proposal.yaml`（取代 10-20 次 mutation）
  4. 執行 `apltk codegraph verify --spec <dir>` 驗證正確性

**Uncertainty Level**: Known

### Requirement 5: 更新 init-project-html 技能的工作流程

**GIVEN** `codegraph survey` 工具已完成實作
**WHEN** 使用者執行 `init-project-html` 技能
**THEN** 流程更新為：
  1. 執行 `apltk codegraph survey` 取得專案結構報告（取代 subagent grep/Read 數百個檔案）
  2. LLM subagent 根據 survey 結果決定 feature 分組
  3. 執行 `apltk architecture apply` 批量寫入 atlas（取代逐一手動 mutation）

**Uncertainty Level**: Known

## Error and Edge Cases

- **`verify` 遇到 overlay 中的新功能符號**：這些符號尚未存在於索引中是預期行為，應跳過驗證並在報告中標記「未驗證（新功能）」
- **`verify` 遇到不支援語言的檔案**：明確回報該檔案無法驗證，不無聲跳過
- **`apply` 的 YAML 格式錯誤**：明確指出錯誤位置（行號、欄位），不繼續執行
- **`apply` 中途失敗**：維持原有的 undo snapshot 機制，允許 `apltk architecture undo` 還原
- **`template` 的 SPEC.md 路徑錯誤**：提示檔案不存在，列出可能的 SPEC.md 路徑
- **`template` 無法讀取 SPEC.md**：退而生成完全空白的骨架（無需求映射），不阻塞

## Clarification Questions

- ~~`apply` 遇到 `action: remove` 時，是否也支援批量移除？還是只處理新增與修改？~~
  ✅ **已決定：支援 `action: remove`。** 移除 feature 時級聯移除其下 submodule；移除 edge 時只移除該 edge。
- ~~`verify` 對 spec overlay 中新功能（不存在的符號）的「跳過」策略是否夠安全？還是應增加明確的 `--skip-new` 旗標？~~
  ✅ **已決定：不需要 `--skip-new` 旗標。** `verify` 應自動判斷：若參照的 feature slug 在 spec overlay 中被宣告為 `action: add`，則跳過驗證（新功能）；若參照的 feature 不在 overlay 的新增列表中，則必須存在於 CodeGraph 索引中。

## References

- Related code files:
  - `skills/design/SKILL.md` — 將被更新的技能
  - `skills/init-project-html/SKILL.md` — 將被更新的技能
  - `skills/init-project-html/lib/atlas/state.js` — `saveOverlay()`、`loadOverlay()`、`mergeOverlay()` 等現有 mutation 邏輯
  - `skills/init-project-html/references/architecture.md` — 現有 CLI mutation 參數參考
  - `packages/tools/architecture/index.ts` — 現有 architecture tool handler

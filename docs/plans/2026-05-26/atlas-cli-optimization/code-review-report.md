# Code Review Report

- **Spec**: atlas-cli-optimization (D → B → A → C)
- **Date**: 2026-05-26
- **Reviewer**: QA Agent (6-dimension parallel review, round 2)
- **Verdict**: Needs Work

---

## 判決說明

**Verdict**: Needs Work

本次為第二輪獨立審查（前一輪修復已合併至 `7b2cf16`）。6 個維度的平行審查發現 **1 個 P0 功能性崩潰、2 個 P1 問題、6 個 P2 問題、3 個 P3 建議**。P0 問題（`verbScan` fallback 路徑因 `const` 重賦值導致 `TypeError` 崩潰）需立即修復。相較於上一輪審查，多項已修復問題確認有效（findEdgeMeta Map 優化、EVI_LABEL 動態生成、fixCommand flag 正確性），本次發現皆為新識別的問題。

---

## 發現的問題

### P0 — 嚴重缺陷

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 1 | `verbScan` 以 `const` 宣告 `srcDir`（L1684），但在 fallback 路徑嘗試重賦值 `srcDir = projectRoot`（L1694）。在 `'use strict'` 模式下拋出 `TypeError: Assignment to constant variable`，被內層 catch 捕獲後輸出錯誤訊息並返回 exit code 1 | 當 `--src` 未指定且 `src/` 目錄不存在時，scan 完全無法運作，違反 spec R1.3 的 fallback 語義 | `init-project-html/lib/atlas/cli.js` | L1684, L1694 |

### P1 — 重要問題

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 2 | `htmlEscape` 函數在 `cli.js`（L1914-1921）和 `render.js`（L28-35）中各自定義，實作完全相同。cli.js 已透過 `require('./render')` 匯入 renderLib，卻未使用 `renderLib.htmlEscape` | 違反 DRY 原則；HTML 轉義邏輯修正需兩處同步更新 | `init-project-html/lib/atlas/cli.js`、`init-project-html/lib/atlas/render.js` | L1914 / L28 |
| 3 | `runRender` 在 spec mode mutation 後重複載入 state（`load()` + `loadOverlay()` + `mergeOverlay()`），而 `performMutation` 已在前一步完成完全相同的載入與合併。每次 spec mutation 多出一次完整的 I/O 讀取 + merge 計算 | 50+ feature atlas 下每筆 spec mutation 多出 ~50-150ms 開銷；批次 mutation 腳本中浪費可達 1-2 秒 | `init-project-html/lib/atlas/cli.js` | L1131-1157, L1159-1173 |

### P2 — 一般問題

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 4 | `splitList`（L1012-1015）和 `parseNameList`（L1378-1384）語義重複：兩者皆將逗號分隔字串轉為陣列，僅 null 輸入的回傳值不同（`[]` vs `undefined`） | 增加認知負擔；若需改變解析邏輯須改兩處 | `init-project-html/lib/atlas/cli.js` | L1012, L1378 |
| 5 | `renderDiffViewer` 在 cli.js 中內嵌完整 HTML/CSS/JS 呈現層代碼（~160 行，L1930-2089）。cli.js 的角色是命令調度，不應包含 HTML 模板 | 違反分層原則；對 diff viewer UI 的任何修改都需修改 cli.js 而非 render.js | `init-project-html/lib/atlas/cli.js` | L1930-2089 |
| 6 | `state.js` 匯出過多內部實作細節：24 個匯出中僅 ~12 個被外部生產程式碼使用。`readYaml`、`writeYaml`、`normalizeFeature`、`normalizeSubmodule`、`macroVisualOf`、`featureVisualOf` 等僅在模組內部使用 | 過寬的 API 表面導致封裝洩漏，增加未來重構成本 | `init-project-html/lib/atlas/state.js` | L458-484 |
| 7 | `schema.validate()` 中約 15+ 處 `fixCommand: null` 的驗證錯誤訊息缺少 `(no automatic fix)` 後綴（spec R3.3 要求）。受影響位置包括 fn.in/purpose 型別檢查、variable type/purpose 型別檢查、error when/means 型別檢查、edge id/kind/label 驗證、feature story/dependsOn 驗證等 | 使用者無法區分「有自動修復命令」和「無自動修復命令」的錯誤，降低 validate 輸出的可用性 | `init-project-html/lib/atlas/schema.js` | L96, L107, L113, L123, L129, L130, L229-254, L247, L250, L255, L263, L266, L268, L272, L285 |
| 8 | 損壞的 YAML 檔案導致 `status` crash 而非優雅回報 validation error。`readYaml()` 直接呼叫 `yaml.load(text)` 無 try-catch，YAML 語法錯誤會一路傳播到 `dispatch()` 的 catch block，返回 exit code 1 而非 spec 要求的 exit code 0 | 違反 spec edge case：「status 在損壞的 YAML 檔案上應報告 validation errors 而非 crash」 | `init-project-html/lib/atlas/state.js` | L32-36 |
| 9 | `cli.js` 已達 2181 行，承擔 help page 生成（~930 行）、diff viewer HTML（~160 行）、所有 verb 實作（~680 行）、diff 收集與 merge（~530 行）、dispatch 入口等多項職責 | 違反單一職責原則；維護困難、合併衝突風險高 | `init-project-html/lib/atlas/cli.js` | — |

### P3 — 建議改善

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 10 | `layout.js` 的 `KIND_LABELS` 與 `render.js` 的 `KIND_LABEL` 各自維護一份 kind-label 對照表，顯示文字不同（如 `db → 'database'` vs `db → 'DB'`）。layout.js 用於估算文字寬度，render.js 用於實際渲染，不一致可能導致 SVG 佈局偏差 | 輕度佈局精度風險 | `init-project-html/lib/atlas/layout.js`、`init-project-html/lib/atlas/render.js` | L54 / L18 |
| 11 | `REMOVED_TXT` 常數在 cli.js 中定義但未匯出，render.js 直接硬編碼字串 `'_removed.txt'` | 若檔名需變更，兩處都要修改 | `init-project-html/lib/atlas/cli.js`、`init-project-html/lib/atlas/render.js` | L48 / L552 |
| 12 | `emptyState()` 定義在 schema.js（領域詞彙模組）中，但其實質是 state factory，更接近 persistence 層的關注點。導致 state.js 必須依賴 schema.js 僅為取得此函數 | 低影響；當前設計有其合理性（schema.js 自稱為 "single source of truth for component shapes"） | `init-project-html/lib/atlas/schema.js` | L371-382 |

---

## 審查維度摘要

- **幻覺代碼**: 乾淨 — 所有 CLI flag 名稱與 verb handler 一致，fixCommand 無幽靈 flag，CSS class 與 render 輸出完全匹配，evidence 欄位跨 schema/state/render 一致
- **冗余代碼**: 2 個 finding — `htmlEscape` 雙重定義（P1-2）、`splitList`/`parseNameList` 重複（P2-4）；5 個模組大量匯出無外部消費者的符號（P2-6 及其他）
- **實作偏移**: 2 個 finding — `verbScan` const 重賦值崩潰（P0-1）；損壞 YAML 導致 status crash（P2-8）
- **實作遺漏**: 2 個 finding — `verbScan` const 宣告導致 fallback 失效（P0-1）；約 15+ 處驗證錯誤缺少 `(no automatic fix)` 後綴（P2-7）
- **架構瑕疵**: 4 個 finding — `htmlEscape` 重複定義（P1-2）；`renderDiffViewer` 內嵌 HTML 違反分層（P2-5）；state.js API 表面過寬（P2-6）；cli.js 單體膨脹（P2-9）
- **性能隱患**: 1 個 finding — spec mode `runRender` 重複載入 state（P1-3）。另有 5 個 P2 級別性能問題（save 冗餘深拷貝、孤兒文件清掃、undo 雙寫入、同步 I/O、deriveOverlay JSON.stringify 全量比對）及 5 個 P3 級別建議，因不影響功能正確性且當前規模下影響輕微，不逐一列入

---

## 解決方案

### P0 修復

#### P0-1: `verbScan` const 重賦值導致 fallback 崩潰

- **涉及檔案**：`init-project-html/lib/atlas/cli.js` > `verbScan()`（L1684, L1694）
- **根因**：L1684 以 `const` 宣告 `srcDir`，L1694 在 fallback 路徑嘗試重賦值。在 `'use strict'` 模式下拋出 `TypeError`。
- **修復方案**：將 L1684 的 `const srcDir` 改為 `let srcDir`：

```js
let srcDir = path.resolve(projectRoot, srcRaw);
```

- **驗證方式**：在無 `src/` 目錄的專案執行 `apltk architecture scan`，確認輸出正確的目錄清單（path 不含 `src/` 前綴）；新增測試案例覆蓋 fallback 路徑。

### P1 修復

#### P1-2: `htmlEscape` 雙重定義

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（L1914-1921）、`init-project-html/lib/atlas/render.js`（L28-35）
- **根因**：cli.js 定義了自己的 `htmlEscape`，但已透過 `require('./render')` 匯入 renderLib，可直接使用 `renderLib.htmlEscape`。
- **修復方案**：刪除 cli.js 中的 `htmlEscape` 函數定義（L1914-1921），將 `renderDiffViewer` 中的 `htmlEscape(...)` 呼叫改為 `renderLib.htmlEscape(...)`。
- **驗證方式**：`npm test` 全部通過；diff viewer 輸出保持不變。

#### P1-3: spec mode `runRender` 重複載入 state

- **涉及檔案**：`init-project-html/lib/atlas/cli.js` > `performMutation()`（L1131-1157）、`runRender()`（L1159-1173）
- **根因**：`performMutation` 已執行 `load()` → `loadOverlay()` → `mergeOverlay()`，但 `runRender` 內部再次執行相同的載入流程。
- **修復方案**：讓 `performMutation` 將已計算的 `merged` state 傳遞給 `runRender`：

```js
// performMutation 內部（L1155 附近）:
if (!flags['no-render']) {
  await runRender({ projectRoot, flags, preMergedState: merged });
}

// runRender 內部:
async function runRender({ projectRoot, flags, preMergedState }) {
  const state = preMergedState || loadResolvedState(projectRoot, flags.spec);
  // ...
}
```

- **驗證方式**：`npm test` 全部通過；spec mode mutation 後渲染輸出保持不變。

### P2 修復

#### P2-4: `splitList` / `parseNameList` 合併

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（L1012-1015, L1378-1384）
- **修復方案**：將 `parseNameList` 改為委派給 `splitList`，或直接刪除 `parseNameList` 並讓呼叫方使用 `splitList` + 本地預設值處理。
- **驗證方式**：`npm test` 全部通過。

#### P2-5: `renderDiffViewer` 遷移

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（L1930-2089）
- **修復方案**：將 `renderDiffViewer`、`toViewerRel` 及相關輔助函數遷移至新檔案 `init-project-html/lib/atlas/diff-viewer.js`，cli.js 透過 `require('./diff-viewer')` 引用。
- **驗證方式**：`npm test` 全部通過；diff viewer HTML 輸出保持不變。

#### P2-6: `state.js` API 表面收窄

- **涉及檔案**：`init-project-html/lib/atlas/state.js`（L458-484）
- **修復方案**：從 `module.exports` 移除僅內部使用的符號：`UNDO_FILE`、`UNDO_STACK_FILE`、`HISTORY_FILE`、`readYaml`、`writeYaml`、`readUndoSnapshot`、`clearUndoSnapshot`、`normalizeFeature`、`normalizeSubmodule`、`macroVisualOf`、`featureVisualOf`。測試可透過重新匯出輔助模組取得所需符號。
- **驗證方式**：`npm test` 全部通過；無外部生產程式碼引用被移除的匯出。

#### P2-7: 補充 `(no automatic fix)` 後綴

- **涉及檔案**：`init-project-html/lib/atlas/schema.js`（多處）
- **修復方案**：在所有 `fixCommand: null` 的 `errors.push()` 呼叫中，確保 message 字串以 `(no automatic fix)` 結尾。
- **驗證方式**：`npm test` 全部通過；validate 輸出中所有無 fix command 的錯誤均顯示 `(no automatic fix)`。

#### P2-8: 損壞 YAML 不導致 status crash

- **涉及檔案**：`init-project-html/lib/atlas/state.js` > `readYaml()`（L32-36）、`load()`（L49-73）
- **修復方案**：在 `load()` 中對個別 feature YAML 的讀取加入 try-catch，將讀取失敗的 feature 視為 validation error 而非拋出異常。
- **驗證方式**：手動建立語法錯誤的 YAML 檔案，執行 `apltk architecture status --json`，確認返回 exit code 0 且 validation.errors 包含該問題。

#### P2-9: cli.js 模組拆分

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（2181 行）
- **修復方案**：提取以下獨立模組：
  - `cli-help.js` — help page 定義（~930 行）
  - `diff-viewer.js` — diff viewer HTML 生成（~160 行，與 P2-5 合併處理）
  - 保留 cli.js 為 dispatch 入口 + verb 實作（~1100 行）
- **驗證方式**：`npm test` 全部通過；CLI help 輸出和所有功能保持不變。

### P3 改善

#### P3-10: 統一 `KIND_LABEL` 來源

- **涉及檔案**：`init-project-html/lib/atlas/layout.js`（L54-62）、`init-project-html/lib/atlas/render.js`（L18-26）
- **修復方案**：讓 layout.js 從 render.js 匯入 `KIND_LABEL`，或提取到共享常數模組。同時統一兩份對照表的顯示文字。
- **驗證方式**：`npm test` 通過；SVG macro 圖的 kind label 與 submodule 頁面保持一致。

#### P3-11: 共享 `REMOVED_TXT` 常數

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（L48）、`init-project-html/lib/atlas/render.js`（L552）
- **修復方案**：從 cli.js 匯出 `REMOVED_TXT` 常數，或定義在 `state.js` 中與其他檔案名稱常數一起匯出。render.js 改為引用匯出的常數。
- **驗證方式**：`npm test` 通過。

#### P3-12: `emptyState()` 歸屬（可選）

- **涉及檔案**：`init-project-html/lib/atlas/schema.js`（L371-382）
- **當前設計可接受**：schema.js 自稱為 "single source of truth for atlas component shapes"，`emptyState()` 定義最小合法狀態的 shape 與此定位一致。無需強制修改。

---

## 已確認修復（前一輪）

以下前一輪 QA 報告標記的問題已確認在 `7b2cf16` 中正確實修：

- P1-1: scan 降級路徑 `srcDir` 更新（但遺留 const 宣告問題 → P0-1）
- P1-2 + P2-4: fixCommand `--submodule` → `--slug` + `formatFix` callback 解耦
- P2-1: dry-run io 抽象層貫穿所有 verb
- P3-2: `renderMacroSvg` O(N²) → `Map.get()` O(1)
- P3-3: JSON 輸出 try-catch 錯誤邊界
- P3-4: state.js 內部函數不再公開匯出（但仍有更多可清理 → P2-6）
- P3-5: `EVI_LABEL` 從 `EVIDENCE_LEVELS` 動態生成

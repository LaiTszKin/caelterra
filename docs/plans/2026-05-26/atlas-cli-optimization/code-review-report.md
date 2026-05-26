# Code Review Report

- **Spec**: atlas-cli-optimization (D → B → A → C)
- **Date**: 2026-05-27
- **Reviewer**: QA Agent (6-dimension parallel review, round 3)
- **Verdict**: Needs Work

---

## 判決說明

**Verdict**: Needs Work

本次為第三輪獨立審查。6 個維度的平行審查發現 **2 個 P1 問題、5 個 P2 問題、6 個 P3 建議**。無 P0 功能性崩潰。主要問題集中在：`formatFix` callback 從未被呼叫導致所有 fixCommand 為 null、四個 mutation verb 缺少 `--evidence` 支援、以及 CLI help 未記錄新 flag。

---

## 發現的問題

### P1 — 重要問題

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 1 | `formatFix` callback 被注入 `schema.validate()` 但從未被任何驗證函數呼叫。全部 40+ 處驗證錯誤都透過 `noFix()` 或 `requireField()` 產生，`fixCommand` 永遠為 `null` | `verbValidate` 中 `→ fix:` 輸出永遠不會出現；即使是可以自動修復的錯誤（如 unknown submodule reference、invalid slug）也無法提供修復命令。違反 spec B R3.1「每 error 附 fix command」 | `init-project-html/lib/atlas/schema.js` | L111-276（10 個 validate 函數） |
| 2 | `--evidence` flag 僅支援 5 個 mutation verb（feature/submodule/function/variable/error），缺少 `dataflow add`、`edge add`、`meta set`、`actor add` 的支援。Spec C R1.4 要求「所有 mutation verb 均支援」 | agent 無法為 dataflow step、edge、meta、actor 標記 evidence 品質 | `init-project-html/lib/atlas/cli.js` | L442-481, L524-580, L588-596, L598-611 |

### P2 — 一般問題

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 3 | `--evidence` flag 未出現在 CLI help 的任何位置：不在 `mutationFlags` 陣列、不在任何 action help page、不在全域 flag 註解 | 使用者無法透過 `--help` 得知 `--evidence` flag 的存在 | `init-project-html/lib/atlas/cli-help.js` | L43-47, L738-747 |
| 4 | `--dry-run` flag 也未出現在 `mutationFlags` 陣列（僅在頂層 help 列出一次） | action-specific help（如 `feature add --help`）不顯示 `--dry-run` | `init-project-html/lib/atlas/cli-help.js` | L43-47 |
| 5 | `'force'` 出現在 `findFirstPositional`（L107）和 `parseFlags`（L140）的 `booleanFlags` Set，但 `flags.force` 在全部程式碼中從未被讀取 | 幽靈 flag：使用者傳入 `--force` 會被解析但靜默丟棄，產生錯誤預期 | `init-project-html/lib/atlas/cli.js` | L107, L140 |
| 6 | `performMutation` 在 spec mode 已載入 base state（L240），但傳給 `runRender` 時不附帶 base；`runRender` 再次從磁碟載入（L269） | 多餘的 I/O：每筆 spec mutation 重複讀取所有 feature YAML | `init-project-html/lib/atlas/cli.js` | L240-262, L269 |
| 7 | `mergeOverlay` 以 `JSON.parse(JSON.stringify(base))` 深拷貝整個 base state（L228），即使 overlay 僅修改 1 個 feature | 50+ feature atlas 每次 mutation 浪費記憶體與 CPU 拷貝 49 個未變更的 feature | `init-project-html/lib/atlas/state.js` | L228 |

### P3 — 建議改善

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 8 | `booleanFlags` Set `['no-render', 'no-open', 'help', 'force', 'dry-run', 'json']` 在 `findFirstPositional` 和 `parseFlags` 中重複定義 | 新增 flag 時需同步兩處 | `init-project-html/lib/atlas/cli.js` | L107, L140 |
| 9 | render.js 產生 `submodule-kind--{kind}`、`atlas-submodule-index__kind--{kind}`、`submodule-card__kind--{kind}` 三組 modifier CSS class，但 `architecture.css` 中無對應規則（僅有 `m-node--{kind}` 的規則） | HTML 輸出具備 class 結構但無視覺效果（目前依賴基礎 class 樣式，modifier class 無作用） | `init-project-html/lib/atlas/render.js`、`lib/atlas/assets/architecture.css` | L193, L259, L488 |
| 10 | `renderAll` 無條件執行 `layoutMacro(state)`（elkjs 圖形佈局），即使 scope 僅包含 submodule 頁面不包含 macro。elkjs 佈局是渲染管線中最昂貴的操作 | 編輯單一 function/variable 時觸發不必要的完整 macro 佈局計算 | `init-project-html/lib/atlas/render.js` | L550 |
| 11 | `save()` 僅為設定 `meta.updatedAt` 時間戳而對整個 state 執行 `JSON.parse(JSON.stringify(state))` | 大型 atlas 的記憶體使用暫時翻倍 | `init-project-html/lib/atlas/state.js` | L112 |
| 12 | undo stack 無大小上限。每次 mutation 將完整 state 快照推入 stack，`writeUndoStack` 將整個 stack 序列化為單一 JSON blob | 若從不執行 undo，stack 檔案無限增長 | `init-project-html/lib/atlas/state.js` | L476-523 |
| 13 | `render.js` 匯出多個僅內部使用的符號：`renderMacro`、`renderFeaturePage`、`renderSubmodulePage`、`copyAssets`、`KIND_LABEL`；`layout.js` 匯出 `approxTextWidth`、`wrapByVisualWidth`、`buildGraph` | 不必要的公開 API 表面，增加重構阻力 | `init-project-html/lib/atlas/render.js`、`lib/atlas/layout.js` | L695-706, L477-501 |

---

## 審查維度摘要

- **幻覺代碼**: 2 個 finding — `force` 幽靈 flag（P2-5）、kind modifier CSS class 無對應規則（P3-9）
- **冗余代碼**: 2 個 finding — booleanFlags Set 重複（P3-8）、不必要的公開匯出（P3-13）
- **實作偏移**: 3 個 finding — formatFix 從未被呼叫（P1-1）、--evidence 缺少 4 個 verb 支援（P1-2）、--evidence/--dry-run 未記錄在 help（P2-3, P2-4）
- **實作遺漏**: 2 個 finding — formatFix 無法產生 fix command（P1-1）、--evidence 覆蓋不完整（P1-2）。已確認前兩輪修復的 status/scan/dry-run/evidence 核心功能全部存在且正確
- **架構瑕疵**: 2 個 finding — runRender 重複載入 base state（P2-6）、mergeOverlay 全量深拷貝浪費（P2-7）
- **性能隱患**: 4 個 finding — mergeOverlay 深拷貝（P2-7）、runRender 重複 I/O（P2-6）、renderAll 無條件 elkjs（P3-10）、save 深拷貝僅為 updatedAt（P3-11）、undo stack 無上限（P3-12）

---

## 解決方案

### P1 修復

#### P1-1: `formatFix` callback 從未被呼叫

- **涉及檔案**：`init-project-html/lib/atlas/schema.js`（10 個 validate 函數）
- **根因**：`validate()` 接受 `formatFix` 參數並傳遞給 `validateFeature()` → `validateSubmodule()` → `validateFunction()` / `validateVariable()` / `validateError()` / `validateEdge()`，但所有這些函數僅使用 `noFix()` 和 `requireField()`（兩者都 hardcode `fixCommand: null`）。沒有任何程式碼路徑呼叫 `formatFix({type, action, ...})` 來產生實際的修復命令。
- **修復方案**：對以下可自動修復的錯誤產生 fixCommand：

| 錯誤類型 | 對應 fixCommand |
|---------|---------------|
| unknown function reference in dataflow | `formatFix({type: 'function', action: 'add', feature, submodule, name})` |
| unknown variable reference in dataflow | `formatFix({type: 'variable', action: 'add', feature, submodule, name})` |
| unknown submodule in edge/intra-edge | `formatFix({type: 'submodule', action: 'add', feature, slug})` |
| unknown feature in cross-feature edge | `formatFix({type: 'feature', action: 'add', slug})` |
| invalid slug format | `(no automatic fix)` — 保留 |
| duplicate slug | `(no automatic fix)` — 保留 |
| type/shape errors | `(no automatic fix)` — 保留 |

修改 `validateFunction`/`validateVariable`/`validateEdge`/`validateSubmodule` 的簽名以接受並使用 `formatFix`。

- **驗證方式**：`npm test`；手動建立包含 undeclared reference 的 atlas，執行 `apltk architecture validate` 確認輸出 `→ fix: apltk architecture function add ...`

#### P1-2: 四個 mutation verb 缺少 `--evidence` 支援

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`
  - `verbDataflow`（L442-481）：在 `buildDataflowItem` 中加入 evidence 處理
  - `verbEdge`（L524-580）：edge 物件 schema 目前沒有 evidence 欄位，需先在 schema.js 和 render.js 中加入
  - `verbMeta`（L588-596）：meta 物件目前沒有 evidence 欄位
  - `verbActor`（L598-611）：actor 物件目前沒有 evidence 欄位
- **修復方案**：
  - dataflow：在 `buildDataflowItem` 中處理 `flags.evidence`，將 evidence 寫入 step 物件
  - edge/meta/actor：需先評估是否真的有 evidence 標記的業務需求。若 spec 意圖是所有「建立新 entity 的 verb」，則 edge/meta/actor 應加入；若 spec 意圖是「有 component 概念的 verb」，則 dataflow 才應加入
  - 最保守方案：補上 dataflow 的 evidence 支援，並在 spec 中明確 edge/meta/actor 的 evidence 範圍
- **驗證方式**：`npm test`；`apltk architecture dataflow add ... --evidence "observed:src/auth.ts:42"` 確認 YAML 寫入 evidence 欄位

### P2 修復

#### P2-3: `--evidence` 未出現在 CLI help

- **涉及檔案**：`init-project-html/lib/atlas/cli-help.js`（L43-47）
- **修復方案**：在 `mutationFlags` 陣列中加入 `'`--evidence <level[:source]>` to tag components with observed/inferred/assumed quality levels.'`
- **驗證方式**：`apltk architecture feature add --help` 輸出包含 `--evidence` 說明

#### P2-4: `--dry-run` 未出現在 action-specific help

- **涉及檔案**：`init-project-html/lib/atlas/cli-help.js`（L43-47）
- **修復方案**：在 `mutationFlags` 陣列中加入 `'`--dry-run` to preview mutation changes as JSON diff without writing to disk.'`
- **驗證方式**：`apltk architecture feature add --help` 輸出包含 `--dry-run` 說明

#### P2-5: `force` 幽靈 boolean flag

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（L107, L140）
- **修復方案**：從兩個 `booleanFlags` Set 中移除 `'force'`
- **驗證方式**：`npm test`；`--force` 不再被靜默接受

#### P2-6: spec mode `runRender` 重複載入 base state

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（L240-262, L269）
- **修復方案**：讓 `performMutation` 將已載入的 base state 傳遞給 `runRender`，避免重複 I/O：

```js
// performMutation (L261-263):
if (!flags['no-render']) {
  await runRender({ projectRoot, flags, preloadedMerged: isSpec ? merged : base, preloadedBase: isSpec ? base : null });
}

// runRender (L266-279):
async function runRender({ projectRoot, flags, preloadedMerged, preloadedBase }) {
  if (flags.spec) {
    const { overlayDir, htmlOutDir } = specOverlayDir(projectRoot, flags.spec);
    const base = preloadedBase || stateLib.load(baseAtlasDir(projectRoot));
    const merged = preloadedMerged || stateLib.mergeOverlay(base, stateLib.loadOverlay(overlayDir));
    // ...
  }
}
```

- **驗證方式**：`npm test`

#### P2-7: `mergeOverlay` 全量深拷貝浪費

- **涉及檔案**：`init-project-html/lib/atlas/state.js`（L228）
- **修復方案**：改為 shallow copy + 僅對被 overlay 替換的 feature 進行 deep clone：

```js
const merged = { ...base, features: [...(base.features || [])] };
// 僅在 featureMap.set 時替換陣列中的元素
```

這較複雜且容易出錯，建議綜合評估效能收益後決定。當前規模下（< 100 features）影響輕微。

### P3 改善

#### P3-8: booleanFlags Set 重複

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（L107, L140）
- **修復方案**：提取為模組頂層常數，兩處共用
- **驗證方式**：`npm test`

#### P3-9: Kind modifier CSS class 無對應規則

- **涉及檔案**：`init-project-html/lib/atlas/render.js`、`lib/atlas/assets/architecture.css`
- **修復方案**：三選一 — (a) 移除 render.js 中無作用的 modifier class 產生程式碼；(b) 在 CSS 中加入對應規則；(c) 維持現狀（基礎 class 已有樣式，modifier 為未來擴充預留）
- 建議採用 (a)，移除無作用的 class

#### P3-10: renderAll 無條件 elkjs layout

- **涉及檔案**：`init-project-html/lib/atlas/render.js`（L550）
- **修復方案**：只在 `shouldEmit('macro')` 為 true 時才呼叫 `layoutMacro(state)`，否則傳入 skip flag 或 null
- **驗證方式**：`npm test`；spec mode 只修改 submodule 時不觸發 elkjs

#### P3-11: save() 深拷貝僅為 updatedAt

- **涉及檔案**：`init-project-html/lib/atlas/state.js`（L112）
- **修復方案**：直接在 state 物件上設定 `state.meta.updatedAt`，在 `writeYaml` 之前還原（或接受 shallow mutation — save 是同步操作的最後一步）
- **驗證方式**：`npm test`

#### P3-12: undo stack 無大小上限

- **涉及檔案**：`init-project-html/lib/atlas/state.js`（L476-523）
- **修復方案**：設定最大 stack 深度（如 50），超出時移除最舊的快照
- **驗證方式**：`npm test`

#### P3-13: 不必要的公開匯出

- **涉及檔案**：`init-project-html/lib/atlas/render.js`、`lib/atlas/layout.js`
- **修復方案**：從 `module.exports` 移除僅內部使用的符號。保留測試用 re-export（若有測試依賴）
- **驗證方式**：`npm test`

---

## 已確認修復（前兩輪）

以下前兩輪 QA 報告標記的問題已確認正確實修且無回歸：

- P0-1: `verbScan` const→let — 已確認修復（cli.js:678）
- P1-2: `htmlEscape` 重複 — 已確認修復（cli.js 使用 `renderLib.htmlEscape`）
- P1-3: spec mode `runRender` 部分修復（已傳遞 `preloadedMerged`，但未傳遞 base → 本輪 P2-6）
- P2-4: `splitList`/`parseNameList` 合併 — 已確認修復
- P2-5: `renderDiffViewer` 遷移至 `diff-viewer.js` — 已確認修復
- P2-6: state.js API 表面收窄 — 已確認修復（移除了 UNDO_FILE 等內部符號的匯出）
- P2-7: `(no automatic fix)` 後綴 — 已確認修復（所有 42 處 noFix 皆有後綴）
- P2-8: 損壞 YAML graceful handling — 已確認修復（state.js L72-74 try-catch）
- P2-9: cli.js 模組拆分（cli-help.js, diff-viewer.js）— 已確認修復
- P3-10: KIND_LABEL 統一來源 — 已確認修復（schema.js 為單一來源）
- P3-11: REMOVED_TXT 共享 — 已確認修復（state.js 匯出，render.js/cli.js 引用）

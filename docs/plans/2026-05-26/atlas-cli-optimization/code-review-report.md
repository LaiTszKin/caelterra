# Code Review Report

- **Spec**: atlas-cli-optimization (D → B → A → C)
- **Date**: 2026-05-26
- **Reviewer**: QA Agent (6-dimension parallel review)
- **Verdict**: Needs Work

---

## 判決說明

**Verdict**: Needs Work

在六維度審查中發現 2 個 P1 功能缺陷：`scan` 降級路徑回報錯誤的路徑前綴，以及 `schema.js` 中 `submodule set` 的 fixCommand 使用了不存在的 `--submodule` flag。另有 4 個 P2 問題（測試覆蓋、dry-run io 繞過、status I/O 浪費、fixCommand 耦合）與 6 個 P3 建議。P1 問題需先修復才能合併。

相較於前次審查 (`c5bf459` 修復後)，本次為全新獨立審查。上次報告中的 11 個 P0-P3 問題已全部修復，但本次發現了 2 個上次未探查到的新問題，以及多個上次已標記但尚未處理的遺留項目。

---

## 發現的問題

### P0 — 嚴重缺陷

無。

### P1 — 重要問題

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 1 | `verbScan` 降級路徑未更新 `srcDir` 變數：當 `src/` 不存在且未指定 `--src` 時，entries 從 `projectRoot` 讀取，但 `srcDir` 仍指向 `path.resolve(projectRoot, 'src')`，導致輸出的 `path` 欄位錯誤地包含 `src/` 前綴（例如 `src/jobs` 而非 `jobs`） | 無 `src/` 目錄的專案執行 `apltk architecture scan` 時回報損毀的路徑，誤導 AI agent 的後續操作 | `init-project-html/lib/atlas/cli.js` | L1662, L1700 |
| 2 | `schema.js` 中 `validateSubmodule` 的 fixCommand 使用 `--submodule` flag，但 `verbSubmodule set` 實際接受的 flag 是 `--slug`（L1351）。使用者按 fixCommand 執行 `apltk architecture submodule set --feature X --submodule Y --kind ui` 會因 `parseFlags` 無法識別 `--submodule` 而失敗 | submodule kind 枚舉錯誤的 fix command 完全無效，使用者收到無法執行的「修復」指令 | `init-project-html/lib/atlas/schema.js` | L139 |

### P2 — 一般問題

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 1 | Dry-run 輸出繞過 `io` 抽象層，直接使用 `process.stdout.write()`（L1215），而其他所有 verb 均透過 `dispatch(argv, io)` 傳入的 `io.stdout.write()`。這導致 dry-run 輸出在測試中無法被 mock 捕獲 | dry-run JSON 輸出行為不可測試；程式碼風格不一致 | `init-project-html/lib/atlas/cli.js` | L1215 |
| 2 | 新功能 (`status`, `scan`, `--dry-run`, `--evidence`) 在三個測試檔案 (`atlas-cli.test.js`, `atlas-state.test.js`, `atlas-render.test.js`) 中完全無測試覆蓋。無 `scan --src`、`scan` 降級、`status` / `status --json`、`--dry-run` 與 mutation 組合、`--evidence` flag、evidence 渲染驗證等測試 | P1 bug 若有測試應被捕獲；未來重構風險高 | `test/` | — |
| 3 | `verbStatus` 載入完整 state（含所有 feature YAML 的 N 次 `readFileSync`）只為產生摘要計數。`load()` 對每個 feature 做一次 YAML parse，但 `summarize()` 僅需 feature 數量、submodule 數量、edge 數量等頂層統計 | 100+ feature atlas 下 status 命令執行不必要的 O(N) I/O，違反「快速狀態查詢」的設計目標 | `init-project-html/lib/atlas/cli.js` | L1618 |
| 4 | `schema.js` 中的 fixCommand 字串直接硬編碼 `apltk architecture ...` CLI 語法（flag 名稱、二進位檔名），造成 domain layer (schema.js) 反向依賴 interface layer (cli.js) 的實作細節。若 CLI flag 改名或 entry point 重新命名，所有 fixCommand 會靜默過時 | 違反分層架構原則；維護風險 | `init-project-html/lib/atlas/schema.js` | L101-103, L117-119, L138-139, L184-186, L202-205 |

### P3 — 建議改善

| # | 問題描述 | 影響 | 檔案 | 行數 |
|---|--------|------|------|------|
| 1 | Spec mode dry-run 中 `mergeOverlay` 已回傳全新物件（內部做了一次 `JSON.parse(JSON.stringify(base))`），`performMutation` 再對 merged 做第二次深拷貝 (`JSON.parse(JSON.stringify(merged))`)。可將 `merged` 直接作為 `dryRunState` 使用 | 大型 atlas 下 dry-run 延遲加倍 | `init-project-html/lib/atlas/cli.js` | L1206-1208 |
| 2 | `renderMacroSvg` 中對每個 layout feature 做 `state.features.find()`（O(F²)），對每個 layout submodule 先 `.find()` feature 再 `.find()` submodule（O(S × F)），`findEdgeMeta` 對每條 edge 做全表線性掃描（O(E²)） | 100+ feature atlas 下 macro SVG 渲染有可測量的延遲 | `init-project-html/lib/atlas/render.js` | L117, L124-125, L84-94, L150 |
| 3 | `verbStatus`、`verbScan`、dry-run 三處 JSON 輸出直接使用裸 `JSON.stringify` 寫入 stdout，無任何錯誤邊界保護。若計算過程中拋出異常，stderr 訊息可能與部分 stdout 交錯，破壞 agent 的 JSON 解析 | 錯誤情境下 consumer agent 可能收到無法解析的輸出 | `init-project-html/lib/atlas/cli.js` | L1215, L1633, L1705 |
| 4 | `state.js` 匯出多個僅內部使用的低階 I/O 函數（`readYaml`、`writeYaml`、`normalizeFeature`、`normalizeSubmodule` 等），允許外部繞過 `load()`/`save()` 的正規化與索引同步邏輯 | 不必要的 API 表面積，潛在誤用風險 | `init-project-html/lib/atlas/state.js` | L527-546 |
| 5 | `render.js` 的 `EVI_LABEL` 對應表 key 值（`observed`/`inferred`/`assumed`）與 `schema.js` 的 `EVIDENCE_LEVELS` 內容重複。若將來新增 evidence 等級，需記得同步更新 render.js 和 architecture.css | 輕度不同步風險 | `init-project-html/lib/atlas/render.js` | L29 |
| 6 | cli.js 已達 2365 行，其中 ~1000 行 help page 定義和 ~160 行 diff viewer HTML 模板可拆分至獨立模組 | 長期維護性 | `init-project-html/lib/atlas/cli.js` | — |

---

## 審查維度摘要

- **幻覺代碼**: 1 個 finding — fixCommand `--submodule` flag 不存在於 `verbSubmodule set`（P1-2）
- **冗余代碼**: 無嚴重發現 — `EVI_LABEL` 與 `EVIDENCE_LEVELS` 有輕度 key 重疊（P3-5）；cli.js exports 21 項中僅 3 項有外部消費者，但非死代碼
- **實作偏移**: 2 個 finding — scan 降級路徑 `srcDir` 未更新（P1-1）；dry-run 繞過 io 抽象層（P2-1）
- **實作遺漏**: 1 個 finding — dataflow/edge/meta/actor 不支援 `--evidence` flag（但這些實體無 evidence 渲染邏輯，屬合理取捨）；新功能缺乏測試覆蓋（P2-2）
- **架構瑕疵**: 2 個 finding — fixCommand 耦合 CLI 語法（P2-4）；cli.js 單體膨脹（P3-6）。無循環依賴，模組職責邊界正確
- **性能隱患**: 3 個 finding — mutation 拷貝鏈（P3-1）、renderMacroSvg O(N²) 查找（P3-2）、verbStatus 全量 I/O（P2-3）

---

## 解決方案

### P1 修復

#### P1-1: `verbScan` 降級路徑未更新 `srcDir`

- **涉及檔案**：`init-project-html/lib/atlas/cli.js` > `verbScan()`（L1660-1707）
- **根因**：當預設 `src/` 不存在時，entries 改從 `projectRoot` 讀取（L1671），但 `srcDir` 變數仍為 `path.resolve(projectRoot, 'src')`（L1662），L1700 的 path 計算使用了過期的 `srcDir`。
- **修復方案**：在降級讀取成功後更新 `srcDir = projectRoot`：

```js
} catch (e) {
  if (!srcSpecified) {
    try {
      entries = fs.readdirSync(projectRoot, { withFileTypes: true });
      srcDir = projectRoot;  // ← 新增：更新 srcDir 以正確計算相對路徑
    } catch (e2) {
```

- **驗證方式**：在無 `src/` 目錄的專案執行 `apltk architecture scan`，確認輸出的 `path` 欄位不含 `src/` 前綴；新增測試案例覆蓋降級路徑。

#### P1-2: fixCommand 使用不存在的 `--submodule` flag

- **涉及檔案**：`init-project-html/lib/atlas/schema.js` > `validateSubmodule()`（L139）
- **根因**：`verbSubmodule set` 使用 `--slug` 來識別目標 submodule（cli.js L1351），但 `validateSubmodule` 的 fixCommand 錯誤地使用了 `--submodule`（這是 `function add`、`variable add` 等其他 verb 用來指定所屬 submodule 的 flag）。這是唯一一處不一致。
- **修復方案**：將 L139 的 `--submodule` 改為 `--slug`：

```js
fixCommand: sub && sub.slug
  ? `apltk architecture submodule set --feature ${featureSlug} --slug ${sub.slug} --kind ${SUBMODULE_KINDS[0]}`
  : null,
```

- **驗證方式**：`npm test` 全部通過；手動確認 `apltk architecture submodule set --feature X --slug Y --kind ui` 可正常執行。

### P2 修復

#### P2-1: Dry-run 輸出繞過 io 抽象層

- **涉及檔案**：`init-project-html/lib/atlas/cli.js` > `performMutation()`（L1215）
- **根因**：`performMutation` 未接收 `io` 參數，直接使用 `process.stdout.write`。
- **修復方案**：將 `performMutation` 簽章改為 `async function performMutation(projectRoot, flags, action, args, mutate, io)`，並將 L1215 改為 `io.stdout.write(...)`。所有呼叫點（約 15 處）需傳入 `io`。
- **驗證方式**：`npm test` 全部通過；dry-run 輸出可被測試 mock 捕獲。

#### P2-2: 新功能測試覆蓋

- **涉及檔案**：`test/atlas-cli.test.js`、`test/atlas-state.test.js`、`test/atlas-render.test.js`
- **根因**：新功能開發時未同步新增對應測試。
- **修復方案**：新增測試案例 —
  - `summarize()`：edge 計數正確性（cross-feature vs intra-feature）
  - `parseEvidence()`：有效/無效輸入
  - `computeDiff()`：added/modified/removed
  - `--dry-run`：stdout 輸出 + YAML 未修改
  - `scan`：正常掃描、空目錄、降級路徑
  - `status --json`：schema 驗證、空 atlas
- **驗證方式**：`npm test` 全部通過，新增測試覆蓋上述函數。

#### P2-3: verbStatus 全量 I/O

- **涉及檔案**：`init-project-html/lib/atlas/cli.js` > `verbStatus()`（L1618）、`init-project-html/lib/atlas/state.js` > `load()`（L49-74）
- **根因**：`status` 僅需 feature 數量、submodule 計數等頂層統計，但 `load()` 讀取了所有 feature 的完整 YAML 並做 normalize。
- **修復方案**：在 `load()` 中新增 `metaOnly` 選項，只讀取 `atlas.index.yaml` 並計算摘要統計，不載入個別 feature YAML。或者讓 `summarize` 接受從 index 檔案推導的最小資料集。
- **驗證方式**：在有 100+ feature 的 atlas 上比較修復前後的 status 執行時間。

#### P2-4: fixCommand 耦合

- **涉及檔案**：`init-project-html/lib/atlas/schema.js` > `validateFunction()`、`validateVariable()`、`validateSubmodule()`、`validateSubmodule.dataflow` 段落（L101-103, L117-119, L138-139, L184-186, L202-205）
- **根因**：schema.js 直接硬編碼 CLI flag 語法，若 CLI 介面變更會導致所有 fixCommand 失效。
- **修復方案**（擇一）：
  - A: 讓 `validate()` 回傳結構化錯誤碼（error code + context params），由 `verbValidate` 在 CLI 層根據錯誤碼動態產生 fix command
  - B: 將 fixCommand 產生器作為 callback 參數傳入 `validate(state, { formatFix })`，由呼叫端注入
- **驗證方式**：`npm test` 全部通過，fixCommand 輸出格式保持不變。

### P3 改善

#### P3-1: Spec mode dry-run 非必要深拷貝

- **涉及檔案**：`init-project-html/lib/atlas/cli.js` > `performMutation()`（L1206-1208）
- **根因**：`mergeOverlay` 已回傳全新物件（內部 `JSON.parse(JSON.stringify(base))`），不需再做 `JSON.parse(JSON.stringify(merged))`。
- **修復方案**：`const dryRunState = merged;`（直接使用合併結果作為可變目標），僅保留 `before` 的快照（`before = merged` 已在 `c5bf459` 修正）。
- **驗證方式**：dry-run 行為不變，`npm test` 通過。

#### P3-2: renderMacroSvg O(N²) 查找

- **涉及檔案**：`init-project-html/lib/atlas/render.js` > `renderMacroSvg()`（L117, L124-125）、`findEdgeMeta()`（L84-94）
- **根因**：巢狀 `.find()` 和線性掃描導致大型 atlas 渲染延遲。
- **修復方案**：在 `renderAll` 中預先建立 `Map<slug, feature>` 和 `Map<edgeId, {edge, scope}>`，傳遞給 `renderMacroSvg` 以實現 O(1) 查找。
- **驗證方式**：大 atlas 的 macro SVG 渲染時間顯著減少；`npm test` 通過。

#### P3-3: JSON 輸出無錯誤邊界保護

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（L1215, L1633, L1705）
- **根因**：JSON 輸出與 stderr 訊息可能交錯。
- **修復方案**：將 JSON 計算與 stdout 寫入包在 try-catch 中，確保輸出完整性；或改用結構化輸出格式（如 JSON Lines）。
- **驗證方式**：手動觸發錯誤情境（如損壞的 YAML），確認 stdout 保持合法 JSON。

#### P3-4: 低階 I/O 匯出

- **涉及檔案**：`init-project-html/lib/atlas/state.js`（L527-546）
- **根因**：`readYaml`、`writeYaml`、`normalizeFeature` 等內部函數被公開匯出。
- **修復方案**：從 `module.exports` 移除僅內部使用的函數，僅保留測試所需的匯出（或使用 `_` 前綴標記為內部 API）。
- **驗證方式**：`npm test` 通過；外部無生產程式碼引用這些函數。

#### P3-5: EVI_LABEL 同步風險

- **涉及檔案**：`init-project-html/lib/atlas/render.js`（L29）
- **根因**：`EVI_LABEL` 對應表的 key 值與 `schema.EVIDENCE_LEVELS` 內容重複但獨立維護。
- **修復方案**：從 `schema.EVIDENCE_LEVELS` 動態產生 label 對應（例如 `EVI_LABEL = Object.fromEntries(EVIDENCE_LEVELS.map(l => [l, l.slice(0, 3)]))`）。
- **驗證方式**：`npm test` 通過；`EVI_LABEL` 自動反映所有 evidence 等級。

#### P3-6: cli.js 單體拆分

- **涉及檔案**：`init-project-html/lib/atlas/cli.js`（2365 行）
- **根因**：help page 定義（~1000 行）和 diff viewer HTML 模板（~160 行）與命令分派邏輯混在同一檔案。
- **修復方案**：提取 `cli-help.js`（help page 定義）和 `diff-viewer.js`（diff viewer HTML 模板）至獨立模組，cli.js 降至 ~1200 行。
- **驗證方式**：`npm test` 通過，CLI help 輸出和 diff viewer 功能不變。

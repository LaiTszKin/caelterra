# Tasks: 證據品質與模式偵測 (O5+O6)

- Date: 2026-05-26
- Feature: 證據品質與模式偵測 (O5+O6)

## **Task 1: 在 cli.js 實作 `--evidence` flag**

Purpose: 讓 mutation verb 接受 `--evidence` flag，存入 YAML
Requirements: R1.1, R1.2, R1.3, R1.4
Scope: `init-project-html/lib/atlas/cli.js` — 修改所有 mutation verb 函數
Out of scope: 不修改 `performMutation()` 核心邏輯

- T1.1 [ ] **`cli.js:parseFlags()`** — 確認 `--evidence` 可被正確解析（非 boolean flag，接受值參數）
  - Verify: `--evidence "observed:src/auth.ts:42"` 正確解析為 `flags.evidence = "observed:src/auth.ts:42"`

- T1.2 [ ] **`cli.js:verbFunction()`** — 在 function add 時，若 `flags.evidence` 存在，解析等級與來源，寫入 `fn.evidence = { level, source }`；若等級不合法則拋錯
  - Verify: `apltk architecture function add ... --evidence "observed:src/auth.ts:42"` 在 YAML 中寫入 evidence 欄位

- T1.3 [ ] **`cli.js:verbVariable()`** — 同上，支援 `--evidence` 在 variable add 時寫入
  - Verify: `apltk architecture variable add ... --evidence inferred` 寫入 `evidence: { level: "inferred", source: "" }`

- T1.4 [ ] **`cli.js:verbError()`** — 同上，支援 `--evidence` 在 error add 時寫入
  - Verify: `apltk architecture error add ... --evidence assumed` 正確寫入

- T1.5 [ ] **`cli.js:verbFeature()`** — 在 feature add/set 時支援 `--evidence`
  - Verify: `apltk architecture feature add ... --evidence "observed:src/"` 正確寫入

- T1.6 [ ] **`cli.js:verbSubmodule()`** — 在 submodule add/set 時支援 `--evidence`
  - Verify: `apltk architecture submodule add ... --evidence inferred` 正確寫入

## **Task 2: 在 render.js 實作 evidence 徽章渲染**

Purpose: 渲染 evidence 品質徽章在 submodule 頁面上
Requirements: R2.1, R2.2, R2.3, R2.4
Scope: `init-project-html/lib/atlas/render.js`
Out of scope: 不修改 macro 頁面和 feature 頁面

- T2.1 [ ] **`render.js:renderSubmoduleTable()`** — 接受可選的 `evidenceCol` 參數。若有任何 row 包含 evidence 資料，在 table header 新增 "Evidence" 欄位、每 row 新增 `<td>` 包含 `<span class="evi evi--observed" title="src/auth.ts:42">obs</span>`
  - Verify: 渲染包含 evidence 的 submodule 頁面，確認 table 中有 evidence 欄位

- T2.2 [ ] **`render.js:renderSubmodulePage()`** — 計算 submodule 內所有 function/variable/error 中各 evidence 等級的數量，在 header 區域的 role 下方新增 `<p class="submodule-evidence-summary">Evidence: N observed, M inferred, K assumed</p>`
  - Verify: 渲染包含混合 evidence 的 submodule 頁面，確認 header 顯示正確摘要

- T2.3 [ ] **`render.js` CSS class** — 確保 evidence 徽章使用正確的 CSS class name（`evi--observed`、`evi--inferred`、`evi--assumed`）
  - Verify: 檢查渲染輸出的 HTML 原始碼

- T2.4 [ ] **`architecture.css`** — 新增三種 evidence 徽章的樣式（在 `init-project-html/lib/atlas/assets/architecture.css` 中）
  - Verify: 瀏覽器中 evidence 徽章有三種視覺上可區分的顏色

## **Task 3: 更新 `init-project-html/SKILL.md` 模式偵測路由**

Purpose: 在技能指引中加入四種模式的判斷條件
Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6
Scope: `init-project-html/SKILL.md`
Out of scope: 不修改 `references/` 下的參考文件

- T3.1 [ ] **`SKILL.md` — 新增模式偵測段落** — 在「工作流程」之前新增「## 模式偵測」段落，定義四種模式的判斷條件及對應的工作流程
  - Verify: 閱讀 SKILL.md 確認四種模式判斷邏輯完整

- T3.2 [ ] **`SKILL.md` — design 模式** — 當無 `resources/project-architecture/atlas/` 目錄時，走完整 C4 初始化流程，強調使用 `--evidence observed` 標記
  - Verify: design 模式流程清晰可執行

- T3.3 [ ] **`SKILL.md` — record 模式** — 當 atlas 目錄存在但近乎為空，走快速逐 feature 記錄流程，使用 `scan` 輔助
  - Verify: record 模式流程清晰可執行

- T3.4 [ ] **`SKILL.md` — update 模式** — 引導 agent 使用 `update-project-html` 技能
  - Verify: update 模式引導正確

- T3.5 [ ] **`SKILL.md` — review 模式** — 存在 `architecture_diff/` 時，走 diff 比對流程
  - Verify: review 模式流程清晰可執行

## **Task 4: 精簡 `update-project-html/SKILL.md`**

Purpose: 移除與 init 重疊的內容，加入 evidence 標記建議
Requirements: R4.1, R4.2
Scope: `update-project-html/SKILL.md`
Out of scope: 不改變現有工作流程的核心邏輯

- T4.1 [ ] **`update-project-html/SKILL.md`** — 移除重複的 C4 層級說明（已在 init SKILL.md 中），加入 `--evidence inferred` 使用指引
  - Verify: 閱讀 SKILL.md 確認內容精簡且不與 init 重疊

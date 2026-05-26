# Spec: 證據品質與模式偵測 (O5+O6)

- Date: 2026-05-26
- Feature: 證據品質與模式偵測 (O5+O6)
- Owner: [To be filled]

## Goal

提升 AI agent 生成架構圖的品質與透明度：`--evidence` flag 讓 agent 為每個宣告標記證據品質（observed / inferred / assumed），渲染時顯示對應徽章；SKILL.md 模式偵測讓 agent 根據當前開發階段自動選擇正確的工作流程。

## Scope

### In Scope
- 所有 mutation verb 新增 `--evidence <level[:source]>` flag
- `--evidence` 接受三種等級：`observed`（原始碼直接確認）、`inferred`（從命名/結構推斷）、`assumed`（基於常識假設）
- `--evidence` 接受可選的 `<path:line>` 格式來源引用
- atlas YAML schema 新增可選 `evidence` 欄位在 function / variable / error / submodule / feature 上
- 渲染層在 submodule 頁面上顯示 evidence 品質徽章
- 渲染層在 submodule 頁面頂部顯示整體 evidence 摘要
- `init-project-html/SKILL.md` 新增模式偵測路由（design / record / update / review）
- `update-project-html/SKILL.md` 精簡為只處理 update 模式

### Out of Scope
- 自動驗證 evidence 來源是否真實存在
- `--evidence` 不影響 `validate` 行為（可選欄位）
- 不修改 `TEMPLATE_SPEC.md` 參考文件
- 不引入新 runtime 依賴
- macro 頁面（index.html）不顯示 evidence 資訊

## Functional Behaviors (BDD)

### Requirement 1: `--evidence` flag 接受品質等級與來源
**GIVEN** agent 正在透過 CLI 宣告架構 component
**WHEN** 執行 `apltk architecture function add --feature X --submodule Y --name fn --evidence "observed:src/auth.ts:42"`
**THEN** function row 的 YAML 寫入 `evidence: { level: "observed", source: "src/auth.ts:42" }`
**AND** 若僅指定等級無來源：`--evidence inferred`，寫入 `evidence: { level: "inferred", source: "" }`

**Uncertainty Level**: Known

**Requirements**:
- [ ] R1.1 `--evidence` 接受 `observed`、`inferred`、`assumed` 三種等級
- [ ] R1.2 `--evidence` 接受可選的 `<path:line>` 來源引用（以 `:` 分隔最後一個合法行號）
- [ ] R1.3 不指定 `--evidence` 時，YAML 不寫入 evidence 欄位（向後相容）
- [ ] R1.4 所有 mutation verb（feature/submodule/function/variable/error）均支援 `--evidence`

### Requirement 2: Evidence 徽章渲染
**GIVEN** submodule 內的 function / variable / error 附有 evidence 資料
**WHEN** 渲染 submodule HTML 頁面
**THEN** function/variable/error table 中新增 Evidence 欄位，顯示對應 CSS class 的徽章
**AND** 徽章文字為 `obs`（observed）、`inf`（inferred）、`asm`（assumed）
**AND** 徽章 hover 時顯示來源路徑 tooltip（若有的話）
**AND** submodule 頁面頂部 header 區域顯示 evidence summary：`Evidence: 3 observed, 1 inferred, 2 assumed`

**Uncertainty Level**: Known

**Requirements**:
- [ ] R2.1 三種 evidence 等級對應三種 CSS class：`evi--observed`、`evi--inferred`、`evi--assumed`
- [ ] R2.2 徽章在 function / variable / error table 中新增一欄顯示
- [ ] R2.3 submodule 頁面 header 區域顯示 evidence 摘要統計
- [ ] R2.4 無 evidence 資料的舊 YAML 檔案渲染時不顯示徽章欄位（向後相容）

### Requirement 3: SKILL.md 模式偵測路由
**GIVEN** AI agent 載入 `init-project-html` 技能
**WHEN** agent 評估當前 repo 狀態
**THEN** 根據以下規則選擇模式：
  - **design 模式**：無 `resources/project-architecture/atlas/` 目錄 → 完整 C4 初始化
  - **record 模式**：atlas 目錄存在但近乎為空 → 快速逐 feature 記錄
  - **update 模式**：atlas 有內容，需跟隨程式碼變更 → 委派 `update-project-html`
  - **review 模式**：存在 `architecture_diff/` overlay → diff 比對審查

**Uncertainty Level**: Known

**Requirements**:
- [ ] R3.1 `init-project-html/SKILL.md` 頂部加入四種模式的判斷條件
- [ ] R3.2 每種模式指向對應的工作流程段落
- [ ] R3.3 design 模式走完整 C4 初始化（現有流程，加上 `--evidence` 標記指引）
- [ ] R3.4 record 模式走快速記錄流程
- [ ] R3.5 update 模式引導 agent 使用 `update-project-html` 技能
- [ ] R3.6 review 模式走 diff 比對流程

### Requirement 4: `update-project-html/SKILL.md` 專注更新
**GIVEN** update-project-html 技能被調用
**WHEN** agent 執行更新
**THEN** 走現有的 drift 測量 → 過濾 → 增量更新流程
**AND** 更新流程中加入 `--evidence inferred` 標記指引

**Uncertainty Level**: Known

**Requirements**:
- [ ] R4.1 `update-project-html/SKILL.md` 移除與 init 重疊的內容
- [ ] R4.2 更新流程中加入 evidence 標記建議（從 diff 推斷的標記為 inferred）

## Error and Edge Cases
- [ ] `--evidence` 值不為 `observed|inferred|assumed` 時應報錯
- [ ] `--evidence` 來源不含 `:` 時，整段視為 source path（無行號）
- [ ] 無 evidence 資料的舊 YAML 渲染時不顯示徽章（向後相容）
- [ ] design 模式下若 atlas 目錄意外存在（非空），提示 agent 確認
- [ ] review 模式下若無 `architecture_diff/`，fallback 到 update 模式

## Clarification Questions
None — 需求已在前期研究中確認完畢。

## References
- Official docs: 無外部依賴
- Related code files:
  - `init-project-html/SKILL.md` — 現有技能指引 (line 1-81)
  - `update-project-html/SKILL.md` — 現有更新技能指引 (line 1-66)
  - `init-project-html/references/TEMPLATE_SPEC.md` — atlas 欄位速查表
  - `init-project-html/lib/atlas/render.js` — `renderSubmodulePage()` (line 437)
  - `init-project-html/lib/atlas/cli.js` — `performMutation()` (line 1131)
  - `init-project-html/lib/atlas/schema.js` — `validate()` (line 251)，依賴 Spec B 的新回傳格式

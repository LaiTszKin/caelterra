# Design: 優化引擎與系統整合 (Optimize & Integrate)

- **Date**: 2026-05-29
- **Feature**: 評測結果驅動的優化 diff、CLI 介面、CI/CD 整合
- **Source SPEC**: `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/SPEC.md`

> **Purpose:** 技術方案文檔——定義優化引擎、CLI 命令、CI 整合的架構與取捨。

---

## 1. 調研摘要

### 1.1 技術可行性

| 需求編號 | 可行性 | 風險點 |
|---|---|---|
| R1 優化 diff 生成 | 可行 | 語意去重準確度影響優化品質（誤合導致漏修、誤分導致重複修改）；FIND/REPLACE 匹配失敗需 fallback |
| R2 CLI 命令 | 可行 | 現有 CLI 架構完全支援新增 tool；需注意與現有 `scripts/` 腳本的共存策略 |
| R3 PR 閘門 | 可行 | GitHub Actions 整合無技術阻礙；PR 評論自動化需 `gh` CLI 或 GitHub API token |
| R4 上下文隔離 | 可行 | 每次 API 呼叫建立新 HTTP request = 天然隔離；工具模擬需設計合理的 mock 回傳值 |

**總體判斷**: 全部可行。

### 1.2 現有實現參考

| 參考來源 | 可借鑑的設計模式 |
|---|---|
| Microsoft SkillOpt validation gate | 編輯只在 held-out set 上嚴格改善時才被接受；rejected-edit buffer 防止重複嘗試相同編輯 |
| Anthropic skill-creator Comparator | 盲測 A/B 比較兩個版本，Content × Structure rubric 1-10 分 |
| `scripts/optimize.mjs` (現有實作) | 七階段 pipeline: 聚合 → 提取 → 去重 (Jaccard + judge refine) → fix 生成 → 計劃 → SKILL.md 優化 → apltk 優化；FIND/REPLACE 解析、備份/復原、post-optimization 驗證 (npm test + CLI help) |
| GitHub Actions workflow 模式 | `on: pull_request` + `paths:` filter (僅技能檔案變更時觸發) |

### 1.3 技術棧兼容性

| 候選技術 | 與 repo 依賴兼容性 | 授權 | 選擇 |
|---|---|---|---|
| TypeScript (CLI 工具) | 完全兼容 | MIT | 採用 |
| `@laitszkin/tool-registry` | 內部依賴 | MIT | 採用 |
| GitHub Actions | 無依賴衝突 | N/A | 採用 |
| Node.js child_process (gh CLI) | 完全兼容 | MIT | 採用 |

---

## 2. 架構總覽

### 2.1 模組清單

| 模組 key | 職責（一句話） | 擁有的產物 |
|---|---|---|
| `eval-optimizer` | 從 score.json 提取問題、去重、生成優化 diff | optimization-plan.json, skill-optimization-patch.md |
| `eval-cli` | CLI 命令註冊 (`apltk eval`)，參數解析、模式選擇、進度顯示 | ToolDefinition, CLI handler |
| `eval-ci-gate` | PR 閘門：檢測技能檔案變更、觸發評測、回報結果 | GitHub Actions workflow YAML, PR comment |
| `eval-isolation` | 工具模擬層：攔截寫入操作、回傳 mock 結果；確保評分上下文隔離 | mock tool registry, context factory |

### 2.2 邊界

- **進入點**: 
  - CLI: `apltk eval <skill> [--mode fast|standard] [--optimize] [--dry-run]`
  - CI: GitHub Actions workflow `eval.yml` triggered by `pull_request` with `paths: skills/**`
- **信任邊界**: 優化 diff 不得在未經人工審查的情況下自動合併到主分支
- **外部 → 內部**: 
  - `User/CI` → `eval-cli` → `eval-executor` (Part 1) → `eval-scorer` (Part 1) → `eval-optimizer` → `eval-cli output`

### 2.3 Target vs Baseline

| | Baseline（現在） | Target（變更後） |
|---|---|---|
| CLI 進入點 | `node scripts/run-evals.mjs [date]` + `node scripts/score.mjs [date]` + `node scripts/optimize.mjs [date]` | `apltk eval <skill>` 一鍵完成全流程 |
| 優化輸出 | `results/spec/{date}/skill-optimization-patch.md` + `optimization-plan.json` | 相同格式，整合到 CLI 輸出 |
| CI 整合 | 無 | GitHub Actions workflow，PR 觸發 |
| 工具模擬 | 僅純文字對話（無工具調用） | 讀取真實/寫入 mock 的分層模擬 |

---

## 3. 互動設計

### 3.1 互動錨點 (`INT-###`)

| ID | 意圖 | Caller → Callee | 耦合類型 | 跨越的資訊 / 狀態 | 失敗傳播期望 |
|---|---|---|---|---|---|
| `INT-005` | 提取問題並去重 | `eval-optimizer` → score.json[] | sync call | issues[] → deduped issues[] | score.json 不存在 → 跳過該題，不阻塞其他 |
| `INT-006` | 生成優化 diff | `eval-optimizer` → Judge Model API | HTTP | deduped issues + SKILL.md content → optimization diff | API 錯誤 → fallback 到 template-based suggestion |
| `INT-007` | 應用優化 diff (非 dry-run) | `eval-optimizer` → Filesystem | sync call | FIND/REPLACE edits → modified files | 修改後驗證失敗 → 自動復原備份 |
| `INT-008` | CLI 觸發評測 | `eval-cli` → `eval-executor` | sync call (orchestration) | skill name, mode, flags | 任一階段失敗 → 保留已完成結果，回報 exit code 1 |
| `INT-009` | CI 檢測技能變更 | GitHub Actions → `git diff` | event-driven | changed files list | 無變更 → 跳過 workflow |
| `INT-010` | CI 回報結果 | GitHub Actions → PR comment | gh CLI / API | 評測報告摘要 | gh CLI 不可用 → fallback 到 workflow log |

### 3.2 排序 / 並行約束

- `eval-optimizer` 必須在所有評分完成後執行
- CLI 全流程為線性 pipeline: 出題 → 執行 → 評分 → 報告 → (可選) 優化
- CI workflow 與其他 CI job 並行，不阻塞 lint/test
- 優化 diff 的應用必須在備份成功後才執行

### 3.3 需求連結

- **R1 集群 (優化 diff)**: `INT-005` → `INT-006` → `INT-007`
- **R2 集群 (CLI 命令)**: `INT-008`
- **R3 集群 (PR 閘門)**: `INT-009` → `INT-010`
- **R4 集群 (上下文隔離)**: 在 `eval-executor` 和 `eval-scorer` 的 API 呼叫層實現

---

## 4. 外部依賴

### 4.1 依賴總覽

| 外部依賴 | 用途 | 官方文檔 |
|---|---|---|
| GitHub CLI (`gh`) | PR 評論、CI 狀態回報 | cli.github.com |
| GitHub Actions | CI workflow 執行環境 | docs.github.com/actions |
| OpenAI-compatible API | Judge model (優化 diff 生成) | platform.openai.com |

### 4.2 GitHub Actions

#### 整合錨點 (`EXT-###`)

| ID | 在此邊界整合的對象 | 不可協商的處理要求 | 禁止的假設 |
|---|---|---|---|
| `EXT-003` | `on: pull_request` + `paths: skills/**` | 僅在技能檔案變更時觸發；失敗不應阻塞無關 PR | 不假設 `.env` 在 CI 環境中一定存在（缺失時跳過並警告） |
| `EXT-004` | `gh pr comment` / GitHub Issues API | fallback: API 失敗時將結果寫入 workflow summary | 不假設 `gh` CLI 已認證（檢查 `gh auth status`） |

---

## 5. 資料持久化

| 資源 | 典型讀寫者 | 一致性期望 |
|---|---|---|
| `optimization-plan.json` | `eval-optimizer` 寫；人閱讀 | JSON 結構完整，issues[] 按優先級排序 |
| `skill-optimization-patch.md` | `eval-optimizer` 寫；人審查 | diff 格式可讀，含每個修改的 rationale |
| `.bak` 備份檔案 | `eval-optimizer` 寫；復原時讀 | 與原始檔案內容一致（apply 前複製） |
| GitHub Actions workflow log | CI 寫；人閱讀 | 結構化輸出（評測摘要 + 報告路徑） |

---

## 6. 系統不變量

| 不變量 | 架構上破壞它的方式 | 違反的症狀 |
|---|---|---|
| 優化 diff 不修改技能目錄外的檔案 | `mapIssuesToFiles` 的 ALLOWED_FILES 白名單被繞過 | 不相關的原始碼被修改 |
| 備份在修改前必定存在 | apply 邏輯中備份和寫入之間有 exception | 原始檔案損壞且無法復原 |
| 優化後技能檔案語法有效 | 跳過 post-optimization validation | YAML frontmatter 損壞、CLI help 報錯 |
| dry-run 模式不產生任何檔案系統副作用 | dry-run flag 未被正確傳遞 | 未審查的變更被直接寫入 |

---

## 7. 技術取捨

| 決策 | 拒絕的替代方案 | 對實作的鎖定影響 |
|---|---|---|
| FIND/REPLACE 文本匹配（非 AST 改寫） | TypeScript compiler API 精確修改 | 簡單但匹配可能失敗（空白差異）；需 fallback 到完整檔案替換 |
| GitHub Actions（非 GitLab CI / CircleCI） | 多平台 CI 支援 | 鎖定 GitHub；如需支援其他平台需另寫 workflow |
| `gh` CLI（非 GitHub REST API） | 直接呼叫 REST API | 需要 CI 環境預裝 `gh` CLI；好處是簡化認證 |
| 語意去重使用 Jaccard + 選配 judge refine | 純 judge model 去重（成本高）或純關鍵字（不準確） | 兩階段去重平衡成本與準確度；Jaccard 閾值需 empirical tuning |
| 優化僅建議、不自動合併 | 全自動閉環（SkillOpt 風格 validation gate） | 簡化實作但增加人工審查成本；保留未來升級為 auto-apply + validation gate 的空間 |

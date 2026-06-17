# 技能開發慣例

## Frontmatter 最小化

`SKILL.md` 的 YAML frontmatter 僅限 `name` 與 `description` 兩個欄位。`name` 必須為 kebab-case 且與目錄名稱一致；`description` 必須為非空字串且不超過 1024 字元。

**理由**: 最小化 frontmatter 降低維護成本，所有技能中繼資料可由檔案系統結構推導。

**範例**:

```yaml
---
name: systematic-debug
description: Systematically reproduces issues, validates fixes, and establishes regression tests.
---
```

## 主體結構標準化

技能主體依序包含：Goal → Acceptance Criteria → Workflow → Examples → References。工作流程使用編號步驟，每個步驟描述要做什麼而非如何做。

**理由**: 標準化結構讓代理人在不同技能之間有一致的執行預期，減少解讀成本。

**範例**: `deep-research-topics` 的工作流程分為 7 個步驟：理解請求 → 拆解研究問題 → 深度研究 → 讀取工作區 → 決定輸出語言 → 起草交付物 → 交付至輸出技能。

## Dependencies 與 Standards 區塊

當技能依賴其他技能或需要明確的品質約束時，使用標準化的 `## Dependencies`（含 Required/Conditional/Optional/Fallback 子項）與 `## Standards`（含 Evidence/Execution/Quality/Output 子項）區塊。

**理由**: 明確宣告依賴與品質標準讓代理人能在缺失依賴時停止並報告，而非發明替代路徑。

**範例**: `deep-research-topics` 宣告 Required 為 none，Conditional 為 `pdf`/`doc`/`slides`，Fallback 為若輸出技能不可用則停止並報告。

## 英文為主

技能描述與工作流程使用英文，以最大化跨平台代理人相容性與技能的可發現性。技術術語、檔案路徑與程式碼識別符保留原文。

**理由**: 英文為代理人系統的共同語言，讓技能在不同語言環境的程式碼編輯器中都能正確觸發與執行。

## 證據本位

技能文件中的每個聲明必須可追溯至程式碼庫中的實際實作。禁止基於命名或註解推斷行為。

**理由**: 程式碼庫是唯一的事實來源，文件脫離程式碼後快速腐化。

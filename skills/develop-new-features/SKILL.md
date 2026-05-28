---
name: develop-new-features
description: 從零開始打造新專案。將產品需求轉化為可批准的 spec，再實作為可驗證的交付成果。
---

## 技能目標

將新的產品需求轉化為可批准、可實作、可驗證的交付流程。
避免在需求未定稿前直接撰寫產品程式碼。
確保最終功能、測試與規劃文件彼此一致。

## 驗收條件

- 產出完全符合用戶需求的 spec，將其精確定義為可實作的工程指導文檔
- 遵照 spec 完成用戶需求的實作

## 工作流程

### 1. 理解用戶需求

分析用戶需求，並使用 `spec` 技能建立spec。

### 2. 生成實作計畫

在明確獲取用戶的同意之後，使用 `plan` 技能將 spec 轉化為 PROMPT.md。
plan 會自動識別單 spec 或 batch spec，並生成對應的執行計畫與智能體路由策略。

### 3. 實作 spec

使用 `implement` 技能讀取 PROMPT.md，嚴格按照計畫執行實作。
implement 會根據 PROMPT.md 中的批次排程與 subagent 路由自動處理並行或循序實作。

## 使用範例

- "現有repo完全不存在任何的CSV解析、讀取、會出功能。用戶要求替 dashboard 新增 CSV 匯出功能。-> "建立spec並等待用戶批准，再實作匯出流程，並用 property tests 驗證欄位順序、編碼與內容不變量"
- "原repo不存在任何cli功能。用戶要求同時新增 CLI、後端與基礎設施的新能力" -> "拆成多份 spec，用 `coordination.md` 管理跨模組依賴。使用 `plan` 生成 PROMPT.md 定義協同策略，再使用 `implement` 按計畫執行。"
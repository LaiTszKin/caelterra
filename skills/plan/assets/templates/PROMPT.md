# Implementation Plan: [Spec/Batch Name]

- **Date**: [YYYY-MM-DD]
- **Type**: [Single Spec / Batch Spec]
- **Source Spec(s)**: [spec 目錄路徑清單]

---

## 1. Executive Summary

[一段話概述本次實作的範圍、目標、以及整體執行策略（循序 / 部分並行 / 完全並行）。]

---

## 2. Dependency Graph

### 2.1 工作單元定義

| 工作單元 ID | 對應 Spec / 任務 | 目標檔案 | 依賴 |
|---|---|---|---|
| `W1` | [spec-name / tasks.md T1.1–T1.3] | `src/a.ts`, `src/b.ts` | — |
| `W2` | [spec-name / tasks.md T2.1–T2.4] | `src/c.ts`, `src/d.ts` | W1 |
| `W3` | [spec-name / tasks.md T3.1–T3.2] | `src/e.ts` | — |

### 2.2 依賴圖

```
W1 ──→ W2
W3 ──→ W4
```

[說明關鍵依賴的原因：共享檔案 / INT 錨點順序 / 資料流依賴。]

---

## 3. Batch Schedule

### Batch 1 — [前置準備 / 獨立基礎]

**執行方式**: [循序 / 並行]
**工作單元**: W1 ∥ W3

**完成條件**:
- [ ] [具體可驗證的條件]
- [ ] 測試通過: `[command]`

---

### Batch 2 — [核心實作]

**執行方式**: 並行 (2 subagents)
**工作單元**: W2 ∥ W4
**依賴**: Batch 1 完成

**完成條件**:
- [ ] [具體可驗證的條件]
- [ ] 測試通過: `[command]`

---

### Batch N — [收尾 / 整合]

**執行方式**: 循序
**工作單元**: W5

**完成條件**:
- [ ] [整合驗證]
- [ ] 完整測試套件通過: `[command]`

---

## 4. Subagent Assignments

### Batch 2 — Subagent A: [名稱]

- **工作單元**: W2
- **目標**: [這個 subagent 要完成什麼，一句話描述]
- **工作目錄**: `[spec 目錄路徑]`
- **任務清單**:
  - [ ] T1.1: [任務描述] — `[目標檔案]`
  - [ ] T1.2: [任務描述] — `[目標檔案]`
- **允許修改的檔案**:
  - `src/a.ts`
  - `src/b.ts`
- **禁止修改的檔案**:
  - `src/c.ts`（屬於 Subagent B）
  - `package-lock.json`（由 Batch N 統一處理）
- **風險標記**: [auth / schema / migration / 外部 API / 無]
- **驗證命令**: `[test/lint 命令]`

### Batch 2 — Subagent B: [名稱]

- **工作單元**: W3
- **目標**: [這個 subagent 要完成什麼]
- **工作目錄**: `[spec 目錄路徑]`
- **任務清單**:
  - [ ] T2.1: [任務描述] — `[目標檔案]`
- **允許修改的檔案**:
  - `src/c.ts`
- **禁止修改的檔案**:
  - `src/a.ts`, `src/b.ts`（屬於 Subagent A）
- **風險標記**: [auth / schema / migration / 外部 API / 無]
- **驗證命令**: `[test/lint 命令]`

---

## 5. File Ownership Map

| 檔案路徑 | 擁有者 | 備註 |
|---|---|---|
| `src/a.ts` | Subagent A (Batch 2) | — |
| `src/b.ts` | Subagent A (Batch 2) | — |
| `src/c.ts` | Subagent B (Batch 2) | — |
| `package-lock.json` | Batch N (主流程) | 最終統一更新 |

---

## 6. Lockfile Strategy

[由 Batch N 統一更新 / 由 Subagent X 負責 / 不修改]

---

## 7. Verification Checkpoints

### Checkpoint 1 — Batch 1 完成後
- 執行: `[command]`
- 預期: [預期結果]

### Checkpoint 2 — Batch 2 合併後
- 執行: `[command]`
- 預期: [預期結果]
- 整合檢查: [coordination.md 定義的 integration checkpoints]

### Checkpoint N — 最終驗證
- 執行完整測試套件: `[command]`
- 確認 lint 通過: `[command]`

---

## 8. Error Recovery

| 失敗場景 | 處理方式 |
|---|---|
| Subagent 執行失敗 | 重試一次；再次失敗則暫停，通知用戶 |
| 同批次其他 subagent 成功 | 保留成功結果，不廢棄 |
| 合併衝突 | 手動解決衝突後重新執行該批次驗證 |
| 測試回歸 | 暫停，標記問題後等待用戶決策 |

---

## 9. Boundaries

### Always
- [ ] 每個批次完成後執行驗證命令
- [ ] 遵循 `design.md` 定義的模組邊界
- [ ] 遵循 `contract.md` 定義的外部依賴約束

### Ask First
- [ ] 修改 schema / migration 相關檔案
- [ ] 新增外部依賴
- [ ] 超出 spec 定義範圍的變更

### Never
- [ ] 修改其他 subagent 擁有的檔案（見 File Ownership Map）
- [ ] 提交 secrets 或 API keys
- [ ] 跳過驗證檢查點直接進入下一批次

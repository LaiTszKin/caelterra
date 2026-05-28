# Fix Plan: [Spec Name]

- **Date**: [YYYY-MM-DD]
- **Source REPORT**: [REPORT.md 路徑]
- **Source Spec**: [spec 目錄路徑]
- **Total Issues**: [P0: X, P1: X, P2: X, P3: X]

---

## 1. Fix Summary

[一段話概述本次修復的範圍、問題總數、以及整體執行策略（循序 / 部分並行 / 完全並行）。]

---

## 2. Issue Inventory

| Issue ID | 等級 | 問題簡述 | 涉及檔案 | 審查維度 | 複雜度 |
|---|---|---|---|---|---|
| `FIX-01` | P0 | [簡述] | `src/a.ts` | 幻覺代碼 | 簡單 |
| `FIX-02` | P0 | [簡述] | `src/b.ts`, `src/c.ts` | 實作遺漏 | 複雜 |
| `FIX-03` | P1 | [簡述] | `src/d.ts` | 架構瑕疵 | 簡單 |

---

## 3. Fix Dependency Analysis

### 3.1 依賴圖

```
FIX-01 ──→ FIX-02  （FIX-01 重構介面，FIX-02 依賴新介面）
FIX-03           （獨立，無依賴）
FIX-04 ──→ FIX-05  （同檔案 src/e.ts，必須循序）
```

### 3.2 檔案重疊檢測

| 衝突組 | 問題 ID | 共享檔案 | 處理方式 |
|---|---|---|---|
| 重疊組 1 | FIX-04, FIX-05 | `src/e.ts` | 分至不同批次，循序修復 |
| 無重疊 | FIX-01, FIX-03 | — | 可並行 |

---

## 4. Fix Batch Schedule

### Batch 1 — P0 獨立修復（並行）

**執行方式**: 並行 (2 subagents)
**問題**: FIX-01 ∥ FIX-03

**完成條件**:
- [ ] FIX-01 修復完成，驗證通過
- [ ] FIX-03 修復完成，驗證通過
- [ ] 現有測試套件通過: `[command]`

---

### Batch 2 — P0 依賴修復（循序）

**執行方式**: 循序
**問題**: FIX-02 → FIX-04 → FIX-05
**依賴**: Batch 1 完成

**完成條件**:
- [ ] FIX-02 修復完成
- [ ] FIX-04、FIX-05 修復完成（同檔案，需照順序）
- [ ] 測試通過: `[command]`

---

### Batch 3 — 收尾（並行）

**執行方式**: 並行 (或單一 subagent)
**問題**: FIX-06 ∥ FIX-07

**完成條件**:
- [ ] 所有問題修復完成
- [ ] 完整測試套件通過: `[command]`
- [ ] Lint 通過: `[command]`

---

## 5. Subagent Routing

### Batch 1 — Subagent A: [名稱]

- **負責問題**: FIX-01
- **目標**: [一句話描述修復目標]
- **允許修改的檔案**:
  - `src/a.ts`
- **禁止修改的檔案**:
  - `src/b.ts`（屬於 Subagent B）
- **修復方案**: [具體修改方式]
- **驗證命令**: `[test command]`

**Subagent Prompt**:

```
[完整的 subagent 提示詞，包含:
- 修復背景與目標
- 需要閱讀的 REPORT.md / spec 檔案路徑
- Per-Issue Fix Details 中該問題的完整修復方案
- 允許/禁止修改的檔案邊界
- 驗證命令
- 風險標記與注意事項]
```

### Batch 1 — Subagent B: [名稱]

- **負責問題**: FIX-03
- **目標**: [一句話描述修復目標]
- **允許修改的檔案**:
  - `src/d.ts`
- **禁止修改的檔案**:
  - `src/a.ts`（屬於 Subagent A）
- **修復方案**: [具體修改方式]
- **驗證命令**: `[test command]`

**Subagent Prompt**:

```
[完整的 subagent 提示詞，包含:
- 修復背景與目標
- 需要閱讀的 REPORT.md / spec 檔案路徑
- Per-Issue Fix Details 中該問題的完整修復方案
- 允許/禁止修改的檔案邊界
- 驗證命令
- 風險標記與注意事項]
```

---

## 6. Per-Issue Fix Details

### FIX-01: [問題標題] (P0)

- **審查維度**: [幻覺代碼 / 冗余 / 偏移 / 遺漏 / 架構 / 性能]
- **涉及檔案**: `src/a.ts` > `functionName()`（L[N]-[N]）
- **根因**: [說明導致此問題的根本原因]
- **修復方案**: [描述如何修改檔案來修復問題]
- **修改範圍**: [僅指定函式 / 同檔案多處 / 跨檔案]
- **複雜度**: [簡單 / 複雜]
- **驗證方式**: [如何確認修復有效，如特定測試案例或手動驗證步驟]

### FIX-02: [問題標題] (P0)

- **審查維度**: [維度]
- **涉及檔案**: `src/b.ts` > `functionName()`（L[N]-[N]）, `src/c.ts` > `otherFunc()`（L[N]-[N]）
- **根因**: [說明導致此問題的根本原因]
- **修復方案**: [描述如何修改檔案來修復問題]
- **修改範圍**: [跨檔案]
- **複雜度**: 複雜
- **驗證方式**: [驗證命令或步驟]

---

## 7. Regression Test Strategy

- **必須通過的現有測試**:
  - `[test command]` — 涵蓋 [範圍]
- **新增回歸測試**:
  - [ ] FIX-01: 新增測試 `[test file/name]` 驗證 [情境]
  - [ ] FIX-02: 新增測試 `[test file/name]` 驗證 [情境]
- **Property-based 測試**: [需要 / N/A — 原因]

---

## 8. Verification Checkpoints

### Checkpoint 1 — Batch 1 完成後
- 執行: `[command]`
- 預期: 所有現有測試通過，FIX-01 和 FIX-03 的手動驗證通過

### Checkpoint 2 — Batch 2 完成後
- 執行: `[command]`
- 預期: 所有 P0 問題已修復，無回歸

### Checkpoint 3 — 最終驗證
- 執行完整測試套件: `[command]`
- 確認 lint 通過: `[command]`
- 確認 REPORT.md 中所有問題已處理

---

## 9. Boundaries

### Always
- [ ] 每個修復完成後執行對應的驗證命令
- [ ] 修復不得與 spec 原始需求衝突
- [ ] 保留現有測試的行為語義（除非 spec 明確要求變更）

### Ask First
- [ ] 修復方案與 spec 設計意圖衝突時
- [ ] 需要新增外部依賴

### Never
- [ ] 修改其他 subagent 擁有的檔案（見 Subagent Routing）
- [ ] 在未通過驗證的情況下進入下一批次
- [ ] 變更 spec 文檔（除非修復過程中發現 spec 錯誤需回報）

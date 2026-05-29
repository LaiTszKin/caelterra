# Implementation Prompt: [Spec/Batch Name]

- **Date**: [YYYY-MM-DD]
- **Type**: [Single Spec / Batch Spec]
- **Source Spec**: [SPEC.md 路徑]
- **Source Design**: [DESIGN.md 路徑]
- **Source Checklist**: [CHECKLIST.md 路徑]

---

## 1. Mission

[一段話告訴 AI agent：你要做什麼、為什麼要做。從 SPEC.md 的 Goal 和業務價值提煉。]

**Success looks like**: [一句話描述實作完成後的最終可觀測結果。]

---

## 2. Scope & Boundaries

### What you WILL implement

[從 SPEC.md 的 In Scope + BDD 需求清單提煉。條列式，每條一句話。]

### What you will NOT implement

[從 SPEC.md 的 Out of Scope 提煉。明確告訴 agent 不要做什麼，防止過度實作。]

### File ownership

| 檔案路徑 | 擁有者（工作單元 ID 或 Subagent） | 備註 |
|---|---|---|
| `[path]` | [W1 / Subagent A / 主流程] | [說明] |

---

## 3. Technical Context

### Architecture (from DESIGN.md)

[從 DESIGN.md 的模組清單和互動錨點提煉。只放與本次實作相關的部份。]

**Modules you will touch**:

| 模組 | 職責 | 你將如何修改它 |
|---|---|---|
| `[module-key]` | [一句話職責] | [具體修改方式] |

**Key interaction anchors** (you must respect these):

| ID | Caller → Callee | 跨越的資訊 | 失敗傳播期望 |
|---|---|---|---|
| `INT-###` | `A` → `B` | […] | […] |

### Invariants you MUST NOT break

[從 DESIGN.md 的系統不變量提煉。這些是硬約束，任何修改都不得違反。]

| 不變量 | 違反的症狀（如果你打破了，你會看到…） |
|---|---|
| […] | […] |

### Technical decisions you must follow

[從 DESIGN.md 的技術取捨提煉。每個決策一句話 + 為什麼這樣選。]

| 決策 | 原因 | 這意味著你必須… |
|---|---|---|
| […] | […] | […] |

---

## 4. Task Units

[每個任務是一個原子工作單元，可獨立完成、獨立驗證。任務 ID 格式：`T{批次}.{序號}`。]

### Dependency Graph

```
T1.1 ──→ T2.1 ──→ T3.1
T1.2 ──→ T2.1
T1.3 （獨立）
```

[說明依賴原因：檔案重疊 / 資料流 / INT 錨點順序。]

---

### T{批次}.{序號}: [任務名稱]

- **Goal**: [一句話描述這個任務要做什麼]
- **Files**: `[檔案路徑清單]`
- **Depends on**: [任務 ID 或 `—`（無依賴）]
- **What to do**:
  1. [具體步驟 1 — 精確到函式/行級別]
  2. [具體步驟 2]
- **Why**: [為什麼這樣做 — 對應 SPEC 需求 R?.? 或 DESIGN 的 INT-###]
- **Verify**:
  - 執行: `[驗證命令]`
  - 預期結果: [你應該看到什麼]

---

[重複以上區塊，為每個任務填寫。]

---

## 5. Batch Schedule

[按依賴圖排程。同一批次內的任務無檔案重疊、無邏輯依賴，可並行。]

### Batch 1 — [名稱]

- **Execution**: [循序 / 並行 (N subagents)]
- **Tasks**: T1.1, T1.2, T1.3
- **Completion checklist**:
  - [ ] T1.1 驗證通過
  - [ ] T1.2 驗證通過
  - [ ] T1.3 驗證通過
  - [ ] [批次層級的整合驗證命令]

---

### Batch 2 — [名稱]

- **Execution**: [循序 / 並行 (N subagents)]
- **Tasks**: T2.1, T2.2
- **Depends on**: Batch 1
- **Completion checklist**:
  - [ ] T2.1 驗證通過
  - [ ] T2.2 驗證通過
  - [ ] [批次層級的整合驗證命令]

---

### Batch N — [收尾 / 整合]

- **Execution**: 循序
- **Tasks**: T{N}.1
- **Depends on**: [所有前置批次]
- **Completion checklist**:
  - [ ] [最終整合驗證]
  - [ ] 完整測試套件通過: `[command]`
  - [ ] Lint 通過: `[command]`

---

## 6. Subagent Assignments

[僅在需要並行處理的批次中定義。每個 subagent 獲得一份完整的自包含提示詞。]

### Batch 2 — Subagent A: [名稱]

- **Responsible for**: T2.1
- **Goal**: [一句話]

**Subagent Prompt**:

```
You are implementing [任務名稱] as part of [Spec Name].

## Mission
[從 Section 1 複製或精簡]

## Your Task
- Task ID: T2.1
- Files you MAY modify:
  - `[path]` — [說明]
- Files you MUST NOT touch:
  - `[path]`（屬於 Subagent B）

## What to do
1. [具體步驟]
2. [具體步驟]

## Verification
- Run: `[command]`
- Expected: [你應該看到什麼]

## Boundaries
- NEVER modify files owned by other subagents
- NEVER introduce new external dependencies without asking
- If you encounter unexpected obstacles, STOP and report — do not improvise
```

---

### Batch 2 — Subagent B: [名稱]

- **Responsible for**: T2.2
- **Goal**: [一句話]

**Subagent Prompt**:

```
[同上結構 — 每個 subagent prompt 是完全自包含的，不需參考外部文檔]
```

---

## 7. Verification Checkpoints

[從 CHECKLIST.md 的行為測試對照 (CL-### → R?.?) 和 Hardening 清單提煉。]

### Per-batch verification

| 批次 | 驗證命令 | 預期結果 |
|---|---|---|
| Batch 1 | `[command]` | [預期] |
| Batch 2 | `[command]` | [預期] |
| Batch N | `[command]` | [預期] |

### Key behavior checks (from CHECKLIST.md)

| ID | 可觀察行為 | 對應 SPEC 需求 | 驗證方式 |
|---|---|---|---|
| CL-01 | [行為描述] | R?.? | `[test command]` |
| CL-02 | [行為描述] | R?.? | `[test command]` |

### Final verification

- [ ] 完整測試套件通過: `[command]`
- [ ] Lint 通過: `[command]`
- [ ] [CHECKLIST.md 中要求的 hardening 檢查]

---

## 8. Boundaries

### ALWAYS — 無條件遵守

- [ ] 每個任務完成後立即執行其 Verify 命令
- [ ] 遵循 Technical Context 中定義的模組邊界與不變量
- [ ] 遵循 File Ownership — 不修改其他工作單元擁有的檔案
- [ ] 任務失敗時遵循 Error Recovery 策略，不自行發明替代方案

### ASK FIRST — 暫停並向用戶確認

- [ ] 修改 schema / migration / 持久化相關檔案
- [ ] 需要新增外部依賴
- [ ] 發現 SPEC/DESIGN 中未定義的修改需求
- [ ] 任務的 Verify 命令失敗且無法在 2 次嘗試內修復

### NEVER — 嚴格禁止

- [ ] 修改其他 subagent 擁有的檔案（見 File Ownership）
- [ ] 提交 secrets、API keys、或憑證
- [ ] 跳過驗證檢查點直接進入下一批次
- [ ] 在未通過當前批次所有驗證的情況下開始下一批次
- [ ] 擅自擴大實作範圍（見 Scope & Boundaries）

---

## 9. Error Recovery

| 失敗場景 | 處理方式 |
|---|---|
| 單一任務 Verify 失敗 | 修正後重試，最多 2 次；仍失敗則暫停並報告 |
| Subagent 執行失敗 | 重試一次；再次失敗則暫停，保留同批次其他成功的結果 |
| 合併衝突（subagent 結果合併時） | 手動解決衝突後重新執行該批次驗證 |
| 測試回歸（現有測試在新代碼上失敗） | 暫停，標記問題後等待用戶決策。不要為了讓測試通過而降低測試標準 |
| 發現 SPEC/DESIGN 矛盾或不可行的設計 | 暫停，記錄具體矛盾點，通知用戶 |

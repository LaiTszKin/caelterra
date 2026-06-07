# Fix Worker Prompt: FIX-03-docs-r4

- **Related issue**: FIX-03 — DESIGN.md batch non-atomicity statement outdated (P3-5)

---

## 1. Mission & Rules

### Mission

Update DESIGN.md §7 to accurately reflect that batch mode NOW has full rollback (the design was written before rollback was implemented).

### Context

P3-5 in REPORT.md: DESIGN.md §7 states "Batch 非原子性: 若中間 entity 失敗，已處理的部分已寫入磁碟" and "Batch 模式採 sequential apply with suppressed auto-render，而非 transactional". However, the actual code (cli.js L940-963, L1019-1027) implements full rollback that restores pre-batch state/overlay on failure. The code provides stronger guarantees than the design documents.

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — §7 Technical Trade-offs, "Batch 非原子性" section
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — P3-5 finding

### Root Cause

The DESIGN.md was written before the batch rollback mechanism was implemented. During Round 3, rollback was added to the code (cli.js L940-963, L1019-1027), but the design document was not updated to reflect this.

---

## 3. Tasks

### [DESIGN.md] — Update batch atomicity trade-off description

1. Open `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
2. Locate the "Batch 非原子性" section in §7 Technical Trade-offs (around L130-137)

Replace the current text:
```
### Batch 非原子性的風險評估

Batch 非原子性是一個已知取捨。在真實使用場景中，agent 一次發出 3-5 個 entity 定義，如果第三個因語意錯誤失敗，前兩個已寫入。風險控制在於：

- 每個 entity 在 `performMutation` 層都有獨立驗證
- 失敗 entity 的錯誤訊息明確，agent 可以修正後重試
- 此行為與現有 `feature add` + `submodule add` 順序呼叫的行為完全一致
- 如果要原子性，使用者應使用 spec 模式 + `diff` + `merge`，這套流程維持原子性
```

With:
```
### Batch 原子性保障 (自 Round 3 實作)

Batch 操作目前具備完整的 rollback 機制（已在 cli.js L940-963, L1019-1027 實作）。當任一 entity 在處理過程中拋出錯誤時，系統會將狀態/overlay 檔案還原到 batch 開始前的內容，確保不會產生部分變更。注意事項：

- Rollback 還原的是 YAML 狀態檔案，不包含歷史記錄（`appendHistory` 中的條目在 rollback 後可能殘留）。
- 此機制與 spec 模式下的 overlay rollback 行為一致（spec 模式和 base 模式都支援 rollback）。
- 如果有強原子性需求（包括被 rollback 的 entity 不留下任何蹤跡），使用 spec 模式 + `diff` + `merge` 流程，它在更嚴格的語意下運作。
```

3. Also update the Decision table entry for batch mode (in §7, the row about "Batch 模式採 sequential apply"):
   - Change the "Lock-in Effect" to mention that rollback is now implemented
   - Update "Rejected Alternatives" to note that transactional behavior was considered but state-file rollback was chosen as the practical middle ground

### Output

When done, report back to the coordinator:
- **Files modified**: [list]
- **Change summary**: Updated DESIGN.md batch atomicity description
- **Risks or concerns**: "None — documentation-only change"

---

## 4. Verification

1. Read the updated DESIGN.md §7 section — confirm the new text accurately reflects the code behavior
2. No tests to run (documentation-only change)

---

## 5. Scope & References

### Allowed Files

- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — §7 batch atomicity section only

### Forbidden Files

- All source code and test files

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Round 4 findings (P3-5)
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements

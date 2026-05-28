# Checklist: 技能目錄重組

- Date: 2026-05-28
- Feature: 技能目錄重組

## Usage Notes

- Add/remove items based on actual scope; keep only applicable items.
- Use `$test-case-strategy` for test level selection, oracle design, and drift-check planning.
- Property-based coverage required for business-logic changes unless `N/A` with reason.
- Test result values: `PASS / FAIL / BLOCKED / NOT RUN / N/A`.

## Clarification & Approval Gate

- [ ] Clarification responses recorded (or `N/A` if none).
- [ ] Affected plans updated after clarification (or `N/A` + reason).
- [ ] Explicit approval obtained (date/ref: [to be filled]).

## Behavior-to-Test Checklist

- [ ] CL-01: 技能目錄正確遷移至 `skills/` 下 — R1.1, R1.2, R1.3, R1.4 → T1.1-T1.3 — Result: `NOT RUN`
- [ ] CL-02: 安裝腳本正確從 `skills/` 發現並安裝技能 — R2.1, R2.3 → T2.1-T2.2 — Result: `NOT RUN`
- [ ] CL-03: curl/pipe 模式下安裝腳本仍正常運作 — R2.4 → T2.2 — Result: `NOT RUN`
- [ ] CL-04: CLI 工具正確掃描 `skills/` 目錄 — R3.3 → T4.1-T4.2 — Result: `NOT RUN`
- [ ] CL-05: 全部現有測試通過 — R3.2 → T4.4 — Result: `NOT RUN`

## Hardening Checklist

- [ ] Regression tests for bug-prone/high-risk behavior: `N/A`（純路徑重組，不涉及業務邏輯）
- [ ] Unit drift checks for non-trivial tasks: `N/A`
- [ ] Property-based coverage for business logic: `N/A`
- [ ] External services mocked/faked: `N/A`
- [ ] Adversarial cases for abuse paths: `N/A`
- [ ] Authorization, idempotency, concurrency risks evaluated: `N/A`
- [ ] Assertions verify outcomes/side-effects, not just "returns 200": 驗證技能數量、 test 通過
- [ ] Fixtures reproducible (fixed seed/clock): `N/A`

## E2E / Integration Decisions

- [ ] 安裝→驗證流程: E2E — Reason: 安裝後需確認 agent 能載入技能
- [ ] curl/pipe 安裝模式: Integration replacement — Reason: 模擬 curl/pipe 場景

## Execution Summary

- [ ] Unit: `NOT RUN`
- [ ] Regression: `NOT RUN`
- [ ] Property-based: `N/A`
- [ ] Integration: `NOT RUN`
- [ ] E2E: `NOT RUN`
- [ ] Mock scenarios: `N/A`
- [ ] Adversarial: `N/A`

## Completion Records

- [ ] Task 1 (技能遷移): pending — Remaining: None
- [ ] Task 2 (Shell 腳本): pending — Remaining: None
- [ ] Task 3 (PowerShell 腳本): pending — Remaining: None
- [ ] Task 4 (其他路徑引用): pending — Remaining: None

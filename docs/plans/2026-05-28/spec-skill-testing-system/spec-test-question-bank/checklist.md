# Checklist: 測試題庫

- Date: 2026-05-28
- Feature: 測試題庫

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

- [ ] CL-01: JSON schema 正確定義所有必要欄位 — R1.1-R1.4 → T1.1-T1.4 — Result: `NOT RUN`
- [ ] CL-02: 100 道題目全部通過 schema 驗證 — R2.1 → T2.1-T2.5 — Result: `NOT RUN`
- [ ] CL-03: 題目覆蓋 spec 技能全部 8 個工作流程步驟 — R2.3 → T2.5 — Result: `NOT RUN`
- [ ] CL-04: 邊界/異常題目 >= 20 道 — R2.4 → T2.3 — Result: `NOT RUN`
- [ ] CL-05: 反向測試題目 >= 10 道 — R2.5 → T2.4 — Result: `NOT RUN`
- [ ] CL-06: 評分標準正確剝離，不暴露給被測 agent — R3.1-R3.2 → T3.2-T3.3 — Result: `NOT RUN`

## Hardening Checklist

- [ ] Regression tests for bug-prone/high-risk behavior: `N/A`（純資料內容，無業務邏輯）
- [ ] Unit drift checks for non-trivial tasks: `N/A`
- [ ] Property-based coverage for business logic: `N/A`
- [ ] External services mocked/faked: `N/A`
- [ ] Adversarial cases for abuse paths: 反向測試題目已涵蓋（agent 不應調用 skill）
- [ ] Authorization, idempotency, concurrency risks evaluated: `N/A`
- [ ] Assertions verify outcomes/side-effects: schema 驗證 + 覆蓋率矩陣
- [ ] Fixtures reproducible: 題目 JSON 為固定內容

## E2E / Integration Decisions

- [ ] 題目載入→剝離→傳遞給執行器: Integration replacement — Reason: 在 Spec C 整合測試中驗證
- [ ] 評分器讀取評分標準: Integration replacement — Reason: 在 Spec C 整合測試中驗證

## Execution Summary

- [ ] Unit: `N/A`
- [ ] Regression: `N/A`
- [ ] Property-based: `N/A`
- [ ] Integration: `NOT RUN`
- [ ] E2E: `NOT RUN`
- [ ] Mock scenarios: `N/A`
- [ ] Adversarial: `NOT RUN`

## Completion Records

- [ ] Task 1 (Schema 定義): pending — Remaining: None
- [ ] Task 2 (100 道題目): pending — Remaining: None
- [ ] Task 3 (載入工具函數): pending — Remaining: None

# Checklist: 優化器

- Date: 2026-05-28
- Feature: 優化器

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

- [ ] CL-01: 全部 score.json 正確載入並彙整 — R1.1-R1.2 → T1.1-T1.2 — Result: `NOT RUN`
- [ ] CL-02: 實質相同的問題被正確去重合併 — R1.3 → T1.3 — Result: `NOT RUN`
- [ ] CL-03: 優化計劃按 severity + frequency 排序 — R1.4 → T1.4 — Result: `NOT RUN`
- [ ] CL-04: 每個去重問題有具體的 suggestedFix — R1.4 → T1.5 — Result: `NOT RUN`
- [ ] CL-05: spec SKILL.md 優化後通過 frontmatter 驗證 — R2.2 → T2.3 — Result: `NOT RUN`
- [ ] CL-06: apltk 工具優化後 npm test 全部通過 — R3.2 → T3.3 — Result: `NOT RUN`
- [ ] CL-07: apltk CLI 公開介面向後相容 — R3.3 → T3.4 — Result: `NOT RUN`

## Hardening Checklist

- [ ] Regression tests for bug-prone/high-risk behavior: SKILL.md 修改後的功能回歸
- [ ] Unit drift checks for non-trivial tasks: 優化前後 CLI 輸出 diff
- [ ] Property-based coverage for business logic: `N/A`
- [ ] External services mocked/faked: 評分模型（用於生成 suggestedFix）
- [ ] Adversarial cases for abuse paths: `N/A`
- [ ] Authorization, idempotency, concurrency risks evaluated: `N/A`
- [ ] Assertions verify outcomes/side-effects: 去重正確性、CLI 相容性
- [ ] Fixtures reproducible: 使用固定評分結果 dataset

## E2E / Integration Decisions

- [ ] 完整優化流程（讀取結果 → 去重 → 優化 → 驗證）: E2E — Reason: 端到端驗證
- [ ] 去重準確率（用已知重複 dataset 測試）: Integration replacement — Reason: 驗證去重演算法

## Execution Summary

- [ ] Unit: `NOT RUN`
- [ ] Regression: `NOT RUN`
- [ ] Property-based: `N/A`
- [ ] Integration: `NOT RUN`
- [ ] E2E: `NOT RUN`
- [ ] Mock scenarios: `NOT RUN`
- [ ] Adversarial: `N/A`

## Completion Records

- [ ] Task 1 (彙整去重): pending — Remaining: None
- [ ] Task 2 (SKILL.md 優化): pending — Remaining: None
- [ ] Task 3 (apltk 工具優化): pending — Remaining: None

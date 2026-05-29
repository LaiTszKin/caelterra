# Checklist: 技能評測核心 (Skill Eval Core)

- **Date**: 2026-05-29
- **Feature**: 自動化技能評測 — 出題、執行、評分
- **Source SPEC**: `docs/plans/2026-05-29/skill-eval-optimizer/eval-core/SPEC.md`

> **Purpose:** 驗證策略——定義如何確認實作滿足了 SPEC.md 的業務需求。

---

## Usage Notes

- 測試使用 Node.js 原生 `node:test` + `node:assert/strict`
- 所有檔案系統測試使用 `fs.mkdtempSync()` 隔離
- CLI 輸出測試使用 memory streams 捕捉 stdout/stderr
- 外部 API 呼叫全部 mock（使用 fake HTTP server 或 mock fetch）

---

## Behavior-to-Test Checklist

對照 SPEC.md 中的每個 BDD 需求：

| ID | 可觀察行為 | SPEC 需求 | 對應測試 | 結果 |
|---|---|---|---|---|
| CL-01 | 從 JSON 檔案載入題庫，驗證格式正確 | R1.1, R1.2 | Unit: `loadQuestions()` valid + invalid input | `NOT RUN` |
| CL-02 | 題庫為空時拋出明確錯誤 | Error case | Unit: `loadQuestions()` with empty array | `NOT RUN` |
| CL-03 | 按模式抽取指定數量題目（快速 3-5，標準 8-12） | R1.3, R1.4 | Unit: `sampleQuestions(questions, mode)` | `NOT RUN` |
| CL-04 | LLM 變體生成保留原始評分標準 | R1.3 | Integration: mock judge API, verify scoringCriteria passthrough | `NOT RUN` |
| CL-05 | 執行模型調用成功時記錄完整 trace JSONL | R2.1, R2.2 | Unit: verify trace.jsonl structure after mock exec | `NOT RUN` |
| CL-06 | 執行模型超時記錄為 timeout 狀態並繼續 | R2.3, Error case | Unit: AbortController timeout scenario | `NOT RUN` |
| CL-07 | 執行模型 API 錯誤不阻塞其他題目 | R2.3 | Unit: concurrent execution with one failing API call | `NOT RUN` |
| CL-08 | 並發控制限制同時執行數 | R2.4 | Unit: `promisePool()` with concurrency limit | `NOT RUN` |
| CL-09 | 評分模型從三維度產出結構化 score.json | R3.1-R3.4 | Unit: `buildJudgePrompt()` output format, `parseJudgeOutput()` fallbacks | `NOT RUN` |
| CL-10 | 評分模型輸出非 JSON 時多層 fallback 解析 | R3.5, Error case | Unit: `parseJudgeOutput()` with malformed inputs | `NOT RUN` |
| CL-11 | 已完成評分的題目不重複評分 (.scored marker) | R3.5 | Unit: `scoreSingleTest()` skip logic | `NOT RUN` |
| CL-12 | 產出結構化 Markdown 報告含總分和各題明細 | R3.5 | Unit: report template rendering with mock scores | `NOT RUN` |
| CL-13 | 題庫 JSON 格式無效時拋出明確錯誤 | Error case | Unit: `loadQuestions()` with malformed JSON | `NOT RUN` |
| CL-14 | 磁碟空間檢查（可選，low priority） | Error case | N/A (deferred) | `N/A` |

---

## Hardening Checklist

- [ ] 回歸測試 for `parseJudgeOutput()` fallback chain (已有 bug history: JSON parse failures silently swallowed)
- [ ] 回歸測試 for `stripScoringCriteria()` 確保不洩漏 scoringCriteria 和 difficulty 欄位
- [ ] Unit drift checks for trace JSONL schema (確保新增欄位不破壞向後兼容)
- [ ] Property-based coverage for `jaccardSimilarity()` edge cases (empty sets, identical sets, disjoint sets)
- [ ] 外部服務 mocked/faked: Exec Model API, Judge Model API 全部使用 mock HTTP
- [ ] Adversarial cases for judge prompt injection (惡意 agent 輸出的 content 包含 judge 指令)
- [ ] 授權、冪等性、並行風險已評估: `.scoring-lock` mkdir mutex 的跨平台行為 (Windows vs Unix)
- [ ] Assertions verify outcomes/side-effects: 檢查 JSONL 行數、score.json 結構、REPORT.md 內容
- [ ] Fixtures reproducible: 使用 fixed seed 的 mock API responses

---

## E2E / Integration Decisions

| Flow/Risk | 測試層級 | 理由 |
|---|---|---|
| 完整評測流程 (出題→執行→評分→報告) | Integration (mock APIs) | 驗證模組間資料傳遞正確性（JSONL → score.json → REPORT.md） |
| 真實 API 呼叫 | E2E (optional, manual) | 成本高且有網路依賴，僅在重大改版前手動執行 |
| 並發執行 + 評分正確性 | Integration (mock APIs with concurrency) | 驗證 promise pool 和 file lock 正確性 |
| 題庫 LLM 變體生成 | Integration (mock judge API) | 驗證變體保留原始評分標準的 fidelity |

---

## Execution Summary

| 測試類型 | 狀態 |
|---|---|
| Unit | `NOT RUN` |
| Regression | `NOT RUN` |
| Property-based | `NOT RUN` |
| Integration | `NOT RUN` |
| E2E | `NOT RUN` |
| Mock scenarios | `NOT RUN` |
| Adversarial | `NOT RUN` |

---

## Completion Records

| Flow/Group | 狀態 | 剩餘 |
|---|---|---|
| 題庫管理 (R1) | pending | Unit tests for load/sample/variant |
| 評測執行 (R2) | pending | Unit + Integration tests for executor |
| 評分與報告 (R3) | pending | Unit + Integration tests for scorer + reporter |
| 錯誤處理 | pending | Error case coverage |

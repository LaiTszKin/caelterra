# Checklist: 優化引擎與系統整合 (Optimize & Integrate)

- **Date**: 2026-05-29
- **Feature**: 評測結果驅動的優化 diff、CLI 介面、CI/CD 整合
- **Source SPEC**: `docs/plans/2026-05-29/skill-eval-optimizer/optimize-and-integrate/SPEC.md`

> **Purpose:** 驗證策略——定義如何確認實作滿足了 SPEC.md 的業務需求。

---

## Usage Notes

- CLI 測試使用 memory streams 捕捉 stdout/stderr
- 檔案系統測試使用 `fs.mkdtempSync()` 隔離（含 mock SKILL.md）
- CI workflow 測試使用 `act` 或 manual trigger on PR
- Judge model API mock 用於優化 diff 生成測試

---

## Behavior-to-Test Checklist

對照 SPEC.md 中的每個 BDD 需求：

| ID | 可觀察行為 | SPEC 需求 | 對應測試 | 結果 |
|---|---|---|---|---|
| CL-01 | 從 score.json 提取問題、按優先級排序 | R1.1, R1.2 | Unit: `extractIssues()` + `deduplicateIssues()` | `NOT RUN` |
| CL-02 | Jaccard 語意去重合併相似問題 | R1.2 | Unit: `jaccardSimilarity()` edge cases | `NOT RUN` |
| CL-03 | 產出 optimization-plan.json 含優先級排序 | R1.5 | Unit: `generateOptimizationPlan()` output structure | `NOT RUN` |
| CL-04 | 生成 FIND/REPLACE diff 僅限技能目錄檔案 | R1.3 | Unit: `mapIssuesToFiles()` whitelist enforcement | `NOT RUN` |
| CL-05 | dry-run 模式僅寫 patch 不修改原始檔 | R1.4 | Unit: verify no source files modified under --dry-run | `NOT RUN` |
| CL-06 | 優化前自動備份原始檔案 | R1.5 | Unit: verify .bak file exists before modification | `NOT RUN` |
| CL-07 | `apltk eval spec` 執行快速模式評測 | R2.1, R2.2 | Integration: CLI invocation with mock exec + judge APIs | `NOT RUN` |
| CL-08 | `apltk eval spec --mode standard` 使用 8-12 題 | R2.1 | Integration: verify question count in standard mode | `NOT RUN` |
| CL-09 | `apltk eval spec --optimize --dry-run` 產出優化 patch | R2.3 | Integration: verify patch file output | `NOT RUN` |
| CL-10 | 不指定 skill_name 時顯示可用技能列表 | R2.4 | Unit: CLI help / list output | `NOT RUN` |
| CL-11 | PR 修改技能檔案時 CI 觸發評測 | R3.1 | Integration: GitHub Actions `paths:` filter test | `NOT RUN` |
| CL-12 | PR 未修改技能檔案時 CI 跳過評測 | R3.1 | Integration: verify workflow skipped | `NOT RUN` |
| CL-13 | 評測總分低於門檻時 CI 回報失敗 | R3.2 | Integration: mock low score scenario | `NOT RUN` |
| CL-14 | CI 失敗時在 PR 評論張貼報告摘要 | R3.4 | Integration: verify PR comment content | `NOT RUN` |
| CL-15 | 寫入操作被 mock 攔截並回傳模擬成功 | R4.1 | Unit: mock tool dispatcher intercepts Write/Edit | `NOT RUN` |
| CL-16 | 讀取操作真實執行（讀檔、搜尋） | R4.1 | Unit: read tool passthrough in mock dispatcher | `NOT RUN` |
| CL-17 | 評分模型上下文不包含被評測模型的對話歷史 | R4.2 | Unit: verify judge prompt only contains trace + scoring criteria | `NOT RUN` |
| CL-18 | 優化 diff 合併衝突時保留雙方版本 | Error case | Unit: conflict resolution behavior | `NOT RUN` |
| CL-19 | CLI 收到無效 skill_name 顯示錯誤 | Error case | Unit: CLI error output for invalid skill | `NOT RUN` |
| CL-20 | CI 缺少 .env 時跳過評測不阻塞 PR | Error case | Integration: CI workflow missing env vars | `NOT RUN` |

---

## Hardening Checklist

- [ ] 回歸測試 for FIND/REPLACE 解析 (空白差異、多行匹配、特殊字符)
- [ ] 回歸測試 for post-optimization validation (YAML frontmatter、CLI interface、npm test)
- [ ] Unit drift checks for `optimization-plan.json` schema (確保新欄位向後兼容)
- [ ] Property-based coverage for `jaccardSimilarity()` with real-world issue descriptions
- [ ] 外部服務 mocked/faked: Judge Model API (optimize prompt)，GitHub CLI (gh pr comment)
- [ ] Adversarial cases: 惡意 judge model 輸出含程式碼注入的 FIND/REPLACE block
- [ ] 授權、冪等性、並行風險已評估: 兩個 CI job 同時執行優化（file lock）
- [ ] Assertions verify outcomes: `.bak` 存在、patch 內容、exit code
- [ ] Fixtures reproducible: fixed skill files + fixed score.json

---

## E2E / Integration Decisions

| Flow/Risk | 測試層級 | 理由 |
|---|---|---|
| CLI 全流程 (出題→執行→評分→優化) | Integration (mock APIs) | 驗證端到端資料流和 exit code 正確性 |
| PR 閘門 GitHub Actions workflow | Manual / `act` | CI 整合涉及外部平台，自動化測試覆蓋有限 |
| 工具模擬層 (read real / write mock) | Integration (mock tool registry) | 驗證 dispatcher 正確分類工具類型 |
| 優化 diff 應用到真實 SKILL.md | Integration (tmp skill dir) | 驗證 FIND/REPLACE 匹配和備份復原 |

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
| 優化 diff 生成 (R1) | pending | Unit + Integration tests for optimizer |
| CLI 命令 (R2) | pending | Unit + Integration tests for CLI handler |
| PR 閘門 (R3) | pending | Integration test + manual workflow validation |
| 上下文隔離 (R4) | pending | Unit tests for isolation layer |
| 錯誤處理 | pending | Error case coverage |

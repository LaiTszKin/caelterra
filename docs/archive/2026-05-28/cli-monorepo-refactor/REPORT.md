# Review Report

- **Spec**: CLI Monorepo Refactor (Package Architecture & Foundation + Tool Decoupling & External Dependencies)
- **Date**: 2026-05-29
- **Reviewer**: Claude Code Review Agent
- **Verdict**: Needs Attention

---

## 判決說明

**Verdict**: Needs Attention

有 3 個 P1 問題需要在合併前處理：yargs 整合未完成（依賴已安裝但完全未使用）、根 tsconfig.json 未納入工具 package 的 project references、`extract-codex-conversations` 別名 package 遺漏。另有 9 個 P2 問題涉及依賴管理、死代碼清理和啟動性能。

核心功能（CLI 命令路由、工具執行、安裝/卸載）在當前手寫解析器下可正常運作，174 個測試全部通過。主要缺口在於 DESIGN.md 定義的 yargs 遷移未完成。

---

## 發現的問題

### P1 — 重要問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 1 | **yargs 列為依賴但完全未被 import 或使用**。`packages/cli` 仍使用手寫 `parseArguments()` (367 行) 解析命令。所有 19 個工具 package 匯出的 `yargsCommand` 物件從未被 CLI 層讀取，為完全的死代碼。這違反 Spec 2 R2.1 和 DESIGN.md INT-002 的架構目標。 | CLI 命令解析停留在手寫階段，yargs 約 372KB 依賴為純死重。 | `packages/cli/index.ts`, `packages/tools/*/index.ts` (19 個檔案) | — | 實作偏移、幻覺代碼、架構瑕疵 |
| 2 | **根 `tsconfig.json` 未納入 19 個工具 package 的 project references**。`tsc --build` 從根目錄僅編譯 tui、tool-registry、tool-utils、cli，不會自動編譯任何工具 package。`packages/cli/tsconfig.json` 亦未宣告對工具 package 的 references，但 `tool-registration.ts` 靜態 import 所有 19 個工具。 | CI/CD 中 `npm run build` 不會編譯工具 package；開發者需手動進入每個工具目錄編譯。 | `tsconfig.json` (根), `packages/cli/tsconfig.json` | — | 實作遺漏、架構瑕疵 |
| 3 | **`extract-codex-conversations` 別名 package 未建立**。PROMPT.md T10.5 明確要求建立此別名 package（指向 extract-conversations），但 `packages/tools/extract-codex-conversations/` 目錄不存在。原始 CLI 中 `extract-codex-conversations` 和 `extract-skill-conversations` 是 `extract-conversations` 工具的別名。 | `apltk extract-codex-conversations` 命令將無法識別。 | `packages/cli/tool-registration.ts` | — | 實作遺漏 |

### P2 — 一般問題

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 4 | **所有 19 個工具在 CLI 啟動時靜態載入**。`packages/cli/tool-registration.ts` 以頂層 `import` 載入全部工具，`registerAllTools()` 在模組載入時立即執行。執行 `apltk install` 或 `apltk --help` 也需要載入所有工具（包括 docs-to-voice、render-katex 等不相關的工具）。 | 每次 CLI 啟動增加約 50-200ms 延遲；測試檔案僅 import `parseArguments` 也會觸發完整工具載入。 | `packages/cli/tool-registration.ts`, `packages/cli/index.ts` | L1-22, L30 | 性能隱患 |
| 5 | **15 個工具 package 宣告了未使用的 `@laitszkin/tool-utils` 依賴**。僅 4 個工具（filter-logs、search-logs、validate-skill-frontmatter、validate-openai-agent-config）實際 import 了 tool-utils。其餘 15 個工具的 package.json 中該依賴為冗余。 | 增加不必要的依賴耦合與 package.json 維護負擔。 | `packages/tools/{15 個工具}/package.json` | — | 冗余代碼、架構瑕疵 |
| 6 | **`validate-openai-agent-config` import `js-yaml` 但未在其 package.json 中宣告**。該依賴僅存在於根 package.json（巧合可用）。若根 package.json 移除 js-yaml，此工具將在執行時崩潰。 | 違反 npm workspaces 依賴聲明原則，存在執行期破裂風險。 | `packages/tools/validate-openai-agent-config/package.json`, `index.ts` | L3 | 架構瑕疵 |
| 7 | **`js-yaml` 被錯誤列為 `packages/cli` 的依賴**。cli 模組中沒有任何檔案 import js-yaml，該依賴屬於 validate-openai-agent-config 工具。 | 依賴歸屬錯誤，增加 cli package 的不必要體積。 | `packages/cli/package.json` | — | 冗余代碼 |
| 8 | **遺留的舊建置產物與廢棄檔案**。`bin/apollo-toolkit.js` (CJS 舊入口) 和 `dist/lib/` 目錄（已刪除源碼的殘留建置產物）仍存在。 | 可能誤導開發者；佔用不必要的磁碟空間。 | `bin/apollo-toolkit.js`, `dist/lib/` | — | 冗余代碼 |
| 9 | **`elkjs` 在根 package.json 列為依賴但未被任何 monorepo package 使用**。僅在舊 `skills/init-project-html/lib/atlas/layout.js` 中引用（非 workspace package 的一部分）。 | 7.7MB 死依賴增加 npm install 時間。 | `package.json` (根) | — | 冗余代碼、性能隱患 |
| 10 | **`buildToolOverview` 和 `buildToolExamples` 是死導出**。在 `packages/tool-registry/registry.ts` 中定義並從 index.ts 重新導出，但 CLI 從未 import 或使用這兩個函數。 | 死代碼增加維護負擔。 | `packages/tool-registry/registry.ts` | L59, L87 | 幻覺代碼 |
| 11 | **5 個工具的 `yargsCommand.handler` 忽略 `argv` 參數，改用 `process.argv.slice(2)`** (docs-to-voice、render-katex、render-error-book、generate-storyboard-images、enforce-video-aspect-ratio)。這在當前是死代碼（yargsCommand 未被執行），但若未來啟用 yargs 整合，這些 handler 將有錯誤行為。 | 潛在的未來 bug：當 yargs 整合啟用時，這些 handler 會忽略解析後的參數。 | `packages/tools/{5 個工具}/index.ts` | — | 幻覺代碼 |
| 12 | **`architecture` 工具的 `yargsCommand.handler` 跳過 `argv._` 位置參數**。architecture 工具依賴 `diff` 等子命令作為位置參數，但 handler 將 `_` 鍵跳過。當前為死代碼，但若啟用 yargs 將導致功能缺失。 | 潛在的未來 bug：`architecture diff` 無法正確傳遞子命令。 | `packages/tools/architecture/index.ts` | L37-53 | 幻覺代碼 |

### P3 — 建議改善

| # | 問題描述 | 影響 | 檔案 | 行數 | 審查維度 |
|---|--------|------|------|------|---------|
| 13 | **函數命名 `promptForModes` 與 SPEC R3.1 的 `promptForSelectableModes` 不一致**。DESIGN.md 和 CHECKLIST.md 已使用新名稱，但 SPEC 文字未同步更新。不影響功能。 | 文檔不一致，對實作無影響。 | `packages/tui/prompts.ts` | — | 實作偏移 |
| 14 | **SPEC 聲稱「20 個工具」但實際僅 19 個**。原始 `lib/tools/` 目錄含 19 個工具檔案 + 1 個共用工具 (log-cli-utils.ts)。SPEC 將共用工具錯誤計入。 | 文檔計數錯誤。 | `docs/plans/.../SPEC.md` | — | 實作偏移 |
| 15 | **SPEC 1 中 ESM 遷移同時出現在 In Scope 與 Out of Scope**。兩處文字完全一致，為 SPEC 內部矛盾。實作正確選擇了 In Scope 方向。 | SPEC 品質問題，對實作無影響。 | `docs/plans/.../SPEC.md` | L21, L31 | 實作偏移 |
| 16 | **所有 `yargsCommand.handler` 傳遞空 context `{}`**。若 yargs 路徑被啟用，工具將無法使用自訂 stdout/stderr。handler 內部有 `|| process.stdout` fallback 作為緩解。 | 邊界情況下的輸出不正確（當前為死代碼）。 | `packages/tools/*/index.ts` (19 個檔案) | — | 幻覺代碼 |

---

## 審查維度摘要

- **幻覺代碼**: 4 個 finding — yargsCommand 全體為死代碼 (P1#1)；`buildToolOverview`/`buildToolExamples` 死導出 (P2#10)；5 個工具的 handler 忽略 argv (P2#11)；architecture handler 跳過位置參數 (P2#12)；空 context 傳遞 (P3#16)
- **冗余代碼**: 4 個 finding — 15 個工具冗余 tool-utils 依賴 (P2#5)；js-yaml 錯放在 cli (P2#7)；遺留舊建置產物 (P2#8)；elkjs 死依賴 (P2#9)
- **實作偏移**: 3 個 finding — yargs 未整合 (P1#1)；promptForModes 命名 (P3#13)；SPEC 內部矛盾 (P3#14, P3#15)
- **實作遺漏**: 3 個 finding — tsconfig 缺工具 references (P1#2)；extract-codex-conversations 別名缺失 (P1#3)；yargs 整合未完成 (P1#1)
- **架構瑕疵**: 3 個 finding — yargs 死代碼違反 INT-002 (P1#1)；tsconfig references 不完整 (P1#2)；validate-openai-agent-config 缺少 js-yaml 依賴宣告 (P2#6)；15 個工具冗余 tool-utils 依賴 (P2#5)
- **性能隱患**: 3 個 finding — 啟動時載入全部工具 (P2#4)；elkjs 死依賴 (P2#9)；tsconfig 缺工具 references 影響編譯效能

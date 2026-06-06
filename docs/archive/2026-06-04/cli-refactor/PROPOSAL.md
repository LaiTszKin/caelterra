# Proposal: CLI 工具全面重構

- **Date**: 2026-06-04
- **Source**: Produced by the `discuss` skill through structured conversation

---

## 1. Scope

### In Scope

- **內部程式碼抽象化**：在不改變現有 package 邊界（`cli`、`tool-registry`、`tool-utils`、`tools/*`、`tui`）的前提下，對各模塊內部進行抽象與簡化。
- **消除 hardcode**：將散落在各處的硬編碼常數、路徑、字串提煉為可管理的抽象層。
- **一致的程式碼風格**：統一整個 monorepo 的命名慣例、錯誤處理模式、函數組織方式。
- **建立跨平台抽象層**：路徑處理、檔案系統操作、子行程呼叫、TTY 偵測等平台相關邏輯集中在一個模塊，確保 Windows 與 macOS 行為一致。
- **補強測試**：
  - 單元測試覆蓋率 >= 80%
  - 整合測試覆蓋主要使用者路徑（install、uninstall、各 tool 執行）
  - GitHub Actions CI 矩陣（ubuntu + windows-latest）
- **版本號提升至 v5.0.0**（major bump，反映內部結構重大變更）

### Out of Scope (Explicitly Excluded)

- **模塊邊界重劃分**：不進行 package 層級的合併、拆分或重新命名——這留待後續階段處理。
- **技能優化工具**（`eval` 相關）：現有實作尚未完成，不納入本次重構範圍。
- **CLI 外部介面變更**：指令名稱、參數簽名、配置檔格式等對外介面維持不變。
- **新增功能**：本次僅做結構改善，不引入任何新功能。

---

## 2. User Scenarios

### Target Users

本次重構的使用者是**開發者（就是你本人）**。終端使用者的操作體驗不應有任何變化。

### Typical Flow

1. 開發者修改某個 tool 的內部邏輯
2. 執行 `npm test`——單元測試快速驗證更動是否正確
3. 執行 CI（本地或 GitHub Actions）確認跨平台整合測試通過
4. 提交 PR，合併後安心睡覺

### Success Criteria

- 開發者新增一個指令時，只需撰寫核心邏輯，不需要手動處理樣板（參數註冊、錯誤處理、輸出格式化）。
- 修改一個現有指令時，不需要先花 30 分鐘讀懂整個流程才能下手。
- `npm test` 全部通過（>= 80% 覆蓋率）+ CI matrix 全部通過。
- 合併後沒有半夜被叫起來修 regression。

### Error Handling

- 測試失敗時，CI 會明確指出失敗的作業系統、測試名稱、斷言行數，開發者可以直接定位問題。
- 單元測試失敗提供明確的斷言訊息，不需要去讀測試框架原始碼。

---

## 3. Constraints

- **版本策略**：以 major bump（v4.1.4 → v5.0.0）為目標，過程中可逐步合併，累積到可發佈狀態再釋出。
- **平台支援**：必須在 macOS 和 Windows 上都能通過測試。以 GitHub Actions matrix（ubuntu-latest + windows-latest）為驗證閘門。
- **無 CI 成本限制**：使用 GitHub Actions 免費配額即可，不引入外部付費服務。
- **區域 / 語言**：無限制，CLI 工具以英文為主，但不需要多語言支援。
- **安全 / 隱私**：不處理金流或個人可識別資訊。

---

## 4. Business Value

### Problem Statement

目前 CLI 程式碼缺少抽象層、充斥 hardcode、風格不一致，導致每改一點功能都需要花大量時間理解程式碼才能確定修改的影響範圍，開發效率低落，且不敢任意改動。

### 衡量標準

1. **單元測試覆蓋率 >= 80%**（客觀指標）
2. **可以安心合併**——不會因為一次重構修了 A 卻炸了 B，不用擔心隔天醒來有人回報問題

---

## 5. Functional Module Design

根據現有 monorepo package 結構，將重構拆解為以下 5 個功能模組。每個模組對應一個或多個現有 package，模組之間的關係以依賴方向表示。

```
                     ┌───────────────────────────────┐
                     │     指令註冊與派發層           │
                     │  (packages/cli)                │
                     │  指令樹定義、參數 schema、      │
                     │  dispatch 到對應 handler       │
                     └──────┬────────────────────────┘
                            │ 調用
              ┌─────────────┼────────────────┐
              ▼              ▼                 ▼
   ┌──────────────────┐ ┌────────────┐ ┌──────────────┐
   │  工具執行層       │ │ 安裝/解除   │ │  驗證框架    │
   │ (packages/tools/*)│ │ 安裝引擎    │ │ (tool-utils  │
   │ 各 tool 的        │ │ (packages/  │ │  + 各 tool)  │
   │ 業務邏輯          │ │ cli 內部)   │ │ 輸入驗證、    │
   └────────┬─────────┘ └──────┬──────┘ │ schema 檢查  │
            │                  │        └──────────────┘
            └────────┬─────────┘
                     ▼
           ┌──────────────────┐
           │  共用基礎層       │
           │ (packages/        │
           │  tool-utils)      │
           │ 錯誤處理、格式轉換 │
           │ 檔案操作、網路請求 │
           └────────┬─────────┘
                    ▼
           ┌──────────────────┐
           │ 終端 UI 層       │
           │ (packages/tui)   │
           │ 輸出格式化、顏色、 │
           │ 進度條、TTY 偵測  │
           └──────────────────┘

      ═══════════════════════════════
      測試基礎建設 (貫穿所有層)
      ┌──────────────────────────────┐
      │  • 單元測試 (>= 80% 覆蓋率)  │
      │  • 整合測試 (process I/O)     │
      │  • CI matrix (ubuntu + win)  │
      └──────────────────────────────┘
```

### 模組說明

#### M1: 指令註冊與派發層（`packages/cli`）

**職責**：定義完整的指令樹結構、管理參數 schema、將使用者輸入分派到對應的 handler 函數。

**重構重點**：
- 建立集中的指令註冊機制，取代目前可能散落在各處的 if-else/switch dispatch
- 引入統一的參數宣告格式（schema-based），讓參數定義、help 文字生成、驗證三者來自同一份宣告
- 建立錯誤邊界（error boundary），確保未捕捉的例外不會導致髒當機

**依賴**：→ M2（呼叫工具邏輯）→ M3（呼叫安裝邏輯）→ M4（使用共用工具）

#### M2: 工具執行層（`packages/tools/*`，共 19 個工具）

**職責**：各 tool 的核心業務邏輯，例如 codegraph 的程式碼分析、architecture 的 diff/merge、filter-logs 的日誌過濾等。

**重構重點**：
- 每個 tool 統一入口：接受結構化輸入、回傳結構化輸出、由派發層處理 I/O
- 移除各 tool 中自行處理參數解析、輸出格式化的重複程式碼——這些由 M1 和 M5 負責
- 確保各 tool 內部風格一致（錯誤拋例外而非 `console.error + process.exit`）

**依賴**：→ M4（使用共用工具函數）→ M5（使用輸出的格式化）

#### M3: 安裝/解除安裝引擎（`packages/cli` 內部的 install/uninstall 子系統）

**職責**：將 skills 安裝到目標環境（codex / openclaw / trae / agents / claude-code），以及從目標環境移除。

**重構重點**：
- 將「目標環境」抽象為一組 interface（每種環境實作 install/uninstall/sync）
- 消除各目標之間複製貼上的安裝邏輯
- 支援 atomic sync（要嘛全部成功、要嘛全部復原）

**依賴**：→ M4（檔案操作、路徑處理）→ M5（進度顯示）

#### M4: 共用基礎層（`packages/tool-utils`）

**職責**：跨工具共享的基礎函數——檔案系統操作、路徑處理、外部行程呼叫、錯誤類型定義、資料格式轉換。

**重構重點**：
- 建立 `cross-platform` 子模組：統一封裝 `path`、`os.EOL`、`spawn` 的跨平台行為
- 定義統一的 `AppError` 層級（可區分使用者錯誤 vs 系統錯誤 vs 預期外錯誤）
- 清理目前可能存在的未使用或重複的 utility 函數

**依賴**：→ M5（使用格式化輸出記錄日誌）

#### M5: 終端 UI 層（`packages/tui`）

**職責**：所有終端輸出——格式化文字、顏色、圖示、進度條、表格、TTY 偵測。

**重構重點**：
- 統一輸出函數：`stdout()`、`stderr()`、`info()`、`warn()`、`error()`，自動處理顏色支援判定
- 提供結構化輸出模式（`--json` flag 支援）靜態分析工具輸出
- 進度條 / spinner 抽象化：自動降階為純文字當非 TTY 或 Windows 舊終端

### 貫穿模組：測試基礎建設

**職責**：不屬於任何單一模組，而是服務所有模組。

- **單元測試**：針對 M1-M5 的核心邏輯撰寫，使用 `node:test` + 假物件（mock/stub）取代外部依賴
- **整合測試**：實際 spawn CLI 行程，驗證完整的 stdin → stdout/stderr → exit code 流程
- **跨平台 CI**：`.github/workflows/` 中建立 matrix 設定（ubuntu-latest + windows-latest），每個 PR 自動執行完整測試套件

---

## 6. Open Questions

- 重構的先後順序建議：M5（終端 UI）→ M4（共用基礎層）→ M1（派發層）→ M3（安裝引擎）→ M2（各工具），確保底層抽象先到位，上層再依賴它們。你是否同意這個順序？
- 是否需要考慮 Node.js 的最低版本要求？目前 `package.json` 中未宣告 `engines` 欄位，是否順便補上？

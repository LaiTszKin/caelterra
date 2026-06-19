# Integrated Property-Based Testing (Stateful PBT)

## 概念

傳統 PBT 測試純函式：給定輸入 → 驗證輸出。但多數系統是**有狀態的**——行為依賴於當前狀態，且操作之間有順序依賴。

Integrated PBT（又稱 Stateful / State Machine PBT）將測試提升到流程層級：產生**隨機操作序列**，在每一步驗證系統狀態是否正確。它同時涵蓋了業務不變性、流程正確性，且有潛力覆蓋效能與併發正確性。

## 適用場景

- **跨多個步驟的業務流程**：如訂單建立 → 付款 → 出貨，每個步驟的狀態轉移需正確
- **有明確不變性（invariant）的系統**：如帳戶總金額守恆、庫存數量不為負
- **狀態機核心的領域邏輯**：工作流引擎、訂單狀態機、遊戲邏輯
- **資料庫或儲存系統**：CRUD 操作的正確性、資料同步
- **需要併發正確性驗證的系統**：race condition、deadlock

## 不適用場景

- 純粹的無狀態函式（傳統 PBT 或單元測試即可）
- 以 UI 為主的互動（E2E 更適合）
- 系統無明確的可描述不變性

## 工作方式

### 1. 建立 Model（參考狀態機）

定義系統的抽象 model，通常是一個 state machine：

```
Model 狀態：當前系統中所有相關的狀態變數
Actions/Commands：系統允許的操作（含 precondition）
Postconditions：每個操作後的狀態檢查
Invariants：無論執行什麼操作序列都必須成立的規則
```

### 2. 產生操作序列

PBT 框架自動產生隨機的操作序列，遵從 precondition 約束（如不能在空的購物車上結帳）。

### 3. 執行並驗證

對每個操作：

1. 確認 precondition 滿足
2. 在 model 和真實系統上同時執行該操作
3. 比對兩者的結果與狀態
4. 檢查 invariants 仍成立

### 4. Shrinking

若發現失敗，框架自動縮減操作序列到最小重現步驟。

## 三種整合層級

| 層級               | 測試內容                                  | 範例                                           |
| ------------------ | ----------------------------------------- | ---------------------------------------------- |
| **Sequential**     | 單執行緒操作序列的正確性                  | 建立訂單 → 修改 → 取消，每一步狀態正確         |
| **Contract + PBT** | 跨模組邊界的不變性                        | 對模組 A 的合約進行 PBT，同時驗證模組 B 的行為 |
| **Concurrent**     | 多執行緒下的操作正確性（linearisability） | 多個使用者同時操作同一帳戶，最終結果一致       |

## Concurrent PBT 與效能

Concurrent PBT（也稱為 linearisability testing）透過多執行緒同時執行隨機操作並記錄歷史，然後檢查是否存在合法的 sequential interleaving。

雖然它的主要目的是驗證併發正確性，但它也間接提供了效能相關的驗證：

- 若系統在併發下 throughput 顯著退化，操作序列會 timeout 或 fail
- 長時間執行的操作會觸發測試框架的 timeout 機制，暴露效能瓶頸

## 參考實作

| 語言    | 函式庫                                       | 特色                                                |
| ------- | -------------------------------------------- | --------------------------------------------------- |
| Python  | Hypothesis `RuleBasedStateMachine`           | 內建 stateful testing，bundles + rules + invariants |
| Rust    | proptest-stateful                            | Readyset 出品，有真實資料庫 replication 測試案例    |
| Haskell | QuickCheck state machine / hedgehog-lockstep | 最成熟的 stateful PBT 生態，支援 concurrent testing |
| Java    | jqwik stateful testing                       | 內建 `ActionSequence`，支援 model-based testing     |
| Erlang  | PropEr state machine                         | 工業級應用，Erlang/OTP 生態                         |

## 決策流程

```
系統有跨多步驟的狀態轉移？
  ├── 是 → Invariants 是否可描述？
  │   ├── 是 → Integrated PBT（stateful / state machine testing）
  │   └── 否 → 傳統整合測試
  └── 否 → 一般 PBT 或單元測試
```

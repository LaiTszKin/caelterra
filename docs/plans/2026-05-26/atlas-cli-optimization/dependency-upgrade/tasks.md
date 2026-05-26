# Tasks: 依賴升級

- Date: 2026-05-26
- Feature: 依賴升級

## **Task 1: 更新 package.json 版本號**

Purpose: 升級 `@types/node` 和 `engines.node` 版本
Requirements: R1.1, R1.2
Scope: `package.json`
Out of scope: 不修改其他依賴欄位

- T1.1 [x] **`package.json:devDependencies.@types/node`** — 從 `^25.7.0` 改為 `^25.9.1`
  - Verify: `grep '"@types/node"' package.json` 輸出 `"^25.9.1"`

- T1.2 [x] **`package.json:engines.node`** — 從 `>=18.18` 改為 `>=20.19.0`
  - Verify: `grep '"node"' package.json` 在 engines 區塊輸出 `">=20.19.0"`

## **Task 2: 安裝並驗證**

Purpose: 執行 npm install 更新 lock file，驗證編譯與測試
Requirements: R1.3, R2.1, R2.2, R3.1, R3.2
Scope: `package-lock.json`（自動更新）、編譯輸出
Out of scope: 不修改原始碼

- T2.1 [x] **`npm install`** — 更新 `package-lock.json`
  - Verify: `npm install` 無錯誤退出

- T2.2 [x] **型別檢查** — `npx tsc --noEmit`
  - Verify: 型別檢查通過，無新增錯誤

- T2.3 [x] **測試** — `npm test`
  - Verify: 所有測試通過

- T2.4 [x] **CLI 煙霧測試** — `node dist/bin/apollo-toolkit.js architecture --help` 和 `node dist/bin/apollo-toolkit.js architecture validate`（在有效的 atlas 上）
  - Verify: CLI 正常輸出，無錯誤

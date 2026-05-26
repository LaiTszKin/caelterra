# Spec: 依賴升級

- Date: 2026-05-26
- Feature: 依賴升級
- Owner: [To be filled]

## Goal

將 `@types/node` 升級至最新穩定版本 `^25.9.1`，並將 `engines.node` 最低版本要求更新至 `>=20.19.0`，確保專案依賴與 Node.js 執行環境保持同步。

## Scope

### In Scope
- `@types/node` 從 `^25.7.0` 升級至 `^25.9.1`
- `engines.node` 從 `>=18.18` 升級至 `>=20.19.0`
- `npm install` 更新 `package-lock.json`

### Out of Scope
- 升級 `elkjs`、`js-yaml`、`typescript`（皆已為最新穩定版，無需變更）
- 引入任何新 runtime 或 dev 依賴
- 修改任何 `.js` / `.ts` 原始碼以適配新版型別

## Functional Behaviors (BDD)

### Requirement 1: 依賴版本更新
**GIVEN** Apollo Toolkit repo
**WHEN** 執行 `npm install`
**THEN** `@types/node` 解析至 `^25.9.1` 對應的最新版
**AND** 使用 Node.js >= 20.19.0 時安裝成功無警告

**Uncertainty Level**: Known

**Requirements**:
- [x] R1.1 `package.json` 中 `devDependencies.@types/node` 為 `^25.9.1`
- [x] R1.2 `package.json` 中 `engines.node` 為 `>=20.19.0`
- [x] R1.3 `npm install` 成功完成（無 peer dependency 衝突）

### Requirement 2: 專案可正常編譯與測試
**GIVEN** 依賴已升級
**WHEN** 執行型別檢查與測試
**THEN** 型別檢查通過，無新增錯誤
**AND** 所有現有測試通過

**Uncertainty Level**: Known

**Requirements**:
- [x] R2.1 `npx tsc --noEmit` 通過型別檢查
- [x] R2.2 `npm test` 全部通過

### Requirement 3: CLI 正常運作
**GIVEN** 依賴已升級且專案已編譯
**WHEN** 執行 `apltk architecture --help`
**THEN** 輸出完整的幫助文本
**AND** 退出碼為 0

**Uncertainty Level**: Known

**Requirements**:
- [x] R3.1 `node dist/bin/apollo-toolkit.js architecture --help` 正常輸出
- [x] R3.2 `apltk architecture validate`（在有有效 atlas 的專案上）輸出 `atlas: OK`

## Error and Edge Cases
- [ ] 若使用者 Node.js 版本低於 20.19.0，`npm install` 顯示 engine 警告（非錯誤，不阻斷安裝）
- [ ] `@types/node` 新版不應引入與現有程式碼不相容的型別變更

## Clarification Questions
None — 版本號已在前期研究中確認。

## References
- Official docs:
  - [@types/node versions](https://www.npmjs.com/package/@types/node?activeTab=versions)
  - [Node.js 20.19.0 changelog](https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V20.md)
- Related code files:
  - `package.json` — `devDependencies`、`engines` 欄位

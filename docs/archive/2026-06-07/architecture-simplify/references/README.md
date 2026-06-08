# External References — Architecture CLI Simplification

本設計不引入任何新的外部方法（npm library）或外部 API。所有變更均使用專案既有的依賴：

- **Node.js built-in**: `fs`, `path`, `child_process`（`cli.js` 既存使用）
- **`js-yaml`**: 既存依賴，用於解析/寫入 YAML（已在 `state.js` 中）
- **`@colbymchenry/codegraph`**: 既存依賴，在 `template` handler 中使用（template 退役後不再透過 architecture CLI 呼叫，但仍可透過 `apltk codegraph` 使用）
- **`@laitszkin/tool-utils`**: 既存依賴，在 TS handler 中用於 `UserInputError`/`SystemError`（apply/template 退役後不受影響）

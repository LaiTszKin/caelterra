# Standardized Project Documentation Template

Use this template as the target structure when generating or aligning project documentation. Every document must be grounded in codebase evidence, not assumptions.

## 1. Category Selection Rules

| Category     | Purpose                                     | Writing rule                                                    | Output path                     |
| ------------ | ------------------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| Features     | What the system does for its users          | BDD (Given/When/Then), user perspective, no code references     | `docs/features/<category>.md`   |
| Architecture | How the system is designed at a macro level | Design principles, module responsibilities, boundary rules      | `docs/architecture/<module>.md` |
| Principles   | How code is written and organized           | Recurring patterns, naming conventions, development constraints | `docs/principles/<topic>.md`    |

## 2. Features Template (`docs/features/<category>.md`)

Every feature file must:

- Use a descriptive title that names the functional area.
- Describe only user-visible behavior; never mention file paths, function names, or database tables.
- Use BDD phrasing: **Given** (precondition) → **When** (action) → **Then** (outcome).
- Group related features under subheadings within the file.

```markdown
# <功能類別名稱>

## <功能名稱>

- **Given** <前置條件>
- **When** <使用者操作>
- **Then** <預期結果>

## <功能名稱>

- **Given** <前置條件>
- **When** <使用者操作>
- **Then** <預期結果>
```

### Feature classification guide

To identify feature categories from the codebase:

1. List every user-facing entry point: CLI commands, API routes, UI pages, scheduled jobs, webhook handlers.
2. Group entries by the user goal they serve, not by the module that implements them.
3. Name each group with a term that a user (not a developer) would recognize.

## 3. Architecture Template (`docs/architecture/<module>.md`)

Every architecture file must:

- Use a descriptive title that names the module or layer.
- State design principles, not implementation details.
- Keep each principle macro-level so it survives minor code changes.
- Focus on: module boundaries, data flow direction, integration contracts, and responsibility allocation.

```markdown
# <模組／層名稱> 設計原則

## <原則標題>

<原則描述：這條原則規範什麼、為什麼這樣設計、適用範圍>

## <原則標題>

<原則描述>
```

### Architecture principle test

Before writing a principle, ask: "Would a refactor that renames files or extracts a helper violate this principle?" If yes, the principle is too specific. Rewrite it at a higher level.

## 4. Principles Template (`docs/principles/<topic>.md`)

Every principles file must:

- Use a descriptive title that names the convention area.
- State the convention clearly.
- Provide rationale traceable to the codebase.
- Include a brief example from the codebase (not invented).

```markdown
# <慣例類別>

## <慣例名稱>

<慣例描述>

**理由**: <為什麼採用此慣例>

**範例**: <從repo提取的具體範例>
```

### Principles classification guide

Common principle categories to scan for:

- **命名約定** (`naming-conventions.md`): file naming, variable naming, function naming, type naming
- **程式碼風格** (`coding-style.md`): formatting, import ordering, export conventions, comment usage
- **依賴管理** (`dependency-management.md`): how dependencies are declared, versioning strategy, internal dependency rules
- **錯誤處理** (`error-handling.md`): error creation, propagation, and logging patterns
- **測試慣例** (`testing-conventions.md`): test file placement, naming, mock/stub usage, coverage expectations

## 5. Evidence Checklist

Before finishing any document, confirm:

- [ ] Every feature claim maps to a user-visible entry point found in the codebase.
- [ ] Every architecture principle maps to a real module boundary or design decision visible in the code.
- [ ] Every code principle is supported by at least one concrete example from the codebase.
- [ ] No removed documentation content has been lost without being replaced in the new structure.
- [ ] File titles are descriptive enough to be understood in the table of contents.

## 6. Claim Traceability (證據追溯)

每條文檔記述必須可追溯至實際程式碼來源。使用信心分數模型標記證據強度：

| 信心水準    | 分數 | 定義                                                         | 標記              |
| ----------- | ---- | ------------------------------------------------------------ | ----------------- |
| Direct      | 0.9  | 可直接從程式碼結構驗證（如 router 註冊的 handler）           | 無需標記          |
| Indirect    | 0.7  | 符合已知模式但無明確註冊（如函式簽名吻合 handler interface） | 無需標記          |
| Inferred    | 0.5  | 根據命名慣例或部分結構比對推斷                               | 標記 `[INFERRED]` |
| Speculative | 0.2  | 僅根據關鍵字或註解推測                                       | 省略不寫入文檔    |

**應用方式**：在文檔中無法直接驗證的陳述後加上 `[INFERRED]` 標記。例如：

```markdown
- 使用者註冊後會收到歡迎信 [INFERRED] <!-- 對應 mail/sender.go:45-52 中的 sendWelcomeEmail 呼叫 -->
```

## 7. LLM 安全原則

在文檔產生過程中，只餵給 LLM 結構化中繼資料，不傳輸原始碼完整內容。安全的中繼資料包括：

- 檔案列表與模組邊界
- API 端點路徑與 methods
- 函式簽名與型別定義（不含實作主體）
- 套件依賴關係與資料庫綱要（不含實際資料）

## 8. Removal Rules for Old Documentation

When old documentation exists:

1. If its content has been fully migrated into the new `docs/features/`, `docs/architecture/`, or `docs/principles/` structure, remove it.
2. If it contains content not yet covered by the new structure, migrate that content first, then remove it.
3. If it serves a purpose outside the three categories (e.g., `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`), keep it unless it is stale.
4. Never leave both old and new documentation covering the same topic in place.

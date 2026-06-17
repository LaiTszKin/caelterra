# Module-Internal Restructuring (T2) — Patterns

Restructuring that crosses files but stays within the same module boundary.
Existing integration tests validate behavior — include in the design's task decomposition.

## Extract Shared Logic

A utility or helper repeated across multiple files within the same module.

```typescript
// Before
// file-a.ts: const formatDate = (d) => ...;
// file-b.ts: const formatDate = (d) => ...;

// After
// shared/date.ts: export const formatDate = (d) => ...;
// file-a.ts, file-b.ts: import { formatDate } from '../shared/date';
```

**Placement**: Put shared utilities at the lowest level that all consumers can import without crossing module boundaries.

**Verify**: Integration tests pass; grep confirms all callers updated.

## Consolidate Scattered State

State of the same concept spread across multiple files in the module.

```typescript
// Before
// config.ts — export const API_TIMEOUT = 5000;
// constants.ts — export const DEFAULT_TIMEOUT = 5000;
// settings.ts — const timeout = process.env.API_TIMEOUT ?? 5000;

// After
// config.ts — all timeout definitions in one place:
//   export const API_TIMEOUT = process.env.API_TIMEOUT ?? 5000;
```

**Rule of thumb**: If changing one value means updating N files, the state is scattered.

## Reorganize File Boundaries

A single file has grown to contain multiple concerns; split along cohesion lines.

| Symptom                                                     | Split Strategy                         |
| ----------------------------------------------------------- | -------------------------------------- |
| File has "// validation" and "// formatting" section blocks | One file per concern                   |
| File exports 8+ unrelated functions                         | Group by what they operate on          |
| File contains both types and logic                          | Types → `types.ts`, logic → `logic.ts` |
| File has >300 lines and covers >3 distinct error scenarios  | Split by failure mode                  |

**Naming convention**: `{concern}.ts`, not `{concern}Utils.ts` — the file is the home, not a utility drawer.

## Extract Function Group

Several functions share a common prefix or operate on the same sub-concept.

```typescript
// Before
// order-validator.ts
//   function validateLineItem(item) { ... }
//   function validateShipping(addr) { ... }
//   function validatePromo(code) { ... }

// After
// order-validator.ts — orchestrates validation
// validation/line-item.ts — validateLineItem
// validation/shipping.ts — validateShipping
// validation/promo.ts — validatePromo
```

## Flatten Function Chain

A → B → C → D where each is a single-caller delegation.

```typescript
// Before
function handleRequest(req) {
  return validate(parse(req));
}
function validate(data) {
  return checkSchema(data);
}
function checkSchema(data) {
  return schema.parse(data);
}

// After
function handleRequest(req) {
  return schema.parse(req);
}
```

**Skip if** the chain exists for testability (each function individually mockable) — that's a valid reason.

## Migrate to Early Data Validation

Input validation scattered across processing steps → consolidated at the module boundary.

```typescript
// Before
function process(data) {
  const parsed = parse(data); // validates format
  const enriched = enrich(parsed); // validates completeness
  const saved = save(enriched); // validates constraints
}

// After
function process(data) {
  const validated = validate(data); // single validation pass
  return save(parse(enrich(validated)));
}
```

## Standardize Error Handling

Mixed error patterns (throwing, returning `null`, returning `Result` types) unified within the module.

| Inconsistent                                        | Standardized                              |
| --------------------------------------------------- | ----------------------------------------- |
| Some functions throw, some return null              | All return `Result<T, E>` or all throw    |
| Some validate with `assert`, some with `if...throw` | Uniform validation pattern                |
| Callers don't know which errors to handle           | Documented error types per function group |

## Remove Implicit Module Coupling

Two files in the same module import internal symbols from each other's implementation files rather than going through the module's index/barrel.

```typescript
// Before
// features/orders/fulfill.ts
//   import { picker } from './internal/warehouse';

// After
// features/orders/index.ts re-exports warehouse's public API
// features/orders/fulfill.ts
//   import { picker } from '../orders';  // through barrel
```

**Verify**: No file in the module imports from another file's private path — all go through the module boundary.

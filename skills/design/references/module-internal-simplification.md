# Module-Internal Simplification (T1) — Patterns

Simplifications confined to a single function or file that do not change the module's public API.
Existing unit tests validate behavioral preservation — these are the safest refactorings.

## Guard Clause Extraction

Replace nested conditionals with early returns.

```typescript
// Before
function processOrder(order) {
  if (order) {
    if (order.isPaid) {
      if (!order.isCancelled) {
        // main logic
      }
    }
  }
}

// After
function processOrder(order) {
  if (!order) return;
  if (!order.isPaid) return;
  if (order.isCancelled) return;
  // main logic
}
```

**Test coverage**: All code paths already exercised by unit tests.
**Verify**: `npm test -- --related <file>`

## Dead Code Removal

Remove unused exports, unreachable branches, and commented-out blocks.

```typescript
// Before
export function legacyFormatter(data) { /* no callers found */ }
function process() {
  // if (experimental) { ... }  // commented out 6 months ago
}

// After
// Remove legacyFormatter entirely
function process() { /* clean body */ }
```

**Verify**: `grep -r "legacyFormatter" src/` confirms zero callers; tests still pass.

## Predicate Simplification

Collapse duplicated or tautological conditions.

```typescript
// Before
if (user != null && user !== undefined && user.role != null) { ... }

// After
if (user?.role) { ... }
```

## Inline Redundant Variable

A variable that exists solely to hold a single-use expression.

```typescript
// Before
const now = Date.now();
log(now);

// After
log(Date.now());
```

**Does not apply when** the variable name carries meaning that clarifies the expression.

## Switch-to-Map / Switch-to-Polymorphism

Replace long switch statements with lookup maps.

```typescript
// Before
function format(type, value) {
  switch (type) {
    case 'date': return formatDate(value);
    case 'currency': return formatCurrency(value);
    case 'percent': return formatPercent(value);
    default: return String(value);
  }
}

// After
const FORMATTERS = {
  date: formatDate,
  currency: formatCurrency,
  percent: formatPercent,
};
function format(type, value) {
  return (FORMATTERS[type] ?? String)(value);
}
```

## Remove Redundant Branch

When a branch body is identical to the fallback, merge.

```typescript
// Before
function greet(name) {
  if (name) {
    return `Hello, ${name}!`;
  }
  return `Hello, world!`;
}

// After
function greet(name) {
  return `Hello, ${name || 'world'}!`;
}
```

## Flatten Unnecessary Async

A function declared `async` but containing no `await` calls.

```typescript
// Before
async function getVersion() {
  return pkg.version;
}

// After
function getVersion() {
  return pkg.version;
}
```

**Skip if** the function is an interface/abstract override that must return a Promise for polymorphic consistency.

## Merge Adjacent Operations

Two sequential loops or filter-map chains over the same collection.

```typescript
// Before
const active = users.filter(u => u.active);
const names = active.map(u => u.name);

// After
const names = users.filter(u => u.active).map(u => u.name);
```

## Remove Accidental Complexity

Extraneous indirection introduced by premature abstraction or framework boilerplate.

| Anti-pattern | Refactored |
|---|---|
| Single-function class that holds no state | Convert to plain function |
| Wrapper function that only adds logging | Inline logging at call site |
| Factory that always produces the same concrete type | Use constructor directly |
| Interface with exactly one implementation | Remove interface, keep implementation |

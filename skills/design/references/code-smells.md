# Code Smell Patterns — Architecture Survey Reference

Common patterns to recognize while reading code during architecture survey.
Use this catalog to identify refactoring opportunities; each entry notes the likely tier (T1/T2/T3) for dispositioning.

## Control Flow

### Deeply Nested Conditionals
Multiple levels of `if`/`else`/`switch` exceeding 3 levels deep, or containing duplicated branch predicates.
- **T1 fix**: Early returns, guard clauses, switch-to-map, predicate extraction
- **Symptoms**: Methods with >3 indent levels, repeated `if (condition)` checks

### Mutable Flag Variables
Boolean or enum variables threaded through functions purely to control which branch runs later.
- **T1 fix**: Split the function at the decision point; caller chooses which path
- **Symptoms**: `let/var` flags declared at function start, set in multiple branches

### Sequential Conditionals Hiding State Machine
A chain of `if`/`else` blocks that implicitly represent state transitions.
- **T2 fix**: Explicit state machine or table-driven dispatch
- **Symptoms**: State variable mutated across a chain, each branch checks both old and new state

## Data & State

### Shotgun Duplication
The same small expression or transformation repeated across multiple functions or files.
- **T2 fix**: Extract to shared utility or helper; place in the lowest-level module that needs it
- **Symptoms**: Copy-pasted 2-5 line blocks, grep reveals identical patterns across module

### Temporary Field
An object property or class field only set in some code paths and always `null`/`undefined` in others.
- **T1 fix**: Extract a separate type or parameter object; remove the field from the base type
- **Symptoms**: Fields with `?`/`| undefined` that are checked before every use

### Overly Permissive Null Handling
Parameters or return types that accept `null` when the semantics don't require it, propagating `?.` / `== null` checks through callers.
- **T1 fix**: Tighten the contract — require defined values, push null handling to the boundary
- **Symptoms**: Chains of `?.a?.b?.c`, unnecessary `== null` checks on always-present data

## Structure

### Dead Code
Exported functions never called, branches unreachable due to constants, commented-out code blocks.
- **T1 fix**: Remove the function or branch; let the compiler/test suite catch if something depended on it
- **Symptoms**: grep shows zero callers, `if (false)`, files with only comments

### Lazy Class / Middle Man
A class or function that does nothing but delegate to another, with no added behavior or transformation.
- **T1 fix**: Inline the delegation; remove the intermediate
- **Symptoms**: 1:1 method mapping between wrapper and wrapped, no state or logic added

### Divergent Change Pattern
The same class or file is modified for multiple unrelated reasons across recent commits.
- **T2 fix**: Split the file along axis-of-change lines; each responsibility gets its own home
- **Symptoms**: git log shows the same file touched for feature work, bug fixes, and refactoring in the same period

### Data Clump
The same 2-4 parameters appear together across multiple function signatures.
- **T2 fix**: Extract parameter object; group validation and formatting with the new type
- **Symptoms**: `(start, end, limit)`, `(userId, role, tenantId)` repeated across 3+ functions

## Coupling

### Feature Envy
A function accesses data or calls methods on another object more than on its own.
- **T2 fix**: Move the function to the object that owns the data it depends on
- **Symptoms**: `a.x`, `a.y`, `a.z` in a method of `B`; long chains of `getter().getter()`

### Inappropriate Intimacy
Two modules or classes reach into each other's internal state rather than using public interfaces.
- **T3 fix**: Define a clear interface between them; extract shared state into a third module
- **Symptoms**: `friend`/`internal` usage across module boundaries, circular imports

### God Object / God Module
A single file or class with disproportionate size and responsibility breadth.
- **T3 fix**: Decompose by responsibility into separate modules; update callers
- **Symptoms**: File exceeds 500 lines, contains >1 "section" comment block, 10+ imports

## Legacy & Migration

### Deprecated API Usage
Import from deprecated packages, usage of `@deprecated`-marked symbols, or reliance on removed Node.js/TypeScript features.
- **T1 fix**: Replace with the recommended alternative (often a find-and-replace across the module)
- **Symptoms**: `@deprecated` JSDoc, runtime deprecation warnings, import from `/dist/` or `lib/`

### No-Longer-Needed Workaround
Code that exists to work around a bug or gap in a previous framework/library version, now resolved upstream.
- **T1 fix**: Remove the workaround; test the happy path and edge case
- **Symptoms**: Comments referencing old issue numbers or "temporary" workarounds, version-gated blocks for very old versions

### Commented-Out Alternative
A second version of a function/block left commented out "for reference."
- **T1 fix**: Remove; if needed, git history preserves the alternative
- **Symptoms**: Blocks commented out with explanations like "old version" or "alternative approach"

# Design: CLI 狀態查詢與預覽 (O1+O4)

- Date: 2026-05-26
- Feature: CLI 狀態查詢與預覽 (O1+O4)
- Change Name: cli-status-and-dry-run

> **Purpose:** **High-level architectural context for `tasks.md`**—structure, coupling, sequencing intent—not a second implementation list. Requirement intent stays in `spec.md`; **documented vendor truth** stays in **`contract.md`**. **`tasks.md` owns** every runnable step (paths, edits, verifies).
>
> **Do not duplicate `tasks.md`:** no checkbox-style chores, no per-file implementation lines, no verifiers—the executable queue exists only under **`tasks.md`**. Optional **`INT-###`** labels are **coarse anchors** that task rows cite for traceability.
>
> **Audience:** Humans/agents authoring **`tasks.md`**, and implementers needing **mental model before** ticking task boxes—not a standalone execution script.

## Traceability

|                             |                                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| Requirement IDs             | [R?.?]                                                                      |
| In-scope modules (≤3)       | [paths / services]                                                           |
| External systems touched    | [names only—full truth in **`contract.md`**, or `None`]                      |
| Batch coordination          | [`../coordination.md` or `None`]                                            |

## Target vs baseline

|                       | Baseline (today) | Target (after this change) |
| --------------------- | ---------------- | --------------------------- |
| Structure / ownership | […]              | […]                         |

## Boundaries

- Entry surface(s): [HTTP · CLI · job · subscriber · FFI — whichever applies]
- Trust boundary crossed: [`None` / brief]
- Outside → inside (one line): `[Actor]` → `[our entry]` → `[…]` (vendor touchpoints **`contract.md` only`)

## Modules (nouns only)

| Module key | Responsibility (one sentence) | Owned artifacts (types, tables, queues) |
| ---------- | ---------------------------- | ---------------------------------------- |
| `[key]`    | […]                          | [none / list]                             |

---

## Interaction anchors (`INT-###`)

**Grain:** **Above `tasks.md`**. One anchor ≈ a **meaningful handshake** between module keys—not one checkbox. Several task lines may realize a single `INT-###`.

| ID        | Intent (when this coupling matters) | Caller → Callee | Coupling kind (route pattern · RPC · event · sync call—**name/pattern**, not file path) | Information / state crossing (summary) | Failure / propagation expectation (summary) |
| --------- | ------------------------------------ | --------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| `INT-001` | […]                                  | `A` → `B`       | […]                                                                                      | […]                                    | […]                                         |

**Ordering / concurrency (design-level):** [parallelism rules, critical sections, or `None`—still no file-level steps]

## Requirement linkage (coarse ordering)

Maps **which `R` clusters** depend on **which anchor order**. **`tasks.md` decomposes** into concrete steps.

### [Scenario / `R?.?` cluster]

- Anchor order hint: `INT-…` → `INT-…` → …
- Narrative glue (≤3 bullets): [why this order; what must not reorder]

[`None` if one anchor suffices—say so]

## Data & persistence (design-level)

| Resource                      | Typical readers/writers (module keys) | Consistency expectation (ordering, idempotency) |
| ----------------------------- | ------------------------------------- | ------------------------------------------------ |
| [store · schema · queue …] | […]                                   | […]                                             |

## Invariants (system-level)

| Invariant | What breaks it architecturally           | Symptoms if violated |
| --------- | ---------------------------------------- | -------------------- |
| […]       | [coupling mistake / wrong owner / …]     | […]                  |

## Tradeoffs inherited by implementation

| Decision | Rejected alternative | Locks in (for **`tasks.md`**) |
| -------- | -------------------- | ---------------------------- |
| […]      | […]                  | […]                           |

## Batch-only

[`None` \| single line: responsibilities **not** in this spec → see **`coordination.md`**]

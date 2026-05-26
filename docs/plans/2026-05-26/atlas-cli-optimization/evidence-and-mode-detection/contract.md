# Contract: 證據品質與模式偵測 (O5+O6)

- Date: 2026-05-26
- Feature: 證據品質與模式偵測 (O5+O6)
- Change Name: evidence-and-mode-detection

> **Purpose:** **High-level external-dependency context for `tasks.md`**: cite-backed facts, limits, failures, security—so integrations are not hallucinated. **Not** a runnable checklist; **`tasks.md` executes** wiring (files, calls, mocks, tests). Internal coupling intent stays in **`design.md`** (`INT-###`).
>
> **Anti-duplication:** Do not enumerate per-file edits, checkbox steps, or copy task ordering. **`EXT-###`** are **constraints / anchors** that task rows may cite.
>
> **Undocumented gaps:** **`TBD`** + clarification—never invent payloads, endpoints, or semantics.

## Scope

- **External deps in this doc:** [`0` \| ≥1]
- **`0`:** under **Dependencies** write **`None.`** plus one line (what “no deps” excludes for coders).

## Dependencies

If **external dep count is 0:** keep **only**:

**None.** [one line — e.g. no network SDKs/APIs beyond stdlib/process]

**Delete everything** from “### \[Dependency name]” downward.

If **≥1 dependency:** delete the `None.` block above; copy one `### [Dependency name]` section per dependency.

### [Dependency name]

#### Evidence

| Primary docs URL(s)             | Sections / anchors used |
| ------------------------------- | ----------------------- |
| […]                             | […]                     |

**Version revision assumed:** [pinned \| line \| `Not fixed` — how pinning lands in **`tasks.md`**]

#### Facts we rely on (must be citeable)

| Fact / capability needed | Doc location |
| ------------------------ | ------------ |
| […]                      | […]          |

#### Limits & failures (coding obligations)

| Category                         | Doc fact | Meaning while executing **`tasks.md`** |
| -------- | --------- | ---------------------------------------- |
| Quotas · size · timeout · paging | […] | [backoff / batching — policy level] |
| Errors / degraded modes | […] | [map-to-app policy—not file paths unless standard] |

#### Security & secrets (policy level)

| Concern           | Constraint |
| ----------------- | ---------- |
| Auth / scopes    | […]        |
| Secret keys (names)| […]       |

#### Integration anchors (`EXT-###`)

**Grain:** Boundary truth + obligations—**fewer anchors than typical task rows**. Multiple checkboxes often satisfy one anchor.

| ID        | What we integrate at this boundary *(doc-named surface)* | Non‑negotiables (handling, retries, idempotency *per doc*) | Forbidden assumptions |
| --------- | ---------------------------------------------------------- | ----------------------------------------------------------- | --------------------- |
| `EXT-001` | [endpoint · SDK symbol · topic — **verbatim-ish** from doc] | […]                                                        | […]                   |

**Doc-level ordering constraint (if any):** [e.g. token before resource call—or `None`]

#### Trace hooks (no task parroting)

- Spec IDs covered: [R?.?]
- Related **`design.md`** module keys / `INT-###`: [optional]
- **Unknown / `TBD`:** [list or `None`]

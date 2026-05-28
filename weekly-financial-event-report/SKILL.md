---
name: weekly-financial-event-report
description: Read a user-specified PDF that marks the week's key financial events, deeply research each marked event with current sources, capture any additional breaking financial developments, and produce a concise Chinese-capable PDF briefing that explains what happened and why it matters.
---

# Weekly Financial Event Report

## Dependencies

- Required: `pdf` to render the final report, `cjk-pdf` for CJK font and PDF QA needs.
- Conditional: `document-vision-reader` when the source PDF's highlighted markers are visible in layout but not recoverable from machine-readable text alone.
- Optional: none.
- Fallback: If source-PDF extraction through `pdf` is unavailable or fails on macOS, use the bundled `apltk extract-pdf-text-pdfkit` helper before giving up; only stop when neither `pdf` nor the local PDFKit fallback can recover the marked events, or when final PDF rendering itself cannot be completed.

## Standards

- Evidence: Research only events explicitly marked in the source PDF plus clearly material breaking developments, and verify claims with current authoritative sources.
- Execution: Read the PDF first, prefer `pdf` for extraction but fall back to the bundled macOS PDFKit extractor when local PDF tooling is missing, lock the research window, check for an existing report covering that same window before duplicating work, research each marked event, then hand the final briefing to `pdf` for rendering and QA with deterministic table-safe layout rules when needed; when a Codex automation prompt includes an explicit `Automation memory:` path, reuse that concrete path for run-memory notes instead of assuming `$CODEX_HOME` resolves in the shell.
- Quality: Keep the report concise, Chinese-compatible, explicit about source-versus-breaking events, conflicts, uncertainty, PDF font safety, and long-text table legibility.
- Output: Save only the final standardized PDF under the month folder using the financial-event-report naming scheme.

## Behavior Contract

GIVEN the user provides a PDF that marks weekly key financial events  
WHEN the agent uses this skill  
THEN the agent must read the PDF first  
AND identify only the events that are explicitly marked or clearly designated in the document  
AND research each marked event with current sources  
AND capture any additional breaking financial events that materially changed the week's interpretation  
AND produce a concise, standardized PDF report that explains the event timeline, market impact, and why the events matter  
AND default the report language to Chinese unless the user explicitly requests another language.

## Required Inputs

Before writing, confirm these facts from the PDF, user context, or current sources:

- Path to the source PDF
- The week or date range covered by the source PDF
- Any user-specified geography, market, sector, or asset-class focus
- Output directory if the user specified one
- Language preference if different from the Chinese default
- Automation memory path when the task prompt explicitly provides an `Automation memory:` line and the run needs to persist a concise automation summary

Do not guess any input that materially changes the research window or report scope.

## Source Rules

- Use current web research for time-sensitive claims.
- Prefer primary or authoritative sources first:
  - central banks
  - government statistical agencies
  - regulators
  - exchanges
  - company filings or official releases
- Use high-quality financial reporting to triangulate facts, surface timelines, or explain market reactions.
- Record the event date or publication date for every material claim.
- Use exact calendar dates for market holidays, exchange closures, and "next session" timing instead of relative wording such as "today" or "next Monday" alone.
- Separate confirmed facts from interpretation.
- Distinguish between:
  - events explicitly marked in the source PDF
  - additional breaking events added during research

## Workflow

### 1) Read the source PDF and extract the marked events

- Prefer the `pdf` skill to open and extract the source PDF.
- If `pdf` extraction is unavailable or fails because the current machine lacks local PDF tooling, and the host is macOS, run:

```bash
apltk extract-pdf-text-pdfkit /absolute/path/to/source.pdf
```

- 在執行前先閱讀 `references/extract-pdf-text-pdfkit.md` 了解輸出格式。
- The bundled extractor prints page-delimited text directly from PDFKit so the agent can still build the source-event table without adding Python PDF packages ad hoc.
- Identify the document's explicit markers, such as highlights, comments, callouts, boxed sections, bookmarks, or clearly labeled weekly key-event sections.
- Build a source-event table before searching. For each marked event capture:
  - page number
  - event label in the source PDF
  - date or date range if present
  - short note about why the source document highlighted it
- If the PDF does not expose machine-readable annotations, fall back to clearly visible marked sections or headings from the extracted page text.
- If the page text alone is insufficient because the document uses visual highlights or layout callouts without recoverable text markers, use `document-vision-reader` on screenshots of the relevant PDF pages before deciding the events are ambiguous.
- If the document still does not make the marked events unambiguous, stop and report the ambiguity rather than inventing events.

### 2) Lock the research window

- Prefer the exact week or date range stated in the source PDF.
- If the PDF lacks an explicit range, infer the window only from unambiguous document evidence such as the title, cover date, or repeated date markers.
- If the research window remains unclear, report the ambiguity instead of assuming one.
- State exact calendar dates and timezone in the report.

### 2.5) Check for an existing report before regenerating

- Before drafting a new report, inspect the target month folder for an existing `financial-event-report` PDF that already covers the same exact date range.
- If an existing report already covers the locked window, read it first and compare it with the newly confirmed marked events plus any newly discovered breaking developments.
- Reuse the existing report as the baseline when it already covers the same window, and regenerate only when at least one of these is true:
  - the source PDF reveals a marked event that the existing report missed
  - a material breaking event landed after the prior report was generated
  - the earlier report used an incorrect or incomplete research window
- If the existing report is still complete and current for the same window, stop and report that no refresh is needed instead of rewriting the same deliverable.

### 3) Research each marked event deeply

- For every marked event, gather:
  - what happened
  - when it happened
  - the direct trigger or official announcement
  - market or macro channels affected
  - the immediate reaction
  - why the event matters after the initial headline
- Prefer direct evidence over commentary.
- When multiple sources disagree, explain the conflict instead of forcing a single narrative.

### 4) Capture additional breaking financial events

- Search for material financial or macro developments that occurred within the report window or after the source PDF was prepared but before report finalization.
- Add an event only when it materially changes the user's understanding of the week, such as:
  - surprise central-bank communication
  - emergency policy action
  - major bank, fund, or exchange stress
  - sharp cross-asset repricing
  - geopolitical shocks with direct market spillovers
  - unexpected company events with broad market consequences
- Label these clearly as newly added breaking events rather than source-PDF items.
- When a breaking event affects how an already published data point should be interpreted at the next market session, state the exact upcoming trading date or reopening date.

### 5) Write the standardized report

- Start from `assets/financial_event_report_template.md`.
- Keep the report short enough for a fast read; default target is roughly 2-5 pages unless the user asks otherwise.
- Default to Chinese if the user does not specify another language.
- Explain both the sequence of events and the practical market impact.
- For each marked event, answer:
  - what happened
  - why it mattered
  - what markets or sectors moved
  - what remains unresolved
- Include a dedicated section for additional breaking events.
- Include a final section on implications and watchpoints.

### 6) Prepare PDF requirements for the `pdf` skill

- The final PDF must support Chinese text cleanly.
- Pass the font and rendering requirements to the `pdf` skill instead of implementing a separate export path here.
- On macOS, require the `pdf` skill to verify the font path before rendering.
Use $cjk-pdf for CJK font selection, content safety, visual QA, and temporary file cleanup. For tables with long phrases, require wrapped paragraph cells and width-constrained columns that expand with content.

### 7) Delegate rendering and PDF QA to the `pdf` skill

- Hand the completed report content and font requirements to the `pdf` skill for rendering.
- If custom table or timeline layout is needed, require the `pdf` skill to keep that renderer as a reusable local script instead of relying on one-off inline code.
- Require the `pdf` skill to open the rendered PDF locally before finishing.
- Require the `pdf` skill to capture temporary screenshots from the rendered PDF before considering the report complete.
- Require the `pdf` skill to inspect at least:
  - the first page
  - one page with a table or timeline
  - one page with dense paragraph text
- Require the `pdf` skill to verify:
  - Chinese glyphs render correctly
  - no tofu boxes or missing characters
  - headings and body text are visually balanced
  - line wrapping is readable
  - tables remain legible
  - long table cells do not overlap adjacent text
  - row heights and timeline blocks expand enough to fit wrapped content
- Treat those screenshots as temporary QA artifacts only.
- If the output fails visual QA, revise the content or PDF requirements and call the `pdf` skill again.
- After the final PDF passes QA, require the `pdf` skill to delete all temporary screenshots before finishing.

### 8) Persist automation run memory when applicable

- If the task prompt includes an explicit `Automation memory:` path, read that file first when it exists so the run can build on the prior summary.
- After the final report is generated, write a concise run note back to that exact path.
- Prefer the explicit path from the prompt over `$CODEX_HOME/...` interpolation when the shell environment does not define `CODEX_HOME`.

## Standard Report Requirements

The report must contain these sections in order:

1. Report title and source document
2. Generated time and research window
3. Executive summary
4. Source PDF marked-event overview
5. Key marked events and deep analysis
6. Additional breaking financial events
7. Cross-market impact and implications
8. Watchpoints for the coming days
9. Risks, uncertainty, and source limitations

## File Layout Rules

- Store reports inside a month-based folder named `YYYY-MM`.
- If the user gives a base output directory, create or reuse `YYYY-MM` beneath it.
- If the user does not give a base output directory, use the current working directory as the base.
- Keep only the final PDF as the persistent deliverable.
- Remove temporary working files after rendering.
- Do not keep QA screenshots unless the user explicitly asks to preserve them.

## Report Naming Rules

- The visible report title must use this exact pattern:
  - `[YYYY/M/D-YYYY/M/D]-financial-event-report`
- Build the date range from the exact research window start and end dates.
- Because `/` is not safe in macOS filenames, the PDF filename must use:
  - `[YYYY-M-D-YYYY-M-D]-financial-event-report.pdf`

## Output Rules

- The default deliverable is a PDF.
- Save the final file at `YYYY-MM/[YYYY-M-D-YYYY-M-D]-financial-event-report.pdf`.
- The default language is Chinese unless the user explicitly requests another language.
- Keep the report evidence-based, concise, and decision-useful.
- Make it easy for a user to understand the week's important financial developments within a few minutes.

## References

- `references/extract-pdf-text-pdfkit.md` — apltk extract-pdf-text-pdfkit 工具的完整參數說明。在步驟 1 需要 macOS 本地 PDF 提取時閱讀。

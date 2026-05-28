---
name: learning-error-book
description: A learning-focused error-book workflow. When the user asks to summarize mistakes, the agent summarizes mistakes made while solving questions, writes structured reference data, and renders polished PDFs directly without Markdown as an intermediate.
---

# Learning Error Book Skill

## Dependencies

- Required: `pdf` whenever question sources or the final deliverable involve PDF handling.
- Conditional: none.
- Optional: none.
- Fallback: If PDF extraction fails, escalate to OCR through `pdf`; if OCR still cannot recover the content, ask the user for the minimum needed text or screenshots.

## Standards

- Evidence: Summarize mistakes only from traceable question sources, user attempts, and correct-answer evidence.
- Execution: Build an evidence table first, write structured reference data, then render polished PDFs directly with Chinese-safe fonts.
- Quality: Explain mistake types, concept misunderstandings, and per-question solutions in a way that is specific, complete, and non-speculative.
- Output: Deliver separate MC and long-question error books, each backed by its own reference file and rendered PDF.

Goal: when the user asks to "summarize mistakes / summarize errors / compile an error book", summarize mistakes with evidence and generate or update structured error-book data plus polished PDFs directly from that data.

## Behavior Contract (GIVEN/THEN)

GIVEN the user asks to summarize mistakes/errors
THEN the agent summarizes the user's mistakes made while solving questions
AND generates or updates two error-book tracks when relevant:
- one for multiple-choice questions
- one for long-answer questions
AND each track includes:
- Coverage scope (which question files / sources are included)
- Common mistake types overview
- Conceptual mistake highlights (definition, user's common misjudgment, cautions)
- Mistake-by-mistake analysis and solutions
  - For MC questions: explain why each option is wrong/right, and why the correct option is correct
  - For long-answer questions: compare the expected solution steps against the user's steps, show exactly where the divergence starts, and identify the key concepts involved
AND the delivered error books must be polished PDFs rendered directly from structured data, without Markdown as an intermediate.

## Trigger Conditions

Use this skill when the user intent matches:
- "summarize mistakes", "what did I do wrong", "compile error book", "review wrong answers"
- user provides question files (often PDFs) and asks to summarize mistakes

## Inputs (Facts You Must Collect)

Before writing anything, ensure you have enough facts (do not guess):
- Question source: file paths (PDF), or pasted text/screenshots, or question id/page number
- User's attempt: chosen option / written answer, and their reasoning (if available)
- Correct answer and explanation: extract from the PDF if present; otherwise ask the user to provide it

If the PDF is scanned/image-based and text extraction fails:
- Use the `pdf` skill to attempt OCR (if available)
- If OCR is not possible, request pasted text or screenshots (minimum: stem + options/sub-questions)

## Output Spec (Required Sections)

The error books must contain:
1) Coverage Scope: which question files/sources are included (with paths; include page/question ids when available)
2) Common Mistake Types Overview: 3-8 categories (concept misunderstanding, misreading conditions, derivation/calculation error, option traps, etc.), with representative questions
3) Conceptual Mistake Highlights (per concept):
   - Definition (precise and actionable)
   - User's common misjudgment (mapped to concrete mistakes)
   - Cautions / checklists to avoid repeating the mistake
4) Per-Question Mistake & Solution:
   - Traceable locator: file + page/question id
   - User answer vs correct answer
   - Why it's wrong (link back to mistake type + concept)
   - Correct solution (step-by-step)
   - For MC: explain why each option is wrong/right, and why the correct option is correct
   - For Long Question: compare each expected step with the user's corresponding step, explain the gap at each step, state the first incorrect step clearly, and list the key concepts that question depends on

Formats:
- MC reference: `error_book/references/mc-question-reference.json`
- Long-question reference: `error_book/references/long-question-reference.json`
- MC deliverable: `error_book/mc-question-error-book.pdf`
- Long-question deliverable: `error_book/long-question-error-book.pdf`

## Recommended File Layout (Keep It Consistent)

```text
error_book/
  mc-question-error-book.pdf
  long-question-error-book.pdf
  references/
    mc-question-reference.json
    long-question-reference.json
  sources/          # optional: shortcuts/copies/list of source PDFs
```

## Workflow (Required)

1) Determine coverage
   - If the user provided files/question ids: add them to Coverage Scope
   - If not: search the workspace for relevant PDFs and confirm with the user

2) Extract question text + answers/explanations (extract when possible)
   - Use the `pdf` skill (pypdf/pdfplumber/OCR as available)
   - If extraction fails, request user-provided text/screenshots

3) Build an evidence table before writing
   - For each question: locator, user answer, correct answer, mistake type, concept(s), explanation
   - For long-answer questions, also collect expected steps, user steps, step-by-step gaps, first wrong step, and key concepts
   - Then map it into the required sections for the relevant track

4) Generate/update structured reference files
   - For MC questions: start from `assets/mc_question_reference_template.json`
   - For long-answer questions: start from `assets/long_question_reference_template.json`
   - If a reference file already exists: preserve existing entries, append new evidence, and refresh overview/concept sections

5) Render structured data -> PDF (CJK font support)
   - Run:
     - 在執行前先閱讀 `references/render-error-book.md` 了解參數。
     - `apltk render-error-book error_book/references/mc-question-reference.json error_book/mc-question-error-book.pdf`
     - `apltk render-error-book error_book/references/long-question-reference.json error_book/long-question-error-book.pdf`
   - If paper size/font needs change: adjust script flags (`--help`)

## Built-in Template

- `assets/mc_question_reference_template.json`: MC error-book structured template
- `assets/long_question_reference_template.json`: long-answer error-book structured template

## Rendering Notes (Avoid Pitfalls)

- Avoid lossy Markdown conversion. Keep symbols, formulas, and option text in the structured reference payload.
- For long-answer questions, preserve the original step granularity instead of merging multiple reasoning steps into one.
- Keep key-concept labels stable across questions so the concept summary can aggregate them cleanly.

## 參考資料

- `references/render-error-book.md` — apltk render-error-book 工具的完整參數說明。在步驟 5 渲染 PDF 前閱讀。

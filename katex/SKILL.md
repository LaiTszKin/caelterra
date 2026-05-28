---
name: katex
description: Render and embed math formulas with KaTeX using official documentation-backed patterns. Use when an agent needs inline or display math in HTML, Markdown, MDX, or other text-based outputs, or when it should generate insertion-ready KaTeX snippets from TeX.
---

# KaTeX

## Dependencies

- Required: none.
- Conditional: none.
- Optional: none.
- Fallback: If `node`, `npx`, or network package download is unavailable, keep the source TeX unchanged and explain that KaTeX rendering could not be generated locally.

## Standards

- Evidence: Follow the official KaTeX docs in `references/official-docs.md` before choosing render mode, options, or insertion strategy.
- Execution: Decide between pre-rendering and client-side auto-render first, then use `apltk render-katex` for deterministic output whenever a static rendered snippet is enough.
- Quality: Default to `htmlAndMathml`, keep `trust` disabled unless the content source is explicitly trusted, and include the KaTeX stylesheet whenever the output will be displayed in HTML.
- Output: Return insertion-ready content plus the exact CSS or runtime requirements still needed by the target file.

## Goal

Use KaTeX safely and consistently so mathematical formulas can be inserted into documents without the agent re-deriving the rendering workflow each time.

## Workflow

### 1) Confirm the target surface

- Identify the destination file type before rendering: static HTML, Markdown/MDX, generated docs, or an existing HTML page that already contains TeX delimiters.
- Decide whether the destination can keep raw HTML. If it cannot, keep the TeX source and document the runtime rendering requirement instead of forcing a broken snippet.

### 2) Pick the right rendering strategy

- Use **pre-rendering** when the agent needs a stable snippet to paste into HTML, Markdown, MDX, templates, or generated artifacts.
- Use **auto-render** only when the document should keep TeX delimiters in source and render in the browser at runtime.
- Prefer pre-rendering for one-off formulas and exported documents. Prefer auto-render when the file intentionally stores author-friendly TeX like `$...$` and `$$...$$`.

### 3) Render static output with the bundled script

Run the bundled renderer for pre-rendered output:

```bash
apltk render-katex \
  --tex '\int_0^1 x^2 \\, dx = \\frac{1}{3}' \
  --display-mode \
  --output-format html-fragment
```

Useful output modes:

- `html-fragment`: paste into HTML, MDX, JSX, or Markdown engines that allow raw HTML.
- `html-page`: generate a standalone previewable HTML file with the KaTeX stylesheet link included.
- `markdown-inline`: emit an inline-friendly HTML fragment for Markdown/MDX.
- `markdown-block`: emit a block-friendly HTML fragment for Markdown/MDX.
- `json`: emit machine-friendly JSON for downstream automation or templating.

Useful options:

- `--display-mode` for centered display math; omit for inline math.
- `--katex-format htmlAndMathml` by default for accessibility; switch only when the destination needs HTML-only or MathML-only output.
- `--macro` / `--macro-file` for reusable custom macros.
- `--strict`, `--trust`, `--max-size`, `--max-expand`, `--error-color`, and `--no-throw-on-error` when the task needs explicit control from the official options reference.

### 4) Insert output according to file type

- **HTML / template files**: paste `html-fragment` output and ensure the page loads the KaTeX stylesheet.
- **Standalone HTML exports**: use `html-page` when the user wants a ready-to-open preview file.
- **Markdown / MDX**: use `markdown-inline` or `markdown-block` only if the target renderer preserves raw HTML; otherwise keep source TeX and document the runtime render requirement.
- **Existing browser pages with raw delimiters**: keep the original TeX and wire in the official auto-render assets instead of pasting a pre-rendered snippet.

See `references/insertion-patterns.md` for concrete insertion guidance.

### 5) Apply the official runtime requirements

- KaTeX-rendered HTML needs the KaTeX CSS to display correctly.
- Official docs recommend using the HTML5 doctype so browser quirks mode does not distort layout.
- For browser auto-render, load `katex.min.js`, `auto-render.min.js`, the stylesheet, then call `renderMathInElement(...)` after the DOM is ready.

### 6) Keep safety and maintainability defaults

- Keep `trust` off unless the input source is trusted and the task explicitly needs trusted commands.
- On untrusted content, keep size and expansion limits bounded instead of relaxing them blindly.
- Reuse one macro definition source across the whole document when many formulas share the same commands.
- When the rendered output is only for preview and the final destination has its own KaTeX pipeline, prefer editing the TeX source instead of freezing rendered HTML too early.

## References

- `references/render-katex.md` — apltk render-katex 工具的完整參數說明。在步驟 3 執行渲染前閱讀。
- `references/official-docs.md`: condensed notes from the official KaTeX docs and direct source links.
- `references/insertion-patterns.md`: insertion patterns for HTML, Markdown/MDX, and auto-rendered pages.

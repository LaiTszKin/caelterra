import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';

interface ErrorBookData {
  title?: string;
  book_type?: string;
  last_updated?: string;
  coverage_scope?: Array<Record<string, unknown>>;
  mistake_overview?: Array<Record<string, unknown>>;
  concept_highlights?: Array<Record<string, unknown>>;
  questions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function safeText(value: unknown, defaultValue = '-'): string {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'string') return value.trim() || defaultValue;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => safeText(v, '')).filter(Boolean);
    return parts.join(', ') || defaultValue;
  }
  return String(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHtmlContent(data: ErrorBookData): string {
  const title = safeText(data.title, 'Error Book');
  const type = safeText(data.book_type, 'general');
  const updated = safeText(data.last_updated);
  const questions = Array.isArray(data.questions) ? data.questions : [];

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: -apple-system, 'PingFang SC', 'Noto Sans CJK', Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.55; color: #1F2937; }
  h1 { font-size: 24pt; margin-bottom: 0; }
  .subtitle { font-size: 11pt; color: #6B7280; margin-top: 4pt; }
  h2 { font-size: 16pt; color: #0F766E; border-bottom: 1px solid #D1D5DB; padding-bottom: 4pt; margin-top: 20pt; }
  h3 { font-size: 14pt; color: #1F2937; margin-top: 16pt; }
  h4 { font-size: 11pt; color: #1F2937; margin-top: 12pt; margin-bottom: 4pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9pt; }
  th { background: #0F766E; color: white; padding: 6pt 8pt; text-align: left; }
  td { padding: 6pt 8pt; border: 1px solid #D1D5DB; vertical-align: top; }
  tr:nth-child(even) td { background: #F8FAFC; }
  .callout { background: #FFEDD5; border-left: 4px solid #9A3412; padding: 8pt 10pt; margin: 8pt 0; }
  .meta { font-size: 10pt; color: #6B7280; }
  .section { margin-top: 20pt; }
  .question-block { page-break-inside: avoid; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="subtitle">Type: ${escapeHtml(type)} | Last updated: ${escapeHtml(updated)}</p>
<p class="subtitle">A structured review of mistakes, concepts, and corrections.</p>
`;

  // Coverage scope table
  html += '<h2>Coverage Scope</h2>\n<table><thead><tr><th>Source</th><th>Questions</th><th>Notes</th></tr></thead><tbody>\n';
  const coverageScope = Array.isArray(data.coverage_scope) ? data.coverage_scope : [];
  if (coverageScope.length === 0) {
    html += '<tr><td>-</td><td>-</td><td>-</td></tr>\n';
  }
  for (const item of coverageScope) {
    html += `<tr><td>${escapeHtml(safeText(item.source_path))}</td><td>${escapeHtml(safeText(item.included_questions))}</td><td>${escapeHtml(safeText(item.notes))}</td></tr>\n`;
  }
  html += '</tbody></table>\n';

  // Mistake overview
  html += '<h2>Common Mistake Types Overview</h2>\n';
  const overview = Array.isArray(data.mistake_overview) ? data.mistake_overview : [];
  if (overview.length === 0) {
    html += '<p>No mistake overview provided.</p>\n';
  }
  for (const entry of overview) {
    html += `<div style="background:#F8FAFC;border:1px solid #D1D5DB;padding:8pt 10pt;margin:6pt 0;">
<h4>${escapeHtml(safeText(entry.type))}</h4>
<p>${escapeHtml(safeText(entry.summary))}</p>
<p class="meta">Representative questions: ${escapeHtml(safeText(entry.representative_questions))}</p>
</div>\n`;
  }

  // Concept highlights
  html += '<h2>Conceptual Mistake Highlights</h2>\n';
  const concepts = Array.isArray(data.concept_highlights) ? data.concept_highlights : [];
  if (concepts.length === 0) {
    html += '<p>No concept highlights provided.</p>\n';
  }
  for (const concept of concepts) {
    const checklist = Array.isArray(concept.checklist) ? concept.checklist : [];
    html += `<h3>${escapeHtml(safeText(concept.name, 'Unnamed concept'))}</h3>
<table><tbody>
<tr><td style="background:#EEF2FF;width:22%;font-weight:bold;">Definition</td><td>${escapeHtml(safeText(concept.definition))}</td></tr>
<tr><td style="background:#EEF2FF;font-weight:bold;">Common misjudgment</td><td>${escapeHtml(safeText(concept.common_misjudgment))}</td></tr>
<tr><td style="background:#EEF2FF;font-weight:bold;">Checklist</td><td>${checklist.map((c: unknown) => `- ${escapeHtml(safeText(c))}`).join('<br>') || '-'}</td></tr>
</tbody></table>\n`;
  }

  // Questions
  if (questions.length > 0) {
    html += '<div style="page-break-before:always;"></div>\n';
    html += '<h2>Mistake-by-Mistake Analysis & Solutions</h2>\n';

    for (const q of questions) {
      const qMeta = [
        ['Source', safeText(q.source_path)],
        ['Locator', safeText(q.page_or_locator)],
        ['User answer', safeText(q.user_answer)],
        ['Correct answer', safeText(q.correct_answer)],
        ['Mistake type', safeText(q.mistake_type)],
        ['Concepts', safeText(q.concepts)],
      ];

      html += `<div class="question-block">
<h3>${escapeHtml(safeText(q.question_id, 'Unnamed question'))}</h3>
<table><tbody>
${qMeta.map(([label, val]) => `<tr><td style="background:#F8FAFC;width:18%;font-weight:bold;">${escapeHtml(label)}</td><td>${escapeHtml(val)}</td></tr>`).join('\n')}
</tbody></table>
<h4>Stem</h4>
<p>${escapeHtml(safeText(q.stem))}</p>
<h4>Why it was wrong</h4>
<p>${escapeHtml(safeText(q.why_wrong))}</p>
`;

      // Correct solution steps
      const steps = Array.isArray(q.correct_solution_steps) ? q.correct_solution_steps : [];
      if (steps.length > 0) {
        html += '<h4>Correct solution</h4>\n<ul>\n';
        for (const step of steps) {
          html += `<li>${escapeHtml(safeText(step))}</li>\n`;
        }
        html += '</ul>\n';
      }

      // Options table for MC questions
      const options = Array.isArray(q.options) ? q.options : [];
      if (options.length > 0) {
        html += '<h4>Option-by-option reasoning</h4>\n<table><thead><tr><th>Option</th><th>Text</th><th>Verdict</th><th>Reason</th></tr></thead><tbody>\n';
        for (const opt of options) {
          html += `<tr><td>${escapeHtml(safeText(opt.label))}</td><td>${escapeHtml(safeText(opt.text))}</td><td>${escapeHtml(safeText(opt.verdict))}</td><td>${escapeHtml(safeText(opt.reason))}</td></tr>\n`;
        }
        html += '</tbody></table>\n';
      }

      // Step comparison for long questions
      const stepComparison = Array.isArray(q.step_comparison) ? q.step_comparison : [];
      if (stepComparison.length > 0) {
        html += '<h4>Step-by-step comparison</h4>\n<table><thead><tr><th>Step</th><th>Expected</th><th>User</th><th>Gap</th><th>Fix</th></tr></thead><tbody>\n';
        for (const sc of stepComparison) {
          html += `<tr><td>${escapeHtml(safeText(sc.step_no))}</td><td>${escapeHtml(safeText(sc.expected_step))}</td><td>${escapeHtml(safeText(sc.user_step))}</td><td>${escapeHtml(safeText(sc.gap))}</td><td>${escapeHtml(safeText(sc.fix))}</td></tr>\n`;
        }
        html += '</tbody></table>\n';
      }

      html += '</div>\n';
    }
  }

  html += '\n</body>\n</html>\n';
  return html;
}

export async function renderErrorBookHandler(args: string[], context: ToolContext): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;

  let inputFile = '';
  let outputFile = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      stdout.write(`Usage: apltk render-error-book --input <json> --output <pdf>

Options:
  --input   Input JSON file path
  --output  Output PDF file path
`);
      return 0;
    }
    if (arg === '--input') {
      inputFile = args[++i] || '';
    } else if (arg === '--output') {
      outputFile = args[++i] || '';
    } else if (!inputFile && !arg.startsWith('-')) {
      // positional: first is input, second is output (backward compat)
      if (!inputFile) {
        inputFile = arg;
      } else if (!outputFile) {
        outputFile = arg;
      }
    }
  }

  if (!inputFile) {
    stderr.write('Error: --input is required.\n');
    return 1;
  }
  if (!outputFile) {
    stderr.write('Error: --output is required.\n');
    return 1;
  }

  const inputPath = path.resolve(inputFile);
  const outputPath = path.resolve(outputFile);

  if (!fs.existsSync(inputPath)) {
    stderr.write(`Error: Input file not found: ${inputPath}\n`);
    return 1;
  }

  let data: ErrorBookData;
  try {
    const raw = fs.readFileSync(inputPath, 'utf-8');
    data = JSON.parse(raw) as ErrorBookData;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON';
    stderr.write(`Error: Failed to parse input JSON: ${msg}\n`);
    return 1;
  }

  // Generate HTML
  const htmlContent = buildHtmlContent(data);

  // Try to convert to PDF
  const tmpHtmlFile = path.join(
    fs.mkdtempSync('error-book-'),
    'output.html',
  );
  fs.mkdirSync(path.dirname(tmpHtmlFile), { recursive: true });
  fs.writeFileSync(tmpHtmlFile, htmlContent, 'utf-8');

  let converted = false;

  // Try pandoc first
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    execSync(
      `pandoc "${tmpHtmlFile}" -o "${outputPath}" --pdf-engine=weasyprint 2>/dev/null || ` +
      `pandoc "${tmpHtmlFile}" -o "${outputPath}" --pdf-engine=wkhtmltopdf 2>/dev/null || ` +
      `pandoc "${tmpHtmlFile}" -o "${outputPath}"`,
      { stdio: 'ignore', timeout: 60000 },
    );
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      converted = true;
    }
  } catch {
    // Fall through
  }

  // Try wkhtmltopdf
  if (!converted) {
    try {
      execSync(
        `wkhtmltopdf "${tmpHtmlFile}" "${outputPath}"`,
        { stdio: 'ignore', timeout: 60000 },
      );
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        converted = true;
      }
    } catch {
      // Fall through
    }
  }

  // Clean up temp file
  try {
    fs.unlinkSync(tmpHtmlFile);
    fs.rmdirSync(path.dirname(tmpHtmlFile));
  } catch {
    // ignore cleanup errors
  }

  if (converted) {
    stdout.write(`${outputPath}\n`);
    return 0;
  }

  // Fallback: write HTML and report
  const htmlOutputPath = outputPath.replace(/\.pdf$/i, '.html') + '.html';
  fs.mkdirSync(path.dirname(htmlOutputPath), { recursive: true });
  fs.writeFileSync(htmlOutputPath, htmlContent, 'utf-8');
  stdout.write(`${htmlOutputPath}\n`);
  stderr.write('Warning: No PDF converter found (pandoc/wkhtmltopdf). HTML was written instead.\n');
  return 0;
}

export const tool: ToolDefinition = {
  name: 'render-error-book',
  category: 'media',
  description: 'Generate an error book PDF from JSON data.',
  handler: renderErrorBookHandler,
};

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';

interface KatexArgs {
  tex: string | null;
  inputFile: string | null;
  outputFormat: string;
  katexFormat: string;
  displayMode: boolean;
  leqno: boolean;
  fleqn: boolean;
  colorIsTextColor: boolean;
  noThrowOnError: boolean;
  outputFile: string | null;
  cssHref: string;
  title: string;
  lang: string;
  help: boolean;
  macro: string[];
  macroFile: string | null;
  errorColor: string | null;
  strict: string | null;
  trust: string | null;
  maxSize: number | null;
  maxExpand: number | null;
  minRuleThickness: number | null;
}

function parseArgs(args: string[]): KatexArgs {
  const parsed: KatexArgs = {
    tex: null,
    inputFile: null,
    outputFormat: 'html-fragment',
    katexFormat: 'htmlAndMathml',
    displayMode: false,
    leqno: false,
    fleqn: false,
    colorIsTextColor: false,
    noThrowOnError: false,
    outputFile: null,
    cssHref: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css',
    title: 'KaTeX Render',
    lang: 'en',
    help: false,
    macro: [],
    macroFile: null,
    errorColor: null,
    strict: null,
    trust: null,
    maxSize: null,
    maxExpand: null,
    minRuleThickness: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      let key: string;
      let value: string | boolean | null;

      if (eqIndex !== -1) {
        key = arg.slice(2, eqIndex);
        value = arg.slice(eqIndex + 1);
      } else {
        key = arg.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          value = next;
          i++;
        } else {
          value = true;
        }
      }

      switch (key) {
        case 'tex':
          parsed.tex = String(value);
          break;
        case 'input-file':
          parsed.inputFile = String(value);
          break;
        case 'output-format':
          if (['html-fragment', 'html-page', 'markdown-inline', 'markdown-block', 'json'].includes(String(value))) {
            parsed.outputFormat = String(value);
          }
          break;
        case 'katex-format':
          if (['html', 'mathml', 'htmlAndMathml'].includes(String(value))) {
            parsed.katexFormat = String(value);
          }
          break;
        case 'display-mode':
          parsed.displayMode = value === true || value === 'true';
          break;
        case 'leqno':
          parsed.leqno = value === true || value === 'true';
          break;
        case 'fleqn':
          parsed.fleqn = value === true || value === 'true';
          break;
        case 'color-is-text-color':
          parsed.colorIsTextColor = value === true || value === 'true';
          break;
        case 'no-throw-on-error':
          parsed.noThrowOnError = value === true || value === 'true';
          break;
        case 'output-file':
          parsed.outputFile = String(value);
          break;
        case 'css-href':
          parsed.cssHref = String(value);
          break;
        case 'title':
          parsed.title = String(value);
          break;
        case 'lang':
          parsed.lang = String(value);
          break;
        case 'macro':
          parsed.macro.push(String(value));
          break;
        case 'macro-file':
          parsed.macroFile = String(value);
          break;
        case 'error-color':
          parsed.errorColor = String(value);
          break;
        case 'strict':
          parsed.strict = String(value);
          break;
        case 'trust':
          parsed.trust = String(value);
          break;
        case 'max-size':
          parsed.maxSize = Number(value);
          break;
        case 'max-expand':
          parsed.maxExpand = Number(value);
          break;
        case 'min-rule-thickness':
          parsed.minRuleThickness = Number(value);
          break;
      }
    }
  }

  return parsed;
}

function loadTex(opts: KatexArgs): string {
  if (opts.inputFile) {
    const inputPath = path.resolve(opts.inputFile);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    return fs.readFileSync(inputPath, 'utf-8').trim();
  }
  return (opts.tex || '').trim();
}

function buildHtmlPage(renderedHtml: string, opts: KatexArgs): string {
  const cssLink = opts.cssHref
    ? `  <link rel="stylesheet" href="${opts.cssHref}">\n`
    : '';
  return (
    '<!DOCTYPE html>\n' +
    `<html lang="${opts.lang}">\n` +
    '<head>\n' +
    '  <meta charset="utf-8">\n' +
    `  <title>${opts.title}</title>\n` +
    cssLink +
    '</head>\n' +
    '<body>\n' +
    `${renderedHtml}\n` +
    '</body>\n' +
    '</html>\n'
  );
}

function wrapOutput(renderedHtml: string, tex: string, opts: KatexArgs): string {
  switch (opts.outputFormat) {
    case 'html-fragment':
      return `${renderedHtml}\n`;
    case 'html-page':
      return buildHtmlPage(renderedHtml, opts);
    case 'markdown-inline':
      return `${renderedHtml}\n`;
    case 'markdown-block':
      return `\n${renderedHtml}\n`;
    case 'json':
      return JSON.stringify(
        {
          tex,
          displayMode: opts.displayMode,
          katexFormat: opts.katexFormat,
          cssHref: opts.cssHref,
          content: renderedHtml,
        },
        null,
        2,
      ) + '\n';
    default:
      throw new Error(`Unsupported output format: ${opts.outputFormat}`);
  }
}

function writeOutput(content: string, outputFile: string | null, stdout: NodeJS.WriteStream): void {
  if (!outputFile) {
    stdout.write(content);
    return;
  }
  const outputPath = path.resolve(outputFile);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf-8');
  stdout.write(`${outputPath}\n`);
}

export async function renderKatexHandler(args: string[], context: ToolContext): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;

  try {
    const opts = parseArgs(args);

    if (opts.help) {
      stdout.write(`Usage: apltk render-katex [options]

Render TeX with KaTeX and emit insertion-ready output.

Options:
  --tex <string>              Raw TeX expression without delimiters
  --input-file <path>         Path to a text file containing raw TeX
  --output-format <format>    html-fragment (default) | html-page | markdown-inline | markdown-block | json
  --katex-format <format>     html | mathml | htmlAndMathml (default)
  --display-mode              Render in display mode
  --output-file <path>        Write output to a file
  --css-href <url>            Stylesheet href (default: KaTeX CDN)
  --title <text>              Document title for html-page
  --lang <code>               HTML lang attribute (default: en)
`);
      return 0;
    }

    const tex = loadTex(opts);
    if (!tex) {
      stderr.write('Error: Input TeX is empty.\n');
      return 1;
    }

    // Build npx katex command
    const cmdArgs: string[] = [
      'npx',
      '--yes',
      '--package',
      'katex',
      'katex',
      '--format',
      opts.katexFormat,
    ];

    if (opts.displayMode) cmdArgs.push('--display-mode');
    if (opts.leqno === true) cmdArgs.push('--leqno');
    if (opts.fleqn === true) cmdArgs.push('--fleqn');
    if (opts.colorIsTextColor === true) cmdArgs.push('--color-is-text-color');
    if (opts.noThrowOnError === true) cmdArgs.push('--no-throw-on-error');

    if (opts.errorColor) cmdArgs.push('--error-color', opts.errorColor);
    if (opts.strict) cmdArgs.push('--strict', opts.strict);
    if (opts.trust) cmdArgs.push('--trust', opts.trust);
    if (opts.maxSize !== null) cmdArgs.push('--max-size', String(opts.maxSize));
    if (opts.maxExpand !== null) cmdArgs.push('--max-expand', String(opts.maxExpand));
    if (opts.minRuleThickness !== null) cmdArgs.push('--min-rule-thickness', String(opts.minRuleThickness));
    // Handle macro args
    for (const macro of opts.macro) {
      cmdArgs.push('--macro', macro);
    }
    if (opts.macroFile) cmdArgs.push('--macro-file', opts.macroFile);

    // Write tex to temp file and pass it to katex
    const tmpFile = path.join(
      fs.mkdtempSync('katex-'),
      'input.tex',
    );
    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, tex + '\n', 'utf-8');
    cmdArgs.push('--input', tmpFile);

    let renderedHtml: string;
    try {
      const result = execSync(cmdArgs.join(' '), {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000,
      });
      renderedHtml = result.trim();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'KaTeX CLI failed.';
      stderr.write(`Error: ${message}\n`);
      return 1;
    } finally {
      try {
        fs.unlinkSync(tmpFile);
        fs.rmdirSync(path.dirname(tmpFile));
      } catch {
        // ignore cleanup errors
      }
    }

    const wrapped = wrapOutput(renderedHtml, tex, opts);
    writeOutput(wrapped, opts.outputFile, stdout);
    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

export const tool: ToolDefinition = {
  name: 'render-katex',
  category: 'media',
  description: 'Render TeX with KaTeX and emit insertion-ready output.',
  handler: renderKatexHandler,
};

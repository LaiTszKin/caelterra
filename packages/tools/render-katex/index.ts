import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { parseArgs } from 'node:util';
import { UserInputError, SystemError } from '@laitszkin/tool-utils';

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

function parseCliArgs(args: string[]): KatexArgs {
  const { values } = parseArgs({
    options: {
      'tex': { type: 'string' },
      'input-file': { type: 'string' },
      'output-format': { type: 'string', default: 'html-fragment' },
      'katex-format': { type: 'string', default: 'htmlAndMathml' },
      'display-mode': { type: 'boolean', default: false },
      'leqno': { type: 'boolean', default: false },
      'fleqn': { type: 'boolean', default: false },
      'color-is-text-color': { type: 'boolean', default: false },
      'no-throw-on-error': { type: 'boolean', default: false },
      'output-file': { type: 'string' },
      'css-href': { type: 'string', default: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css' },
      'title': { type: 'string', default: 'KaTeX Render' },
      'lang': { type: 'string', default: 'en' },
      'help': { type: 'boolean', default: false },
      'macro': { type: 'string', multiple: true },
      'macro-file': { type: 'string' },
      'error-color': { type: 'string' },
      'strict': { type: 'string' },
      'trust': { type: 'string' },
      'max-size': { type: 'string' },
      'max-expand': { type: 'string' },
      'min-rule-thickness': { type: 'string' },
    },
    allowPositionals: true,
  });

  const rawOpts = {
    tex: (values['tex'] as string | undefined) ?? null,
    inputFile: (values['input-file'] as string | undefined) ?? null,
    outputFormat: (values['output-format'] as string) || 'html-fragment',
    katexFormat: (values['katex-format'] as string) || 'htmlAndMathml',
    displayMode: !!values['display-mode'],
    leqno: !!values['leqno'],
    fleqn: !!values['fleqn'],
    colorIsTextColor: !!values['color-is-text-color'],
    noThrowOnError: !!values['no-throw-on-error'],
    outputFile: (values['output-file'] as string | undefined) ?? null,
    cssHref: (values['css-href'] as string) || 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css',
    title: (values['title'] as string) || 'KaTeX Render',
    lang: (values['lang'] as string) || 'en',
    help: !!values['help'],
    macro: (values['macro'] as string[] | undefined) || [],
    macroFile: (values['macro-file'] as string | undefined) ?? null,
    errorColor: (values['error-color'] as string | undefined) ?? null,
    strict: (values['strict'] as string | undefined) ?? null,
    trust: (values['trust'] as string | undefined) ?? null,
    maxSize: (values['max-size'] as string | undefined) ?? null,
    maxExpand: (values['max-expand'] as string | undefined) ?? null,
    minRuleThickness: (values['min-rule-thickness'] as string | undefined) ?? null,
  };

  return {
    ...rawOpts,
    maxSize: rawOpts.maxSize ? Number(rawOpts.maxSize) : null,
    maxExpand: rawOpts.maxExpand ? Number(rawOpts.maxExpand) : null,
    minRuleThickness: rawOpts.minRuleThickness ? Number(rawOpts.minRuleThickness) : null,
  };
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
    const opts = parseCliArgs(args);

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
      throw new UserInputError('Input TeX is empty.');
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
      throw new SystemError(message);
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
    if (err instanceof UserInputError) {
      stderr.write(`${err.message}\n`);
    } else if (err instanceof SystemError) {
      stderr.write(`${err.message}\n${err.stack}\n`);
    } else {
      const message = err instanceof Error ? err.message : 'Unknown error';
      stderr.write(`Error: ${message}\n`);
    }
    return 1;
  }
}

export const tool: ToolDefinition = {
  name: 'render-katex',
  category: 'media',
  description: 'Render TeX with KaTeX and emit insertion-ready output.',
  handler: renderKatexHandler,
};

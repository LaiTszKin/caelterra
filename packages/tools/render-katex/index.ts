import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { createToolRunner, UserInputError, SystemError } from '@laitszkin/tool-utils';

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

function convertValuesToKatexArgs(values: Record<string, unknown>): KatexArgs {
  const rawOutputFormat = values['output-format'] as string | undefined;
  const rawKatexFormat = values['katex-format'] as string | undefined;
  const rawMaxSize = values['max-size'] as string | undefined;
  const rawMaxExpand = values['max-expand'] as string | undefined;
  const rawMinRuleThickness = values['min-rule-thickness'] as string | undefined;

  return {
    tex: (values['tex'] as string | undefined) ?? null,
    inputFile: (values['input-file'] as string | undefined) ?? null,
    outputFormat: rawOutputFormat && ['html-fragment', 'html-page', 'markdown-inline', 'markdown-block', 'json'].includes(rawOutputFormat)
      ? rawOutputFormat : 'html-fragment',
    katexFormat: rawKatexFormat && ['html', 'mathml', 'htmlAndMathml'].includes(rawKatexFormat)
      ? rawKatexFormat : 'htmlAndMathml',
    displayMode: !!values['display-mode'],
    leqno: !!values['leqno'],
    fleqn: !!values['fleqn'],
    colorIsTextColor: !!values['color-is-text-color'],
    noThrowOnError: !!values['no-throw-on-error'],
    outputFile: (values['output-file'] as string | undefined) ?? null,
    cssHref: (values['css-href'] as string) || 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css',
    title: (values['title'] as string) || 'KaTeX Render',
    lang: (values['lang'] as string) || 'en',
    help: false,
    macro: values['macro'] ? [values['macro'] as string] : [],
    macroFile: (values['macro-file'] as string | undefined) ?? null,
    errorColor: (values['error-color'] as string | undefined) ?? null,
    strict: (values['strict'] as string | undefined) ?? null,
    trust: (values['trust'] as string | undefined) ?? null,
    maxSize: rawMaxSize ? Number(rawMaxSize) : null,
    maxExpand: rawMaxExpand ? Number(rawMaxExpand) : null,
    minRuleThickness: rawMinRuleThickness ? Number(rawMinRuleThickness) : null,
  };
}

function loadTex(opts: KatexArgs): string {
  if (opts.inputFile) {
    const inputPath = path.resolve(opts.inputFile);
    if (!fs.existsSync(inputPath)) {
      throw new UserInputError(`Input file not found: ${inputPath}`);
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

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = {
  options: {
    'tex': { type: 'string' as const },
    'input-file': { type: 'string' as const },
    'output-format': { type: 'string' as const, default: 'html-fragment' },
    'katex-format': { type: 'string' as const, default: 'htmlAndMathml' },
    'display-mode': { type: 'boolean' as const },
    'leqno': { type: 'boolean' as const },
    'fleqn': { type: 'boolean' as const },
    'color-is-text-color': { type: 'boolean' as const },
    'no-throw-on-error': { type: 'boolean' as const },
    'output-file': { type: 'string' as const },
    'css-href': { type: 'string' as const, default: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css' },
    'title': { type: 'string' as const, default: 'KaTeX Render' },
    'lang': { type: 'string' as const, default: 'en' },
    'macro': { type: 'string' as const },
    'macro-file': { type: 'string' as const },
    'error-color': { type: 'string' as const },
    'strict': { type: 'string' as const },
    'trust': { type: 'string' as const },
    'max-size': { type: 'string' as const },
    'max-expand': { type: 'string' as const },
    'min-rule-thickness': { type: 'string' as const },
  },
  allowPositionals: true,
  usage: 'apltk render-katex [options]',
  description: 'Render TeX with KaTeX and emit insertion-ready output.',
  handler: async (
    values: Record<string, unknown>,
    positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const stdout = context.stdout || process.stdout;
    const stderr = context.stderr || process.stderr;

    try {
      const opts = convertValuesToKatexArgs(values);

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
  },
};

export const tool: ToolDefinition = {
  name: 'render-katex',
  category: 'media',
  description: 'Render TeX with KaTeX and emit insertion-ready output.',
  handler: createToolRunner(schema),
};

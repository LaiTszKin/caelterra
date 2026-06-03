import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { UserInputError, createToolRunner } from '@laitszkin/tool-utils';

const SWIFT_SCRIPT = [
  'import Foundation',
  'import PDFKit',
  '',
  'let args = CommandLine.arguments',
  'guard args.count > 1 else { print("PDF_PATH="); exit(1) }',
  'let pdfPath = args[1]',
  'let pdfURL = URL(fileURLWithPath: pdfPath)',
  'guard let document = PDFDocument(url: pdfURL) else { fputs("Unable to open PDF at \\(pdfPath)\\n", stderr); exit(1) }',
  'print("PDF_PATH=\\(pdfPath)")',
  'print("PAGE_COUNT=\\(document.pageCount)")',
  'for pageIndex in 0..<document.pageCount {',
  '    guard let page = document.page(at: pageIndex) else { continue }',
  '    let text = page.string?.replacingOccurrences(of: "\\u{000C}", with: "\\n").trimmingCharacters(in: .whitespacesAndNewlines) ?? ""',
  '    print("=== PAGE \\(pageIndex + 1) ===")',
  '    if text.isEmpty { print("[NO_TEXT_EXTRACTED]") } else { print(text) }',
  '}',
].join('\n');

const schema = {
  options: {} as Record<string, never>,
  allowPositionals: true,
  usage: 'apltk extract-pdf-text-pdfkit <path>',
  description: 'Extract per-page text from a PDF through macOS PDFKit.',
  handler: async (
    _values: Record<string, unknown>,
    positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const stdout = context.stdout || process.stdout;
    const stderr = context.stderr || process.stderr;

    const pdfPath = (positionals[0] as string) ?? '';
    if (!pdfPath) {
      throw new UserInputError('PDF path is required.');
    }

    const resolvedPath = path.resolve(pdfPath);

    return new Promise((resolve) => {
      const child = spawn('swift', ['-', resolvedPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: context.env || process.env as Record<string, string>,
      });

      // Write the Swift script to stdin for inline execution
      child.stdin!.write(SWIFT_SCRIPT);
      child.stdin!.end();

      let stdoutText = '';
      let stderrText = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutText += String(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderrText += String(chunk);
      });

      child.on('error', (err: Error) => {
        stderr.write(`Failed to start swift: ${err.message}\n`);
        resolve(1);
      });

      child.on('close', (code: number | null) => {
        if (stdoutText) {
          stdout.write(stdoutText);
        }
        if (stderrText) {
          stderr.write(stderrText);
        }
        resolve(typeof code === 'number' ? code : 1);
      });
    });
  },
};

export const tool: ToolDefinition = {
  name: 'extract-pdf-text-pdfkit',
  category: 'Rendering & media',
  description: 'Extract PDF text with macOS PDFKit fallback.',
  handler: createToolRunner(schema),
};

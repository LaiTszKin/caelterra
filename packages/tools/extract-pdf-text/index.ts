import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';

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

export async function extractPdfTextHandler(args: string[], context: ToolContext): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;

  // Find positional pdfPath arg
  let pdfPath = '';
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      showHelp = true;
      break;
    }
    if (!arg.startsWith('-')) {
      pdfPath = arg;
    }
  }

  if (showHelp || !pdfPath) {
    stdout.write(`Usage: apltk extract-pdf-text-pdfkit <path>

Extract per-page text from a PDF through macOS PDFKit.

Arguments:
  path  Absolute path to the source PDF file

Output format:
  PDF_PATH=<path>
  PAGE_COUNT=<N>
  === PAGE 1 ===
  <page text>
  === PAGE 2 ===
  ...
`);
    return pdfPath ? 1 : 0;
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
}

export const tool: ToolDefinition = {
  name: 'extract-pdf-text-pdfkit',
  category: 'Rendering & media',
  description: 'Extract PDF text with macOS PDFKit fallback.',
  handler: extractPdfTextHandler,
};

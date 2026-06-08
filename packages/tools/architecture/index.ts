import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';

// ── Handler entrypoint ───────────────────────────────────────────────────────

/**
 * architectureHandler — Known carryover from the createToolRunner migration.
 *
 * Reason for not using createToolRunner:
 * - All subcommands delegate to the JS atlas CLI (cli.js) which has its own
 *   error handling (retired apply/template verbs included).
 * - Subcommand-level flag parsing: Each subcommand has unique flags; a single
 *   ToolSchema can't express this. See DESIGN.md §2.3 for the full picture.
 *
 * Error handling: All paths are handled by cli.dispatch()'s internal catch.
 */
export async function architectureHandler(
  args: string[],
  context: ToolContext,
): Promise<number> {
  // Delegate all verbs to the atlas CLI (JS)
  const sourceRoot =
    context.sourceRoot ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const cliPath = path.join(
    sourceRoot,
    'skills',
    'init-project-html',
    'lib',
    'atlas',
    'cli.js',
  );

  // Use file URL for ESM import compatibility on Windows — import() requires forward slashes.
  const cliModule = await import(pathToFileURL(cliPath).href);
  const cli = cliModule.default;
  return cli.dispatch(args, {
    stdout: context.stdout || process.stdout,
    stderr: context.stderr || process.stderr,
  });
}

export const tool: ToolDefinition = {
  name: 'architecture',
  category: 'Planning & architecture',
  skill: 'init-project-html',
  description: 'Open the project HTML architecture atlas, or render a paginated diff (`architecture diff`).',
  handler: architectureHandler,
};

import { registerTool } from '@laitszkin/tool-registry';

const TOOL_MODULE_NAMES = [
  '@laitszkin/tool-validate-skill-frontmatter',
  '@laitszkin/tool-validate-openai-agent-config',
  '@laitszkin/tool-open-github-issue',
  '@laitszkin/tool-find-github-issues',
  '@laitszkin/tool-read-github-issue',
  '@laitszkin/tool-review-threads',
  '@laitszkin/tool-architecture',
  '@laitszkin/tool-codegraph',
  '@laitszkin/tool-eval',
  '@laitszkin/tool-create-specs',
  '@laitszkin/tool-create-review-report',
];

// Sync tool-name lookup for parseArguments (does not load handlers)
const TOOL_NAMES = new Set([
  ...TOOL_MODULE_NAMES.map((name) => name.replace('@laitszkin/tool-', '')),
]);

export function isKnownToolName(name: string): boolean {
  return TOOL_NAMES.has(name);
}

let _registered = false;

export async function registerAllTools(): Promise<void> {
  if (_registered) return;
  _registered = true;

  const modules = await Promise.all(
    TOOL_MODULE_NAMES.map((name) => import(name)),
  );

  type ToolDefinition = Parameters<typeof registerTool>[0];

  for (const mod of modules) {
    registerTool((mod as { tool: ToolDefinition }).tool);
  }
}

/** Tools excluded from CLI refactoring scope (SPEC.md L28) */
export const SCOPE_EXCLUDED_TOOLS = new Set(['eval']);

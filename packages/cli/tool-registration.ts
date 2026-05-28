import { registerTool } from '@laitszkin/tool-registry';

const TOOL_MODULE_NAMES = [
  '@laitszkin/tool-filter-logs',
  '@laitszkin/tool-search-logs',
  '@laitszkin/tool-validate-skill-frontmatter',
  '@laitszkin/tool-validate-openai-agent-config',
  '@laitszkin/tool-sync-memory-index',
  '@laitszkin/tool-open-github-issue',
  '@laitszkin/tool-find-github-issues',
  '@laitszkin/tool-read-github-issue',
  '@laitszkin/tool-review-threads',
  '@laitszkin/tool-extract-conversations',
  '@laitszkin/tool-docs-to-voice',
  '@laitszkin/tool-render-katex',
  '@laitszkin/tool-render-error-book',
  '@laitszkin/tool-generate-storyboard-images',
  '@laitszkin/tool-enforce-video-aspect-ratio',
  '@laitszkin/tool-architecture',
  '@laitszkin/tool-create-specs',
  '@laitszkin/tool-create-review-report',
  '@laitszkin/tool-extract-pdf-text',
];

// Sync tool-name lookup for parseArguments (does not load handlers)
const TOOL_NAMES = new Set([
  ...TOOL_MODULE_NAMES.map((name) => name.replace('@laitszkin/tool-', '')),
  // Tool definitions whose name differs from the module suffix
  'extract-pdf-text-pdfkit',
  // Known aliases (must match tool definitions)
  'extract-codex-conversations',
  'extract-skill-conversations',
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

  for (const mod of modules) {
    registerTool(mod.tool);
  }
}

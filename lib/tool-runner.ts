import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { formatExamples } from './utils/format';
import type { ToolContext, ToolDefinition, ToolExample } from './types';
import { createSpecsHandler } from './tools/create-specs';
import { renderKatexHandler } from './tools/render-katex';
import { renderErrorBookHandler } from './tools/render-error-book';
import { docsToVoiceHandler } from './tools/docs-to-voice';
import { generateStoryboardImagesHandler } from './tools/generate-storyboard-images';
import { enforceVideoAspectRatioHandler } from './tools/enforce-video-aspect-ratio';
import { extractPdfTextHandler } from './tools/extract-pdf-text';
import { filterLogsHandler } from './tools/filter-logs';
import { searchLogsHandler } from './tools/search-logs';
import { openGitHubIssueHandler } from './tools/open-github-issue';
import { findGitHubIssuesHandler } from './tools/find-github-issues';
import { readGitHubIssueHandler } from './tools/read-github-issue';
import { reviewThreadsHandler } from './tools/review-threads';
import { architectureHandler } from './tools/architecture';
import { extractConversationsHandler } from './tools/extract-conversations';
import { syncMemoryIndexHandler } from './tools/sync-memory-index';
import { validateSkillFrontmatterHandler } from './tools/validate-skill-frontmatter';
import { validateOpenaiAgentConfigHandler } from './tools/validate-openai-agent-config';
import { createReviewReportHandler } from './tools/create-review-report';

const HELP_FLAGS = new Set(['--help', '-h']);

function toolExamples(...examples: ToolExample[]): ToolExample[] {
  return examples;
}

const TOOL_COMMANDS: ToolDefinition[] = [
  {
    name: 'architecture',
    category: 'Planning & architecture',
    skill: 'init-project-html',
    handler: architectureHandler,
    description: 'Open the project HTML architecture atlas, or render a paginated diff (`architecture diff`).',
    help: {
      purpose: 'Inspect, mutate, validate, and diff the repository architecture atlas without hand-editing generated HTML files.',
      useWhen: [
        'You need to browse or update `resources/project-architecture/` through the declarative atlas CLI.',
        'You need to compare proposed spec overlays under `docs/plans/**/architecture_diff/` against the base atlas.',
      ],
      insteadOf: [
        'Editing rendered architecture HTML files directly.',
        'Inventing atlas YAML changes without validating them through `apltk architecture validate`.',
      ],
      examples: toolExamples(
        {
          command: 'apltk architecture',
          result: 'Prints the base atlas HTML path and opens it in a browser unless `--no-open` is set.',
        },
        {
          command: 'apltk architecture diff',
          result: 'Builds a paginated before/after viewer and prints the generated diff viewer path.',
        },
      ),
    },
  },
  {
    name: 'filter-logs',
    category: 'Observability',
    skill: 'analyse-app-logs',
    handler: filterLogsHandler,
    description: 'Filter log lines by timestamp window.',
    aliases: ['filter-logs-by-time'],
    help: {
      purpose: 'Narrow a log file to an exact time window before deeper investigation.',
      useWhen: ['You know the incident time range and want only the matching log slice.'],
      insteadOf: ['Searching the full log file when the main problem is time scoping.'],
      examples: toolExamples({
        command: 'apltk filter-logs app.log --start 2026-03-24T10:00:00Z --end 2026-03-24T10:15:00Z',
        result: 'Prints only the lines whose timestamps fall within the requested window.',
      }),
    },
  },
  {
    name: 'search-logs',
    category: 'Observability',
    skill: 'analyse-app-logs',
    handler: searchLogsHandler,
    description: 'Search logs by keyword or regex.',
    help: {
      purpose: 'Search logs by keyword or regex after you know which file or slice to inspect.',
      useWhen: ['You need to find recurring messages, IDs, stack traces, or regex matches inside logs.'],
      insteadOf: ['Filtering by time alone when you already know the error text or pattern to match.'],
      examples: toolExamples({
        command: 'apltk search-logs app.log --pattern "timeout|ECONNRESET"',
        result: 'Prints matching log lines or matching groups, depending on the script flags you choose.',
      }),
    },
  },
  {
    name: 'docs-to-voice',
    category: 'Rendering & media',
    skill: 'docs-to-voice',
    handler: docsToVoiceHandler,
    description: 'Convert text into audio, timeline JSON, and SRT.',
    help: {
      purpose: 'Turn text or documents into narrated audio plus subtitle timelines.',
      useWhen: ['You need spoken output, subtitle timing, or a voiceover pipeline for docs and scripts.'],
      examples: toolExamples({
        command: 'apltk docs-to-voice --input notes.md --project-name lecture-01',
        result: 'Writes audio plus subtitle artifacts under the project audio output directory.',
      }),
    },
  },
  {
    name: 'create-specs',
    category: 'Planning & architecture',
    skill: 'spec',
    handler: createSpecsHandler,
    description: 'Create spec planning documents from templates.',
    help: {
      purpose: 'Generate a new planning scaffold under `docs/plans/` for a requested change or batch.',
      useWhen: ['You need a spec-first workflow before implementing a user-visible or risky change.'],
      insteadOf: ['Starting implementation before a spec path exists when planning is required.'],
      examples: toolExamples({
        command: 'apltk create-specs "Membership upgrade flow" --change-name membership-upgrade-flow',
        result: 'Creates a dated spec directory with the planning templates for that change.',
      }),
    },
  },
  {
    name: 'create-review-report',
    category: 'Planning & architecture',
    skill: 'qa',
    handler: createReviewReportHandler,
    description: 'Copy the QA code review report template to the spec directory.',
    help: {
      purpose: 'Copy the code-review-report.md template from qa/assets/templates to the appropriate spec directory. For batch specs, the report is placed alongside coordination.md at the batch root; for single specs, it is placed alongside spec.md.',
      useWhen: [
        'You need to start a code review and want the review report template in the correct spec directory.',
      ],
      insteadOf: [
        'Manually copying the template file to the spec directory.',
      ],
      examples: toolExamples(
        {
          command: 'apltk create-review-report',
          result: 'Auto-detects the latest spec and copies the review report template to it.',
        },
        {
          command: 'apltk create-review-report docs/plans/2026-05-21/my-feature',
          result: 'Copies the review report template to the specified spec directory.',
        },
        {
          command: 'apltk create-review-report docs/plans/2026-05-21/my-batch',
          result: 'Copies the review report template to the batch root directory.',
        },
        {
          command: 'apltk create-review-report --force',
          result: 'Auto-detects and overwrites the review report if it already exists.',
        },
      ),
    },
  },
  {
    name: 'render-katex',
    category: 'Rendering & media',
    skill: 'katex',
    handler: renderKatexHandler,
    description: 'Render TeX with KaTeX into reusable output.',
    help: {
      purpose: 'Render TeX formulas into insertion-ready KaTeX output.',
      useWhen: ['You need verified inline or display math output for Markdown, HTML, or generated documents.'],
      examples: toolExamples({
        command: 'apltk render-katex --tex "\\\\int_0^1 x^2 dx"',
        result: 'Prints or writes the rendered KaTeX output in the format selected by the script flags.',
      }),
    },
  },
  {
    name: 'render-error-book',
    category: 'Rendering & media',
    skill: 'learning-error-book',
    handler: renderErrorBookHandler,
    description: 'Render structured error-book JSON into PDF.',
    help: {
      purpose: 'Convert structured error-book data into a finished PDF deliverable.',
      useWhen: ['You already have JSON error-book content and need a rendered PDF artifact.'],
      examples: toolExamples({
        command: 'apltk render-error-book --input mistakes.json --output mistakes.pdf',
        result: 'Writes the rendered PDF to the requested output path.',
      }),
    },
  },
  {
    name: 'open-github-issue',
    category: 'GitHub workflows',
    skill: 'open-github-issue',
    handler: openGitHubIssueHandler,
    description: 'Publish or draft a structured GitHub issue.',
    help: {
      purpose: 'Create a structured GitHub issue with auth fallbacks and a stable JSON output contract.',
      useWhen: ['You need to publish a confirmed problem, proposal, docs gap, security issue, or observability issue to GitHub.'],
      insteadOf: ['Hand-building issue bodies inline in shell commands when rich Markdown could be corrupted by quoting.'],
      examples: toolExamples({
        command: 'apltk open-github-issue --payload-file /tmp/issue.json --repo owner/repo',
        result: 'Prints a JSON result describing the publish mode, rendered body, and issue URL when creation succeeds.',
      }),
    },
  },
  {
    name: 'generate-storyboard-images',
    category: 'Rendering & media',
    skill: 'openai-text-to-image-storyboard',
    handler: generateStoryboardImagesHandler,
    description: 'Generate storyboard image sets from text.',
    help: {
      purpose: 'Generate storyboard image assets from chapters, scenes, or other written prompts.',
      useWhen: ['You need picture outputs under the storyboard workflow rather than a generic one-off image.'],
      examples: toolExamples({
        command: 'apltk generate-storyboard-images --input chapter.txt --project-name teaser',
        result: 'Writes storyboard image files into the storyboard output directory for that project.',
      }),
    },
  },
  {
    name: 'find-github-issues',
    category: 'GitHub workflows',
    skill: 'read-github-issue',
    handler: findGitHubIssuesHandler,
    description: 'List GitHub issues through gh.',
    help: {
      purpose: 'Search and list GitHub issues from a repository through a stable wrapper over `gh`.',
      useWhen: ['You need to discover candidate issues before reading one in detail.'],
      insteadOf: ['Opening a single issue directly when you first need to search or filter the issue list.'],
      examples: toolExamples({
        command: 'apltk find-github-issues --repo owner/repo --query "architecture"',
        result: 'Prints matching issues in the format selected by the script flags, often table or JSON.',
      }),
    },
  },
  {
    name: 'read-github-issue',
    category: 'GitHub workflows',
    skill: 'read-github-issue',
    handler: readGitHubIssueHandler,
    description: 'Read GitHub issue details through gh.',
    help: {
      purpose: 'Read one GitHub issue in detail, including comments when supported by the script flags.',
      useWhen: ['You already know the issue number and want its full context.'],
      insteadOf: ['Listing issues when you already have the exact issue you need to inspect.'],
      examples: toolExamples({
        command: 'apltk read-github-issue --repo owner/repo --issue 123',
        result: 'Prints the issue body and related context in the output format chosen by the script.',
      }),
    },
  },
  {
    name: 'review-threads',
    category: 'GitHub workflows',
    skill: 'resolve-review-comments',
    handler: reviewThreadsHandler,
    description: 'List or resolve GitHub PR review threads.',
    help: {
      purpose: 'List unresolved review threads or resolve them after handling the requested changes.',
      useWhen: ['You need to inspect PR review feedback or close addressed review threads.'],
      insteadOf: ['Using generic PR commands when the task is specifically about review threads.'],
      examples: toolExamples(
        {
          command: 'apltk review-threads list --repo owner/repo --pr 42',
          result: 'Prints the matching review threads in the selected output format.',
        },
        {
          command: 'apltk review-threads resolve --repo owner/repo --thread-id PRT_abc123',
          result: 'Marks the addressed review thread as resolved when GitHub permissions allow it.',
        },
      ),
    },
  },
  {
    name: 'enforce-video-aspect-ratio',
    category: 'Rendering & media',
    skill: 'text-to-short-video',
    handler: enforceVideoAspectRatioHandler,
    description: 'Resize video output to a target aspect ratio.',
    help: {
      purpose: 'Normalize rendered video output to a required aspect ratio.',
      useWhen: ['You already have a video file and need a controlled resize or crop step.'],
      examples: toolExamples({
        command: 'apltk enforce-video-aspect-ratio --input clip.mp4 --output clip-vertical.mp4 --aspect 9:16',
        result: 'Writes a transformed video file that matches the requested aspect ratio.',
      }),
    },
  },
  {
    name: 'extract-pdf-text-pdfkit',
    category: 'Rendering & media',
    skill: 'weekly-financial-event-report',
    handler: extractPdfTextHandler,
    description: 'Extract PDF text with macOS PDFKit fallback.',
    help: {
      purpose: 'Extract per-page text from a PDF through macOS PDFKit.',
      useWhen: ['You need a lightweight PDF text extraction fallback on macOS.'],
      examples: toolExamples({
        command: 'apltk extract-pdf-text-pdfkit /absolute/path/to/source.pdf',
        result: 'Prints `PDF_PATH=...`, `PAGE_COUNT=...`, and a per-page text section for each extracted page.',
      }),
    },
  },
  {
    name: 'extract-codex-conversations',
    category: 'Codex memory & learning',
    skill: 'codex-memory-manager',
    handler: extractConversationsHandler,
    description: 'Extract recent Codex sessions for memory updates.',
    help: {
      purpose: 'Extract recent Codex chats so memory maintenance can review them.',
      useWhen: ['You need the last conversation set before generating or refreshing Codex memory artifacts.'],
      examples: toolExamples({
        command: 'apltk extract-codex-conversations --hours 24',
        result: 'Prints or writes the extracted recent-session data needed by the memory workflow.',
      }),
    },
  },
  {
    name: 'sync-codex-memory-index',
    category: 'Codex memory & learning',
    skill: 'codex-memory-manager',
    handler: syncMemoryIndexHandler,
    description: 'Sync the Codex memory index in AGENTS.md.',
    help: {
      purpose: 'Refresh the Codex memory index after the memory documents have been updated.',
      useWhen: ['You need to sync the AGENTS.md memory index to match the latest memory files.'],
      examples: toolExamples({
        command: 'apltk sync-codex-memory-index',
        result: 'Updates the memory index output and reports what was synchronized.',
      }),
    },
  },
  {
    name: 'extract-skill-conversations',
    category: 'Codex memory & learning',
    skill: 'learn-skill-from-conversations',
    handler: extractConversationsHandler,
    description: 'Extract recent Codex sessions for skill learning.',
    help: {
      purpose: 'Extract recent conversation history for learning or improving skills from past chats.',
      useWhen: ['You need recent session input for the learn-skill-from-conversations workflow.'],
      examples: toolExamples({
        command: 'apltk extract-skill-conversations --hours 24',
        result: 'Prints or writes the conversation data consumed by the skill-learning pipeline.',
      }),
    },
  },
  {
    name: 'validate-skill-frontmatter',
    category: 'Catalog maintenance',
    handler: validateSkillFrontmatterHandler,
    description: 'Validate SKILL.md frontmatter across the catalog.',
    help: {
      purpose: 'Check top-level skill frontmatter for required keys, naming, and description constraints.',
      useWhen: ['You changed `SKILL.md` frontmatter or want a catalog-wide metadata validation pass.'],
      examples: toolExamples({
        command: 'apltk validate-skill-frontmatter',
        result: 'Prints either a pass summary or one error per invalid skill frontmatter file.',
      }),
    },
  },
  {
    name: 'validate-openai-agent-config',
    category: 'Catalog maintenance',
    handler: validateOpenaiAgentConfigHandler,
    description: 'Validate every skill agents/openai.yaml config.',
    help: {
      purpose: 'Validate `agents/openai.yaml` for every top-level skill against the repo rules.',
      useWhen: ['You changed skill agent configs or need a catalog-wide agent-config validation pass.'],
      examples: toolExamples({
        command: 'apltk validate-openai-agent-config',
        result: 'Prints either a pass summary or one error per invalid `agents/openai.yaml` file.',
      }),
    },
  },
];

const TOOL_BY_NAME = new Map<string, ToolDefinition>();

for (const tool of TOOL_COMMANDS) {
  TOOL_BY_NAME.set(tool.name, tool);
  for (const alias of tool.aliases || []) {
    TOOL_BY_NAME.set(alias, { ...tool, name: alias, canonicalName: tool.name });
  }
}

export function getToolCommand(name: string): ToolDefinition | null {
  return TOOL_BY_NAME.get(name) || null;
}

export function listToolCommands(): ToolDefinition[] {
  return [...TOOL_COMMANDS].sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveToolCommand(name: string, sourceRoot: string): (ToolDefinition & { scriptPath?: string }) | null {
  const tool = getToolCommand(name);
  if (!tool) return null;
  return {
    ...tool,
    scriptPath: tool.script ? path.join(sourceRoot, tool.script) : undefined,
  };
}

export function formatToolList(): string {
  const tools = listToolCommands();
  const width = tools.reduce((max, tool) => Math.max(max, tool.name.length), 0);
  return tools.map((tool) => {
    const name = tool.name.padEnd(width, ' ');
    return `  ${name}  ${tool.description}`;
  }).join('\n');
}

function buildToolOverview(name: string): string | null {
  const tool = getToolCommand(name);
  if (!tool) return null;

  const lines = [
    `apltk ${tool.name} — ${tool.description}`,
    '',
    'Usage:',
    `  apltk ${tool.name} [...args]`,
    `  apltk tools ${tool.name} [...args]`,
  ];

  if (tool.help?.purpose) {
    lines.push('', 'Purpose:', `  ${tool.help.purpose}`);
  }

  if (tool.help?.useWhen?.length) {
    lines.push('', 'Use this when:', ...tool.help.useWhen.map((item) => `  - ${item}`));
  }

  if (tool.help?.insteadOf?.length) {
    lines.push('', 'Instead of:', ...tool.help.insteadOf.map((item) => `  - ${item}`));
  }

  lines.push('', 'Exact flags:', '  The native tool help appears below.');
  return lines.join('\n');
}

function buildToolExamples(name: string): string {
  const tool = getToolCommand(name);
  if (!tool || !tool.help?.examples?.length) return '';
  return ['Examples:', formatExamples(tool.help.examples)].join('\n');
}

export function buildToolDiscoveryHelp(): string {
  const categories = new Map<string, ToolDefinition[]>();
  for (const tool of listToolCommands()) {
    const category = tool.category || 'Other';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(tool);
  }

  const lines = ['Common goals:'];
  for (const [category, tools] of categories.entries()) {
    lines.push(`  ${category}:`);
    for (const tool of tools) {
      const firstUseCase = tool.help?.useWhen?.[0] || tool.description;
      lines.push(`    - \`${tool.name}\`: ${firstUseCase}`);
    }
  }
  lines.push('', 'Next step:', '  Run `apltk tools <tool> --help` for the exact flags, behavior notes, and examples of one tool.');
  return lines.join('\n');
}

function isTopLevelToolHelpRequest(toolArgs: string[]): boolean {
  return Array.isArray(toolArgs) && toolArgs.length > 0 && toolArgs.every((arg) => HELP_FLAGS.has(arg));
}

function captureCommandOutput(
  tool: ToolDefinition,
  toolArgs: string[],
  context: ToolContext = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const sourceRoot = context.sourceRoot || path.resolve(__dirname, '../..');
  const stderr = context.stderr || process.stderr;
  const env = context.env || process.env;
  const spawnCommand = context.spawnCommand || spawn;
  const toolEntry = resolveToolCommand(tool.name, sourceRoot);
  if (!toolEntry || !toolEntry.runner) {
    stderr.write(`Tool not fully configured: ${tool.name}\n`);
    return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
  }

  return new Promise((resolve) => {
    const child = spawnCommand(toolEntry.runner, [toolEntry.scriptPath, ...toolArgs], {
      cwd: context.cwd || process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });

    let stdoutText = '';
    let stderrText = '';
    let settled = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutText += String(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrText += String(chunk);
    });

    child.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      if ((error as any).killed) {
        stderr.write(`Tool timed out after 30s: ${toolEntry.runner}\n`);
      } else {
        stderr.write(`Failed to start ${toolEntry.runner}: ${error.message}\n`);
      }
      resolve({ exitCode: 1, stdout: stdoutText, stderr: stderrText });
    });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      resolve({
        exitCode: typeof code === 'number' ? code : 1,
        stdout: stdoutText,
        stderr: stderrText,
      });
    });
  });
}

export function runTool(toolName: string, toolArgs: string[], context: ToolContext = {}): Promise<number> {
  const sourceRoot = context.sourceRoot || path.resolve(__dirname, '../..');
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;
  const env = context.env || process.env;
  const spawnCommand = context.spawnCommand || spawn;
  const tool = getToolCommand(toolName);

  if (!tool) {
    stderr.write(`Unknown tool: ${toolName}\n\nAvailable tools:\n${formatToolList()}\n`);
    return Promise.resolve(1);
  }

  // Direct handler invocation (preferred)
  if (tool.handler) {
    return tool.handler(toolArgs, context);
  }

  // Spawn fallback when no handler is registered
  const toolEntry = resolveToolCommand(toolName, sourceRoot);
  if (!toolEntry || !toolEntry.scriptPath) {
    stderr.write(`Tool not fully configured: ${toolName}\n`);
    return Promise.resolve(1);
  }

  if (!fs.existsSync(toolEntry.scriptPath)) {
    stderr.write(`Tool script not found: ${toolEntry.scriptPath}\n`);
    return Promise.resolve(1);
  }

  if (isTopLevelToolHelpRequest(toolArgs)) {
    return captureCommandOutput(tool, ['--help'], context).then((nativeHelp) => {
      const blocks = [buildToolOverview(tool.name)];
      const nativeText = [nativeHelp.stdout, nativeHelp.stderr].filter(Boolean).join('').trim();
      if (nativeText) {
        blocks.push('Native flags and behavior:', nativeText);
      }
      const examplesBlock = buildToolExamples(tool.name);
      if (examplesBlock) {
        blocks.push(examplesBlock);
      }
      stdout.write(`${blocks.filter(Boolean).join('\n\n')}\n`);
      return nativeHelp.exitCode;
    });
  }

  return new Promise((resolve) => {
    const child = spawnCommand(toolEntry.runner!, [toolEntry.scriptPath, ...toolArgs], {
      cwd: context.cwd || process.cwd(),
      env,
      stdio: context.stdio || 'inherit',
    });

    child.on('error', (error: Error) => {
      stderr.write(`Failed to start ${toolEntry!.runner}: ${error.message}\n`);
      resolve(1);
    });

    child.on('close', (code: number | null) => {
      resolve(typeof code === 'number' ? code : 1);
    });
  });
}

// Re-export for backward compatibility
export { formatExamples, buildToolOverview, buildToolExamples, isTopLevelToolHelpRequest, captureCommandOutput };

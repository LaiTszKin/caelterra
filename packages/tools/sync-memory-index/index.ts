import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';

const START_MARKER = '<!-- codex-memory-manager:start -->';
const END_MARKER = '<!-- codex-memory-manager:end -->';
const DEFAULT_SECTION_TITLE = '## User Memory Index';
const DEFAULT_INSTRUCTIONS = [
  'Before starting work, review the index below and open any relevant user preference files.',
  'When a new preference category appears, create or update the matching memory file and refresh this index.',
];

function titleFromMemoryFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Split on \n (trailing \r on Windows is stripped by .trim() below)
    for (const line of content.split('\n')) {
      const stripped = line.trim();
      if (stripped.startsWith('# ')) {
        return stripped.slice(2).trim() || path.basename(filePath).replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
  } catch {
    // fall through
  }
  return path.basename(filePath).replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function iterMemoryFiles(memoryDir: string): string[] {
  if (!fs.existsSync(memoryDir)) return [];
  const entries = fs.readdirSync(memoryDir);
  return entries
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(memoryDir, name))
    .filter((p) => fs.statSync(p).isFile())
    .sort((a, b) => path.basename(a).toLowerCase().localeCompare(path.basename(b).toLowerCase()));
}

function renderSection(memoryFiles: string[], sectionTitle: string, instructionLines: string[]): string {
  const lines = [START_MARKER, sectionTitle.trim(), ''];

  const cleaned = instructionLines.filter((line) => line && line.trim());
  for (const line of cleaned) {
    lines.push(line.trim());
  }
  if (cleaned.length) lines.push('');

  if (memoryFiles.length) {
    const entries = memoryFiles
      .map((p) => ({ title: titleFromMemoryFile(p), resolved: path.resolve(p) }))
      .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.resolved.localeCompare(b.resolved));
    for (const { title, resolved } of entries) {
      lines.push(`- [${title}](file://${resolved})`);
    }
  } else {
    lines.push('- No memory files are currently indexed.');
  }

  lines.push(END_MARKER);
  return lines.join('\n');
}

function removeExistingSection(content: string): string {
  const pattern = new RegExp(`\n*${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}\n*`, 'g');
  return content.replace(pattern, '\n\n').trimEnd();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function syncAgentsFile(agentsFile: string, sectionText: string): void {
  const dir = path.dirname(agentsFile);
  fs.mkdirSync(dir, { recursive: true });

  let original = '';
  try {
    original = fs.readFileSync(agentsFile, 'utf8');
  } catch {
    // file doesn't exist
  }

  const base = removeExistingSection(original);
  // Note: sectionText uses adapter.EOL internally. Hardcoded \n joiners
  // here may produce mixed line endings on Windows. For this use case
  // (AGENTS.md readability) both formats work correctly.
  const updated = base ? `${base}\n\n${sectionText}\n` : `${sectionText}\n`;
  fs.writeFileSync(agentsFile, updated, 'utf8');
}

async function syncMemoryIndexHandler(
  args: string[],
  context: ToolContext,
): Promise<number> {
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;

  try {
    const homeDir = process.env.HOME || '';
    let agentsFile = path.join(homeDir, '.codex', 'AGENTS.md');
    let memoryDir = path.join(homeDir, '.codex', 'memory');
    let sectionTitle = DEFAULT_SECTION_TITLE;
    const instructionLines = [...DEFAULT_INSTRUCTIONS];

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--agents-file' && i + 1 < args.length) agentsFile = args[++i];
      else if (args[i] === '--memory-dir' && i + 1 < args.length) memoryDir = args[++i];
      else if (args[i] === '--section-title' && i + 1 < args.length) sectionTitle = args[++i];
      else if (args[i] === '--instruction-line' && i + 1 < args.length) instructionLines.push(args[++i]);
    }

    const memoryFiles = iterMemoryFiles(memoryDir);
    const sectionText = renderSection(memoryFiles, sectionTitle, instructionLines);
    syncAgentsFile(agentsFile, sectionText);

    stdout.write(`SYNCED_AGENTS_FILE=${path.resolve(agentsFile)}\n`);
    stdout.write(`MEMORY_FILES_INDEXED=${memoryFiles.length}\n`);
    return 0;
  } catch (err) {
    stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

export const tool: ToolDefinition = {
  name: 'sync-memory-index',
  category: 'Maintenance',
  description: 'Sync memory file index into AGENTS.md',
  handler: syncMemoryIndexHandler,
};

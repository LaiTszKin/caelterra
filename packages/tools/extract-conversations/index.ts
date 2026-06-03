import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { UserInputError, createToolRunner } from '@laitszkin/tool-utils';

function getCodexHome(): string {
  return process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex');
}

interface Session {
  id: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
}

function readSessionsDir(sessionsDir: string): Session[] {
  if (!fs.existsSync(sessionsDir)) return [];

  const sessions: Session[] = [];
  const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionDir = path.join(sessionsDir, entry.name);
    const metaFile = path.join(sessionDir, 'session.json');
    if (!fs.existsSync(metaFile)) continue;

    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      sessions.push({
        id: entry.name,
        title: meta.title || entry.name,
        startedAt: meta.startedAt || '',
        updatedAt: meta.updatedAt || '',
        messageCount: meta.messages?.length || 0,
      });
    } catch {
      // skip malformed sessions
    }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function filterSessionsByHours(sessions: Session[], hours: number): Session[] {
  if (hours <= 0) return sessions;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return sessions.filter((s) => {
    const t = new Date(s.updatedAt).getTime();
    return !isNaN(t) && t >= cutoff;
  });
}

const schema = {
  options: {
    hours: { type: 'string' as const, default: '24' },
    format: { type: 'string' as const, default: 'text' },
  },
  allowPositionals: true,
  usage: 'apltk extract-conversations [options]',
  description: 'Extract recent Codex sessions for memory updates.',
  handler: async (
    values: Record<string, unknown>,
    _positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const stdout = context.stdout ?? process.stdout;

    const hours = parseInt(values.hours as string, 10);
    if (isNaN(hours) || hours <= 0) {
      throw new UserInputError('--hours must be a positive number');
    }

    const format = values.format as string;
    if (format !== 'json' && format !== 'text') {
      throw new UserInputError('--format must be "json" or "text"');
    }

    const codexHome = getCodexHome();
    const sessionsDir = path.join(codexHome, 'sessions');
    const archivedDir = path.join(codexHome, 'sessions', '.archived');

    let sessions = readSessionsDir(sessionsDir);

    // Also read archived sessions
    if (fs.existsSync(archivedDir)) {
      const archived = readSessionsDir(archivedDir);
      sessions = [...sessions, ...archived];
    }

    sessions = filterSessionsByHours(sessions, hours);

    if (format === 'json') {
      const output = {
        totalSessions: sessions.length,
        hours,
        sessions: sessions.map((s) => ({
          id: s.id,
          title: s.title,
          startedAt: s.startedAt,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
          sessionPath: path.join(sessionsDir, s.id),
        })),
      };
      stdout.write(JSON.stringify(output, null, 2));
      stdout.write('\n');
    } else {
      stdout.write(`Recent Codex sessions (last ${hours}h):\n`);
      stdout.write(`Found ${sessions.length} sessions\n\n`);
      for (const session of sessions) {
        stdout.write(`  [${session.id}] ${session.title}\n`);
        stdout.write(`    Started: ${session.startedAt}\n`);
        stdout.write(`    Updated: ${session.updatedAt}\n`);
        stdout.write(`    Messages: ${session.messageCount}\n\n`);
      }
    }

    return 0;
  },
};

// ---- Tool definition ----

export const tool: ToolDefinition = {
  name: 'extract-conversations',
  category: 'Codex memory & learning',
  description: 'Extract recent Codex sessions for memory updates.',
  aliases: ['extract-codex-conversations', 'extract-skill-conversations'],
  handler: createToolRunner(schema),
};

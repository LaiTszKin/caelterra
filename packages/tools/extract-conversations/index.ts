import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';

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

export async function extractConversationsHandler(
  args: string[],
  context: ToolContext,
): Promise<number> {
  try {
    let hours = 24;
    let format: 'json' | 'text' = 'text';

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--hours' && i + 1 < args.length) hours = parseInt(args[++i], 10) || 24;
      else if (args[i] === '--format' && i + 1 < args.length) {
        const val = args[++i];
        if (val === 'json' || val === 'text') format = val;
      }
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
      context.stdout!.write(JSON.stringify(output, null, 2));
      context.stdout!.write('\n');
    } else {
      context.stdout!.write(`Recent Codex sessions (last ${hours}h):\n`);
      context.stdout!.write(`Found ${sessions.length} sessions\n\n`);
      for (const session of sessions) {
        context.stdout!.write(`  [${session.id}] ${session.title}\n`);
        context.stdout!.write(`    Started: ${session.startedAt}\n`);
        context.stdout!.write(`    Updated: ${session.updatedAt}\n`);
        context.stdout!.write(`    Messages: ${session.messageCount}\n\n`);
      }
    }

    return 0;
  } catch (err) {
    const stderr = context.stderr || process.stderr;
    stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

// ---- Tool definition ----

export const tool: ToolDefinition = {
  name: 'extract-conversations',
  category: 'Codex memory & learning',
  description: 'Extract recent Codex sessions for memory updates.',
  aliases: ['extract-codex-conversations', 'extract-skill-conversations'],
  handler: extractConversationsHandler,
};

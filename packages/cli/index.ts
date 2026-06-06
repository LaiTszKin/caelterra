import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { color, supportsColor, supportsAnimation, buildBanner, buildWordmark, buildWelcomeScreen, buildSupportedTargetLines, renderSelectionScreen, animateWelcomeScreen, promptYesNo, promptForModes, isInteractive, createStdioWriter } from '@laitszkin/tui';
import type { TargetDefinition, StdioWriter } from '@laitszkin/tui';
import { runTool } from '@laitszkin/tool-registry';
import {
  TARGET_DEFINITIONS,
  VALID_MODES,
  installLinks,
  listAllKnownSkillNames,
  listCodexSkillNames,
  normalizeModes,
  resolveToolkitHome,
  syncToolkitHome,
  uninstallSkills,
  getTargetRoots,
  getUninstallTargetRoots,
  expandUserPath,
  readManifest,
  writeManifest,
  resolveHomeDirectory,
  listSkillNames,
} from './installer.js';
import { checkForPackageUpdate, compareVersions, execCommand } from './updater.js';
import { registerAllTools, isKnownToolName } from './tool-registration.js';

// Re-export installer functions for external consumers (tests, bin)
export {
  TARGET_DEFINITIONS,
  VALID_MODES,
  installLinks,
  listAllKnownSkillNames,
  listCodexSkillNames,
  normalizeModes,
  resolveToolkitHome,
  syncToolkitHome,
  uninstallSkills,
  getTargetRoots,
  getUninstallTargetRoots,
  expandUserPath,
  readManifest,
  writeManifest,
  resolveHomeDirectory,
  listSkillNames,
  checkForPackageUpdate,
  compareVersions,
  execCommand,
};
import type { CliContext, InstallMode, ParsedArguments } from './types.js';
import type { CommandParser } from './parsers/types.js';
import { formatAppError } from '@laitszkin/tool-utils';
import { InstallArgsParser } from './parsers/install-parser.js';
import { UninstallArgsParser } from './parsers/uninstall-parser.js';
import { ToolArgsParser } from './parsers/tool-parser.js';
import { HelpTextBuilder } from './help-text-builder.js';

function readPackageJson(sourceRoot: string): { version: string; name: string } {
  return JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
}

function parseArguments(argv: string[]): ParsedArguments {
  const firstArg = argv[0];

  // Shared parser instances (eliminates double instantiation)
  const installParser = new InstallArgsParser();
  const toolParser = new ToolArgsParser();

  // Dispatch table for all known command types
  // ==== Collision zone (FIX-09) ====
  // L55-190 and L349-360 are high-collision regions touched by dispatch,
  // parser, and error-boundary changes.  Modify with care.
  // =================================

  const commandParsers = new Map<string, CommandParser<any>>([
    ['install', installParser],
    ['uninstall', new UninstallArgsParser()],
    ['tools', toolParser],
    ['tool', toolParser],
  ]);

  // Command dispatch: iterate parsers, first match wins
  for (const [name, parser] of commandParsers) {
    if (firstArg === name) {
      const result = parser.parse(argv);
      return parser.toParsedArguments(result);
    }
  }

  // Direct tool name (no "tools" prefix) — route through the 'tool' dispatch table entry
  if (firstArg && isKnownToolName(firstArg)) {
    return toolParser.toParsedArguments(toolParser.parse(argv));
  }

  // Default: install (handles bare arguments like "codex", "--help", or empty argv)
  return installParser.toParsedArguments(installParser.parse(argv));
}

function buildSymlinkInfo({ colorEnabled }: { colorEnabled: boolean }): string {
  return [
    '',
    color('Symlink mode:', '1', colorEnabled),
    `  ${color('Pro:', '1;32', colorEnabled)} Skills auto-update when you ${color('git pull', '1;33', colorEnabled)} in ~/.apollo-toolkit`,
    `  ${color('Pro:', '1;32', colorEnabled)} No need to re-run installer after patch updates`,
    `  ${color('Con:', '1;31', colorEnabled)} Changes pushed to the repo automatically reflect in your skills -`,
    `       you may receive updates you did not intend to accept`,
    '',
  ].join('\n');
}

async function promptSymlinkChoice({ stdin, stdout, env, colorEnabled }: {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  env: NodeJS.ProcessEnv;
  colorEnabled: boolean;
}): Promise<boolean> {
  stdout.write(buildSymlinkInfo({ colorEnabled }));
  return promptYesNo({ message: 'Install skills as symlinks (recommended)?', default: true, input: stdin, output: stdout });
}

async function promptIncludeExclusiveSkills({ stdin, stdout, env, colorEnabled, codexSkillNames, nonCodexModes }: {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  env: NodeJS.ProcessEnv;
  colorEnabled: boolean;
  codexSkillNames: string[];
  nonCodexModes: string[];
}): Promise<boolean> {
  if (codexSkillNames.length === 0 || nonCodexModes.length === 0) return false;

  stdout.write([
    '',
    color('Exclusive skills detected:', '1;33', colorEnabled),
    `  The following skills are exclusive to codex: ${codexSkillNames.join(', ')}`,
    `  Your selected non-codex targets: ${nonCodexModes.join(', ')}`,
    '',
  ].join('\n'));

  return promptYesNo({
    message: `Install codex-exclusive skills to ${nonCodexModes.join(', ')} as well?`,
    default: false,
    input: stdin,
    output: stdout,
  });
}

async function confirmInstall({ stdin, stdout, version, toolkitHome, modes, linkMode, env }: {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  version: string;
  toolkitHome: string;
  modes: string[];
  linkMode: string;
  env: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const colorEnabled = supportsColor(stdout, env);
  stdout.write(`${buildBanner({ version, colorEnabled })}\n\n`);
  stdout.write(`Apollo Toolkit home: ${toolkitHome}\n`);
  stdout.write(`Targets: ${modes.join(', ')}\n`);
  stdout.write(`Install mode: ${linkMode === 'symlink' ? 'symlink (auto-update via git pull)' : 'copy (manual reinstall for updates)'}\n\n`);

  const targets = await getTargetRoots(modes, env);
  for (const target of targets) {
    stdout.write(`- ${target.label}: ${target.root}\n`);
  }
  stdout.write('\n');

  if (!isInteractive(stdin, stdout, env)) return true;

  return promptYesNo({ message: 'Install Apollo Toolkit to these targets?', default: true, input: stdin, output: stdout });
}

function printSummary({ stdout, version, toolkitHome, modes, installResult, env }: {
  stdout: NodeJS.WriteStream;
  version: string;
  toolkitHome: string;
  modes: string[];
  installResult: any;
  env: NodeJS.ProcessEnv;
}): void {
  const colorEnabled = supportsColor(stdout, env);
  stdout.write(`\n${buildBanner({ version, colorEnabled })}\n\n`);
  stdout.write(color('Installation complete.', '1;32', colorEnabled));
  stdout.write('\n');
  stdout.write(`Apollo Toolkit home: ${toolkitHome}\n`);
  stdout.write(`Installed skills: ${installResult.skillNames.length}\n`);
  stdout.write(`Install mode: ${installResult.linkMode === 'symlink' ? 'symlink' : 'copy'}\n`);
  stdout.write(`Targets: ${modes.join(', ')}\n\n`);

  for (const target of installResult.targets) {
    stdout.write(`- ${target.label}: ${target.root}\n`);
  }
}

function printUninstallSummary({ stdout, uninstallResult, env }: {
  stdout: NodeJS.WriteStream;
  uninstallResult: { target: string; root: string; removedSkills: string[] }[];
  env: NodeJS.ProcessEnv;
}): void {
  const colorEnabled = supportsColor(stdout, env);

  if (uninstallResult.length === 0) {
    stdout.write(color('No Apollo Toolkit installations found.\n', '1;33', colorEnabled));
    return;
  }

  stdout.write(color('Uninstall complete.', '1;32', colorEnabled));
  stdout.write('\n\n');
  for (const result of uninstallResult) {
    stdout.write(`${color(result.target, '1', colorEnabled)} (${result.root})\n`);
    stdout.write(`  Removed: ${result.removedSkills.length > 0 ? result.removedSkills.join(', ') : '(manifest only)'}\n`);
  }
}

export { InstallArgsParser } from './parsers/install-parser.js';
export { UninstallArgsParser } from './parsers/uninstall-parser.js';
export { ToolArgsParser } from './parsers/tool-parser.js';
export { HelpTextBuilder } from './help-text-builder.js';
export { normalizeParseError } from './parsers/parser-utils.js';

export { parseArguments, buildBanner, buildWelcomeScreen, registerAllTools };

export async function run(argv: string[], context: CliContext = {}): Promise<number> {
  const __filename = fileURLToPath(import.meta.url);
  const __dir = path.dirname(__filename);
  const sourceRoot = context.sourceRoot || path.resolve(__dir, '../../..');
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;
  const stdin = context.stdin || process.stdin;
  const env = context.env || process.env;
  const stdioWriter: StdioWriter = createStdioWriter({ stdout, stderr, env });
  let packageJson = readPackageJson(sourceRoot);

  try {
    const parsed = parseArguments(argv);

    if (parsed.showHelp) {
      const colorEnabled = supportsColor(stdout, env);
      if (parsed.helpTopic === 'overview') await registerAllTools();
      const builder = new HelpTextBuilder({ version: packageJson.version, colorEnabled });
      const helpText = parsed.helpTopic === 'install'
        ? builder.install()
        : parsed.helpTopic === 'uninstall'
          ? builder.uninstall()
          : builder.overview();
      stdout.write(`${helpText}\n`);
      return 0;
    }

    if (parsed.showToolsHelp) {
      await registerAllTools();
      stdout.write(`${new HelpTextBuilder({ version: packageJson.version, colorEnabled: supportsColor(stdout, env) }).toolsHelp()}\n`);
      return 0;
    }

    // Tool dispatch error patterns (FIX-10):
    // Pattern A (createToolRunner tools): handler throws -> caught internally ->
    //   formatAppError + return 1
    // Pattern B (carryover tools): handler throws -> propagates through runTool ->
    //   CLI boundary catch -> formatAppError + return 1
    // Both patterns converge on the same formatting at the boundary.
    if (parsed.command === 'tool') {
      await registerAllTools();
      return await (context.runTool || runTool)(parsed.toolName!, parsed.toolArgs, {
        sourceRoot, stdout, stderr, env, spawnCommand: context.spawnCommand, stdioWriter,
      });
    }

    // Uninstall flow
    if (parsed.command === 'uninstall') {
      const toolkitHome = parsed.toolkitHome || resolveToolkitHome(env);
      const isTTY = isInteractive(stdin, stdout, env);

      let resolvedModes: InstallMode[] | null = null;
      if (parsed.modes.length > 0) {
        resolvedModes = normalizeModes(parsed.modes);
      } else if (isTTY) {
        const selected = await promptForModes({
          message: 'Choose which agent skill targets Apollo Toolkit should uninstall.',
          choices: [...TARGET_DEFINITIONS].map((t) => ({ name: t.label, value: t.id, description: t.description })),
          input: stdin,
          output: stdout,
        });
        resolvedModes = normalizeModes(selected);
      }

      const modesForLookup = resolvedModes || [...VALID_MODES];
      const targets = await getUninstallTargetRoots(modesForLookup, env);

      const allKnown = await listAllKnownSkillNames({ toolkitHome, modes: modesForLookup, env });
      stdout.write(color(`Apollo Toolkit home: ${toolkitHome}\n`, '2', supportsColor(stdout, env)));
      if (targets.length > 0) {
        stdout.write('Targets:\n');
        for (const target of targets) {
          stdout.write(`- ${target.label}: ${target.root}\n`);
        }
      }

      const confirmed = parsed.assumeYes || await promptYesNo({
        message: `This will remove Apollo Toolkit-installed skills${resolvedModes ? ` from: ${resolvedModes.join(', ')}` : ' from all targets'}. Continue?`,
        default: false,
        input: stdin,
        output: stdout,
      });

      if (!confirmed) {
        stdout.write('Uninstall cancelled.\n');
        return 1;
      }

      const uninstallResult = await uninstallSkills({ env, modes: resolvedModes ? [...normalizeModes(resolvedModes)] as InstallMode[] : undefined });
      printUninstallSummary({ stdout, uninstallResult, env });

      if (allKnown.length > 0) {
        stdout.write(`\nPreviously known skills (may still exist elsewhere): ${allKnown.join(', ')}\n`);
      }

      return 0;
    }

    // Install flow
    const updateResult = await checkForPackageUpdate({
      packageName: packageJson.name,
      currentVersion: packageJson.version,
      env,
      stdin,
      stdout,
      stderr,
      exec: context.execCommand as any,
      confirmUpdate: context.confirmUpdate as any,
    });

    if (updateResult.updated) {
      packageJson = readPackageJson(sourceRoot);
    }

    const toolkitHome = parsed.toolkitHome || resolveToolkitHome(env);
    const modes: InstallMode[] = parsed.modes.length > 0
      ? normalizeModes(parsed.modes)
      : normalizeModes(await promptForModes({
          message: 'Choose where Apollo Toolkit should copy managed skills.',
          choices: [...TARGET_DEFINITIONS].map((t) => ({ name: t.label, value: t.id, description: t.description })),
          input: stdin,
          output: stdout,
        }));

    const colorEnabled = supportsColor(stdout, env);

    // Show welcome animation only in interactive mode
    if (parsed.modes.length === 0) {
      await animateWelcomeScreen({ output: stdout, version: packageJson.version, env, targets: [...TARGET_DEFINITIONS] });
    }

    let linkMode: 'copy' | 'symlink' | null = parsed.linkMode;
    if (!linkMode) {
      linkMode = (await promptSymlinkChoice({ stdin, stdout, env, colorEnabled })) ? 'symlink' : 'copy';
    }

    const nonCodexModes = modes.filter((m) => m !== 'codex');
    const codexSkillNames = await listCodexSkillNames(toolkitHome).catch(() => []);
    const includeExclusiveSkills = await promptIncludeExclusiveSkills({
      stdin, stdout, env, colorEnabled, codexSkillNames, nonCodexModes,
    });

    const effectiveModes: InstallMode[] = includeExclusiveSkills
      ? [...new Set<InstallMode>([...modes, 'codex'])]
      : modes;

    const confirmed = await confirmInstall({
      stdin, stdout, version: packageJson.version, toolkitHome, modes, linkMode, env,
    });

    if (!confirmed) {
      stdout.write('Installation cancelled.\n');
      return 1;
    }

    const syncResult = await syncToolkitHome({ sourceRoot, toolkitHome, version: packageJson.version, modes: effectiveModes });
    const installResult = await installLinks({
      toolkitHome,
      modes,
      previousSkillNames: syncResult.previousSkillNames,
      linkMode,
      includeExclusiveSkills,
      env: { ...env, APOLLO_TOOLKIT_HOME: toolkitHome },
    });

    printSummary({ stdout, version: packageJson.version, toolkitHome, modes, installResult, env });
    return 0;
  } catch (error) {
    formatAppError(stderr, error);
    return 1;
  }
}

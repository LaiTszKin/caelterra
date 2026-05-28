import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { color, supportsColor, supportsAnimation, buildBanner, buildWordmark, buildWelcomeScreen, buildSupportedTargetLines, renderSelectionScreen, animateWelcomeScreen, promptYesNo, promptForModes } from '@laitszkin/tui';
import type { TargetDefinition } from '@laitszkin/tui';
import { formatToolList, buildToolDiscoveryHelp, runTool, getTool as getToolCommand } from '@laitszkin/tool-registry';
import { formatExamples } from '@laitszkin/tool-registry';
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

function buildModeUsagePattern(): string {
  return `${VALID_MODES.join('|')}|all`;
}

function buildInteractiveModeHint(): string {
  const quotedModes = [...VALID_MODES, 'all'].map((mode) => `\`${mode}\``);
  return `${quotedModes.slice(0, -1).join(', ')}, or ${quotedModes.at(-1)}`;
}

function buildHelpText({ version, colorEnabled }: { version: string; colorEnabled: boolean }): string {
  const examples = [
    { command: 'apltk --help', result: 'Shows the top-level Apollo Toolkit guide, including install modes and bundled task-tool discovery.' },
    { command: 'apltk tools --help', result: 'Lists bundled tools by task so you can decide which CLI helper to inspect next.' },
    { command: 'apltk architecture --help', result: 'Shows the architecture atlas command tree, task guidance, and action-specific follow-up help paths.' },
    { command: 'apltk tools architecture --help', result: 'Shows what the architecture atlas tool is for, then prints its native command tree and examples.' },
    { command: 'apltk filter-logs app.log --start 2026-03-24T10:00:00Z', result: 'Prints only the log lines whose timestamps fall within the requested time window.' },
  ];
  return [
    buildBanner({ version, colorEnabled }),
    '',
    'Usage:',
    `  apltk [install] [${buildModeUsagePattern()}]...`,
    `  apollo-toolkit [install] [${buildModeUsagePattern()}]...`,
    `  apltk uninstall [${buildModeUsagePattern()}]... [--yes]`,
    '  apltk tools',
    '  apltk <tool> [...args]',
    '  apltk tools <tool> [...args]',
    '  apltk --help',
    '  apollo-toolkit --help',
    '',
    'Common goals:',
    '  - Install or refresh skills in one or more agent targets: `apltk install --help`',
    '  - Remove manifest-tracked installs from selected targets: `apltk uninstall --help`',
    '  - Discover which bundled helper tool matches a task: `apltk tools --help`',
    '  - Inspect one tool deeply before running it: `apltk tools <tool> --help`',
    '',
    'Bundled tools:',
    formatToolList(),
    '',
    buildToolDiscoveryHelp(),
    '',
    'Options:',
    '  --home <path>  Override Apollo Toolkit home directory',
    '  --symlink      Install skills as symlinks instead of copied directories',
    '  --copy         Install skills as copied directories instead of symlinks',
    '  --yes, -y      Skip uninstall confirmation',
    '  --help         Show this help text',
    '',
    'Examples:',
    formatExamples(examples),
  ].join('\n');
}

function buildToolsHelp({ version, colorEnabled }: { version: string; colorEnabled: boolean }): string {
  const examples = [
    { command: 'apltk tools', result: 'Lists all bundled tools plus the task-oriented discovery guide.' },
    { command: 'apltk tools open-github-issue --help', result: 'Shows when to use the GitHub issue publisher, then prints its exact script flags and examples.' },
    { command: 'apltk tools architecture --help', result: 'Shows when to use the architecture atlas CLI, then prints its native command tree.' },
  ];
  return [
    buildBanner({ version, colorEnabled }),
    '',
    'Usage:',
    '  apltk tools',
    '  apltk <tool> [...args]',
    '  apltk tools <tool> [...args]',
    '',
    buildToolDiscoveryHelp(),
    '',
    'Bundled tools:',
    formatToolList(),
    '',
    'Tip:',
    '  Pass `--help` after a tool name to view task guidance, native script flags, and concrete examples.',
    '',
    'Examples:',
    formatExamples(examples),
  ].join('\n');
}

function buildInstallHelpText({ version, colorEnabled }: { version: string; colorEnabled: boolean }): string {
  const examples = [
    { command: 'apltk', result: 'Launches the interactive installer, opens the target selector, and then walks through link-mode confirmation.' },
    { command: 'apltk codex openclaw --symlink', result: 'Performs a non-interactive install into `codex` and `openclaw` targets using symlinks.' },
    { command: 'npx @laitszkin/apollo-toolkit all --copy', result: 'Installs a copied snapshot into every supported target instead of symlinking.' },
  ];
  return [
    buildBanner({ version, colorEnabled }),
    '',
    'Usage:',
    `  apltk [install] [${buildModeUsagePattern()}]...`,
    `  apollo-toolkit [install] [${buildModeUsagePattern()}]...`,
    '',
    'Use this when:',
    '  - You want to install or refresh Apollo Toolkit skills in one or more agent targets.',
    '  - You need to choose between symlink mode (auto-updating) and copy mode (stable snapshot).',
    '',
    'Supported targets:',
    buildSupportedTargetLines({ targets: [...TARGET_DEFINITIONS], colorEnabled }),
    '',
    'Behavior notes:',
    '  - Running `apltk` with no targets opens the interactive installer and target selector.',
    '  - `--symlink` keeps installed skills connected to the managed toolkit checkout in `~/.apollo-toolkit`.',
    '  - `--copy` installs a snapshot that only changes when you run the installer again.',
    '  - The installer can optionally include codex-exclusive skills in non-codex targets after prompting.',
    '',
    'Options:',
    '  --home <path>  Override Apollo Toolkit home directory',
    '  --symlink      Install skills as symlinks (recommended)',
    '  --copy         Install skills as copied directories',
    '  --help         Show this install help',
    '',
    'Examples:',
    formatExamples(examples),
  ].join('\n');
}

function buildUninstallHelpText({ version, colorEnabled }: { version: string; colorEnabled: boolean }): string {
  const examples = [
    { command: 'apltk uninstall', result: 'Opens the interactive uninstall selector when running in a TTY and then asks for confirmation before removal.' },
    { command: 'apltk uninstall codex agents --yes', result: 'Removes Apollo Toolkit-managed installs from `codex` and `agents` without another confirmation prompt.' },
    { command: 'apltk uninstall codex --home /tmp/custom-home', result: 'Uses the custom managed toolkit home while removing manifest-tracked installs from the selected target.' },
  ];
  return [
    buildBanner({ version, colorEnabled }),
    '',
    'Usage:',
    `  apltk uninstall [${buildModeUsagePattern()}]... [--yes]`,
    '',
    'Use this when:',
    '  - You want to remove Apollo Toolkit-managed skills from one or more agent targets.',
    '  - You need to clean up manifest-tracked historical installs as well as the current installed skills.',
    '',
    'Supported targets:',
    buildSupportedTargetLines({ targets: [...TARGET_DEFINITIONS], colorEnabled }),
    '',
    'Behavior notes:',
    '  - With no explicit targets, uninstall opens the interactive selector in a TTY and otherwise falls back to all targets.',
    '  - Uninstall removes manifest-tracked current and historical Apollo Toolkit skill directories.',
    '  - `--yes` skips the confirmation prompt after the target list is resolved.',
    '',
    'Options:',
    '  --home <path>  Override Apollo Toolkit home directory',
    '  --yes, -y      Skip uninstall confirmation',
    '  --help         Show this uninstall help',
    '',
    'Examples:',
    formatExamples(examples),
  ].join('\n');
}

function readPackageJson(sourceRoot: string): { version: string; name: string } {
  return JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
}

function parseArguments(argv: string[]): ParsedArguments {
  const args = [...argv];
  const result: ParsedArguments = {
    command: 'install',
    modes: [],
    showHelp: false,
    showToolsHelp: false,
    toolkitHome: null,
    toolName: null,
    toolArgs: [],
    linkMode: null,
    assumeYes: false,
    explicitInstallCommand: false,
    helpTopic: 'overview',
  };

  if (args[0] === 'uninstall') {
    result.command = 'uninstall';
    args.shift();
    while (args.length > 0) {
      const arg = args.shift()!;
      if (arg === '--help' || arg === '-h') {
        result.showHelp = true;
      } else if (arg === '--yes' || arg === '-y') {
        result.assumeYes = true;
      } else if (arg === '--home') {
        const toolkitHome = args.shift();
        if (!toolkitHome) throw new Error('Missing value for --home');
        result.toolkitHome = path.resolve(toolkitHome);
      } else {
        result.modes.push(arg as InstallMode);
      }
    }
    if (result.showHelp) result.helpTopic = 'uninstall';
    return result;
  }

  if (args[0] === 'tools' || args[0] === 'tool') {
    args.shift();
    const nextArg: string | undefined = args[0];
    if (args.length === 0 || nextArg === '--help' || nextArg === '-h') {
      result.command = 'tools-help';
      result.showToolsHelp = true;
      return result;
    }
    result.command = 'tool';
    result.toolName = args.shift() || null;
    result.toolArgs = args;
    return result;
  }

  const firstArg = args[0];
  if (firstArg && isKnownToolName(firstArg)) {
    result.command = 'tool';
    result.toolName = args.shift() || null;
    result.toolArgs = args;
    return result;
  }

  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true;
      continue;
    }
    if (arg === '--home') {
      const toolkitHome = args.shift();
      if (!toolkitHome) throw new Error('Missing value for --home');
      result.toolkitHome = path.resolve(toolkitHome);
      continue;
    }
    if (arg === '--symlink') {
      result.linkMode = 'symlink';
      continue;
    }
    if (arg === '--copy') {
      result.linkMode = 'copy';
      continue;
    }
    if (arg === 'install') {
      result.explicitInstallCommand = true;
      continue;
    }
    result.modes.push(arg as InstallMode);
  }

  if (result.showHelp) {
    const installContextRequested = result.explicitInstallCommand
      || result.modes.length > 0
      || result.linkMode !== null
      || result.toolkitHome !== null;
    result.helpTopic = installContextRequested ? 'install' : 'overview';
  }

  return result;
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

  if (!stdin.isTTY || !stdout.isTTY) return true;

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

export { parseArguments, buildHelpText, buildInstallHelpText, buildUninstallHelpText, buildToolsHelp, buildBanner, buildWelcomeScreen, registerAllTools };

export async function run(argv: string[], context: CliContext = {}): Promise<number> {
  const __filename = fileURLToPath(import.meta.url);
  const __dir = path.dirname(__filename);
  const sourceRoot = context.sourceRoot || path.resolve(__dir, '../../..');
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;
  const stdin = context.stdin || process.stdin;
  const env = context.env || process.env;
  let packageJson = readPackageJson(sourceRoot);

  try {
    const parsed = parseArguments(argv);

    if (parsed.showHelp) {
      const colorEnabled = supportsColor(stdout, env);
      if (parsed.helpTopic === 'overview') await registerAllTools();
      const helpText = parsed.helpTopic === 'install'
        ? buildInstallHelpText({ version: packageJson.version, colorEnabled })
        : parsed.helpTopic === 'uninstall'
          ? buildUninstallHelpText({ version: packageJson.version, colorEnabled })
          : buildHelpText({ version: packageJson.version, colorEnabled });
      stdout.write(`${helpText}\n`);
      return 0;
    }

    if (parsed.showToolsHelp) {
      await registerAllTools();
      stdout.write(`${buildToolsHelp({ version: packageJson.version, colorEnabled: supportsColor(stdout, env) })}\n`);
      return 0;
    }

    if (parsed.command === 'tool') {
      await registerAllTools();
      return (context.runTool || runTool)(parsed.toolName!, parsed.toolArgs, {
        sourceRoot, stdout, stderr, env, spawnCommand: context.spawnCommand,
      });
    }

    // Uninstall flow
    if (parsed.command === 'uninstall') {
      const toolkitHome = parsed.toolkitHome || resolveToolkitHome(env);
      const isTTY = stdin.isTTY && stdout.isTTY;

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
    stderr.write(`Error: ${(error as Error).message}\n`);
    return 1;
  }
}

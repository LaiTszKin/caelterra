import type { TargetDefinition } from './types.js';
import {
  color,
  clearScreen,
  sleep,
  supportsAnimation,
  supportsColor,
} from './terminal.js';

const WORDMARK_LINES = [
  '    _                _ _        _____           _ _    _ _   ',
  '   / \\\\   _ __   ___ | | | ___  |_   _|__   ___ | | | _(_) |_ ',
  "  / _ \\\\ | '_ \\\\ / _ \\\\| | |/ _ \\\\   | |/ _ \\\\ / _ \\\\| | |/ / | __|",
  ' / ___ \\\\| |_) | (_) | | | (_) |  | | (_) | (_) | |   <| | |_ ',
  '/_/   \\\\_\\\\ .__/ \\\\___/|_|_|\\\\___/   |_|\\\\___/ \\\\___/|_|_|\\\\_\\\\_|\\\\__|',
  '         |_|                                                      ',
];

export interface BannerOpts {
  version: string;
  colorEnabled: boolean;
}

export interface WelcomeScreenOpts {
  version: string;
  colorEnabled: boolean;
  stage?: number;
  targets?: TargetDefinition[];
}

export interface SelectionScreenOpts {
  output: NodeJS.WriteStream;
  version: string;
  cursor: number;
  selected: Set<string>;
  message: string;
  env: NodeJS.ProcessEnv;
  intro?: string;
  choices: { id: string; label: string; description: string }[];
  allValues: string[];
}

export function buildWordmark({
  colorEnabled,
}: {
  colorEnabled: boolean;
}): string {
  return WORDMARK_LINES.map((line) => color(line, '1;36', colorEnabled)).join(
    '\n',
  );
}

export function buildBanner({ version, colorEnabled }: BannerOpts): string {
  return [
    buildWordmark({ colorEnabled }),
    color('Apollo Toolkit', '1', colorEnabled),
    color(
      'Install curated skills for Codex, OpenClaw, Trae, Agents, and Claude Code',
      '2',
      colorEnabled,
    ),
    color(`Version ${version}`, '1;33', colorEnabled),
  ].join('\n');
}

export function buildSupportedTargetLines({
  targets,
  colorEnabled,
}: {
  targets: TargetDefinition[];
  colorEnabled: boolean;
}): string {
  const labelWidth = targets.reduce(
    (max, t) => Math.max(max, t.label.length),
    0,
  );
  return targets
    .map(
      (t) =>
        `  ${color(t.label.padEnd(labelWidth, ' '), '1', colorEnabled)} ${t.description}`,
    )
    .join('\n');
}

export function buildWelcomeScreen({
  version,
  colorEnabled,
  stage = 4,
  targets = [],
}: WelcomeScreenOpts): string {
  const lines = [buildBanner({ version, colorEnabled })];

  if (stage >= 1) {
    lines.push(
      '',
      'This setup will configure:',
      `  ${color('*', '1;33', colorEnabled)} A managed Apollo Toolkit home in ${color('~/.apollo-toolkit', '1', colorEnabled)}`,
      `  ${color('*', '1;33', colorEnabled)} Copied skill folders for your selected targets`,
      `  ${color('*', '1;33', colorEnabled)} A clean install flow with target-aware replacement`,
    );
  }

  if (stage >= 2) {
    lines.push(
      '',
      'Quick start after setup:',
      `  ${color('npx @laitszkin/apollo-toolkit codex', '1;33', colorEnabled)}`,
      `  ${color('apollo-toolkit all', '1;33', colorEnabled)}`,
    );
  }

  if (stage >= 3 && targets.length > 0) {
    lines.push(
      '',
      color('Supported targets:', '2', colorEnabled),
      buildSupportedTargetLines({ targets, colorEnabled }),
    );
  }

  if (stage >= 4) {
    lines.push('', color('Launching target selector...', '1;36', colorEnabled));
  }

  return lines.join('\n');
}

export async function animateWelcomeScreen({
  output,
  version,
  env,
  targets = [],
}: {
  output: NodeJS.WriteStream;
  version: string;
  env: NodeJS.ProcessEnv;
  targets?: TargetDefinition[];
}): Promise<void> {
  if (!supportsAnimation(output, env)) return;

  const colorEnabled = supportsColor(output, env);
  for (const stage of [0, 1, 2, 3, 4]) {
    clearScreen(output);
    output.write(
      `${buildWelcomeScreen({ version, colorEnabled, stage, targets })}\n`,
    );
    await sleep(stage === 0 ? 120 : 160);
  }
}

export function renderSelectionScreen({
  output,
  version,
  cursor,
  selected,
  message,
  env,
  intro = 'Choose where Apollo Toolkit should copy managed skills.',
  choices,
  allValues,
}: SelectionScreenOpts): void {
  const colorEnabled = supportsColor(output, env);
  const allSelected = allValues.every((v) => selected.has(v));

  clearScreen(output);
  output.write(`${buildBanner({ version, colorEnabled })}\n\n`);
  output.write(`${intro}\n`);
  output.write(
    `${color('Use Up/Down', '1;33', colorEnabled)} (or ${color('j/k', '1;33', colorEnabled)}) to move, ${color('Space', '1;33', colorEnabled)} to toggle, ${color('Enter', '1;33', colorEnabled)} to continue.\n`,
  );
  output.write(
    `Press ${color('a', '1;33', colorEnabled)} to toggle all, ${color('q', '1;33', colorEnabled)} to cancel.\n\n`,
  );

  choices.forEach((option, index) => {
    const isFocused = index === cursor;
    const isChecked =
      option.id === 'all' ? allSelected : selected.has(option.id);
    const prefix = isFocused ? color('>', '1;33', colorEnabled) : ' ';
    const checkbox = isChecked ? color('[x]', '1;32', colorEnabled) : '[ ]';
    const label = isFocused
      ? color(option.label, '1', colorEnabled)
      : option.label;
    output.write(
      `${prefix} ${checkbox} ${label}  ${color(option.description, '2', colorEnabled)}\n`,
    );
  });

  const selectedModes = allSelected ? [...allValues] : [...selected].sort();
  output.write('\n');
  output.write(
    `Selected: ${selectedModes.length > 0 ? selectedModes.join(', ') : 'none'}\n`,
  );
  if (message) output.write(`${color(message, '1;31', colorEnabled)}\n`);
}

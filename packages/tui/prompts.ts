import { checkbox, confirm as inquirerConfirm } from '@inquirer/prompts';
import { isInteractive } from './terminal.js';

export interface ChoiceOption {
  name: string;
  value: string;
  description?: string;
}

export interface PromptForModesOpts {
  choices: ChoiceOption[];
  message?: string;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

export interface PromptYesNoOpts {
  message: string;
  default?: boolean;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

export async function promptForModes(
  opts: PromptForModesOpts,
): Promise<string[]> {
  if (!opts.input || !opts.output || !isInteractive(opts.input, opts.output)) {
    throw new Error(
      'Interactive selection requires a TTY. Re-run with explicit targets.',
    );
  }
  const result = await checkbox(
    {
      message: opts.message || 'Select targets:',
      choices: opts.choices,
    },
    {
      input: opts.input,
      output: opts.output,
    },
  );
  return result;
}

export async function promptYesNo(opts: PromptYesNoOpts): Promise<boolean> {
  if (!opts.input || !opts.output || !isInteractive(opts.input, opts.output)) {
    return opts.default !== false;
  }
  return inquirerConfirm(
    { message: opts.message, default: opts.default !== false },
    { input: opts.input, output: opts.output },
  );
}

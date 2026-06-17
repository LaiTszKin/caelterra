import { supportsColor, color } from './terminal.js';
import type { OutputMode, StdioWriter } from './types.js';

type StreamLike = { write(s: string): unknown; isTTY?: boolean };

export interface StdioWriterOpts {
  stdout?: StreamLike;
  stderr?: StreamLike;
  env?: NodeJS.ProcessEnv;
  mode?: OutputMode;
  verbose?: boolean;
}

export class StdioWriterImpl implements StdioWriter {
  private stdout: StreamLike;
  private stderr: StreamLike;
  private env: NodeJS.ProcessEnv;
  private _mode: OutputMode;
  private _verbose: boolean;
  private _colorEnabled: boolean;

  constructor(opts?: StdioWriterOpts) {
    this.stdout = opts?.stdout ?? process.stdout;
    this.stderr = opts?.stderr ?? process.stderr;
    this.env = opts?.env ?? process.env;
    this._mode = opts?.mode ?? 'pretty';
    this._verbose = opts?.verbose ?? false;
    this._colorEnabled = supportsColor(this.stdout, this.env);
  }

  info(msg: string): void {
    if (this._mode === 'json') {
      this.stdout.write(
        JSON.stringify({ severity: 'info', message: msg }) + '\n',
      );
    } else {
      this.stdout.write(msg + '\n');
    }
  }

  warn(msg: string): void {
    if (this._mode === 'json') {
      this.stderr.write(
        JSON.stringify({ severity: 'warn', message: msg }) + '\n',
      );
    } else {
      this.stderr.write(color(msg, '1;33', this._colorEnabled) + '\n');
    }
  }

  error(msg: string): void {
    if (this._mode === 'json') {
      this.stderr.write(
        JSON.stringify({ severity: 'error', message: msg }) + '\n',
      );
    } else {
      this.stderr.write(color(msg, '1;31', this._colorEnabled) + '\n');
    }
  }

  verbose(msg: string): void {
    if (!this._verbose) return;
    if (this._mode === 'json') {
      this.stdout.write(
        JSON.stringify({ severity: 'verbose', message: msg }) + '\n',
      );
    } else {
      this.stdout.write(msg + '\n');
    }
  }

  json(data: unknown): void {
    this.stdout.write(JSON.stringify(data) + '\n');
  }

  setMode(mode: OutputMode): void {
    this._mode = mode;
  }

  setVerbose(v: boolean): void {
    this._verbose = v;
  }
}

/**
 * Create a StdioWriter instance with sensible defaults.
 *
 * @param opts - Optional overrides for streams, environment, mode, and verbosity.
 * @returns A StdioWriter instance.
 */
export function createStdioWriter(opts?: StdioWriterOpts): StdioWriter {
  return new StdioWriterImpl(opts);
}

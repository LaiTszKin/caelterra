export interface TargetDefinition {
  id: string;
  label: string;
  description: string;
}

export type OutputMode = 'pretty' | 'json';

export interface StdioWriter {
  /** Writes an informational message to stdout. */
  info(msg: string): void;
  /** Writes a warning message to stderr (yellow in pretty mode). */
  warn(msg: string): void;
  /** Writes an error message to stderr (red in pretty mode). */
  error(msg: string): void;
  /** Writes a verbose message to stdout only when verbose mode is on. */
  verbose(msg: string): void;
  /** Writes raw JSON to stdout regardless of mode. */
  json(data: unknown): void;
  /** Set the output mode (pretty or json). */
  setMode(mode: OutputMode): void;
  /** Enable or disable verbose output. */
  setVerbose(v: boolean): void;
}

/**
 * Application error hierarchy with structured error types.
 *
 * - AppError: base class with code, statusCode, isOperational
 * - UserInputError: invalid user input (exit code 1)
 * - ToolNotFoundError: unknown tool name (exit code 1)
 * - SystemError: unexpected system failures (exit code 1, includes stack)
 */

export type ErrorDetails = Record<string, unknown>;

/**
 * Base application error class.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetails;

  constructor(
    message: string,
    code = 'APP_ERROR',
    statusCode = 1,
    isOperational = true,
    details?: ErrorDetails,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Capture stack trace, excluding constructor call from it
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error for invalid user input.
 */
export class UserInputError extends AppError {
  constructor(message: string, details?: ErrorDetails, options?: ErrorOptions) {
    super(message, 'USER_INPUT_ERROR', 1, true, details, options);
  }
}

/**
 * Error for unknown tool names.
 * Thrown by runTool() in @laitszkin/tool-registry when getTool() returns null.
 */
export class ToolNotFoundError extends AppError {
  constructor(message: string, details?: ErrorDetails, options?: ErrorOptions) {
    super(message, 'TOOL_NOT_FOUND', 1, true, details, options);
  }
}

/**
 * Error for unexpected system failures.
 */
export class SystemError extends AppError {
  constructor(message: string, details?: ErrorDetails, options?: ErrorOptions) {
    super(message, 'SYSTEM_ERROR', 1, false, details, options);
  }
}

/**
 * Format an error to a stderr stream using AppError type-based formatting.
 * UserInputError -- message only (no prefix)
 * SystemError -- message + stack trace
 * AppError -- "Error: " prefix
 * Other -- "Error: " prefix
 */
export function formatAppError(
  stderr: { write: (s: string) => void },
  err: unknown,
): void {
  if (err instanceof UserInputError) {
    stderr.write(`${err.message}\n`);
  } else if (err instanceof SystemError) {
    stderr.write(`${err.message}\n${err.stack}\n`);
  } else if (err instanceof AppError) {
    stderr.write(`Error: ${err.message}\n`);
  } else {
    stderr.write(`Error: ${(err as Error).message}\n`);
  }
}

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
  ) {
    super(message);
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
  constructor(message: string, details?: ErrorDetails) {
    super(message, 'USER_INPUT_ERROR', 1, true, details);
  }
}

/**
 * Error for unknown tool names.
 * NOTE: Currently defined for the error hierarchy completeness.
 * Used when isKnownToolName() check fails in tool dispatch.
 * If never used after full implementation, consider removal.
 */
export class ToolNotFoundError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 'TOOL_NOT_FOUND', 1, true, details);
  }
}

/**
 * Error for unexpected system failures.
 */
export class SystemError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 'SYSTEM_ERROR', 1, false, details);
  }
}

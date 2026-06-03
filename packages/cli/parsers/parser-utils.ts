import { UserInputError } from '@laitszkin/tool-utils';

/**
 * Normalises common parseArgs errors into user-facing UserInputErrors.
 *
 * Currently handles:
 *   - --home without a value
 *
 * Call this inside a catch block to normalise the error before propagating it.
 */
export function normalizeParseError(err: unknown): never {
  const message = (err as Error).message;
  if (message.includes('--home') && (message.includes('argument missing') || message.includes('value'))) {
    throw new UserInputError('Missing value for --home');
  }
  throw err;
}

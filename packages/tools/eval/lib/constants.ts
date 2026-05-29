/**
 * constants.ts — Shared constants for the eval pipeline
 *
 * Contains constants used across multiple eval modules (optimizer, reporter, etc.)
 * to avoid duplication and ensure consistency.
 */

/** Severity ranking: P0 (most severe) > P1 > P2. For consistent sorting across all modules. */
export const SEVERITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

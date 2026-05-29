/**
 * Judge model API utilities.
 *
 * Shared callJudgeModel and parseJudgeJSON implementations used by
 * score.mjs and optimize.mjs.
 *
 * This is the TypeScript version migrated from scripts/lib/judge-api.mjs.
 */

import type { EnvConfig } from './env-utils.js';

// --- Types ---

export interface Message {
  role: string;
  content: string | null;
  tool_calls?: Array<Record<string, unknown>>;
  tool_call_id?: string;
}

export interface CallOptions {
  timeoutMs?: number;
}

export interface JudgeRawResult {
  result: Record<string, unknown>;
  content: string;
}

/** Structure returned by parseJudgeOutput when all parsing fallbacks fail. */
export interface ParseErrorResult {
  overallScore: number;
  dimensions: unknown[];
  issues: Array<{
    severity: string;
    category: string;
    description: string;
    evidence: string;
  }>;
  summary: string;
  _parseError: boolean;
  _rawContent: string;
}

// --- Functions ---

/**
 * Low-level judge model API call. Returns raw result and extracted content.
 * Used directly by optimize.mjs when it needs the raw response.
 *
 * @param messages - Conversation messages
 * @param env - Environment variables (JUDGE_BASE_URL, JUDGE_MODEL, JUDGE_API_KEY, JUDGE_REASONING_EFFORT)
 * @param options - Extra options (timeoutMs)
 * @returns Raw API result and extracted content string
 */
export async function callJudgeModelRaw(
  messages: Message[],
  env: EnvConfig,
  options: CallOptions = {},
): Promise<JudgeRawResult> {
  const { timeoutMs = 0 } = options;
  const url = `${env.JUDGE_BASE_URL}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: env.JUDGE_MODEL,
    messages,
    stream: false,
  };

  if (env.JUDGE_REASONING_EFFORT) {
    body.reasoning_effort = env.JUDGE_REASONING_EFFORT;
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.JUDGE_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: timeoutMs > 0 ? controller.signal : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '(unable to read error body)');
      throw new Error(`Judge API error ${response.status}: ${errorText}`);
    }

    const result: Record<string, unknown> = await response.json() as Record<string, unknown>;
    const choices = result.choices as Array<Record<string, unknown>> | undefined;
    const content = choices?.[0]?.message as Record<string, unknown> | undefined;
    const contentStr = content?.content as string | undefined;

    if (!contentStr) {
      throw new Error('Judge 模型回覆中沒有 content');
    }

    return { result, content: contentStr };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Call the judge model API (OpenAI-compatible /v1/chat/completions).
 *
 * @param prompt - Judge scoring prompt
 * @param env - Environment variables (JUDGE_BASE_URL, JUDGE_MODEL, JUDGE_API_KEY, JUDGE_REASONING_EFFORT)
 * @param options - Extra options (timeoutMs)
 * @returns Parsed JSON object from the model response
 */
export async function callJudgeModel(
  prompt: string,
  env: EnvConfig,
  options: CallOptions = {},
): Promise<Record<string, unknown>> {
  const { content } = await callJudgeModelRaw(
    [{ role: 'user', content: prompt }],
    env,
    options,
  );
  return parseJudgeOutput(content);
}

/**
 * Safely parse JSON from judge model output, with multi-level fallback.
 *
 * Fallback chain:
 *   1. Direct JSON.parse()
 *   2. Extract ```json ... ``` block
 *   3. Extract { ... } brace block
 *   4. Return error structure (never throws)
 *
 * @param content - Judge model response text
 * @returns Parsed JSON object (or error structure if parsing fails)
 */
export function parseJudgeOutput(content: string): Record<string, unknown> {
  // 1. Direct parse
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (_) {
    // not valid JSON directly
  }

  // 2. Extract ```json ... ``` block
  const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1]) as Record<string, unknown>;
    } catch (_) {
      // still not valid
    }
  }

  // 3. Extract { ... } brace block
  const braceMatch = content.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as Record<string, unknown>;
    } catch (_) {
      // still not valid
    }
  }

  // 4. Final fallback — never throws
  return {
    overallScore: 0,
    dimensions: [],
    issues: [{
      severity: 'P1',
      category: 'other',
      description: 'Judge 模型回覆無法解析為有效 JSON',
      evidence: content.substring(0, 500),
    }],
    summary: 'Judge 輸出解析失敗',
    _parseError: true,
    _rawContent: content.substring(0, 1000),
  };
}

/**
 * Call the exec model API (OpenAI-compatible /v1/chat/completions).
 *
 * @param messages - Conversation messages
 * @param env - Environment variables (EXEC_BASE_URL, EXEC_MODEL, EXEC_API_KEY, EXEC_REASONING_EFFORT)
 * @param signal - AbortSignal for timeout cancellation
 * @returns Raw API response JSON
 */
export async function callExecModel(
  messages: Message[],
  env: EnvConfig,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const url = `${env.EXEC_BASE_URL}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: env.EXEC_MODEL,
    messages,
    stream: false,
  };

  // Only add reasoning_effort if explicitly set
  if (env.EXEC_REASONING_EFFORT) {
    body.reasoning_effort = env.EXEC_REASONING_EFFORT;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.EXEC_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(unable to read error body)');
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const result: Record<string, unknown> = await response.json() as Record<string, unknown>;
  const choices = result.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content as string | undefined;

  if (content === undefined) {
    throw new Error('Exec model response missing choices[0].message.content');
  }
  return result;
}

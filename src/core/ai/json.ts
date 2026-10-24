/**
 * The ONE place where AI-produced JSON becomes application data.
 *
 * Architecture rule (see ARCHITECTURE.md):
 *   - Providers are dumb text pipes. They guarantee only that the text, when
 *     parsed, is *syntactically* valid JSON — never semantics.
 *   - `requestStructured` here is the only gateway AI results may pass
 *     through into application logic. It instructs the LLM for JSON, parses,
 *     validates against a runtime schema, and applies app-owned retry/failure
 *     handling.
 *   - Core logic never parses free-form LLM prose. If a provider's output fails
 *     the schema, callers receive `{ ok: false, errors }` and decide a safe
 *     fallback (e.g. a neutral observation) — without ever trusting raw output.
 */
import type { LLMProvider, ProviderOptions, StructuredTask } from '../provider/LLMProvider.js';
import { validateSchema, type SchemaNode } from './schema.js';

/** Prompt suffix that pushes any provider toward emitting a JSON object. */
export const JSON_INSTRUCTION =
  'Respond with a single valid JSON object only. Do not wrap it in markdown fences and do not add commentary.';

export function stripCodeFences(text: string): string {
  const match = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (match) return match[1].trim();
  return text.trim();
}

/**
 * Syntax-only parse of an LLM text blob into JSON data.
 * Returns null if the text does not contain parseable JSON.
 * Deliberately performs ZERO semantic validation — that is `requestStructured`'s job.
 */
export function parseJsonData(text: string): unknown | null {
  try {
    return JSON.parse(stripCodeFences(text)) as unknown;
  } catch {
    const block = extractJsonObject(text);
    if (block == null) return null;
    try {
      return JSON.parse(block) as unknown;
    } catch {
      return null;
    }
  }
}

/**
 * Find the first balanced `{...}` block in text, skipping strings, so that
 * wrapped/messy LLM responses still parse at the syntax level.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export interface StructuredResult<T> {
  readonly ok: boolean;
  /** Schema-validated data; present only when ok === true. */
  readonly value: T | null;
  readonly errors: readonly string[];
  /** Raw parsed JSON (for audit/debugging only — never consumed by logic). */
  readonly raw: unknown;
}

export interface RequestStructuredDeps {
  readonly provider: LLMProvider;
  readonly task: StructuredTask;
  readonly prompt: string;
  readonly schema: SchemaNode;
  readonly options?: ProviderOptions;
  /** App-owned retry policy on schema failure. Defaults to a single attempt. */
  readonly maxAttempts?: number;
}

/**
 * Request, parse, and schema-validate a structured AI result.
 *
 * Contract for implementers of `completeStructured`:
 *   the provider may return `null` (refused) or data that is only guaranteed
 *   to be valid *syntax*. This function owns validation and retry.
 */
export async function requestStructured<T>(deps: RequestStructuredDeps): Promise<StructuredResult<T>> {
  const attempts = Math.max(1, deps.maxAttempts ?? 1);
  const errors: string[] = [];
  let raw: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const outcome = await attemptOnce<T>(deps);
    raw = outcome.raw;
    if (outcome.ok) return outcome;
    errors.push(...outcome.errors);
    if (attempt < attempts && deps.maxAttempts !== 1) {
      errors.push(`(retry ${attempt + 1}/${attempts})`);
    }
  }

  return { ok: false, value: null, errors, raw };
}

async function attemptOnce<T>(deps: RequestStructuredDeps): Promise<StructuredResult<T>> {
  try {
    // Providers wrap the raw task prompt with their own JSON-output bootstrap
    // (see JSON_INSTRUCTION usage in each provider). The gateway owns parsing +
    // validation only — that is the application's job.
    const data = await deps.provider.completeStructured<unknown>(
      deps.task,
      deps.prompt,
      { ...deps.options, temperature: 0 },
    );
    if (data === null || data === undefined) {
      return { ok: false, value: null, errors: ['Provider returned no structured result.'], raw: data ?? null };
    }
    const validated = validateSchema<T>(data, deps.schema);
    if (!validated.ok) {
      return { ok: false, value: null, errors: [...validated.errors], raw: data };
    }
    return { ok: true, value: validated.value, errors: [], raw: data };
  } catch (err) {
    return {
      ok: false,
      value: null,
      errors: [err instanceof Error ? err.message : String(err)],
      raw: null,
    };
  }
}
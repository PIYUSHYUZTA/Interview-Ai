import type { RubricCriteria } from '../types.js';

/** Well-known structured tasks the intelligence core can delegate to a provider. */
export type StructuredTask =
  | 'evaluate_narrative'
  | 'extract_resume_claims'
  | 'score_open_response';

export interface ProviderOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly model?: string;
}

/**
 * The single seam between the intelligence core and any LLM backend.
 *
 * Providers are expected to be *stateless* and deterministic-in-shape: they map
 * a prompt (+ optional structured task) to text or a typed JSON object. Real
 * backends (OpenAI, Anthropic, Vertex) are interchangeable, and a fully local
 * deterministic provider exercises the whole loop in tests.
 */
export interface LLMProvider {
  readonly name: string;
  complete(prompt: string, options?: ProviderOptions): Promise<string>;
  /**
   * Ask the provider for a structured, schema-shaped result.
   * Returns `null` if the provider cannot/should not answer (caller decides).
   */
  completeStructured<T>(
    task: StructuredTask,
    prompt: string,
    options?: ProviderOptions,
  ): Promise<T | null>;
}

/** Shape the provider must return for the `score_open_response` task. */
export interface ScoredResponse {
  readonly criteria: RubricCriteria;
  readonly rubricCompliance: number;
  readonly rationale: string;
}
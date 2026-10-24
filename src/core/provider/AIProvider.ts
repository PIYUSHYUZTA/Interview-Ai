import type { ProviderOptions } from './LLMProvider.js';

export interface AIProviderOptions extends ProviderOptions {
  /** Request JSON mode or formatted output from the model */
  readonly json?: boolean;
  /** System message or role instruction */
  readonly system?: string;
}

/**
 * Section 20 Blueprint Mandate: Unified AI Provider Abstraction
 *
 * This is the central decoupled boundary between the intelligence core and any LLM vendor.
 * Rather than hitting OpenAI or Anthropic SDKs directly from business logic,
 * the 3 core generative services call through this interface:
 *
 *  1. `generate()`: Called by QuestionGenerator to craft scoped, role-targeted interview probes
 *  2. `evaluate()`: Called by AnswerEvaluator to grade candidate answers against rubrics and expected points
 *  3. `extract()`:  Called by ResumeAnalyzer to parse unstructured resume text into verified facts
 *
 * Concrete implementations (OpenAIProvider, AnthropicProvider, DeterministicProvider) implement
 * this interface. Swapping providers requires ZERO changes to domain/business logic.
 */
export interface AIProvider {
  readonly name: string;

  /**
   * QuestionGenerator calls this to synthesize questions, follow-ups, and expected answer points.
   */
  generate(prompt: string, options?: AIProviderOptions): Promise<string>;

  /**
   * AnswerEvaluator calls this to score answers against rubric criteria and expected points.
   */
  evaluate(prompt: string, options?: AIProviderOptions): Promise<string>;

  /**
   * ResumeAnalyzer calls this to extract structured facts and claims from raw resume text.
   */
  extract(prompt: string, options?: AIProviderOptions): Promise<string>;
}

import type { LLMProvider, ProviderOptions, StructuredTask } from '../LLMProvider.js';
import type { AIProvider, AIProviderOptions } from '../AIProvider.js';
import { postJson } from './http.js';
import { JSON_INSTRUCTION, parseJsonData } from '../../ai/json.js';

export interface AnthropicConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

/**
 * Anthropic Messages API provider (fetch only, no SDK).
 * Implements both the Section 20 unified AIProvider interface and legacy LLMProvider.
 */
export class AnthropicProvider implements LLMProvider, AIProvider {
  readonly name = 'anthropic';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly config: AnthropicConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
    this.model = config.model ?? 'claude-3-5-sonnet-latest';
  }

  async complete(prompt: string, options?: ProviderOptions): Promise<string> {
    const data = (await postJson(
      `${this.baseUrl}/messages`,
      {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      {
        model: options?.model ?? this.model,
        max_tokens: options?.maxTokens ?? 1200,
        temperature: options?.temperature ?? 0.2,
        messages: [{ role: 'user', content: prompt }],
      },
    )) as { content?: { text?: string }[] };

    const text = data.content?.[0]?.text;
    if (text == null) throw new Error('Anthropic response missing content[0].text');
    return text;
  }

  async completeStructured<T>(task: StructuredTask, prompt: string, options?: ProviderOptions): Promise<T | null> {
    try {
      const text = await this.complete(`${JSON_INSTRUCTION}\n\nTask: ${task}\n\n${prompt}`, {
        ...options,
        temperature: 0,
      });
      return parseJsonData(text) as T | null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Section 20 Unified AIProvider Implementation
  // ---------------------------------------------------------------------------

  async generate(prompt: string, options?: AIProviderOptions): Promise<string> {
    const formatted = options?.json ? `${JSON_INSTRUCTION}\n\nTask: generate_question\n\n${prompt}` : prompt;
    return this.complete(formatted, options);
  }

  async evaluate(prompt: string, options?: AIProviderOptions): Promise<string> {
    const formatted = options?.json ? `${JSON_INSTRUCTION}\n\nTask: evaluate_answer\n\n${prompt}` : prompt;
    return this.complete(formatted, options);
  }

  async extract(prompt: string, options?: AIProviderOptions): Promise<string> {
    const formatted = options?.json ? `${JSON_INSTRUCTION}\n\nTask: extract_resume_claims\n\n${prompt}` : prompt;
    return this.complete(formatted, options);
  }
}
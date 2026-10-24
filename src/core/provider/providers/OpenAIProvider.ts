import type { LLMProvider, ProviderOptions, StructuredTask } from '../LLMProvider.js';
import type { AIProvider, AIProviderOptions } from '../AIProvider.js';
import { postJson } from './http.js';
import { JSON_INSTRUCTION, parseJsonData } from '../../ai/json.js';

export interface OpenAIConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

/**
 * OpenAI Chat Completions provider. Uses only the standard fetch API, no SDK.
 * Implements both the Section 20 unified AIProvider interface and legacy LLMProvider.
 */
export class OpenAIProvider implements LLMProvider, AIProvider {
  readonly name = 'openai';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly config: OpenAIConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.model = config.model ?? 'gpt-4o';
  }

  async complete(prompt: string, options?: ProviderOptions): Promise<string> {
    const data = (await postJson(
      `${this.baseUrl}/chat/completions`,
      { authorization: `Bearer ${this.config.apiKey}` },
      this.shell(prompt, options),
    )) as { choices?: { message?: { content?: string } }[] };

    const content = data.choices?.[0]?.message?.content;
    if (content == null) throw new Error('OpenAI response missing choices[0].message.content');
    return content;
  }

  async completeStructured<T>(task: StructuredTask, prompt: string, options?: ProviderOptions): Promise<T | null> {
    const wrapped = `${JSON_INSTRUCTION}\n\nTask: ${task}\n\n${prompt}`;
    try {
      const text = await this.complete(wrapped, { ...options, temperature: 0 });
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

  private shell(prompt: string, options?: ProviderOptions) {
    return {
      model: options?.model ?? this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 1200,
    };
  }
}
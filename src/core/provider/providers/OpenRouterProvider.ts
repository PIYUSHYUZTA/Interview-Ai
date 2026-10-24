import type { LLMProvider, ProviderOptions, StructuredTask } from '../LLMProvider.js';
import type { AIProvider, AIProviderOptions } from '../AIProvider.js';
import { postJson } from './http.js';
import { JSON_INSTRUCTION, parseJsonData } from '../../ai/json.js';

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly siteUrl?: string;
  readonly siteName?: string;
}

/**
 * OpenRouter & 9router compatible completions provider.
 * Uses standard fetch via postJson, zero external SDK dependencies.
 * Implements both Section 20 unified AIProvider interface and legacy LLMProvider.
 */
export class OpenRouterProvider implements LLMProvider, AIProvider {
  readonly name = 'openrouter';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly siteUrl: string;
  private readonly siteName: string;

  constructor(private readonly config: OpenRouterConfig) {
    this.baseUrl = config.baseUrl ?? 'https://openrouter.ai/api/v1';
    this.model = config.model ?? 'meta-llama/llama-3.3-70b-instruct';
    this.siteUrl = config.siteUrl ?? 'https://github.com/ai-mock-interview';
    this.siteName = config.siteName ?? 'AI Mock Interview Platform';
  }

  async complete(prompt: string, options?: ProviderOptions): Promise<string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.apiKey}`,
      'HTTP-Referer': this.siteUrl,
      'X-Title': this.siteName,
    };

    const data = (await postJson(
      `${this.baseUrl}/chat/completions`,
      headers,
      this.shell(prompt, options),
    )) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };

    if (data.error) {
      throw new Error(`OpenRouter error: ${data.error.message ?? JSON.stringify(data.error)}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (content == null) {
      throw new Error('OpenRouter response missing choices[0].message.content');
    }
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
      max_tokens: options?.maxTokens ?? 1500,
    };
  }
}

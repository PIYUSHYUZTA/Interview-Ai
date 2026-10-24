import type { LLMProvider, ProviderOptions, StructuredTask } from '../LLMProvider.js';
import { JSON_INSTRUCTION, parseJsonData } from '../../ai/json.js';

export interface VertexConfig {
  readonly project: string;
  readonly location?: string;
  readonly model?: string;
  /** Either a static bearer token or an async function producing one (e.g. ADC). */
  readonly token: string | (() => Promise<string>);
}

/** Google Vertex AI generateContent provider (fetch only, no SDK). */
export class VertexProvider implements LLMProvider {
  readonly name = 'vertex';
  private readonly location: string;
  private readonly model: string;

  constructor(private readonly config: VertexConfig) {
    this.location = config.location ?? 'us-central1';
    this.model = config.model ?? 'gemini-1.5-pro';
  }

  async complete(prompt: string, options?: ProviderOptions): Promise<string> {
    const token = await this.resolveToken();
    const url =
      `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.config.project}` +
      `/locations/${this.location}/publishers/google/models/${options?.model ?? this.model}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.2,
          maxOutputTokens: options?.maxTokens ?? 1200,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Vertex HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null) throw new Error('Vertex response missing candidates[0].content.parts[0].text');
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

  private resolveToken(): Promise<string> {
    return typeof this.config.token === 'string' ? Promise.resolve(this.config.token) : this.config.token();
  }
}
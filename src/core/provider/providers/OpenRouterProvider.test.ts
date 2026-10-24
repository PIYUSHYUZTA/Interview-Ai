import { describe, expect, it, vi } from 'vitest';
import { OpenRouterProvider } from './OpenRouterProvider.js';
import { createActiveAIProvider, resolveAIProvider } from '../providerFactory.js';
import * as http from './http.js';

describe('OpenRouterProvider & Provider Factory', () => {
  it('instantiates OpenRouterProvider with expected defaults', () => {
    const provider = new OpenRouterProvider({
      apiKey: 'test-or-key',
    });

    expect(provider.name).toBe('openrouter');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.generate).toBe('function');
    expect(typeof provider.evaluate).toBe('function');
    expect(typeof provider.extract).toBe('function');
  });

  it('sends HTTP-Referer and X-Title headers to OpenRouter endpoint', async () => {
    const postJsonSpy = vi.spyOn(http, 'postJson').mockResolvedValue({
      choices: [{ message: { content: '{"status":"ok"}' } }],
    });

    const provider = new OpenRouterProvider({
      apiKey: 'sk-or-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'meta-llama/llama-3.3-70b-instruct',
    });

    const result = await provider.complete('Hello');
    expect(result).toBe('{"status":"ok"}');
    expect(postJsonSpy).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        authorization: 'Bearer sk-or-test',
        'HTTP-Referer': 'https://github.com/ai-mock-interview',
        'X-Title': 'AI Mock Interview Platform',
      },
      expect.objectContaining({
        model: 'meta-llama/llama-3.3-70b-instruct',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    );

    postJsonSpy.mockRestore();
  });

  it('providerFactory resolves DeterministicProvider when no keys are present', () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const fallback = resolveAIProvider(false);
    expect(fallback.name).toBe('deterministic');

    if (saved) process.env.OPENROUTER_API_KEY = saved;
  });

  it('providerFactory creates OpenRouterProvider when OPENROUTER_API_KEY is present', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-mock-key';
    const active = createActiveAIProvider();
    expect(active).not.toBeNull();
    expect(active?.name).toBe('openrouter');
    delete process.env.OPENROUTER_API_KEY;
  });
});

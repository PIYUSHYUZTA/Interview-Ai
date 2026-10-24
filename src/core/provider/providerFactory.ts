import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AIProvider } from './AIProvider.js';
import type { LLMProvider } from './LLMProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { DeterministicProvider } from './DeterministicProvider.js';

/**
 * Lightweight .env parser to load environment variables from the project root
 * without external npm dependencies.
 */
export function loadEnvFile(envPath?: string): Record<string, string> {
  const targetPath = envPath ?? path.resolve(process.cwd(), '.env');
  const loaded: Record<string, string> = {};
  if (!fs.existsSync(targetPath)) return loaded;

  const content = fs.readFileSync(targetPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    loaded[key] = val;
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
  return loaded;
}

export type SupportedActiveProvider = OpenRouterProvider | OpenAIProvider | AnthropicProvider;

/**
 * Detects available credentials and returns an active live AIProvider.
 */
export function createActiveAIProvider(): (AIProvider & LLMProvider) | null {
  loadEnvFile();

  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.ROUTER_API_KEY;
  if (openrouterKey) {
    return new OpenRouterProvider({
      apiKey: openrouterKey,
      baseUrl: process.env.OPENROUTER_BASE_URL || process.env.ROUTER_BASE_URL,
      model: process.env.OPENROUTER_MODEL || process.env.ROUTER_MODEL,
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return new OpenAIProvider({
      apiKey: openaiKey,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
    });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return new AnthropicProvider({
      apiKey: anthropicKey,
      baseUrl: process.env.ANTHROPIC_BASE_URL,
      model: process.env.ANTHROPIC_MODEL,
    });
  }

  return null;
}

/**
 * Returns the active live provider, or falls back to DeterministicProvider if none configured.
 */
export function resolveAIProvider(requireLive = false): AIProvider & LLMProvider {
  const live = createActiveAIProvider();
  if (live) return live;

  if (requireLive) {
    throw new Error(
      'No live AI provider credential found in environment or .env!\n' +
        'Please define OPENROUTER_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY) in .env.',
    );
  }

  return new DeterministicProvider();
}

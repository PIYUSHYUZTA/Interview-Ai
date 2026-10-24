/**
 * Thin HTTP transport helpers for real providers. No JSON parsing lives here —
 * syntax parsing (`parseJsonData`) and all schema validation live in the
 * application-owned gateway (`core/ai/json.ts` + `core/ai/schema.ts`).
 */

export class ProviderHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

export async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const timeoutMs = Number(process.env.AI_HTTP_TIMEOUT_MS ?? 30000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('AI_HTTP_TIMEOUT_MS must be 1000–120000.');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ProviderHttpError(`HTTP ${response.status} from ${url}: ${await safeText(response)}`, response.status);
  }
  return response.json();
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return '(unreadable body)';
  }
}
// AI provider abstraction for Curevo AI.
//
// Design rules:
// - All LLM access goes through this module. Routes never call provider APIs.
// - Structured output only: `completeJson` validates model responses with Zod
//   before anything touches the resume engine.
// - Deterministic fallback: when no provider is configured (or the provider
//   fails), the deterministic ATS/JD/matching/tailoring engines keep working.
// - Secrets stay server-side; nothing here is imported by frontend code.
//
// Environment configuration:
//   AI_PROVIDER=openai        provider id ('openai' = any OpenAI-compatible API)
//   AI_API_KEY=...            server-side only
//   AI_MODEL=gpt-4o-mini
//   AI_BASE_URL=...           optional, for OpenAI-compatible endpoints
//   AI_TIMEOUT_MS=20000       per-attempt timeout
//   AI_MAX_RETRIES=2          bounded retries for timeout/429/5xx/malformed
//   AI_MAX_ITERATIONS=2       agent critique loop bound

import { ZodType, ZodError } from 'zod';

export type AiErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_MALFORMED'
  | 'AI_PROVIDER_ERROR'
  | 'AI_UNAVAILABLE'
  | 'RESEARCH_NOT_CONFIGURED'
  | 'RESEARCH_NO_RESULTS';

export class AiUnavailableError extends Error {
  code: AiErrorCode;
  retryable: boolean;
  constructor(code: AiErrorCode, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export interface JsonCompletionRequest<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
  temperature?: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Complete a request and return schema-validated structured output. */
  completeJson<T>(req: JsonCompletionRequest<T>): Promise<T>;
  /**
   * Optional single-bullet rewording hook used by the editor suggestions
   * panel. Implementations must only reword; output is truth-checked anyway.
   */
  improveBullet?(bullet: string, allowedSkills: string[]): { text: string; reason: string } | null;
}

export interface AiConfig {
  providerId: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  maxIterations: number;
}

export function readAiConfigFromEnv(): AiConfig | null {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
  const providerId = (process.env.AI_PROVIDER || (apiKey ? 'openai' : '')).trim();
  if (!providerId || providerId === 'none' || providerId === 'off' || !apiKey) return null;
  return {
    providerId,
    apiKey,
    model: (process.env.AI_MODEL || 'gpt-4o-mini').trim(),
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    timeoutMs: boundedInt(process.env.AI_TIMEOUT_MS, 20_000, 1_000, 120_000),
    maxRetries: boundedInt(process.env.AI_MAX_RETRIES, 2, 0, 5),
    maxIterations: boundedInt(process.env.AI_MAX_ITERATIONS, 2, 1, 4),
  };
}

function boundedInt(raw: string | undefined, dflt: number, min: number, max: number): number {
  const n = parseInt(raw || '', 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

/**
 * OpenAI-compatible chat-completions provider (works for OpenAI and any
 * compatible gateway via AI_BASE_URL). Handles timeout, bounded retries,
 * rate limits and malformed responses. Never logs request content or keys.
 */
class OpenAiCompatibleProvider implements AiProvider {
  readonly name: string;
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(cfg: AiConfig) {
    this.name = cfg.providerId;
    this.model = cfg.model;
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl;
    this.timeoutMs = cfg.timeoutMs;
    this.maxRetries = cfg.maxRetries;
  }

  async completeJson<T>(req: JsonCompletionRequest<T>): Promise<T> {
    const attempts = 1 + this.maxRetries;
    let lastError: AiUnavailableError = new AiUnavailableError('AI_UNAVAILABLE', 'AI request failed.');

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const content = await this.attempt(req, attempt);
        // Malformed output is retryable once: give the model one repair chance.
        try {
          return parseStructured(content, req.schema);
        } catch (err) {
          if (err instanceof ZodError) {
            lastError = new AiUnavailableError('AI_MALFORMED', 'AI returned an invalid structure.', true);
          } else {
            lastError = new AiUnavailableError('AI_MALFORMED', 'AI returned unparseable output.', true);
          }
        }
      } catch (err) {
        if (err instanceof AiUnavailableError) {
          lastError = err;
          if (!err.retryable) throw err;
        } else {
          lastError = new AiUnavailableError('AI_UNAVAILABLE', 'AI request failed unexpectedly.', true);
        }
      }
    }
    throw lastError;
  }

  private async attempt<T>(req: JsonCompletionRequest<T>, attempt: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 1600,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
        }),
      });

      const logTag = `ai name=${this.name} model=${this.model} attempt=${attempt}`;
      if (res.status === 429) {
        console.error(`${logTag} status=429 rate_limited`);
        throw new AiUnavailableError('AI_RATE_LIMITED', 'The AI provider is rate limiting requests. Please try again shortly.', true);
      }
      if (res.status === 401 || res.status === 403) {
        console.error(`${logTag} status=${res.status} auth_failed`);
        throw new AiUnavailableError('AI_PROVIDER_ERROR', 'The AI provider rejected the configured credentials.', false);
      }
      if (!res.ok) {
        const retryable = res.status >= 500;
        console.error(`${logTag} status=${res.status} retryable=${retryable} ms=${Date.now() - started}`);
        throw new AiUnavailableError(
          retryable ? 'AI_UNAVAILABLE' : 'AI_PROVIDER_ERROR',
          'The AI provider returned an error.',
          retryable,
        );
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        console.error(`${logTag} empty_content ms=${Date.now() - started}`);
        throw new AiUnavailableError('AI_MALFORMED', 'AI returned an empty response.', true);
      }
      console.error(`${logTag} ok ms=${Date.now() - started}`);
      return content;
    } catch (err) {
      if (err instanceof AiUnavailableError) throw err;
      if ((err as Error).name === 'AbortError') {
        console.error(`ai name=${this.name} model=${this.model} attempt=${attempt} timeout_ms=${this.timeoutMs}`);
        throw new AiUnavailableError('AI_TIMEOUT', 'The AI provider did not respond in time.', true);
      }
      throw new AiUnavailableError('AI_UNAVAILABLE', 'Could not reach the AI provider.', true);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Deterministic stand-in used when no AI provider is configured. */
class RuleBasedProvider implements AiProvider {
  readonly name = 'deterministic';
  readonly model = 'rules-v1';
  async completeJson<T>(): Promise<T> {
    throw new AiUnavailableError('AI_NOT_CONFIGURED', 'No AI provider is configured.', false);
  }
}

let provider: AiProvider | null = null;
let initialised = false;

export function getAiProvider(): AiProvider {
  if (!initialised) {
    initialised = true;
    const cfg = readAiConfigFromEnv();
    if (cfg) {
      if (cfg.providerId === 'openai' || cfg.providerId === 'openai-compatible') {
        provider = new OpenAiCompatibleProvider(cfg);
      } else {
        console.error(`ai unknown provider id "${cfg.providerId}" — running deterministically`);
        provider = new RuleBasedProvider();
      }
    } else {
      provider = new RuleBasedProvider();
    }
  }
  return provider!;
}

export function isAiEnabled(): boolean {
  return !(getAiProvider() instanceof RuleBasedProvider);
}

export function getAiMaxIterations(): number {
  const fromProvider = readAiConfigFromEnv()?.maxIterations;
  if (fromProvider !== undefined) return fromProvider;
  // Independently configurable so the critique loop bound is honoured even
  // when the provider itself is not configured (e.g. tests, deterministic mode).
  return boundedInt(process.env.AI_MAX_ITERATIONS, 2, 1, 4);
}

/** Public status for the frontend — never includes credentials. */
export function getAiStatus(): { enabled: boolean; provider: string; model: string; maxIterations: number } {
  const p = getAiProvider();
  return {
    enabled: !(p instanceof RuleBasedProvider),
    provider: p.name,
    model: p.model,
    maxIterations: getAiMaxIterations(),
  };
}

// --- test hooks -----------------------------------------------------------

/**
 * Inject a mock provider (tests only). Pass null to reset so the singleton
 * re-reads the environment configuration on next use.
 */
export function __setAiProviderForTests(p: AiProvider | null): void {
  if (p) {
    provider = p;
    initialised = true;
  } else {
    provider = null;
    initialised = false;
  }
}

// --- structured output helpers ---------------------------------------------

/** Strip optional code fences and parse JSON, then validate with the schema. */
export function parseStructured<T>(raw: string, schema: ZodType<T>): T {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  // Tolerate prose before/after the outermost JSON object.
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace > 0 || (lastBrace >= 0 && lastBrace < text.length - 1)) {
    if (firstBrace >= 0 && lastBrace > firstBrace) text = text.slice(firstBrace, lastBrace + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiUnavailableError('AI_MALFORMED', 'AI output was not valid JSON.', true);
  }
  return schema.parse(parsed);
}

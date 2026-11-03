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
  details?: string;
  constructor(code: AiErrorCode, message: string, retryable = false, details?: string) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.details = details;
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
  const nvidiaKey = process.env.NVIDIA_API_KEY || '';
  const genericKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
  const explicitProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();

  let providerId = explicitProvider;
  let apiKey = '';

  if (explicitProvider === 'nvidia' || (!explicitProvider && nvidiaKey)) {
    providerId = 'nvidia';
    apiKey = nvidiaKey || genericKey;
  } else if (
    explicitProvider === 'openai' ||
    explicitProvider === 'openai-compatible' ||
    (!explicitProvider && genericKey)
  ) {
    providerId = explicitProvider || 'nvidia';
    apiKey = genericKey;
  }

  if (!providerId || providerId === 'none' || providerId === 'off' || !apiKey) return null;

  const isNvidia = providerId === 'nvidia';
  const defaultModel = isNvidia ? 'nvidia/nemotron-3.5-lightning-30b-a3b' : 'gpt-4o-mini';
  const defaultBaseUrl = isNvidia ? 'https://integrate.api.nvidia.com/v1' : 'https://api.openai.com/v1';

  return {
    providerId,
    apiKey,
    model: (process.env.AI_MODEL || defaultModel).trim(),
    baseUrl: (process.env.AI_BASE_URL || defaultBaseUrl).replace(/\/$/, ''),
    timeoutMs: boundedInt(process.env.AI_TIMEOUT_MS, 65_000, 1_000, 120_000),
    maxRetries: boundedInt(process.env.AI_MAX_RETRIES, 1, 0, 5),
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
export class OpenAiCompatibleProvider implements AiProvider {
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
    let currentReq: JsonCompletionRequest<T> = { ...req };

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const content = await this.attempt(currentReq, attempt);
        // Malformed output is retryable: give the model repair chances up to maxRetries.
        try {
          return parseStructured(content, currentReq.schema);
        } catch (err) {
          if (err instanceof ZodError) {
            const summary = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
            console.error(`ai name=${this.name} model=${this.model} attempt=${attempt} schema_validation_failed: ${summary}`);
            lastError = new AiUnavailableError('AI_MALFORMED', 'AI returned an invalid structure.', true, summary);
          } else if (err instanceof AiUnavailableError) {
            lastError = err;
          } else {
            lastError = new AiUnavailableError('AI_MALFORMED', 'AI returned unparseable output.', true);
          }

          if (attempt < attempts) {
            currentReq = {
              ...currentReq,
              system: `${currentReq.system}\n\nIMPORTANT: Return ONLY a valid, raw JSON object matching the requested schema with all required fields. Do not omit required fields or wrap in non-JSON prose.`,
            };
          }
        }
      } catch (err) {
        if (err instanceof AiUnavailableError) {
          lastError = err;
          if (!err.retryable) throw err;
          if (err.message.includes('token limit') || err.message.includes('truncated')) {
            const currentMax = currentReq.maxTokens ?? 4000;
            currentReq = { ...currentReq, maxTokens: Math.min(8192, currentMax + 1500) };
          }
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
      const payload: Record<string, unknown> = {
        model: this.model,
        stream: false,
        temperature: req.temperature ?? 0.2,
        top_p: 0.95,
        max_tokens: req.maxTokens ?? 4000,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      };
      if (this.name === 'nvidia' || this.model.toLowerCase().includes('nemotron')) {
        payload.chat_template_kwargs = { enable_thinking: false };
      }
      if (this.name === 'openai') {
        payload.response_format = { type: 'json_object' };
      }

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify(payload),
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

      const rawText = await res.text();
      if (rawText.length > 5 * 1024 * 1024) {
        throw new AiUnavailableError('AI_MALFORMED', 'AI response exceeded maximum safe size limit.', false);
      }

      interface ChatCompletionResponse {
        id?: string;
        choices?: {
          index?: number;
          message?: {
            role?: string;
            content?: string | null;
            reasoning_content?: string | null;
          };
          text?: string | null;
          finish_reason?: string | null;
        }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      }

      let data: ChatCompletionResponse;
      try {
        data = JSON.parse(rawText) as ChatCompletionResponse;
      } catch {
        throw new AiUnavailableError('AI_MALFORMED', 'AI returned an unparseable response body.', true);
      }

      const choice = data.choices?.[0];
      if (!choice) {
        console.error(`${logTag} no_choices ms=${Date.now() - started}`);
        throw new AiUnavailableError('AI_MALFORMED', 'AI returned no completion choices.', true);
      }

      const finishReason = choice.finish_reason ?? null;
      const rawContent = choice.message?.content ?? (typeof choice.text === 'string' ? choice.text : null);
      const content = typeof rawContent === 'string' ? rawContent.trim() : '';
      const hasReasoning = Boolean(choice.message?.reasoning_content);

      if (!content) {
        console.error(`${logTag} empty_content finish_reason=${finishReason || 'none'} has_reasoning=${hasReasoning} ms=${Date.now() - started}`);
        if (finishReason === 'length') {
          throw new AiUnavailableError('AI_MALFORMED', 'AI response was truncated due to token limit.', true);
        }
        throw new AiUnavailableError('AI_MALFORMED', 'AI returned an empty response.', true);
      }

      if (finishReason === 'length') {
        console.error(`${logTag} truncated finish_reason=length tokens=${data.usage?.completion_tokens ?? 'unknown'} ms=${Date.now() - started}`);
        try {
          parseStructured(content, req.schema);
        } catch {
          throw new AiUnavailableError('AI_MALFORMED', 'AI response was truncated due to token limit.', true);
        }
      }

      console.error(`${logTag} ok finish_reason=${finishReason || 'stop'} tokens=${data.usage?.completion_tokens ?? 'unknown'} ms=${Date.now() - started}`);
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
      if (cfg.providerId === 'nvidia' || cfg.providerId === 'openai' || cfg.providerId === 'openai-compatible') {
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
export function getAiStatus(): { enabled: boolean; provider: string; model: string; baseUrl: string; timeoutMs: number; maxIterations: number } {
  const p = getAiProvider();
  const cfg = readAiConfigFromEnv();
  return {
    enabled: !(p instanceof RuleBasedProvider),
    provider: p.name,
    model: p.model,
    baseUrl: cfg?.baseUrl || '',
    timeoutMs: cfg?.timeoutMs || 0,
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

export const setAiProviderForTests = __setAiProviderForTests;

// --- structured output helpers ---------------------------------------------

/**
 * Recursively normalizes AI responses:
 * - Converts null values to undefined so optional fields pass validation.
 * - Coerces stringified numbers and booleans into their proper types.
 * - Clamps string and array lengths within schema limits.
 * - Normalizes category synonyms to valid application enum values.
 * - Auto-generates missing non-critical IDs.
 */
export function normalizeAiPayload(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(normalizeAiPayload);

  const obj: Record<string, unknown> = { ...(data as Record<string, unknown>) };

  // 1. Strip top-level nulls
  for (const k of Object.keys(obj)) {
    if (obj[k] === null) {
      delete obj[k];
    }
  }

  // 1b. Normalize summary
  if (obj.summary !== undefined && obj.summary !== null) {
    const rawSummary = typeof obj.summary === 'object'
      ? String((obj.summary as Record<string, unknown>).text || (obj.summary as Record<string, unknown>).summary || (obj.summary as Record<string, unknown>).content || (obj.summary as Record<string, unknown>).revised || JSON.stringify(obj.summary))
      : String(obj.summary);
    // If payload contains critique fields (suggestions or notes), summary max is 1000; otherwise proposal summary max is 2000
    const maxLen = (obj.suggestions || obj.notes) ? 1000 : 2000;
    obj.summary = rawSummary.slice(0, maxLen);
  }

  // 2. Normalize bullets
  if (obj.bullets !== undefined && obj.bullets !== null) {
    if (typeof obj.bullets === 'object' && !Array.isArray(obj.bullets)) {
      obj.bullets = Object.values(obj.bullets);
    }
    if (Array.isArray(obj.bullets)) {
      obj.bullets = obj.bullets
        .map((b, idx) => {
          if (!b || typeof b !== 'object') return null;
          const bObj = { ...(b as Record<string, unknown>) };
          const rawId = String(bObj.itemId || bObj.id || bObj.experienceId || bObj.projectId || '').trim().slice(0, 64);
          const rawIndex = bObj.index !== undefined && bObj.index !== null ? bObj.index : idx;
          const index = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : rawIndex;
          const text = typeof bObj.text === 'string' ? bObj.text.slice(0, 800) : String(bObj.text || '').slice(0, 800);
          return { ...bObj, itemId: rawId, index, text };
        })
        .filter((b): b is { itemId: string; index: number; text: string } =>
          Boolean(b && (b.itemId as string).length > 0 && typeof b.index === 'number' && !isNaN(b.index) && b.index >= 0 && (b.text as string).trim().length >= 5)
        )
        .slice(0, 60);
    } else {
      delete obj.bullets;
    }
  }

  // 3. Normalize removeBullets
  if (obj.removeBullets !== undefined && obj.removeBullets !== null) {
    if (typeof obj.removeBullets === 'object' && !Array.isArray(obj.removeBullets)) {
      obj.removeBullets = Object.values(obj.removeBullets);
    }
    if (Array.isArray(obj.removeBullets)) {
      obj.removeBullets = obj.removeBullets
        .map((b, idx) => {
          if (!b || typeof b !== 'object') return null;
          const bObj = { ...(b as Record<string, unknown>) };
          const rawId = String(bObj.itemId || bObj.id || bObj.experienceId || bObj.projectId || '').trim().slice(0, 64);
          const rawIndex = bObj.index !== undefined && bObj.index !== null ? bObj.index : idx;
          const index = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : rawIndex;
          return { ...bObj, itemId: rawId, index };
        })
        .filter((b): b is { itemId: string; index: number } =>
          Boolean(b && (b.itemId as string).length > 0 && typeof b.index === 'number' && !isNaN(b.index) && b.index >= 0)
        )
        .slice(0, 30);
    } else {
      delete obj.removeBullets;
    }
  }

  // 4. Normalize skillsOrder
  if (obj.skillsOrder !== undefined && obj.skillsOrder !== null) {
    if (typeof obj.skillsOrder === 'string') {
      obj.skillsOrder = obj.skillsOrder.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    } else if (typeof obj.skillsOrder === 'object' && !Array.isArray(obj.skillsOrder)) {
      const sObj = obj.skillsOrder as Record<string, unknown>;
      obj.skillsOrder = Array.isArray(sObj.skills) ? sObj.skills : Array.isArray(sObj.technical) ? sObj.technical : Object.values(sObj);
    }
    if (Array.isArray(obj.skillsOrder)) {
      obj.skillsOrder = obj.skillsOrder
        .map((s) => {
          if (typeof s === 'string') return s.trim().slice(0, 100);
          if (s && typeof s === 'object') {
            const sObj = s as Record<string, unknown>;
            return String(sObj.name || sObj.skill || sObj.title || Object.values(sObj)[0] || '').trim().slice(0, 100);
          }
          return String(s || '').trim().slice(0, 100);
        })
        .filter((s) => s.length > 0)
        .slice(0, 80);
    } else {
      delete obj.skillsOrder;
    }
  }

  // 5. Normalize suggestions (critique)
  if (obj.suggestions !== undefined && obj.suggestions !== null) {
    if (typeof obj.suggestions === 'object' && !Array.isArray(obj.suggestions)) {
      obj.suggestions = Object.values(obj.suggestions);
    }
    if (Array.isArray(obj.suggestions)) {
      obj.suggestions = obj.suggestions
        .map((s, sIdx) => {
          if (!s || typeof s !== 'object') return null;
          const sObj = { ...(s as Record<string, unknown>) };
          for (const k of Object.keys(sObj)) {
            if (sObj[k] === null) delete sObj[k];
          }
          const rawId = sObj.itemId !== undefined && sObj.itemId !== null ? String(sObj.itemId).trim().slice(0, 64) : undefined;
          if (rawId) sObj.itemId = rawId; else delete sObj.itemId;
          if (typeof sObj.index === 'string') {
            const parsedIdx = parseInt(sObj.index, 10);
            sObj.index = !isNaN(parsedIdx) ? parsedIdx : sIdx;
          }
          sObj.section = typeof sObj.section === 'string' ? sObj.section.slice(0, 150) : 'Experience';
          sObj.current = typeof sObj.current === 'string' ? sObj.current.slice(0, 800) : String(sObj.current || '').slice(0, 800);
          sObj.suggested = typeof sObj.suggested === 'string' ? sObj.suggested.slice(0, 800) : String(sObj.suggested || '').slice(0, 800);
          sObj.reason = typeof sObj.reason === 'string' ? sObj.reason.slice(0, 500) : String(sObj.reason || '').slice(0, 500);
          return sObj;
        })
        .filter(Boolean)
        .slice(0, 8);
    } else {
      delete obj.suggestions;
    }
  }

  // Normalize critique notes & summary if present
  if (obj.notes !== undefined && obj.notes !== null) {
    if (typeof obj.notes === 'string') {
      obj.notes = [obj.notes.slice(0, 500)];
    } else if (Array.isArray(obj.notes)) {
      obj.notes = obj.notes
        .map((n) => (typeof n === 'string' ? n.slice(0, 500) : String((n as Record<string, unknown>)?.note || n || '').slice(0, 500)))
        .filter((n) => n.length > 0)
        .slice(0, 8);
    } else {
      delete obj.notes;
    }
  }

  if (Array.isArray(obj.suggestions) || Array.isArray(obj.notes)) {
    if (!obj.summary || typeof obj.summary !== 'string' || !obj.summary.trim()) {
      obj.summary = 'Resume critique completed.';
    }
  }

  // 6. Normalize advisory
  if (obj.advisory !== undefined && obj.advisory !== null) {
    if (typeof obj.advisory === 'string') {
      obj.advisory = { summary: obj.advisory.slice(0, 1000) };
    }
    if (typeof obj.advisory === 'object' && !Array.isArray(obj.advisory)) {
      const adv: Record<string, unknown> = { ...(obj.advisory as Record<string, unknown>) };
      for (const k of Object.keys(adv)) {
        if (adv[k] === null) delete adv[k];
      }

      if (adv.summary !== undefined && adv.summary !== null) {
        adv.summary = typeof adv.summary === 'string' ? adv.summary.slice(0, 1000) : String(adv.summary).slice(0, 1000);
      }

      // Normalize keyStrengths: handle array of objects or strings, slice to 400
      if (adv.keyStrengths !== undefined && adv.keyStrengths !== null) {
        if (typeof adv.keyStrengths === 'string') {
          adv.keyStrengths = [adv.keyStrengths.slice(0, 400)];
        } else if (Array.isArray(adv.keyStrengths)) {
          adv.keyStrengths = adv.keyStrengths
            .map((s) => {
              if (typeof s === 'string') return s.slice(0, 400);
              if (s && typeof s === 'object') {
                const sObj = s as Record<string, unknown>;
                return String(sObj.strength || sObj.title || sObj.name || Object.values(sObj)[0] || '').slice(0, 400);
              }
              return String(s || '').slice(0, 400);
            })
            .filter((s) => s.length > 0);
        } else {
          delete adv.keyStrengths;
        }
      }

      // Normalize criticalGaps: handle array of objects or strings, slice to 400
      if (adv.criticalGaps !== undefined && adv.criticalGaps !== null) {
        if (typeof adv.criticalGaps === 'string') {
          adv.criticalGaps = [adv.criticalGaps.slice(0, 400)];
        } else if (Array.isArray(adv.criticalGaps)) {
          adv.criticalGaps = adv.criticalGaps
            .map((g) => {
              if (typeof g === 'string') return g.slice(0, 400);
              if (g && typeof g === 'object') {
                const gObj = g as Record<string, unknown>;
                return String(gObj.gap || gObj.title || gObj.name || Object.values(gObj)[0] || '').slice(0, 400);
              }
              return String(g || '').slice(0, 400);
            })
            .filter((g) => g.length > 0);
        } else {
          delete adv.criticalGaps;
        }
      }

      // Normalize candidateQuestions: handle array of objects or strings, slice to 400
      if (adv.candidateQuestions !== undefined && adv.candidateQuestions !== null) {
        if (typeof adv.candidateQuestions === 'string') {
          adv.candidateQuestions = [adv.candidateQuestions.slice(0, 400)];
        } else if (Array.isArray(adv.candidateQuestions)) {
          adv.candidateQuestions = adv.candidateQuestions
            .map((q) => {
              if (typeof q === 'string') return q.slice(0, 400);
              if (q && typeof q === 'object') {
                const qObj = q as Record<string, unknown>;
                return String(qObj.question || qObj.title || Object.values(qObj)[0] || '').slice(0, 400);
              }
              return String(q || '').slice(0, 400);
            })
            .filter((q) => q.length > 0);
        } else {
          delete adv.candidateQuestions;
        }
      }

      // Normalize recommendations
      if (adv.recommendations !== undefined && adv.recommendations !== null) {
        if (typeof adv.recommendations === 'object' && !Array.isArray(adv.recommendations)) {
          adv.recommendations = Object.values(adv.recommendations);
        }
        if (Array.isArray(adv.recommendations)) {
          adv.recommendations = adv.recommendations
            .filter((rec) => {
              if (!rec || typeof rec !== 'object') return false;
              const r = rec as Record<string, unknown>;
              return Boolean(
                (typeof r.issue === 'string' && r.issue.trim()) ||
                  (typeof r.actionableStep === 'string' && r.actionableStep.trim()) ||
                  (typeof r.title === 'string' && r.title.trim())
              );
            })
            .map((rec, rIdx) => {
              if (!rec || typeof rec !== 'object') return rec;
              const r: Record<string, unknown> = { ...(rec as Record<string, unknown>) };
              for (const k of Object.keys(r)) {
                if (r[k] === null) delete r[k];
              }
              r.id = r.id !== undefined && r.id !== null && String(r.id).trim().length > 0 ? String(r.id).trim().slice(0, 64) : `rec_${rIdx + 1}`;
              r.title = String(r.title || 'Recommendation').trim().slice(0, 150);
              r.section = String(r.section || 'Experience').trim().slice(0, 100);
              r.issue = String(r.issue || 'Improvement opportunity').trim().slice(0, 500);
              r.whyItMatters = String(r.whyItMatters || 'Aligns with target role').trim().slice(0, 500);
              r.actionableStep = String(r.actionableStep || 'Update resume with details').trim().slice(0, 500);

              if (r.candidateQuestion !== undefined && r.candidateQuestion !== null) {
                r.candidateQuestion = typeof r.candidateQuestion === 'string' ? r.candidateQuestion.slice(0, 400) : String(r.candidateQuestion).slice(0, 400);
              }
              if (r.metricPlaceholder !== undefined && r.metricPlaceholder !== null) {
                r.metricPlaceholder = typeof r.metricPlaceholder === 'string' ? r.metricPlaceholder.slice(0, 120) : String(r.metricPlaceholder).slice(0, 120);
              }

              // Map category synonyms
              const rawCat = String(r.category || '').toLowerCase().replace(/[\s-]+/g, '_');
              if (rawCat.includes('impact') || rawCat.includes('bullet')) r.category = 'bullet_impact';
              else if (rawCat.includes('keyword') || rawCat.includes('skill')) r.category = 'keyword_gap';
              else if (rawCat.includes('missing') || rawCat.includes('require')) r.category = 'missing_requirement';
              else if (rawCat.includes('quant') || rawCat.includes('metric') || rawCat.includes('number')) r.category = 'quantification';
              else if (rawCat.includes('format') || rawCat.includes('struct') || rawCat.includes('layout')) r.category = 'formatting_structure';
              else r.category = 'bullet_impact';

              // Coerce boolean requiresCandidateInput
              if (typeof r.requiresCandidateInput === 'string') {
                r.requiresCandidateInput = r.requiresCandidateInput.toLowerCase() === 'true' || r.requiresCandidateInput === '1';
              } else if (typeof r.requiresCandidateInput === 'number') {
                r.requiresCandidateInput = r.requiresCandidateInput === 1;
              } else if (typeof r.requiresCandidateInput !== 'boolean') {
                r.requiresCandidateInput = false;
              }
              return r;
            })
            .slice(0, 12);
        } else {
          delete adv.recommendations;
        }
      }
      obj.advisory = adv;
    } else {
      delete obj.advisory;
    }
  }

  return obj;
}

function calculateContentScore(obj: unknown): number {
  if (!obj || typeof obj !== 'object') return 0;
  const o = obj as Record<string, unknown>;
  let score = 0;
  if (Array.isArray(o.bullets) && o.bullets.length > 0) score += o.bullets.length * 1000;
  if (typeof o.summary === 'string' && o.summary.trim().length > 0) score += 1000;
  if (Array.isArray(o.skillsOrder) && o.skillsOrder.length > 0) score += o.skillsOrder.length * 100;
  if (o.advisory && typeof o.advisory === 'object') {
    const adv = o.advisory as Record<string, unknown>;
    score += 500;
    if (Array.isArray(adv.recommendations)) score += adv.recommendations.length * 200;
    if (Array.isArray(adv.keyStrengths)) score += adv.keyStrengths.length * 100;
    if (Array.isArray(adv.criticalGaps)) score += adv.criticalGaps.length * 100;
  }
  if (Array.isArray(o.suggestions) && o.suggestions.length > 0) score += o.suggestions.length * 1000;
  if (Array.isArray(o.notes) && o.notes.length > 0) score += o.notes.length * 100;
  return score;
}

/** Robust JSON extraction and parsing helper. */
export function parseStructured<T>(raw: string, schema: ZodType<T>): T {
  const text = (raw || '').trim();
  if (!text) {
    throw new AiUnavailableError('AI_MALFORMED', 'AI returned an empty response.', true);
  }

  function tryParse(str: string): unknown {
    const trimmed = str.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      try {
        const sanitized = trimmed
          .replace(/\/\/[^\n\r"]*(?=[\n\r])/g, '')
          .replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(sanitized);
      } catch {
        return null;
      }
    }
  }

  // 1. Collect all candidate JSON structures from raw text, code fences, balanced braces, and outermost slice
  const candidates: unknown[] = [];

  // 1a. Direct parse check (raw text is already valid JSON)
  const direct = tryParse(text);
  if (direct !== null && typeof direct === 'object') {
    candidates.push(direct);
  }

  // 1b. Scan all markdown code fences (```json ... ``` or ``` ... ```)
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    const p = tryParse(candidate);
    if (p !== null && typeof p === 'object') {
      candidates.push(p);
    }
  }

  // 1c. Balanced scanner: find candidate JSON objects or arrays inside surrounding prose
  for (let i = 0; i < text.length; i++) {
    const startChar = text[i];
    if (startChar !== '{' && startChar !== '[') continue;

    const endChar = startChar === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === startChar) {
          depth++;
        } else if (ch === endChar) {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(i, j + 1).trim();
            const p = tryParse(candidate);
            if (p !== null && typeof p === 'object') {
              candidates.push(p);
            }
            break;
          }
        }
      }
    }
  }

  // 1d. Fallback: Outermost brace slice
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1).trim();
    const p = tryParse(candidate);
    if (p !== null && typeof p === 'object') {
      candidates.push(p);
    }
  }

  if (candidates.length === 0) {
    throw new AiUnavailableError('AI_MALFORMED', 'AI output was not valid JSON.', true);
  }

  // 2. Select the best candidate that matches the schema and has real content
  type ScoredCandidate = { data: unknown; contentScore: number; rawScore: number };
  const validCandidates: ScoredCandidate[] = [];

  for (const cand of candidates) {
    const normalized = normalizeAiPayload(cand);
    const parsedRes = schema.safeParse(normalized);
    if (parsedRes.success) {
      const contentScore = calculateContentScore(normalized);
      let rawScore = 0;
      if (cand && typeof cand === 'object') {
        rawScore += Object.keys(cand as Record<string, unknown>).length * 10;
        try {
          rawScore += JSON.stringify(cand).length;
        } catch {
          // ignore serialization failure
        }
      }
      validCandidates.push({ data: normalized, contentScore, rawScore });
    }
  }

  // If we have candidates with real content, choose the best one
  const substantiveCandidates = validCandidates.filter((c) => c.contentScore > 0);
  if (substantiveCandidates.length > 0) {
    substantiveCandidates.sort((a, b) => (b.contentScore !== a.contentScore ? b.contentScore - a.contentScore : b.rawScore - a.rawScore));
    return schema.parse(substantiveCandidates[0].data);
  }

  // If no substantive candidates succeeded, but some valid candidates exist (e.g. valid empty object)
  if (validCandidates.length > 0) {
    validCandidates.sort((a, b) => b.rawScore - a.rawScore);
    return schema.parse(validCandidates[0].data);
  }

  // If none passed safeParse, run schema.parse on the largest candidate to trigger informative ZodError
  const largestCandidate = candidates.reduce((prev, curr) => {
    const prevLen = typeof prev === 'object' && prev !== null ? JSON.stringify(prev).length : 0;
    const currLen = typeof curr === 'object' && curr !== null ? JSON.stringify(curr).length : 0;
    return currLen >= prevLen ? curr : prev;
  }, candidates[0]);

  const normalized = normalizeAiPayload(largestCandidate);
  return schema.parse(normalized);
}
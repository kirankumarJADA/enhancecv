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
            lastError = new AiUnavailableError('AI_MALFORMED', 'AI returned an invalid structure.', true);
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

  // 2. Normalize bullets
  if (Array.isArray(obj.bullets)) {
    obj.bullets = obj.bullets
      .map((b, idx) => {
        if (!b || typeof b !== 'object') return null;
        const bObj = { ...(b as Record<string, unknown>) };
        const rawId = bObj.itemId !== undefined && bObj.itemId !== null ? String(bObj.itemId).trim() : '';
        const rawIndex = bObj.index !== undefined && bObj.index !== null ? bObj.index : idx;
        const index = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : rawIndex;
        const text = typeof bObj.text === 'string' ? bObj.text.slice(0, 800) : String(bObj.text || '');
        return { ...bObj, itemId: rawId, index, text };
      })
      .filter((b) => b && (b.itemId as string).length > 0 && typeof b.index === 'number' && !isNaN(b.index) && (b.text as string).trim().length >= 5);
  }

  // 3. Normalize removeBullets
  if (Array.isArray(obj.removeBullets)) {
    obj.removeBullets = obj.removeBullets
      .map((b, idx) => {
        if (!b || typeof b !== 'object') return null;
        const bObj = { ...(b as Record<string, unknown>) };
        const rawId = bObj.itemId !== undefined && bObj.itemId !== null ? String(bObj.itemId).trim() : '';
        const rawIndex = bObj.index !== undefined && bObj.index !== null ? bObj.index : idx;
        const index = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : rawIndex;
        return { ...bObj, itemId: rawId, index };
      })
      .filter((b) => b && (b.itemId as string).length > 0 && typeof b.index === 'number' && !isNaN(b.index));
  }

  // 4. Normalize suggestions (critique)
  if (Array.isArray(obj.suggestions)) {
    obj.suggestions = obj.suggestions
      .map((s, sIdx) => {
        if (!s || typeof s !== 'object') return null;
        const sObj = { ...(s as Record<string, unknown>) };
        for (const k of Object.keys(sObj)) {
          if (sObj[k] === null) delete sObj[k];
        }
        if (sObj.itemId !== undefined && sObj.itemId !== null) {
          sObj.itemId = String(sObj.itemId).trim();
        }
        if (typeof sObj.index === 'string') {
          const parsedIdx = parseInt(sObj.index, 10);
          sObj.index = !isNaN(parsedIdx) ? parsedIdx : sIdx;
        }
        if (typeof sObj.current === 'string') sObj.current = sObj.current.slice(0, 800);
        if (typeof sObj.suggested === 'string') sObj.suggested = sObj.suggested.slice(0, 800);
        if (typeof sObj.reason === 'string') sObj.reason = sObj.reason.slice(0, 500);
        return sObj;
      })
      .filter(Boolean);
  }

  // 5. Normalize advisory
  if (obj.advisory && typeof obj.advisory === 'object') {
    const adv: Record<string, unknown> = { ...(obj.advisory as Record<string, unknown>) };
    for (const k of Object.keys(adv)) {
      if (adv[k] === null) delete adv[k];
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
        r.id = r.id !== undefined && r.id !== null ? String(r.id).trim() : `rec_${rIdx + 1}`;
        if (!r.title) r.title = 'Recommendation';
        if (!r.section) r.section = 'Experience';
        if (!r.issue) r.issue = 'Improvement opportunity';
        if (!r.whyItMatters) r.whyItMatters = 'Aligns with target role';
        if (!r.actionableStep) r.actionableStep = 'Update resume with details';

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
      });
    }
    obj.advisory = adv;
  }

  return obj;
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
  type ScoredCandidate = { data: unknown; score: number };
  const validCandidates: ScoredCandidate[] = [];

  for (const cand of candidates) {
    const normalized = normalizeAiPayload(cand);
    const parsedRes = schema.safeParse(normalized);
    if (parsedRes.success) {
      let score = 0;
      if (cand && typeof cand === 'object') {
        const keys = Object.keys(cand as Record<string, unknown>);
        score += keys.length * 10;
        try {
          score += JSON.stringify(cand).length;
        } catch {
          // ignore serialization failure
        }
      }
      validCandidates.push({ data: normalized, score });
    }
  }

  if (validCandidates.length > 0) {
    validCandidates.sort((a, b) => b.score - a.score);
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
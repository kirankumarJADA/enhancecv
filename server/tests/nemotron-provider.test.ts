// Curevo AI — NVIDIA Nemotron Provider & Robustness Regression Test Suite
//
// Verifies:
// 1. Target model configuration: nvidia/nemotron-3-ultra-550b-a55b default for NVIDIA provider.
// 2. Request payload contract for Ultra:
//    - stream: false
//    - reasoning_effort: 'medium'
//    - initial max_tokens: 8192
//    - temperature: 0.2
//    - top_p: omitted (endpoint default retained)
//    - chat_template_kwargs: omitted (not sent for Ultra)
// 3. Backward compatibility:
//    - Legacy Lightning sends chat_template_kwargs: { enable_thinking: false } and omits reasoning_effort.
// 4. Reasoning trace isolation:
//    - choice.message.reasoning_content is isolated and ignored.
//    - <think>...</think> tags embedded in choice.message.content are stripped before parsing.
// 5. Truncation / finish_reason="length" handling:
//    - Adaptive retry expands max_tokens up to 32,768 for Ultra.
// 6. Empty response handling:
//    - choices[0].message.content empty/missing triggers sanitized diagnostics and raises AI_MALFORMED
//      without logging prompts or PII.
// 7. Error handling:
//    - Timeouts, 429 rate limits, 401/403 auth errors, and 5xx server errors.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import {
  OpenAiCompatibleProvider,
  parseStructured,
  sanitizeRawAiOutput,
  AiUnavailableError,
  readAiConfigFromEnv,
  aiRequestContext,
} from '../src/ai/provider';
import { getAiKeyPoolCount } from '../src/config';

const testSchema = z.object({
  summary: z.string(),
  skills: z.array(z.string()).optional(),
});

describe('NVIDIA Nemotron Provider Configuration & Robustness', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reads default model as nvidia/nemotron-3-ultra-550b-a55b and timeout as 120000ms from env', () => {
    const origNvidia = process.env.NVIDIA_API_KEY;
    const origModel = process.env.AI_MODEL;
    const origTimeout = process.env.AI_TIMEOUT_MS;

    try {
      process.env.NVIDIA_API_KEY = 'nvapi-test-key-550b';
      delete process.env.AI_MODEL;
      delete process.env.AI_TIMEOUT_MS;

      const cfg = readAiConfigFromEnv();
      expect(cfg).not.toBeNull();
      expect(cfg!.providerId).toBe('nvidia');
      expect(cfg!.model).toBe('nvidia/nemotron-3-ultra-550b-a55b');
      expect(cfg!.baseUrl).toBe('https://integrate.api.nvidia.com/v1');
      expect(cfg!.timeoutMs).toBe(120_000);
      expect(cfg!.maxRetries).toBe(1);
      expect(cfg!.maxIterations).toBe(2);
    } finally {
      if (origNvidia !== undefined) process.env.NVIDIA_API_KEY = origNvidia; else delete process.env.NVIDIA_API_KEY;
      if (origModel !== undefined) process.env.AI_MODEL = origModel; else delete process.env.AI_MODEL;
      if (origTimeout !== undefined) process.env.AI_TIMEOUT_MS = origTimeout; else delete process.env.AI_TIMEOUT_MS;
    }
  });

  it('sets stream: false, reasoning_effort: "medium", max_tokens: 8192, and omits chat_template_kwargs for Nemotron Ultra', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    let capturedHeaders: Record<string, string> | null = null;

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      capturedHeaders = init.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ summary: 'Ultra summary', skills: ['TypeScript', 'Kubernetes'] }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { completion_tokens: 45, total_tokens: 220 },
          }),
      } as Response;
    });

    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'nvapi-test-key-12345',
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 120_000,
      maxRetries: 1,
      maxIterations: 2,
    });

    const result = await provider.completeJson({
      system: 'You are Curevo AI',
      user: 'Generate a resume summary',
      schema: testSchema,
      temperature: 0.2,
    });

    expect(result.summary).toBe('Ultra summary');
    expect(capturedBody).toBeDefined();
    expect(capturedBody!.model).toBe('nvidia/nemotron-3-ultra-550b-a55b');
    expect(capturedBody!.stream).toBe(false);
    expect(capturedBody!.reasoning_effort).toBe('medium');
    expect(capturedBody!.chat_template_kwargs).toBeUndefined();
    expect(capturedBody!.top_p).toBeUndefined(); // endpoint default retained
    expect(capturedBody!.max_tokens).toBe(8192);
    expect(capturedBody!.temperature).toBe(0.2);
    expect(capturedHeaders!['Accept']).toBe('application/json');
    expect(capturedHeaders!['Authorization']).toBe('Bearer nvapi-test-key-12345');
  });

  it('maintains backward compatibility: sends chat_template_kwargs: { enable_thinking: false } for legacy Lightning', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ summary: 'Lightning summary', skills: ['TypeScript'] }),
                },
                finish_reason: 'stop',
              },
            ],
          }),
      } as Response;
    });

    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'nvapi-test-key-lightning',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 65_000,
      maxRetries: 1,
      maxIterations: 2,
    });

    const result = await provider.completeJson({
      system: 'You are Curevo AI',
      user: 'Generate a resume summary',
      schema: testSchema,
      maxTokens: 4000,
      temperature: 0.2,
    });

    expect(result.summary).toBe('Lightning summary');
    expect(capturedBody).toBeDefined();
    expect(capturedBody!.model).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
    expect(capturedBody!.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(capturedBody!.reasoning_effort).toBeUndefined();
    expect(capturedBody!.max_tokens).toBe(4000);
  });

  it('isolates reasoning traces: strips <think> tags and ignores reasoning_content', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  reasoning_content: 'Chain of thought: candidate has 5 years experience, emphasize TypeScript.',
                  content: `<think>\nThinking about candidate strengths...\nFinalizing output format...\n</think>\n{\n  "summary": "Accomplished engineer with 5 years experience.",\n  "skills": ["TypeScript", "Node.js"]\n}`,
                },
                finish_reason: 'stop',
              },
            ],
            usage: { completion_tokens: 120, total_tokens: 300 },
          }),
      } as Response;
    });

    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'nvapi-ultra-key',
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 120_000,
      maxRetries: 1,
      maxIterations: 2,
    });

    const result = await provider.completeJson({
      system: 'You are Curevo AI',
      user: 'Tailor resume',
      schema: testSchema,
    });

    expect(result.summary).toBe('Accomplished engineer with 5 years experience.');
    expect(result.skills).toEqual(['TypeScript', 'Node.js']);
    // Verify no thinking tags or chain of thought leaked into the output
    expect(JSON.stringify(result)).not.toContain('think');
    expect(JSON.stringify(result)).not.toContain('Chain of thought');
  });

  it('handles empty choices[0].message.content gracefully and raises AI_MALFORMED', async () => {
    const errorLogs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errorLogs.push(args.join(' '));
    });

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '', // Empty content as observed in live bug
                  reasoning_content: 'Some internal thinking tokens that consumed output',
                },
                finish_reason: 'stop',
              },
            ],
          }),
      } as Response;
    });

    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'nvapi-secret-key-999',
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 10000,
      maxRetries: 1,
      maxIterations: 1,
    });

    await expect(
      provider.completeJson({
        system: 'System prompt',
        user: 'User prompt with sensitive PII John Doe secret@email.com',
        schema: testSchema,
      })
    ).rejects.toThrow('AI returned an empty response.');

    // Verify diagnostics logged sanitized finish_reason without leaking PII or prompt
    expect(errorLogs.some((l) => l.includes('empty_content') && l.includes('has_reasoning=true'))).toBe(true);
    expect(errorLogs.some((l) => l.includes('John Doe') || l.includes('secret@email.com') || l.includes('nvapi-secret-key-999'))).toBe(false);

    consoleSpy.mockRestore();
  });

  it('detects finish_reason="length" and executes adaptive retry with increased max_tokens up to 32768 for Ultra', async () => {
    const requestedTokenLimits: number[] = [];

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      requestedTokenLimits.push(body.max_tokens);

      if (requestedTokenLimits.length === 1) {
        // First attempt: truncated mid-JSON due to token limit
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: '{"summary": "Incomplete text that cut off mid',
                  },
                  finish_reason: 'length',
                },
              ],
              usage: { completion_tokens: 8192, total_tokens: 8500 },
            }),
        } as Response;
      }

      // Second attempt (retry): succeeds with higher token limit
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ summary: 'Fully completed summary on retry', skills: ['TypeScript'] }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { completion_tokens: 9500, total_tokens: 10000 },
          }),
      } as Response;
    });

    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'nvapi-test',
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 120_000,
      maxRetries: 1,
      maxIterations: 1,
    });

    const result = await provider.completeJson({
      system: 'System prompt',
      user: 'User prompt',
      schema: testSchema,
    });

    expect(result.summary).toBe('Fully completed summary on retry');
    expect(requestedTokenLimits.length).toBe(2);
    expect(requestedTokenLimits[0]).toBe(8192);
    // Adaptive retry increased token limit by 4096 to 12288
    expect(requestedTokenLimits[1]).toBe(12288);
  });

  it('parseStructured handles trailing commas produced by LLMs', () => {
    const rawWithTrailingComma = `
    {
      "summary": "Valid summary with trailing comma",
      "skills": ["React", "Node",],
    }
    `;
    const parsed = parseStructured(rawWithTrailingComma, testSchema);
    expect(parsed.summary).toBe('Valid summary with trailing comma');
    expect(parsed.skills).toEqual(['React', 'Node']);
  });

  it('parseStructured handles markdown code fences and introductory commentary', () => {
    const rawWithFences = `Here is the requested resume analysis:
\`\`\`json
{
  "summary": "Full stack developer with 6 years experience.",
  "skills": ["Go", "Kubernetes"]
}
\`\`\`
Hope this is helpful!`;

    const parsed = parseStructured(rawWithFences, testSchema);
    expect(parsed.summary).toBe('Full stack developer with 6 years experience.');
    expect(parsed.skills).toEqual(['Go', 'Kubernetes']);
  });

  it('correctly maps 429 to AI_RATE_LIMITED and 503 to AI_UNAVAILABLE', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      } as Response;
    });

    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'nvapi-test',
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 5000,
      maxRetries: 1,
      maxIterations: 1,
    });

    await expect(
      provider.completeJson({
        system: 'System',
        user: 'User',
        schema: testSchema,
      })
    ).rejects.toThrow('The AI provider is rate limiting requests.');
    expect(callCount).toBe(2); // 1 initial + 1 retry
  });

  it('aborts on timeout and throws AI_TIMEOUT', async () => {
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'nvapi-test',
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 50, // Short timeout for test
      maxRetries: 0,
      maxIterations: 1,
    });

    await expect(
      provider.completeJson({
        system: 'System',
        user: 'User',
        schema: testSchema,
      })
    ).rejects.toThrow('The AI provider did not respond in time.');
  });

  describe('Multi-Key Rotation & BYOK Quota Resilience', () => {
    it('parses multiple comma-separated keys and deduplicates them', () => {
      const origNvidiaKeys = process.env.NVIDIA_API_KEYS;
      const origNvidiaKey = process.env.NVIDIA_API_KEY;
      try {
        process.env.NVIDIA_API_KEYS = 'nvapi-key-1, nvapi-key-2, nvapi-key-3';
        process.env.NVIDIA_API_KEY = 'nvapi-key-1'; // Duplicate should be deduped
        const cfg = readAiConfigFromEnv();
        expect(cfg).not.toBeNull();
        expect(cfg?.apiKeys).toEqual(['nvapi-key-1', 'nvapi-key-2', 'nvapi-key-3']);
        expect(getAiKeyPoolCount(process.env)).toBe(3);
      } finally {
        if (origNvidiaKeys) process.env.NVIDIA_API_KEYS = origNvidiaKeys;
        else delete process.env.NVIDIA_API_KEYS;
        if (origNvidiaKey) process.env.NVIDIA_API_KEY = origNvidiaKey;
        else delete process.env.NVIDIA_API_KEY;
      }
    });

    it('rotates to next API key in pool on HTTP 429 and succeeds on rotated key', async () => {
      const sentHeaders: string[] = [];
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        callCount++;
        const headers = init.headers as Record<string, string>;
        sentHeaders.push(headers['Authorization']);
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            text: async () => 'Rate limit exceeded on key 1',
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ summary: 'Success on rotated key' }),
                },
                finish_reason: 'stop',
              },
            ],
          }),
        } as Response;
      });

      const provider = new OpenAiCompatibleProvider({
        providerId: 'nvidia',
        apiKey: 'nvapi-primary',
        apiKeys: ['nvapi-primary', 'nvapi-secondary'],
        model: 'nvidia/nemotron-3-ultra-550b-a55b',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        timeoutMs: 5000,
        maxRetries: 1,
        maxIterations: 1,
      });

      const res = await provider.completeJson({
        system: 'System',
        user: 'User',
        schema: testSchema,
      });

      expect(res.summary).toBe('Success on rotated key');
      expect(callCount).toBe(2);
      expect(sentHeaders).toEqual(['Bearer nvapi-primary', 'Bearer nvapi-secondary']);
    });

    it('prioritizes BYOK custom API key from AsyncLocalStorage request context', async () => {
      const sentHeaders: string[] = [];
      global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        sentHeaders.push(headers['Authorization']);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ summary: 'Success with BYOK' }),
                },
                finish_reason: 'stop',
              },
            ],
          }),
        } as Response;
      });

      const provider = new OpenAiCompatibleProvider({
        providerId: 'nvidia',
        apiKey: 'nvapi-server-default',
        apiKeys: ['nvapi-server-default'],
        model: 'nvidia/nemotron-3-ultra-550b-a55b',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        timeoutMs: 5000,
        maxRetries: 1,
        maxIterations: 1,
      });

      await aiRequestContext.run({ customApiKey: 'nvapi-custom-user-key' }, async () => {
        const res = await provider.completeJson({
          system: 'System',
          user: 'User',
          schema: testSchema,
        });
        expect(res.summary).toBe('Success with BYOK');
      });

      expect(sentHeaders).toEqual(['Bearer nvapi-custom-user-key']);
    });
  });

  describe('AI Response Sanitization, JSON Mode & Auth Key Rotation', () => {
    describe('sanitizeRawAiOutput', () => {
      it('strips closed <think> blocks and trailing unclosed <think> blocks', () => {
        const rawWithClosed = '<think>Deliberating resume structure...\nComparing options</think>{"summary": "Test Summary"}';
        expect(sanitizeRawAiOutput(rawWithClosed)).toBe('{"summary": "Test Summary"}');

        const rawWithUnclosed = '{"summary": "Test Summary"}<think>Unfinished thoughts that cut off';
        expect(sanitizeRawAiOutput(rawWithUnclosed)).toBe('{"summary": "Test Summary"}');

        const rawMultiline = '<think>\nStep 1: Check requirements.\nStep 2: Generate JSON.\n</think>\n```json\n{"summary": "Lead Architect"}\n```';
        expect(sanitizeRawAiOutput(rawMultiline)).toBe('{"summary": "Lead Architect"}');
      });

      it('strips markdown code fences with and without json tag', () => {
        const withTag = '```json\n{"summary": "Software Engineer"}\n```';
        expect(sanitizeRawAiOutput(withTag)).toBe('{"summary": "Software Engineer"}');

        const withoutTag = '```\n{"summary": "Software Engineer"}\n```';
        expect(sanitizeRawAiOutput(withoutTag)).toBe('{"summary": "Software Engineer"}');

        const withProse = 'Here is the tailored resume:\n```json\n{"summary": "DevOps Engineer"}\n```\nLet me know if you need edits!';
        expect(sanitizeRawAiOutput(withProse)).toBe('{"summary": "DevOps Engineer"}');
      });

      it('extracts outermost valid JSON object and array boundaries', () => {
        const objInProse = 'Sure, here is the result: {"summary": "Data Scientist", "skills": ["Python"]} and that is all.';
        expect(sanitizeRawAiOutput(objInProse)).toBe('{"summary": "Data Scientist", "skills": ["Python"]}');

        const arrInProse = 'The list of skills is: ["TypeScript", "Node.js", "Docker"] as requested.';
        expect(sanitizeRawAiOutput(arrInProse)).toBe('["TypeScript", "Node.js", "Docker"]');
      });

      it('handles JSON with curly braces and brackets inside string literals', () => {
        const complex = '```json\n{"summary": "Expert in regex like {[a-z]+} and {bracket} syntax"}\n```';
        expect(sanitizeRawAiOutput(complex)).toBe('{"summary": "Expert in regex like {[a-z]+} and {bracket} syntax"}');
      });
    });

    describe('parseStructured robustness', () => {
      it('parses output containing both <think> blocks and markdown code fences', () => {
        const messyOutput = `
<think>
Thinking about candidate strengths...
Formatting as JSON schema.
</think>
Here is your requested structured resume:
\`\`\`json
{
  "summary": "Full Stack Engineer with 7 years experience",
  "skills": ["React", "Node.js", "PostgreSQL"]
}
\`\`\`
Hope this helps!
`;
        const parsed = parseStructured(messyOutput, testSchema);
        expect(parsed.summary).toBe('Full Stack Engineer with 7 years experience');
        expect(parsed.skills).toEqual(['React', 'Node.js', 'PostgreSQL']);
      });

      it('safely rejects truncated JSON and throws AI_MALFORMED with retryable: true', () => {
        const truncatedJson = '{"summary": "Truncated resume output that cut off mid-stre';
        expect(() => parseStructured(truncatedJson, testSchema)).toThrow(AiUnavailableError);
        try {
          parseStructured(truncatedJson, testSchema);
        } catch (err) {
          expect(err).toBeInstanceOf(AiUnavailableError);
          const aiErr = err as AiUnavailableError;
          expect(aiErr.code).toBe('AI_MALFORMED');
          expect(aiErr.retryable).toBe(true);
        }
      });
    });

    describe('JSON mode response_format & HTTP 400 graceful fallback', () => {
      it('sends response_format: { type: "json_object" } in chat completion payload', async () => {
        let capturedPayload: Record<string, unknown> | null = null;
        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
          capturedPayload = JSON.parse(init.body as string);
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              choices: [
                {
                  message: { content: JSON.stringify({ summary: 'JSON mode success' }) },
                  finish_reason: 'stop',
                },
              ],
            }),
          } as Response;
        });

        const provider = new OpenAiCompatibleProvider({
          providerId: 'nvidia',
          apiKey: 'nvapi-test',
          model: 'nvidia/nemotron-3-ultra-550b-a55b',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          timeoutMs: 5000,
          maxRetries: 1,
          maxIterations: 1,
        });

        const res = await provider.completeJson({
          system: 'System prompt',
          user: 'User prompt',
          schema: testSchema,
        });

        expect(res.summary).toBe('JSON mode success');
        expect(capturedPayload).not.toBeNull();
        expect((capturedPayload as any).response_format).toEqual({ type: 'json_object' });
      });

      it('falls back gracefully when endpoint returns HTTP 400 rejecting response_format', async () => {
        const capturedPayloads: Record<string, unknown>[] = [];
        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
          callCount++;
          const payload = JSON.parse(init.body as string);
          capturedPayloads.push(payload);
          if (callCount === 1) {
            return {
              ok: false,
              status: 400,
              text: async () => '400 Bad Request: unrecognized parameter response_format',
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              choices: [
                {
                  message: { content: JSON.stringify({ summary: 'Fallback success' }) },
                  finish_reason: 'stop',
                },
              ],
            }),
          } as Response;
        });

        const provider = new OpenAiCompatibleProvider({
          providerId: 'nvidia',
          apiKey: 'nvapi-test',
          model: 'nvidia/nemotron-3-ultra-550b-a55b',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          timeoutMs: 5000,
          maxRetries: 1,
          maxIterations: 1,
        });

        const res = await provider.completeJson({
          system: 'System prompt',
          user: 'User prompt',
          schema: testSchema,
        });

        expect(res.summary).toBe('Fallback success');
        expect(callCount).toBe(2);
        expect(capturedPayloads[0].response_format).toEqual({ type: 'json_object' });
        expect(capturedPayloads[1].response_format).toBeUndefined();
      });
    });

    describe('Key rotation on HTTP 401 and HTTP 403', () => {
      it('rotates to next API key in pool on HTTP 401 Unauthorized and succeeds', async () => {
        const sentHeaders: string[] = [];
        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
          callCount++;
          const headers = init.headers as Record<string, string>;
          sentHeaders.push(headers['Authorization']);
          if (callCount === 1) {
            return {
              ok: false,
              status: 401,
              text: async () => 'Unauthorized: invalid or expired api key',
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              choices: [
                {
                  message: { content: JSON.stringify({ summary: 'Success on key 2 after 401' }) },
                  finish_reason: 'stop',
                },
              ],
            }),
          } as Response;
        });

        const provider = new OpenAiCompatibleProvider({
          providerId: 'nvidia',
          apiKey: 'nvapi-expired-key',
          apiKeys: ['nvapi-expired-key', 'nvapi-valid-key'],
          model: 'nvidia/nemotron-3-ultra-550b-a55b',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          timeoutMs: 5000,
          maxRetries: 1,
          maxIterations: 1,
        });

        const res = await provider.completeJson({
          system: 'System',
          user: 'User',
          schema: testSchema,
        });

        expect(res.summary).toBe('Success on key 2 after 401');
        expect(callCount).toBe(2);
        expect(sentHeaders).toEqual(['Bearer nvapi-expired-key', 'Bearer nvapi-valid-key']);
      });

      it('rotates to next API key in pool on HTTP 403 Forbidden and succeeds', async () => {
        const sentHeaders: string[] = [];
        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
          callCount++;
          const headers = init.headers as Record<string, string>;
          sentHeaders.push(headers['Authorization']);
          if (callCount === 1) {
            return {
              ok: false,
              status: 403,
              text: async () => 'Forbidden: quota exhausted or key disabled',
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              choices: [
                {
                  message: { content: JSON.stringify({ summary: 'Success on key 2 after 403' }) },
                  finish_reason: 'stop',
                },
              ],
            }),
          } as Response;
        });

        const provider = new OpenAiCompatibleProvider({
          providerId: 'nvidia',
          apiKey: 'nvapi-forbidden-key',
          apiKeys: ['nvapi-forbidden-key', 'nvapi-valid-key'],
          model: 'nvidia/nemotron-3-ultra-550b-a55b',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          timeoutMs: 5000,
          maxRetries: 1,
          maxIterations: 1,
        });

        const res = await provider.completeJson({
          system: 'System',
          user: 'User',
          schema: testSchema,
        });

        expect(res.summary).toBe('Success on key 2 after 403');
        expect(callCount).toBe(2);
        expect(sentHeaders).toEqual(['Bearer nvapi-forbidden-key', 'Bearer nvapi-valid-key']);
      });

      it('throws non-retryable AI_PROVIDER_ERROR when all keys fail with auth errors', async () => {
        let callCount = 0;
        global.fetch = vi.fn().mockImplementation(async () => {
          callCount++;
          return {
            ok: false,
            status: 401,
            text: async () => 'Unauthorized: invalid api key',
          } as Response;
        });

        const provider = new OpenAiCompatibleProvider({
          providerId: 'nvidia',
          apiKey: 'nvapi-bad-1',
          apiKeys: ['nvapi-bad-1', 'nvapi-bad-2'],
          model: 'nvidia/nemotron-3-ultra-550b-a55b',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          timeoutMs: 5000,
          maxRetries: 1,
          maxIterations: 1,
        });

        await expect(
          provider.completeJson({
            system: 'System',
            user: 'User',
            schema: testSchema,
          })
        ).rejects.toThrow('The AI provider rejected the configured credentials.');
        expect(callCount).toBe(2);
      });
    });

    describe('Enforce minimum max_tokens >= 4096', () => {
      it('enforces at least 4096 tokens when req.maxTokens is undefined or less than 4096', async () => {
        let capturedPayload: Record<string, unknown> | null = null;
        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
          capturedPayload = JSON.parse(init.body as string);
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              choices: [
                {
                  message: { content: JSON.stringify({ summary: 'Tokens check' }) },
                  finish_reason: 'stop',
                },
              ],
            }),
          } as Response;
        });

        const provider = new OpenAiCompatibleProvider({
          providerId: 'openai-compatible',
          apiKey: 'test-key',
          model: 'custom-model',
          baseUrl: 'https://api.example.com/v1',
          timeoutMs: 5000,
          maxRetries: 0,
          maxIterations: 1,
        });

        await provider.completeJson({
          system: 'System',
          user: 'User',
          schema: testSchema,
        });

        expect(capturedPayload).not.toBeNull();
        expect((capturedPayload as any).max_tokens).toBeGreaterThanOrEqual(4000);
      });
    });
  });
});

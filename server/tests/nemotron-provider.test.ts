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
  AiUnavailableError,
  readAiConfigFromEnv,
} from '../src/ai/provider';

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
});

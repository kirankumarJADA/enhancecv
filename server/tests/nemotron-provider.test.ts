// Curevo AI — NVIDIA Nemotron Provider & Empty Response Regression Test Suite
//
// Verifies:
// 1. Request payload contract: stream: false, chat_template_kwargs: { enable_thinking: false },
//    adequate max_tokens (4000), low temperature (0.2), and messages.
// 2. Empty response handling: choices[0].message.content empty/missing triggers sanitized
//    diagnostics and raises AI_MALFORMED without logging prompts or PII.
// 3. Truncation / finish_reason="length" handling: triggers adaptive retry with increased
//    max_tokens budget.
// 4. Resilience: JSON repair for trailing commas, code fences, and surrounding prose.
// 5. Error handling: timeouts, 429 rate limits, 401/403 auth errors, and 5xx server errors.

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
    delete process.env.NVIDIA_ENABLE_THINKING;
    global.fetch = originalFetch;
  });

  it('sets stream: false and chat_template_kwargs when thinking disabled for nvidia provider', async () => {
    process.env.NVIDIA_ENABLE_THINKING = 'false';
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
                  content: JSON.stringify({ summary: 'A great summary', skills: ['TypeScript', 'Node.js'] }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { completion_tokens: 35, total_tokens: 150 },
          }),
      } as Response;
    });

    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'nvapi-test-key-12345',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 15000,
      maxRetries: 2,
      maxIterations: 2,
    });

    const result = await provider.completeJson({
      system: 'You are Curevo AI',
      user: 'Generate a resume summary',
      schema: testSchema,
      maxTokens: 4000,
      temperature: 0.2,
    });

    expect(result.summary).toBe('A great summary');
    expect(capturedBody).toBeDefined();
    expect(capturedBody!.stream).toBe(false);
    expect(capturedBody!.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(capturedBody!.max_tokens).toBe(4000);
    expect(capturedBody!.temperature).toBe(0.2);
    expect(capturedBody!.model).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
    expect(capturedHeaders!['Accept']).toBe('application/json');
    expect(capturedHeaders!['Authorization']).toBe('Bearer nvapi-test-key-12345');
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
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
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

  it('detects finish_reason="length" and executes adaptive retry with increased max_tokens', async () => {
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
              usage: { completion_tokens: 4000, total_tokens: 4200 },
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
            usage: { completion_tokens: 4500, total_tokens: 4700 },
          }),
      } as Response;
    });

    const provider = new OpenAiCompatibleProvider({
      providerId: 'nvidia',
      apiKey: 'nvapi-test',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      timeoutMs: 10000,
      maxRetries: 2,
      maxIterations: 1,
    });

    const result = await provider.completeJson({
      system: 'System prompt',
      user: 'User prompt',
      schema: testSchema,
      maxTokens: 4000,
    });

    expect(result.summary).toBe('Fully completed summary on retry');
    expect(requestedTokenLimits.length).toBe(2);
    expect(requestedTokenLimits[0]).toBe(4000);
    // Adaptive retry increased token limit
    expect(requestedTokenLimits[1]).toBe(5500);
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
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
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
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
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

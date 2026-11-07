import { describe, it, expect, vi } from 'vitest';
import {
  scrubText,
  parseWebSentryDsn,
  forwardClientError,
  captureWebError,
} from '../src/lib/monitoring';

describe('Curevo AI — Web Monitoring & Scrubbing (Phase 9M)', () => {
  it('scrubs passwords, tokens, API keys, and email addresses from error text', () => {
    const raw = 'Failed to connect: password=secret123 bearer eyJhbGciOi.token user=john@example.com api_key=ak_live_xyz';
    const scrubbed = scrubText(raw);

    expect(scrubbed).not.toContain('secret123');
    expect(scrubbed).not.toContain('eyJhbGciOi.token');
    expect(scrubbed).not.toContain('john@example.com');
    expect(scrubbed).not.toContain('ak_live_xyz');
    expect(scrubbed).toContain('[REDACTED]');
  });

  it('correctly parses valid Sentry DSN URLs', () => {
    const dsn = 'https://abcdef123456@o12345.ingest.sentry.io/456789';
    const parsed = parseWebSentryDsn(dsn);

    expect(parsed).toEqual({
      publicKey: 'abcdef123456',
      host: 'o12345.ingest.sentry.io',
      projectId: '456789',
    });
  });

  it('returns null for invalid Sentry DSNs', () => {
    expect(parseWebSentryDsn('not-a-sentry-dsn')).toBeNull();
    expect(parseWebSentryDsn('http://insecure@host/123')).toBeNull();
  });

  it('forwards sanitized error payload via HTTP fetch', async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true } as Response;
    });

    try {
      const config = {
        publicKey: 'testkey',
        host: 'sentry.example.com',
        projectId: '999',
      };

      await forwardClientError(config, new Error('Network timeout contacting email=test@domain.com'), {
        component: 'ResumeBuilder',
        action: 'pdf_download',
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.message).toContain('[REDACTED]');
      expect(capturedBody.tags.component).toBe('ResumeBuilder');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('captureWebError does not crash when unconfigured', () => {
    expect(() => {
      captureWebError(new Error('Sample safe client error'));
    }).not.toThrow();
  });
});

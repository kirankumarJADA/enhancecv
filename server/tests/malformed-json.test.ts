// Malformed-JSON error mapping regression tests (Phase 8).
//
// Before the fix, a syntactically invalid JSON body reached the central error
// handler as a body-parser SyntaxError with no AppError/FRIENDLY mapping and
// was answered with the generic 500. These tests pin the required behaviour:
//
//   1. invalid JSON            -> 400 MALFORMED_JSON, standard error shape
//   2. valid JSON              -> reaches the real route handler
//   3. empty body              -> reaches the real route handler
//   4. oversized JSON          -> 413 (body-parser entity.too.large branch)
//   5. malformed JSON response -> no stack traces / file paths / internals
//   6. unexpected exceptions   -> still 500 INTERNAL (unit-tested directly)
//   7. error response shape    -> { error: { code, message, requestId } }
//
// The production app is the stateless, no-database architecture: the only
// mounted routes are /api/health and /api/public/*, so the JSON-body paths are
// exercised against POST /api/public/parse (a real, mounted route guarded by
// express.json's 1 MB limit). Real app instance, no email, no external calls.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';
  process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef';
  app = await (await import('../src/app')).buildApp();
});

afterAll(async () => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('malformed JSON body handling (Phase 8 regression)', () => {
  it('returns 400 MALFORMED_JSON for syntactically invalid JSON', async () => {
    const res = await request(app)
      .post('/api/public/parse')
      .set('Content-Type', 'application/json')
      .send('{invalid json here');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
    expect(res.body.error.message).toBe('Request body is not valid JSON.');
    expect(typeof res.body.error.requestId).toBe('string');
  });

  it('still maps oversized JSON bodies to 413 (1MB express.json limit preserved)', async () => {
    const res = await request(app)
      .post('/api/public/parse')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'a'.repeat(2 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('valid JSON still reaches the real handler (no file → route 400)', async () => {
    const res = await request(app)
      .post('/api/public/parse')
      .set('Content-Type', 'application/json')
      .send({ anything: 'valid json reaches the route' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(res.body.error.message).toContain('No file uploaded');
  });

  it('empty body still reaches the real handler (no file → route 400)', async () => {
    const res = await request(app).post('/api/public/parse');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('never exposes stack traces, file paths or package internals', async () => {
    const res = await request(app)
      .post('/api/public/parse')
      .set('Content-Type', 'application/json')
      .send('{broken');
    const raw = res.text;
    expect(raw).not.toMatch(/at\s+\w+\s+\(/); // stack frame shape
    expect(raw).not.toMatch(/[A-Z]:\\|\/home\/|\/app\/|node_modules/);
    expect(raw).not.toMatch(/SyntaxError|body-parser|express/i);
    expect(Object.keys(res.body)).toEqual(['error']);
    expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message', 'requestId']);
  });

  it('error response shape stays consistent across error classes', async () => {
    const malformed = await request(app)
      .post('/api/public/parse')
      .set('Content-Type', 'application/json')
      .send('{nope');
    const oversized = await request(app)
      .post('/api/public/parse')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'a'.repeat(2 * 1024 * 1024) }));
    // Both flow through the central errorHandler, so both must share one shape.
    // (The public routes' own no-file 400 uses handlePublicError, a different responder.)
    for (const res of [malformed, oversized]) {
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.error).toHaveProperty('requestId');
      expect(Object.keys(res.body)).toEqual(['error']);
    }
  });
});

describe('errorHandler unit — unexpected exceptions still return 500 INTERNAL', () => {
  it('keeps generic server faults on the 500 path without leaking the error', async () => {
    const { errorHandler } = await import('../src/middleware/errors');
    const req = { requestId: 'req_test_1', path: '/test' } as never;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    errorHandler(new Error('boom-in-unit'), req, { status } as never, undefined as never);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledTimes(1);
    const payload = (json.mock.calls[0] as unknown as [{ error: { code: string; message: string } }])[0];
    expect(payload.error.code).toBe('INTERNAL');
    expect(payload.error.message).not.toContain('boom-in-unit'); // no leakage
  });

  it('maps body-parser parse failures to 400 MALFORMED_JSON with a fixed safe message', async () => {
    const { errorHandler } = await import('../src/middleware/errors');
    const parseError = Object.assign(new SyntaxError('Unexpected token i in JSON at position 1'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    const req = { requestId: 'req_test_2', path: '/test' } as never;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    errorHandler(parseError, req, { status } as never, undefined as never);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledTimes(1);
    const payload = (json.mock.calls[0] as unknown as [{ error: { code: string; message: string } }])[0];
    expect(payload.error.code).toBe('MALFORMED_JSON');
    expect(payload.error.message).toBe('Request body is not valid JSON.');
    expect(payload.error.message).not.toContain('Unexpected token'); // never echoes the raw error
  });
});

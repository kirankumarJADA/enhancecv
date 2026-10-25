// APP_URL regression tests.
//
// Root cause these tests pin down: production email links are built from
// config.appUrl, which used to fall back to http://localhost:$PORT when
// APP_URL was missing — on Render that produced
// http://localhost:10000/reset-password links inside real emails.
//
// 1. Unit: checkAppUrl / assertAppUrlIsSafe / isSafeAppUrl semantics.
// 2. Integration (production NODE_ENV + stubbed email HTTP): a reset request
//    with a missing/localhost APP_URL creates NO token and sends NO email;
//    with a valid frontend APP_URL the email link uses that host and never
//    contains localhost. No real email is sent and no token value is printed.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type express from 'express';
import type { Pool } from 'pg';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_APP_URL = process.env.APP_URL;
const FRONTEND_URL = 'https://enhancecv-orpin.vercel.app';
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';

type FetchSpy = { mockRestore: () => void };
type ConsoleSpy = { mock: { calls: unknown[][] }; mockRestore: () => void };

let configModule!: typeof import('../src/config');
let app: express.Express;
let db: Pool;

function mockConsoleError(): ConsoleSpy {
  return vi.spyOn(console, 'error').mockImplementation(() => {}) as unknown as ConsoleSpy;
}
function capturedLog(spy: ConsoleSpy): string {
  return (spy.mock.calls as unknown[][])
    .map((call) => call.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' '))
    .join('\n');
}
function stubFetch(status: number, record: { body: string }[]): FetchSpy {
  const impl = (async (_url: unknown, init?: { body?: unknown }) => {
    record.push({ body: String(init?.body ?? '') });
    return { ok: status >= 200 && status < 300, status, json: async () => ({}), text: async () => '' } as unknown as Awaited<ReturnType<typeof fetch>>;
  }) as unknown as typeof fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl) as unknown as FetchSpy;
}

function withEmailProvider(): void {
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.EMAIL_API_KEY = 'test-key-not-a-real-secret';
}

async function signupOn(a: express.Express, email: string): Promise<void> {
  const supertest = await import('supertest');
  const res = await supertest.default(a).post('/api/auth/signup').send({ email, name: 'AppUrl Test', password: 'password123' });
  expect(res.status).toBe(201);
}
async function requestResetOn(a: express.Express, email: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const supertest = await import('supertest');
  const res = await supertest.default(a).post('/api/auth/forgot-password').send({ email });
  return { status: res.status, body: res.body };
}
async function resetTokenCount(email: string): Promise<number> {
  const r = await db.query(
    `SELECT COUNT(*)::int AS n FROM password_reset_tokens t
     JOIN users u ON u.id = t.user_id WHERE lower(u.email) = lower($1)`,
    [email],
  );
  return r.rows[0].n;
}

beforeAll(async () => {
  // Production semantics are the point of these tests: config.isProd must be
  // captured as true, so NODE_ENV is set BEFORE the first src import. The app
  // boots with a VALID APP_URL (a correctly configured deployment — the
  // startup gate refuses anything else) and the missing/localhost failure
  // mode is simulated at runtime, where isSafeAppUrl() re-checks the env live.
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef';
  process.env.APP_URL = FRONTEND_URL;

  configModule = await import('../src/config');
  app = await (await import('../src/app')).buildApp();
  db = (await import('../src/db/db')).getDb();

  await db.query(
    'TRUNCATE users, password_reset_tokens, email_verification_tokens, analytics_events, error_events, billing_events CASCADE',
  );
});

afterAll(async () => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL_APP_URL;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_API_KEY;
});

describe('checkAppUrl (unit, production semantics)', () => {
  const isProd = true;

  it('accepts the live https frontend URL (with or without trailing slash)', () => {
    expect(configModule.checkAppUrl(FRONTEND_URL, isProd)).toMatchObject({ ok: true });
    expect(configModule.checkAppUrl(FRONTEND_URL + '/', isProd)).toMatchObject({ ok: true });
  });

  it('rejects missing, empty and whitespace-only values', () => {
    for (const v of [undefined, '', '   ']) {
      expect(configModule.checkAppUrl(v, isProd)).toMatchObject({ ok: false, problem: 'missing' });
    }
  });

  it('rejects localhost / loopback hosts — the deployed failure mode', () => {
    for (const v of ['http://localhost:10000', 'https://localhost', 'http://127.0.0.1:4000', 'https://[::1]', 'https://api.localhost']) {
      const check = configModule.checkAppUrl(v, isProd);
      expect(check).toMatchObject({ ok: false, problem: 'localhost' });
      expect(check.message).toContain('not localhost');
      expect(check.message).not.toContain(v!); // value never echoed back
    }
  });

  it('rejects non-https and unparseable values', () => {
    expect(configModule.checkAppUrl('http://enhancecv-orpin.vercel.app', isProd)).toMatchObject({ ok: false, problem: 'invalid' });
    expect(configModule.checkAppUrl('not a url', isProd)).toMatchObject({ ok: false, problem: 'invalid' });
  });

  it('is unconstrained outside production', () => {
    expect(configModule.checkAppUrl('http://localhost:5173', false)).toMatchObject({ ok: true });
    expect(configModule.checkAppUrl(undefined, false)).toMatchObject({ ok: true });
  });

  it('assertAppUrlIsSafe throws (without echoing the value) only in production', () => {
    process.env.APP_URL = 'http://localhost:10000';
    expect(() => configModule.assertAppUrlIsSafe()).toThrow(/APP_URL configuration error: .*not localhost/);
    process.env.APP_URL = FRONTEND_URL;
    expect(() => configModule.assertAppUrlIsSafe()).not.toThrow();
    process.env.APP_URL = 'http://localhost:10000';
    expect(configModule.isSafeAppUrl()).toBe(false);
    process.env.APP_URL = FRONTEND_URL;
    expect(configModule.isSafeAppUrl()).toBe(true);
  });
});

describe('production reset requests when APP_URL goes missing at runtime (deployed failure mode)', () => {
  it('creates no token, sends no email, returns no token-bearing URL', async () => {
    const email = 'appurl-missing@test.dev';
    await signupOn(app, email);
    withEmailProvider();
    // Simulate the deployed misconfiguration AFTER boot: APP_URL disappears
    // (or points at localhost) — the runtime gate must fail closed.
    const savedUrl = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      expect(configModule.isSafeAppUrl()).toBe(false); // missing → unsafe

      const sent: { body: string }[] = [];
      const fetchSpy = stubFetch(200, sent);
      const logSpy = mockConsoleError();

      const res = await requestResetOn(app, email);
      const log = capturedLog(logSpy);
      logSpy.mockRestore();
      fetchSpy.mockRestore();

      expect(res.status).toBe(200);
      expect(sent.length).toBe(0); // NO email with a broken link
      expect(await resetTokenCount(email)).toBe(0); // NO token that could be leaked
      expect(res.body.devActionUrl).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/token/i);
      expect(log).not.toMatch(/token=/i);
      expect(log).not.toContain('localhost'); // operational log stays clean too

      // ... and the same fail-closed behavior when it points at localhost.
      process.env.APP_URL = 'http://localhost:10000';
      const sent2: { body: string }[] = [];
      const fetchSpy2 = stubFetch(200, sent2);
      const res2 = await requestResetOn(app, email);
      fetchSpy2.mockRestore();
      expect(sent2.length).toBe(0);
      expect(res2.body.devActionUrl).toBeUndefined();
      expect(await resetTokenCount(email)).toBe(0);
    } finally {
      if (savedUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = savedUrl;
    }
  });
});

describe('production reset requests with the live frontend APP_URL', () => {
  it('builds the reset link on the configured frontend host — never localhost', async () => {
    // Rebuild the app in a fresh module context with the correct APP_URL so
    // config.appUrl is captured exactly as a properly configured deployment.
    vi.resetModules();
    process.env.APP_URL = FRONTEND_URL;
    const freshConfig = await import('../src/config');
    const app2 = await (await import('../src/app')).buildApp();

    const email = 'appurl-valid@test.dev';
    await signupOn(app2, email);
    withEmailProvider();
    expect(freshConfig.isSafeAppUrl()).toBe(true);

    const sent: { body: string }[] = [];
    const fetchSpy = stubFetch(200, sent);
    const logSpy = mockConsoleError();

    const res = await requestResetOn(app2, email);
    const log = capturedLog(logSpy);
    logSpy.mockRestore();
    fetchSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(sent.length).toBe(1); // exactly one delivery attempt
    expect(sent[0].body).toContain(`${FRONTEND_URL}/reset-password?token=`);
    expect(sent[0].body).not.toContain('localhost');
    expect(await resetTokenCount(email)).toBe(1);
    // The caller still never receives or logs the token.
    expect(res.body.devActionUrl).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    expect(log).not.toMatch(/reset-password\?token=/i);
  });
});

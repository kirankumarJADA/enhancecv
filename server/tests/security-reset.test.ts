// P0 regression suite: password-reset token disclosure.
//
// The whole file runs with NODE_ENV=production, because that is the mode the
// security invariant has to hold in. Every assertion below inspects RESPONSE
// BODIES and CAPTURED LOG OUTPUT — never just an HTTP status code. The point is
// to prove that a production forgot-password request cannot hand the caller (or
// anyone reading the logs) a usable reset token, whether or not an email
// provider is configured, and whether or not that provider succeeds.
//
// Real PostgreSQL, real routes, real token store. Only the outbound email HTTP
// call is stubbed.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { hashToken } from '../src/lib/tokens';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

/** A reset link as it appears inside the outgoing email payload. */
const RESET_LINK = /https?:\/\/\S*reset-password\?token=([a-f0-9]+)/;
/** Anything that looks like a 256-bit hex token. */
const TOKEN_LOOKING = /[a-f0-9]{32,}/i;

type ConsoleSpy = { mock: { calls: unknown[][] }; mockRestore: () => void };
type FetchSpy = { mockRestore: () => void };

let app: Express;
let db: Pool;

beforeAll(async () => {
  // Must be set BEFORE ../src/app is imported: config.isProd is captured at
  // module-evaluation time, and the whole point is to test the production path.
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef'; // >= the production minimum (32 chars)
  // Production deployments require a real https frontend URL: email links are
  // built from it and the startup gate refuses localhost/missing values.
  process.env.APP_URL = 'https://enhancecv.test';
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_API_KEY;
  delete process.env.ADMIN_EMAILS;

  const [{ buildApp }, dbModule] = await Promise.all([import('../src/app'), import('../src/db/db')]);
  db = dbModule.getDb();
  app = await buildApp();

  await db.query(
    'TRUNCATE users, password_reset_tokens, email_verification_tokens, analytics_events, error_events, billing_events CASCADE',
  );
});

afterAll(async () => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_API_KEY;
  delete process.env.APP_URL;
});

// --- helpers ---------------------------------------------------------------

async function signup(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/signup').send({ email, name: 'Security Test', password });
  expect(res.status).toBe(201);
  return res;
}

function withEmailProvider() {
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.EMAIL_API_KEY = 'test-key-not-a-real-secret';
}
function withoutEmailProvider() {
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_API_KEY;
}

function mockConsoleError(): ConsoleSpy {
  return vi.spyOn(console, 'error').mockImplementation(() => {}) as unknown as ConsoleSpy;
}
function capturedLog(spy: ConsoleSpy): string {
  return spy.mock.calls
    .map((call) => call.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' '))
    .join('\n');
}

/** Stub the outbound email HTTP call, recording the payload we "sent". */
function mockEmailProvider(sink: (body: string) => void, status = 200): FetchSpy {
  const impl = (async (_url: unknown, init?: { body?: unknown }) => {
    sink(String(init?.body ?? ''));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ id: 'em_test' }),
    } as unknown as Awaited<ReturnType<typeof fetch>>;
  }) as unknown as typeof fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl) as unknown as FetchSpy;
}

async function requestReset(email: string) {
  return request(app).post('/api/auth/forgot-password').send({ email });
}

// --- 1. production + no email provider: nothing token-bearing anywhere ------

describe('production reset requests with no email provider', () => {
  it('returns no token, no reset URL and no devActionUrl, and creates no token at all', async () => {
    const email = 'sec-nomail@test.dev';
    await signup(email);

    const spy = mockConsoleError();
    const res = await requestReset(email);
    const rawBody = JSON.stringify(res.body);
    const log = capturedLog(spy);
    spy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.emailConfigured).toBe(false);

    // The response carries no devActionUrl key and no token-bearing value.
    expect('devActionUrl' in res.body).toBe(false);
    expect(res.body.devActionUrl).toBeUndefined();
    expect(rawBody).not.toMatch(/token/i);
    expect(rawBody).not.toMatch(/reset-password/i);
    expect(rawBody).not.toMatch(TOKEN_LOOKING);

    // Neither do the server logs.
    expect(log).not.toMatch(/token=/i);
    expect(log).not.toMatch(/reset-password/i);
    expect(log).not.toMatch(TOKEN_LOOKING);

    // Fail-safe: no usable token exists, so there is nothing to steal.
    const count = await db.query(
      `SELECT COUNT(*)::int AS n FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE lower(u.email) = lower($1)`,
      [email],
    );
    expect(count.rows[0].n).toBe(0);
  });

  it('treats a named provider with no credential as undeliverable (no token, no log leak)', async () => {
    const email = 'sec-nokey@test.dev';
    await signup(email);

    process.env.EMAIL_PROVIDER = 'resend'; // provider named …
    delete process.env.EMAIL_API_KEY; // … but no credential, so nothing can be delivered

    const spy = mockConsoleError();
    const res = await requestReset(email);
    const log = capturedLog(spy);
    spy.mockRestore();
    withoutEmailProvider();

    expect(res.status).toBe(200);
    expect(res.body.emailConfigured).toBe(false);
    expect(res.body.devActionUrl).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    expect(log).not.toMatch(/reset-password/i);
    expect(log).not.toMatch(/token=/i);
    expect(log).not.toMatch(TOKEN_LOOKING);

    const count = await db.query(
      `SELECT COUNT(*)::int AS n FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE lower(u.email) = lower($1)`,
      [email],
    );
    expect(count.rows[0].n).toBe(0);
  });

  it('does not leak the email-verification link in production either', async () => {
    const spy = mockConsoleError();
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'sec-verify@test.dev', name: 'V', password: 'password123' });
    const log = capturedLog(spy);
    spy.mockRestore();

    expect(res.status).toBe(201);
    expect(res.body.user.devActionUrl).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/verify-email/i);
    expect(JSON.stringify(res.body)).not.toMatch(TOKEN_LOOKING);
    expect(log).not.toMatch(/verify-email/i);
    expect(log).not.toMatch(/token=/i);
  });

  it('logs the refused reset attempt without a token, and the console transport withholds token-bearing bodies', async () => {
    const email = 'sec-logs@test.dev';
    await signup(email);

    // (a) With no provider, the reset request never reaches the transport at
    //     all — it is refused up-front, so the only log line is a token-free
    //     operational notice.
    const spy = mockConsoleError();
    await requestReset(email);
    const resetLog = capturedLog(spy);
    spy.mockRestore();

    expect(resetLog).toMatch(/email delivery is not safely configured in production/);
    expect(resetLog).not.toMatch(/NOT DELIVERED/);
    expect(resetLog).not.toMatch(/reset-password/i);
    expect(resetLog).not.toMatch(/token=/i);
    expect(resetLog).not.toMatch(TOKEN_LOOKING);

    // (b) When the console transport IS used in production (the signup
    //     verification email), the body is withheld: no link, no token.
    const verifySpy = mockConsoleError();
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'sec-logs-verify@test.dev', name: 'L', password: 'password123' });
    const verifyLog = capturedLog(verifySpy);
    verifySpy.mockRestore();

    expect(verifyLog).toMatch(/NOT DELIVERED/);
    expect(verifyLog).toMatch(/body withheld/i);
    expect(verifyLog).not.toMatch(/verify-email/i);
    expect(verifyLog).not.toMatch(/token=/i);
    expect(verifyLog).not.toMatch(TOKEN_LOOKING);
  });
});

// --- 2. production + configured provider: link is mailed, never disclosed ---

describe('production reset requests with a configured email provider', () => {
  it('sends a valid reset link without returning or logging it, and the link works once', async () => {
    const email = 'sec-mail@test.dev';
    await signup(email);
    withEmailProvider();

    let sentBody = '';
    const fetchSpy = mockEmailProvider((body) => {
      sentBody = body;
    });
    const spy = mockConsoleError();
    const res = await requestReset(email);
    const log = capturedLog(spy);
    spy.mockRestore();
    fetchSpy.mockRestore();
    withoutEmailProvider();

    expect(res.status).toBe(200);
    expect(res.body.emailConfigured).toBe(true);
    expect(res.body.devActionUrl).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);

    // The outgoing email DOES carry a real, well-formed reset link.
    const match = RESET_LINK.exec(sentBody);
    expect(match, 'the provider was asked to send a reset link').toBeTruthy();
    const link = match![0];
    const token = match![1];
    expect(token.length).toBeGreaterThanOrEqual(43);

    // … which is never echoed to the client and never written to the logs.
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(log).not.toContain(token);
    expect(log).not.toMatch(/reset-password/i);

    // The mailed link is genuinely usable exactly once.
    const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'brandnewpass1' });
    expect(reset.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'brandnewpass1' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'password123' })).status).toBe(401);

    const reuse = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'anotherpass123' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('RESET_TOKEN_INVALID');
    expect(link).toContain('/reset-password?token=');
  });

  it('exposes no reset token when the email provider fails', async () => {
    const email = 'sec-provider-fail@test.dev';
    await signup(email);
    withEmailProvider();

    let sentBody = '';
    const fetchSpy = mockEmailProvider((body) => {
      sentBody = body;
    }, 500);
    const spy = mockConsoleError();
    const res = await requestReset(email);
    const log = capturedLog(spy);
    spy.mockRestore();
    fetchSpy.mockRestore();
    withoutEmailProvider();

    expect(res.status).toBe(200);
    expect(res.body.devActionUrl).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);

    const match = RESET_LINK.exec(sentBody);
    expect(match, 'delivery was attempted').toBeTruthy();
    // The token never reaches the caller in any form.
    expect(JSON.stringify(res.body)).not.toContain(match![1]);
    expect(log).not.toContain(match![1]);
    expect(log).not.toMatch(/reset-password/i);
    // The failure is still reported safely for operators.
    expect(log).toMatch(/EMAIL_SEND_FAILED/);
  });
});

// --- 3. no account enumeration in production --------------------------------

describe('production reset requests do not disclose account existence', () => {
  it('returns byte-identical bodies for known and unknown addresses (with and without a provider)', async () => {
    const known = 'sec-known@test.dev';
    await signup(known);

    // (a) no provider configured
    withoutEmailProvider();
    const knownNoProvider = await requestReset(known);
    const ghostNoProvider = await requestReset('sec-ghost-a@test.dev');
    expect(knownNoProvider.status).toBe(200);
    expect(ghostNoProvider.status).toBe(knownNoProvider.status);
    expect(ghostNoProvider.body).toEqual(knownNoProvider.body);
    expect(JSON.stringify(knownNoProvider.body)).not.toMatch(/token/i);

    // (b) provider configured
    withEmailProvider();
    const fetchSpy = mockEmailProvider(() => {});
    const spy = mockConsoleError();
    const knownWithProvider = await requestReset(known);
    const ghostWithProvider = await requestReset('sec-ghost-b@test.dev');
    const log = capturedLog(spy);
    spy.mockRestore();
    fetchSpy.mockRestore();
    withoutEmailProvider();

    expect(knownWithProvider.status).toBe(200);
    expect(ghostWithProvider.status).toBe(knownWithProvider.status);
    expect(ghostWithProvider.body).toEqual(knownWithProvider.body);
    expect(log).not.toMatch(/token=/i);
  });
});

// --- 4. token lifetime and ownership are still correct ---------------------

describe('reset token validity and ownership in production', () => {
  it('rejects an expired token', async () => {
    const email = 'sec-expired@test.dev';
    await signup(email);
    withEmailProvider();
    let sentBody = '';
    const fetchSpy = mockEmailProvider((body) => {
      sentBody = body;
    });
    await requestReset(email);
    fetchSpy.mockRestore();
    withoutEmailProvider();

    const token = RESET_LINK.exec(sentBody)![1];
    await db.query("UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 hour'");

    const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'expiredpass1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESET_TOKEN_EXPIRED');
  });

  it('rejects an unknown token without disclosing anything', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'f'.repeat(64), newPassword: 'whatever123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESET_TOKEN_INVALID');
  });

  it('a token only ever changes the account it was issued for', async () => {
    const victim = 'sec-victim@test.dev';
    const bystander = 'sec-bystander@test.dev';
    await signup(victim);
    await signup(bystander);
    withEmailProvider();

    let sentBody = '';
    const fetchSpy = mockEmailProvider((body) => {
      sentBody = body;
    });
    await requestReset(victim);
    fetchSpy.mockRestore();
    withoutEmailProvider();

    const token = RESET_LINK.exec(sentBody)![1];

    const victimId = (await db.query('SELECT id FROM users WHERE lower(email) = lower($1)', [victim])).rows[0].id;
    const rows = await db.query('SELECT user_id FROM password_reset_tokens WHERE token_hash = $1', [hashToken(token)]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].user_id).toBe(victimId);

    const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'victimnewpass1' });
    expect(reset.status).toBe(200);

    // The victim's password changed; the bystander's did not.
    expect((await request(app).post('/api/auth/login').send({ email: victim, password: 'victimnewpass1' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: victim, password: 'password123' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: bystander, password: 'password123' })).status).toBe(200);
  });
});

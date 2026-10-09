// Session revocation regression suite.
//
// Before this work a session JWT was accepted purely on its signature and
// expiry: logout only cleared the browser cookie, and a password change or
// reset left every previously issued token working for up to seven days. A
// captured token therefore survived the very action meant to revoke it.
//
// These tests pin the two-level model:
//
//   per-device — the token's `jti` names one row in `user_sessions`, so a
//                normal logout revokes only the device that signed out and
//                leaves the user's other devices signed in.
//   per-user   — password reset and password change revoke every session for
//                that user and bump `users.session_version`, so nothing issued
//                earlier survives. This is also the basis of "log out of all
//                devices".
//
// Runs in development mode so forgot-password can hand the test the reset
// token it would otherwise only email (production never returns it — that is
// asserted separately in security-reset.test.ts).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { __resetRateLimitsForTests } from '../src/middleware/rateLimit';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

let app: Express;
let db: Pool;
let getJwtSecret: typeof import('../src/config').getJwtSecret;
let getDb: typeof import('../src/db/db').getDb;
let revokeAllSessions: typeof import('../src/lib/sessions').revokeAllSessions;

beforeAll(async () => {
  // Development mode: the whole suite then exercises the same revocation logic
  // while letting the test read the reset token from the response.
  delete process.env.NODE_ENV;
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef';
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_API_KEY;

  const [appModule, dbModule, configModule, sessionsModule] = await Promise.all([
    import('../src/app'),
    import('../src/db/db'),
    import('../src/config'),
    import('../src/lib/sessions'),
  ]);
  getDb = dbModule.getDb;
  getJwtSecret = configModule.getJwtSecret;
  revokeAllSessions = sessionsModule.revokeAllSessions;
  db = getDb();
  app = await appModule.buildApp();

  await db.query(
    'TRUNCATE user_sessions, users, password_reset_tokens, email_verification_tokens, extension_tokens, analytics_events, error_events CASCADE',
  );
});

afterAll(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

// These tests create a lot of accounts, and the in-memory limiter is shared
// across the single forked test process. Clear its state between cases so the
// suite exercises revocation rather than the signup rate limit.
beforeEach(() => {
  __resetRateLimitsForTests();
});

// --- helpers ---------------------------------------------------------------

let seq = 0;
function freshEmail(tag: string): string {
  seq += 1;
  return `sec-session-${tag}-${Date.now().toString(36)}-${seq}@test.dev`;
}

/** Extract the session cookie from a response's Set-Cookie header. */
function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  const found = list.find((c) => c.startsWith('ecv_session='));
  if (!found) return '';
  const value = found.split(';')[0];
  // An expired cookie (logout) has an empty value — treat that as "no session".
  return value === 'ecv_session=' ? '' : value;
}

async function signup(tag: string, password = 'original-password-1') {
  const email = freshEmail(tag);
  const res = await request(app).post('/api/auth/signup').send({ name: 'Session Test', email, password });
  expect(res.status).toBe(201);
  return { email, password, cookie: cookieFrom(res), id: res.body.user.id as string };
}

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { res, cookie: cookieFrom(res) };
}

function me(cookie: string) {
  return request(app).get('/api/auth/me').set('Cookie', cookie);
}

function logout(cookie?: string) {
  const req = request(app).post('/api/auth/logout');
  return cookie ? req.set('Cookie', cookie) : req;
}

/** Decoded claims of a session cookie (tokens are opaque to the API client). */
function claimsOf(cookie: string): { jti?: string; sv?: number; exp?: number } {
  return (jwt.decode(cookie.replace('ecv_session=', '')) ?? {}) as {
    jti?: string;
    sv?: number;
    exp?: number;
  };
}

/** exp (seconds) of a session token — used to prove a rejected token had NOT expired. */
function expiryOf(cookie: string): number {
  return claimsOf(cookie).exp ?? 0;
}

/** Dev-mode reset token for an existing account, taken from the response. */
async function resetTokenFor(email: string): Promise<string> {
  const res = await request(app).post('/api/auth/forgot-password').send({ email });
  expect(res.status).toBe(200);
  const match = /token=([a-f0-9]+)/.exec(String(res.body.devActionUrl ?? ''));
  expect(match, 'dev mode should expose the reset link so the token can be tested').toBeTruthy();
  return match![1];
}

/** Sign a hand-crafted session token with the real signing key. */
function forge(claims: Record<string, unknown>): string {
  return `ecv_session=${jwt.sign(claims, getJwtSecret(), { expiresIn: '7d' })}`;
}

/** Reject a write to `user_sessions` to simulate a storage outage. */
function breakSessionWrite(): { restore: () => void } {
  const pool = getDb() as unknown as { query: (...args: unknown[]) => unknown };
  const original = pool.query.bind(pool);
  const spy = vi.spyOn(pool, 'query').mockImplementation(((text: unknown, values?: unknown) => {
    if (typeof text === 'string' && text.includes('user_sessions')) {
      return Promise.reject(new Error('simulated storage outage'));
    }
    return (original as (...a: unknown[]) => unknown)(text, values);
  }) as unknown as typeof pool.query);
  return { restore: () => spy.mockRestore() };
}

// --- tests -----------------------------------------------------------------

describe('logout revokes only the device that signed out', () => {
  it('invalidates the device that logged out and leaves the other device signed in', async () => {
    const user = await signup('logout-per-device');
    const otherDevice = await login(user.email, user.password);
    expect(otherDevice.res.status).toBe(200);

    // Two distinct sessions, one per device.
    expect(claimsOf(user.cookie).jti).toBeTruthy();
    expect(claimsOf(otherDevice.cookie).jti).not.toBe(claimsOf(user.cookie).jti);
    expect((await me(user.cookie)).status).toBe(200);
    expect((await me(otherDevice.cookie)).status).toBe(200);

    const out = await logout(user.cookie);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true });

    // Device A is dead...
    expect((await me(user.cookie)).status).toBe(401);
    // ...device B is untouched.
    expect((await me(otherDevice.cookie)).status).toBe(200);
  });

  it('rejects the logged-out token although its expiry has not passed', async () => {
    const user = await signup('logout-pre-expiry');
    // Precondition: the token is still valid by time, so a 401 afterwards can
    // only come from revocation — not from expiry.
    expect(expiryOf(user.cookie) * 1000).toBeGreaterThan(Date.now());

    expect((await logout(user.cookie)).status).toBe(200);

    const after = await me(user.cookie);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('SESSION_EXPIRED');
    // Still unexpired: proves the rejection is server-side revocation.
    expect(expiryOf(user.cookie) * 1000).toBeGreaterThan(Date.now());
  });

  it('does not touch another user’s session', async () => {
    const a = await signup('logout-scope-a');
    const b = await signup('logout-scope-b');
    expect((await logout(a.cookie)).status).toBe(200);
    expect((await me(a.cookie)).status).toBe(401);
    expect((await me(b.cookie)).status).toBe(200);
  });

  it('accepts a freshly issued session on the next login', async () => {
    const user = await signup('relogin');
    await logout(user.cookie);
    const next = await login(user.email, user.password);
    expect(next.res.status).toBe(200);
    expect((await me(next.cookie)).status).toBe(200);
  });

  it('still succeeds without any session cookie', async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('is idempotent — a second sign-out does not fail', async () => {
    const user = await signup('logout-twice');
    expect((await logout(user.cookie)).status).toBe(200);
    expect((await logout(user.cookie)).status).toBe(200);
  });

  it('reports failure instead of claiming success when revocation cannot be persisted', async () => {
    const user = await signup('logout-db-down');

    const broken = breakSessionWrite();
    let res: request.Response;
    try {
      res = await logout(user.cookie);
    } finally {
      broken.restore();
    }

    // Must NOT present itself as a completed server-side sign-out.
    expect(res!.status).toBe(503);
    expect(res!.body.error.code).toBe('AUTH_UNAVAILABLE');
    // The browser cookie is still discarded so the client stops sending it.
    expect(cookieFrom(res!)).toBe('');

    // And the token really is still live — the server never revoked it.
    expect((await me(user.cookie)).status).toBe(200);

    // Once storage recovers the caller can sign out properly.
    expect((await logout(user.cookie)).status).toBe(200);
    expect((await me(user.cookie)).status).toBe(401);
  });
});

describe('password reset revokes every device', () => {
  it('invalidates all previously issued sessions and lets only the new password sign in', async () => {
    const user = await signup('reset');
    const second = await login(user.email, user.password);
    expect((await me(user.cookie)).status).toBe(200);
    expect((await me(second.cookie)).status).toBe(200);

    const token = await resetTokenFor(user.email);
    const newPassword = 'brand-new-password-2';
    const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword });
    expect(reset.status).toBe(200);

    // Every session on every device is dead, before its expiry.
    expect((await me(user.cookie)).status).toBe(401);
    expect((await me(second.cookie)).status).toBe(401);
    expect(expiryOf(user.cookie) * 1000).toBeGreaterThan(Date.now());

    // The old password no longer works; the new one does.
    const stale = await login(user.email, user.password);
    expect(stale.res.status).toBe(401);
    const fresh = await login(user.email, newPassword);
    expect(fresh.res.status).toBe(200);
    expect((await me(fresh.cookie)).status).toBe(200);
  });

  it('leaves other accounts untouched', async () => {
    const victim = await signup('reset-victim');
    const bystander = await signup('reset-bystander');

    const token = await resetTokenFor(victim.email);
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'victim-new-password-3' });
    expect(reset.status).toBe(200);

    expect((await me(victim.cookie)).status).toBe(401);
    expect((await me(bystander.cookie)).status).toBe(200);
  });
});

describe('authenticated password change revokes other devices only', () => {
  it('kills the other sessions while reissuing the current one', async () => {
    const user = await signup('change');
    const otherDevice = await login(user.email, user.password);
    expect((await me(otherDevice.cookie)).status).toBe(200);

    const changed = await request(app)
      .put('/api/profile/password')
      .set('Cookie', user.cookie)
      .send({ currentPassword: user.password, newPassword: 'changed-password-4' });
    expect(changed.status).toBe(200);

    // The other device is signed out immediately...
    expect((await me(otherDevice.cookie)).status).toBe(401);
    // ...and cannot come back with the old password.
    expect((await login(user.email, user.password)).res.status).toBe(401);

    // ...while the caller receives a brand-new session and stays signed in.
    const reissued = cookieFrom(changed);
    expect(reissued).not.toBe('');
    expect(reissued).not.toBe(user.cookie);
    expect(claimsOf(reissued).jti).not.toBe(claimsOf(user.cookie).jti);
    expect((await me(reissued)).status).toBe(200);
    // The session the change was made from is also dead.
    expect((await me(user.cookie)).status).toBe(401);

    expect((await login(user.email, 'changed-password-4')).res.status).toBe(200);
  });

  it('rejects the change when the current password is wrong, without revoking anything', async () => {
    const user = await signup('change-bad');
    const otherDevice = await login(user.email, user.password);

    const res = await request(app)
      .put('/api/profile/password')
      .set('Cookie', user.cookie)
      .send({ currentPassword: 'not-the-password', newPassword: 'whatever-password-5' });
    expect(res.status).toBe(401);

    // A failed attempt must not sign the user out of anything.
    expect((await me(user.cookie)).status).toBe(200);
    expect((await me(otherDevice.cookie)).status).toBe(200);
  });
});

describe('logging out of all devices (per-user revocation)', () => {
  it('kills every session of one user and no other account', async () => {
    const user = await signup('all-devices');
    const deviceB = await login(user.email, user.password);
    const deviceC = await login(user.email, user.password);
    const bystander = await signup('all-devices-bystander');

    for (const c of [user.cookie, deviceB.cookie, deviceC.cookie]) {
      expect((await me(c)).status).toBe(200);
    }

    await revokeAllSessions(user.id);

    for (const c of [user.cookie, deviceB.cookie, deviceC.cookie]) {
      expect((await me(c)).status).toBe(401);
    }
    expect((await me(bystander.cookie)).status).toBe(200);

    // A new login afterwards works against the bumped version.
    const next = await login(user.email, user.password);
    expect(next.res.status).toBe(200);
    expect((await me(next.cookie)).status).toBe(200);
  });
});

describe('token claims are enforced', () => {
  it('rejects a token with no session id (pre-upgrade format)', async () => {
    const user = await signup('no-jti');
    const res = await me(forge({ uid: user.id, email: user.email, sv: 0 }));
    expect(res.status).toBe(401);
  });

  it('rejects a token with no session version', async () => {
    const user = await signup('no-sv');
    const jti = claimsOf(user.cookie).jti!;
    const res = await me(forge({ uid: user.id, email: user.email, jti }));
    expect(res.status).toBe(401);
  });

  it('rejects a token whose session version is stale although the session is live', async () => {
    const user = await signup('stale-sv');
    const jti = claimsOf(user.cookie).jti!;
    // Same live session id, but a version the account never had.
    expect((await me(forge({ uid: user.id, email: user.email, jti, sv: 999 }))).status).toBe(401);
    // The genuine token for that same session still works.
    expect((await me(user.cookie)).status).toBe(200);
  });

  it('rejects a session id belonging to a different user', async () => {
    const owner = await signup('cross-user-owner');
    const attacker = await signup('cross-user-attacker');
    const stolenSessionId = claimsOf(owner.cookie).jti!;
    const res = await me(forge({ uid: attacker.id, email: attacker.email, jti: stolenSessionId, sv: 0 }));
    expect(res.status).toBe(401);
    expect((await me(owner.cookie)).status).toBe(200);
  });

  it('rejects a malformed token and a validly structured one signed with the wrong key', async () => {
    expect((await me('ecv_session=not-a-jwt')).status).toBe(401);
    const forged = jwt.sign({ uid: 'usr_x', email: 'x@test.dev', jti: 'sess_x', sv: 0 }, 'wrong-secret-key-0123456789abcdef', {
      expiresIn: '7d',
    });
    expect((await me(`ecv_session=${forged}`)).status).toBe(401);
  });

  it('rejects a session whose user no longer exists', async () => {
    const user = await signup('deleted');
    expect((await me(user.cookie)).status).toBe(200);
    await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    expect((await me(user.cookie)).status).toBe(401);
  });
});

describe('storage failures fail closed', () => {
  it('never authorises a request when the revocation lookup errors', async () => {
    const user = await signup('db-down');
    expect((await me(user.cookie)).status).toBe(200);

    const pool = getDb() as unknown as { query: (...args: unknown[]) => unknown };
    const original = pool.query.bind(pool);
    const spy = vi.spyOn(pool, 'query').mockImplementation(((text: unknown, values?: unknown) => {
      if (typeof text === 'string' && text.includes('FROM user_sessions')) {
        return Promise.reject(new Error('simulated storage outage'));
      }
      return (original as (...a: unknown[]) => unknown)(text, values);
    }) as unknown as typeof pool.query);

    try {
      const res = await me(user.cookie);
      // Must not be treated as "session still valid".
      expect(res.status).not.toBe(200);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AUTH_UNAVAILABLE');
    } finally {
      spy.mockRestore();
    }

    // The session is still usable once storage recovers.
    expect((await me(user.cookie)).status).toBe(200);
  });
});

describe('browser extension tokens are unaffected', () => {
  it('keeps a Bearer token working after the session is logged out', async () => {
    const user = await signup('extension');
    const issued = await request(app)
      .post('/api/auth/extension-token')
      .set('Cookie', user.cookie)
      .send({ name: 'session-test' });
    expect(issued.status).toBe(201);
    const bearer = issued.body.token as string;

    const before = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${bearer}`);
    expect(before.status).toBe(200);

    // Logging out revokes the browser session cookie but not the separate API
    // token, which keeps its own independent revocation.
    expect((await logout(user.cookie)).status).toBe(200);
    expect((await me(user.cookie)).status).toBe(401);

    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${bearer}`);
    expect(after.status).toBe(200);
  });

  it('keeps a Bearer token working after every session is revoked', async () => {
    const user = await signup('extension-all-devices');
    const issued = await request(app)
      .post('/api/auth/extension-token')
      .set('Cookie', user.cookie)
      .send({ name: 'session-test-all' });
    const bearer = issued.body.token as string;

    await revokeAllSessions(user.id);
    expect((await me(user.cookie)).status).toBe(401);

    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${bearer}`);
    expect(after.status).toBe(200);
  });
});

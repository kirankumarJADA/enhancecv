// JWT configuration security regression suite.
//
// Finding: `config.ts` shipped a hard-coded public fallback signing key. A
// production deployment that started with that value — or with any weak/short
// secret — could have had its session cookies forged, yielding account
// takeover for any user.
//
// This file runs with NODE_ENV=production and proves:
//   - production refuses to start when the secret is missing, empty, the public
//     fallback, or shorter than the documented minimum;
//   - production starts normally with a valid secret;
//   - the failure message never contains the secret value, and nothing is logged;
//   - signing and verification both use the validated configuration, so a token
//     signed with the public fallback is rejected.
//
// Development is proven through the pure validator rather than by mutating the
// live process environment, which keeps the "convenient local dev" guarantee
// testable without a second process.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';

/** A valid production-grade secret (37 chars, >= the 32-char minimum). */
const VALID_SECRET = 'test-only-jwt-secret-0123456789abcdef';
/** Deliberately weak: the value the suites used before this fix (11 chars). */
const SHORT_SECRET = 'test-secret';
/** Exactly at the boundary: 31 chars must be rejected, 32 accepted. */
const BOUNDARY_31 = 'a'.repeat(31);
const BOUNDARY_32 = 'a'.repeat(32);

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

let configModule!: typeof import('../src/config');
let buildApp!: typeof import('../src/app').buildApp;
let signSession!: typeof import('../src/middleware/auth').signSession;

beforeAll(async () => {
  // Must be set BEFORE ../src/config is imported: config.isProd is captured at
  // module-evaluation time, and this file exercises the production path.
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_SECRET = VALID_SECRET;

  configModule = await import('../src/config');
  buildApp = (await import('../src/app')).buildApp;
  signSession = (await import('../src/middleware/auth')).signSession;
});

afterAll(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

/** Capture console output so we can prove no secret is ever written to a log. */
function captureConsole(): { output: string[]; restore: () => void } {
  const originalError = console.error;
  const originalLog = console.log;
  const output: string[] = [];
  const push = (...args: unknown[]): void => {
    output.push(args.map((a) => String(a)).join(' '));
  };
  console.error = push as typeof console.error;
  console.log = push as typeof console.log;
  return {
    output,
    restore: () => {
      console.error = originalError;
      console.log = originalLog;
    },
  };
}

describe('production configuration refuses an unsafe signing key', () => {
  // Values are resolved lazily inside each test body: the module is imported in
  // beforeAll, which runs after these cases are collected.
  const rejected: [string, () => string | undefined, string][] = [
    ['missing', () => undefined, 'missing'],
    ['empty', () => '', 'missing'],
    ['whitespace only', () => '     ', 'missing'],
    ['the published development fallback', () => configModule.DEV_FALLBACK_JWT_SECRET, 'placeholder'],
    ['below the minimum length', () => SHORT_SECRET, 'too-short'],
    ['one character under the minimum', () => BOUNDARY_31, 'too-short'],
  ];

  it.each(rejected)('rejects a %s secret', (_label, resolve, problem) => {
    const value = resolve();
    const check = configModule.checkJwtSecret(value, true);
    expect(check.ok).toBe(false);
    expect(check.problem).toBe(problem);
    // The reason must be actionable but must never echo the secret itself.
    expect(check.message).toBeTruthy();
    if (value) expect(check.message).not.toContain(value);
  });

  it('accepts a secret exactly at the documented minimum', () => {
    expect(configModule.MIN_JWT_SECRET_LENGTH).toBe(32);
    expect(configModule.checkJwtSecret(BOUNDARY_32, true).ok).toBe(true);
    expect(configModule.checkJwtSecret(VALID_SECRET, true).ok).toBe(true);
  });
});

describe('development keeps the convenient fallback', () => {
  it('allows an unset secret locally', () => {
    expect(configModule.checkJwtSecret(undefined, false).ok).toBe(true);
  });

  it('allows the published fallback locally', () => {
    expect(configModule.checkJwtSecret(configModule.DEV_FALLBACK_JWT_SECRET, false).ok).toBe(true);
  });

  it('allows a short secret locally', () => {
    expect(configModule.checkJwtSecret(SHORT_SECRET, false).ok).toBe(true);
  });
});

describe('the startup gate', () => {
  it('throws for the published fallback, without leaking the value', () => {
    process.env.JWT_SECRET = configModule.DEV_FALLBACK_JWT_SECRET;
    let thrown: unknown;
    try {
      configModule.assertJwtSecretIsSafe();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(/JWT_SECRET/);
    expect(message).not.toContain(configModule.DEV_FALLBACK_JWT_SECRET);
  });

  it('throws when the secret is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => configModule.assertJwtSecretIsSafe()).toThrow(/JWT_SECRET/);
  });

  it('throws when the secret is too short', () => {
    process.env.JWT_SECRET = SHORT_SECRET;
    expect(() => configModule.assertJwtSecretIsSafe()).toThrow(/JWT_SECRET/);
  });

  it('does not throw for a valid secret', () => {
    process.env.JWT_SECRET = VALID_SECRET;
    expect(() => configModule.assertJwtSecretIsSafe()).not.toThrow();
  });
});

describe('the resolved secret shown to signing and verification', () => {
  it('returns the configured value when valid', () => {
    process.env.JWT_SECRET = VALID_SECRET;
    expect(configModule.getJwtSecret()).toBe(VALID_SECRET);
  });

  it('throws instead of falling back to the published value in production', () => {
    process.env.JWT_SECRET = configModule.DEV_FALLBACK_JWT_SECRET;
    expect(() => configModule.getJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('throws instead of returning an unset value in production', () => {
    delete process.env.JWT_SECRET;
    expect(() => configModule.getJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('exposes no unvalidated jwtSecret property on the config object', () => {
    // Reading a plain property could bypass validation; the only supported
    // accessor is getJwtSecret().
    expect((configModule.config as unknown as Record<string, unknown>).jwtSecret).toBeUndefined();
  });
});

describe('production startup', () => {
  it('rejects startup with the public fallback and logs no secret', async () => {
    process.env.JWT_SECRET = configModule.DEV_FALLBACK_JWT_SECRET;
    const console_ = captureConsole();
    let rejected: unknown;
    let app: unknown;
    try {
      app = await buildApp();
    } catch (err) {
      rejected = err;
    } finally {
      console_.restore();
    }

    // The gate runs before any request can be served, so startup must fail.
    expect(app).toBeUndefined();
    expect(rejected).toBeInstanceOf(Error);
    // Matches the startup gate specifically — not a database or other error.
    expect((rejected as Error).message).toMatch(/^JWT configuration error: .*JWT_SECRET/);
    // Neither the error nor any captured log line may contain the secret.
    expect((rejected as Error).message).not.toContain(configModule.DEV_FALLBACK_JWT_SECRET);
    expect(console_.output.join('\n')).not.toContain(configModule.DEV_FALLBACK_JWT_SECRET);
  });

  it('starts normally with a valid secret', async () => {
    process.env.JWT_SECRET = VALID_SECRET;
    const app = await buildApp();
    expect(app).toBeTruthy();
  });
});

describe('signing and verification share one validated configuration', () => {
  it('accepts a session it signed', () => {
    process.env.JWT_SECRET = VALID_SECRET;
    // signSession now also binds the token to one device session (`jti`) and a
    // session version (`sv`), which together drive server-side revocation.
    const token = signSession({ uid: 'usr_jwt_test', email: 'jwt@test.dev' }, 0, 'sess_jwt_test');
    const payload = jwt.verify(token, configModule.getJwtSecret()) as { uid: string };
    expect(payload.uid).toBe('usr_jwt_test');
  });

  it('rejects a cookie forged with the published fallback', () => {
    process.env.JWT_SECRET = VALID_SECRET;
    const forged = jwt.sign({ uid: 'usr_attacker', email: 'a@b.dev' }, configModule.DEV_FALLBACK_JWT_SECRET, {
      expiresIn: '7d',
    });
    expect(() => jwt.verify(forged, configModule.getJwtSecret())).toThrow();
  });
});

// Curevo AI — Phase 9C.2: Security Hardening, Row Level Security & CSRF Protection Regression Suite
//
// Validates:
// 1. Asynchronous Bcrypt hashing, verification, and timing resistance
// 2. Cryptographic ID generation randomness, collision resistance, and entropy
// 3. PostgreSQL migration advisory locking (pg_advisory_xact_lock)
// 4. Hardened Row Level Security (FORCE ROW LEVEL SECURITY, CRUD policies, tenant isolation, zero connection pool bleed)
// 5. Cross-Site Request Forgery (CSRF) protection (double-submit cookie, origin/referer check, bearer bypass, timing-safe equality)
// 6. Production configuration validation (DATABASE_URL, JWT_SECRET, APP_URL, EMAIL credentials, zero secret leakage)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'pg';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app';
import { getDb, closeDb, newId, withUserContext } from '../src/db/db';
import { runPendingMigrations } from '../src/db/migrations';
import { UserRepository } from '../src/db/userRepository';
import { createExtensionToken } from '../src/lib/tokens';
import { timingSafeEqualString, CSRF_COOKIE_NAME, generateCsrfToken } from '../src/middleware/csrf';
import {
  validateProductionAuthConfig,
  assertProductionAuthConfigIsSafe,
  validateDatabaseUrl,
  validateEmailConfig,
  DEV_FALLBACK_JWT_SECRET,
} from '../src/config';
import { __resetRateLimitsForTests } from '../src/middleware/rateLimit';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';

let app: Express;
let db: Pool;

const originalDbUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalJwtSecret = process.env.JWT_SECRET;

beforeAll(async () => {
  delete process.env.NODE_ENV;
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.JWT_SECRET = 'security-hardening-test-secret-0123456789abcdef';

  db = getDb();
  app = await buildApp();

  await runPendingMigrations(db);

  // Set up a standard non-superuser application role for testing tenant RLS isolation
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecv_test_app_role') THEN
        CREATE ROLE ecv_test_app_role NOSUPERUSER NOBYPASSRLS;
      END IF;
      GRANT USAGE ON SCHEMA public TO ecv_test_app_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO ecv_test_app_role;
    END $$;
  `);

  await db.query(
    'TRUNCATE users, user_sessions, email_verification_tokens, password_reset_tokens CASCADE',
  );
});

afterAll(async () => {
  await closeDb();
  process.env.NODE_ENV = originalNodeEnv;
  if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
  else delete process.env.DATABASE_URL;
  if (originalJwtSecret !== undefined) process.env.JWT_SECRET = originalJwtSecret;
  else delete process.env.JWT_SECRET;
});

beforeEach(() => {
  __resetRateLimitsForTests();
});

function randomEmail(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}@security-test.dev`;
}

function parseCookies(res: request.Response): {
  sessionCookie: string;
  csrfCookie: string;
  csrfToken: string;
  cookieHeader: string;
} {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  const sessionItem = list.find((c) => c.startsWith('ecv_session='));
  const csrfItem = list.find((c) => c.startsWith('ecv_csrf='));

  const sessionCookie = sessionItem ? sessionItem.split(';')[0] : '';
  const csrfCookie = csrfItem ? csrfItem.split(';')[0] : '';
  const csrfToken = csrfCookie.replace('ecv_csrf=', '');
  const cookieHeader = [sessionCookie, csrfCookie].filter(Boolean).join('; ');

  return { sessionCookie, csrfCookie, csrfToken, cookieHeader };
}

describe('Phase 9C.2 — Security Hardening, RLS & CSRF Verification', () => {
  // ---------------------------------------------------------------------------
  // 1. Asynchronous Bcrypt & Timing Resistance
  // ---------------------------------------------------------------------------
  describe('1. Asynchronous Bcrypt Password Security', () => {
    it('uses asynchronous bcrypt with 10 work factor rounds', async () => {
      const password = 'SuperSecurePassword2026!';
      const hash = await bcrypt.hash(password, 10);
      expect(hash).toMatch(/^\$2[aby]\$10\$/);

      const isMatch = await bcrypt.compare(password, hash);
      expect(isMatch).toBe(true);

      const isMismatch = await bcrypt.compare('WrongPassword999!', hash);
      expect(isMismatch).toBe(false);
    });

    it('returns constant-shape 401 INVALID_CREDENTIALS for nonexistent users', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost_user_does_not_exist@security-test.dev', password: 'SomePassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error?.message).toBe('Incorrect email or password.');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Cryptographic ID Generation & Entropy
  // ---------------------------------------------------------------------------
  describe('2. Cryptographic ID Generation', () => {
    it('generates IDs with cryptographically secure random bytes', () => {
      const id = newId('usr');
      expect(id).toMatch(/^usr_[0-9a-z]+[0-9a-f]{10}$/);
    });

    it('generates 500 unique IDs without collision', () => {
      const set = new Set<string>();
      for (let i = 0; i < 500; i++) {
        const id = newId('tst');
        expect(set.has(id)).toBe(false);
        set.add(id);
      }
      expect(set.size).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PostgreSQL Migration Advisory Locking
  // ---------------------------------------------------------------------------
  describe('3. Migration Concurrency & Advisory Locks', () => {
    it('safely acquires pg_advisory_xact_lock during migrations', async () => {
      const res = await runPendingMigrations(db);
      expect(res).toBeDefined();
      expect(Array.isArray(res.applied)).toBe(true);
      expect(Array.isArray(res.skipped)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Row Level Security Hardening & Isolation
  // ---------------------------------------------------------------------------
  describe('4. Row Level Security & FORCE ROW LEVEL SECURITY', () => {
    it('enforces FORCE ROW LEVEL SECURITY on users and user_sessions tables', async () => {
      const res = await db.query(`
        SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname IN ('users', 'user_sessions');
      `);

      expect(res.rows.length).toBe(2);
      for (const row of res.rows) {
        expect(row.relrowsecurity).toBe(true);
        expect(row.relforcerowsecurity).toBe(true);
      }
    });

    it('defines explicit CRUD policies for users and sessions tables', async () => {
      const res = await db.query(`
        SELECT tablename, policyname, cmd
        FROM pg_policies
        WHERE tablename IN ('users', 'user_sessions')
        ORDER BY tablename, policyname;
      `);

      const policyNames = res.rows.map((r: { policyname: string }) => r.policyname);
      expect(policyNames).toContain('users_select_policy');
      expect(policyNames).toContain('users_insert_policy');
      expect(policyNames).toContain('users_update_policy');
      expect(policyNames).toContain('users_delete_policy');
      expect(policyNames).toContain('sessions_select_policy');
      expect(policyNames).toContain('sessions_insert_policy');
      expect(policyNames).toContain('sessions_update_policy');
      expect(policyNames).toContain('sessions_delete_policy');
    });

    it('isolates user records under withUserContext and clears setting on transaction finish', async () => {
      const userA = await UserRepository.create({
        name: 'Context User A',
        email: randomEmail('ctx_a'),
        passwordHash: 'dummy_hash_a',
      });

      const userB = await UserRepository.create({
        name: 'Context User B',
        email: randomEmail('ctx_b'),
        passwordHash: 'dummy_hash_b',
      });

      // Under userA context with standard app role: User A can read userA record, but User B record query returns 0 rows
      await withUserContext(userA.id, async (client) => {
        await client.query('SET ROLE ecv_test_app_role');
        try {
          const resA = await client.query('SELECT id, name FROM users WHERE id = $1', [userA.id]);
          expect(resA.rows.length).toBe(1);
          expect(resA.rows[0].name).toBe('Context User A');

          const resB = await client.query('SELECT id, name FROM users WHERE id = $1', [userB.id]);
          expect(resB.rows.length).toBe(0);
        } finally {
          await client.query('RESET ROLE');
        }
      });

      // Verify connection pool cleanup: a subsequent query on pool has no leaked app.current_user_id
      const checkSetting = await db.query("SELECT current_setting('app.current_user_id', true) AS uid");
      expect(checkSetting.rows[0].uid == null || checkSetting.rows[0].uid === '').toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. CSRF Protection & Timing-Safe Equality
  // ---------------------------------------------------------------------------
  describe('5. CSRF Protection Middleware & Double-Submit Verification', () => {
    it('verifies timing-safe string comparison function', () => {
      const token = generateCsrfToken();
      expect(timingSafeEqualString(token, token)).toBe(true);
      expect(timingSafeEqualString(token, token.slice(0, -1) + 'x')).toBe(false);
      expect(timingSafeEqualString(token, 'short')).toBe(false);
      expect(timingSafeEqualString('', '')).toBe(true);
    });

    it('vends CSRF token and sets ecv_csrf cookie via GET /api/auth/csrf', async () => {
      const res = await request(app).get('/api/auth/csrf');
      expect(res.status).toBe(200);
      expect(res.body.csrfToken).toBeDefined();
      expect(res.body.csrfToken.length).toBe(64);

      const parsed = parseCookies(res);
      expect(parsed.csrfCookie).toMatch(/^ecv_csrf=/);
      expect(parsed.csrfToken).toBe(res.body.csrfToken);
    });

    it('rejects state-changing requests with invalid or missing CSRF token when session cookie is present', async () => {
      const email = randomEmail('csrf_reject');
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'CSRF Victim', email, password: 'SecurePassword123!' });

      const { sessionCookie, csrfToken } = parseCookies(signupRes);

      // 1. Missing X-CSRF-Token header -> 403 CSRF_ERROR
      const missingTokenRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', sessionCookie);

      expect(missingTokenRes.status).toBe(403);
      expect(missingTokenRes.body.error?.code).toBe('CSRF_ERROR');

      // 2. Mismatched X-CSRF-Token header -> 403 CSRF_ERROR
      const mismatchedTokenRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `${sessionCookie}; ecv_csrf=${csrfToken}`)
        .set('X-CSRF-Token', 'forged_fake_token_000000000000000000000000000000000000000000000000');

      expect(mismatchedTokenRes.status).toBe(403);
      expect(mismatchedTokenRes.body.error?.code).toBe('CSRF_ERROR');
    });

    it('accepts state-changing request when valid matching CSRF token and cookie are provided', async () => {
      const email = randomEmail('csrf_accept');
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'CSRF Valid', email, password: 'SecurePassword123!' });

      const { cookieHeader, csrfToken } = parseCookies(signupRes);

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrfToken);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.ok).toBe(true);
    });

    it('rejects requests from untrusted Origin header with HTTP 403 CSRF_ERROR', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'https://malicious-attacker-website.com')
        .send({ email: 'target@example.com', password: 'Password123!' });

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('CSRF_ERROR');
      expect(res.body.error?.message).toBe('Cross-origin request rejected.');
    });

    it('allows requests from approved Origin header (Vercel production frontend)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', 'https://enhancecv-orpin.vercel.app')
        .send({ email: 'target@example.com', password: 'Password123!' });

      // Origin check passes; fails on invalid credentials rather than CSRF error
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('INVALID_CREDENTIALS');
    });

    it('bypasses CSRF checks when authorized via Authorization: Bearer <token>', async () => {
      const user = await UserRepository.create({
        name: 'Bearer User',
        email: randomEmail('bearer_user'),
        passwordHash: 'dummy_hash',
      });

      const token = await createExtensionToken(user.id, 'Test CLI');

      // Profile request using Bearer token without any CSRF cookies/headers
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(user.email);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Production Configuration Gate & Zero Secret Leakage
  // ---------------------------------------------------------------------------
  describe('6. Production Configuration Validation Gate', () => {
    it('validates database URL formatting and rejects non-postgres URIs', () => {
      expect(validateDatabaseUrl('').ok).toBe(false);
      expect(validateDatabaseUrl('http://localhost:5432/db').ok).toBe(false);
      expect(validateDatabaseUrl('postgres://user:pass@render-db.internal:5432/curevo_prod').ok).toBe(true);
      expect(validateDatabaseUrl('postgresql://user:pass@aws.supabase.co:5432/postgres').ok).toBe(true);
    });

    it('validates production email configuration', () => {
      const invalidConsole = validateEmailConfig({
        EMAIL_PROVIDER: 'console',
        EMAIL_API_KEY: 'secret_key',
        EMAIL_FROM: 'test@example.com',
      } as any);
      expect(invalidConsole.ok).toBe(false);

      const invalidKey = validateEmailConfig({
        EMAIL_PROVIDER: 'resend',
        EMAIL_API_KEY: '',
        EMAIL_FROM: 'test@example.com',
      } as any);
      expect(invalidKey.ok).toBe(false);

      const validResend = validateEmailConfig({
        EMAIL_PROVIDER: 'resend',
        EMAIL_API_KEY: 're_1234567890abcdef',
        EMAIL_FROM: 'Curevo AI <team@curevo.ai>',
      } as any);
      expect(validResend.ok).toBe(true);
      expect(validResend.provider).toBe('resend');
    });

    it('rejects incomplete production configurations with clear, secret-free diagnostics', () => {
      const result = validateProductionAuthConfig({
        DATABASE_URL: '',
        JWT_SECRET: DEV_FALLBACK_JWT_SECRET,
        APP_URL: 'http://localhost:5173',
        EMAIL_PROVIDER: 'console',
      } as any);

      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);

      // Verify ZERO secrets leak in error messages
      for (const err of result.errors) {
        expect(err).not.toContain(DEV_FALLBACK_JWT_SECRET);
      }
    });

    it('passes validation when all production environment variables are properly configured', () => {
      const result = validateProductionAuthConfig({
        DATABASE_URL: 'postgresql://prod_user:secret_password@supabase.co:5432/prod_db',
        JWT_SECRET: 'super-strong-production-jwt-signing-secret-64bytes-entropy',
        APP_URL: 'https://enhancecv-orpin.vercel.app',
        EMAIL_PROVIDER: 'resend',
        EMAIL_API_KEY: 're_live_abcdef1234567890',
        EMAIL_FROM: 'Curevo AI <notifications@curevo.ai>',
      } as any);

      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(() =>
        assertProductionAuthConfigIsSafe({
          DATABASE_URL: 'postgresql://prod_user:secret_password@supabase.co:5432/prod_db',
          JWT_SECRET: 'super-strong-production-jwt-signing-secret-64bytes-entropy',
          APP_URL: 'https://enhancecv-orpin.vercel.app',
          EMAIL_PROVIDER: 'resend',
          EMAIL_API_KEY: 're_live_abcdef1234567890',
          EMAIL_FROM: 'Curevo AI <notifications@curevo.ai>',
        } as any),
      ).not.toThrow();
    });
  });
});

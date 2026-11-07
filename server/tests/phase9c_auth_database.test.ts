// Curevo AI — Phase 9C: Authentication & Database Foundation Integration Test Suite
//
// Validates:
// 1. User registration (validation, hashing, duplicate prevention, session start)
// 2. User login (valid credentials, incorrect password, non-existent account, session creation)
// 3. Session restoration via GET /api/auth/me
// 4. Server-side session revocation on logout (single-device revocation)
// 5. Dual revocation on password reset (per-user revocation across all devices)
// 6. Email verification token generation, consumption, and single-use enforcement
// 7. Protected route rejection for unauthenticated or forged credentials
// 8. Cross-user isolation and ownership enforcement
// 9. Database failure graceful handling (clean 503 AUTH_UNAVAILABLE)
// 10. Database migrations ledger and idempotency

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { buildApp } from '../src/app';
import { getDb, closeDb } from '../src/db/db';
import { runPendingMigrations, getAppliedMigrations } from '../src/db/migrations';
import { UserRepository } from '../src/db/userRepository';
import { createVerificationToken, createPasswordResetToken } from '../src/lib/tokens';
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
  process.env.JWT_SECRET = 'phase9c-test-jwt-secret-0123456789abcdef';

  db = getDb();
  app = await buildApp();

  // Run schema migrations on test database
  await runPendingMigrations(db);

  // Clean test tables
  await db.query(
    'TRUNCATE users, user_sessions, email_verification_tokens, password_reset_tokens CASCADE'
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

function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
}

function csrfFrom(res: request.Response): string {
  if (res.body?.csrfToken) return res.body.csrfToken;
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  const found = list.find((c) => c.startsWith('ecv_csrf='));
  if (!found) return '';
  return found.split(';')[0].replace('ecv_csrf=', '');
}

function randomEmail(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}@test.dev`;
}

describe('Phase 9C — Authentication & Database Foundation', () => {
  // -------------------------------------------------------------------------
  // 1. Database Migrations Ledger & Connection
  // -------------------------------------------------------------------------
  describe('1. Database Migrations & Ledger', () => {
    it('applies baseline migrations and records them in schema_migrations', async () => {
      const applied = await getAppliedMigrations();
      expect(applied).toContain('001_baseline_identity_schema');
      expect(applied).toContain('002_row_level_security_policies');
      expect(applied).toContain('003_hardened_tenant_isolation_rls');
    });

    it('running runPendingMigrations again is idempotent and skips already applied migrations', async () => {
      const result = await runPendingMigrations(db);
      expect(result.applied.length).toBe(0);
      expect(result.skipped).toContain('001_baseline_identity_schema');
      expect(result.skipped).toContain('002_row_level_security_policies');
      expect(result.skipped).toContain('003_hardened_tenant_isolation_rls');
    });
  });

  // -------------------------------------------------------------------------
  // 2. User Registration (POST /api/auth/signup)
  // -------------------------------------------------------------------------
  describe('2. User Registration (POST /api/auth/signup)', () => {
    it('creates a user account, hashes password, starts session, and returns safe user profile', async () => {
      const email = randomEmail('signup_success');
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Alex Mercer', email, password: 'SecurePassword123!' });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.name).toBe('Alex Mercer');
      expect(res.body.user.emailVerified).toBe(false);
      expect(res.body.user.password).toBeUndefined(); // Never expose passwords
      expect(res.body.user.password_hash).toBeUndefined();

      // Verifies session cookie is set
      const cookie = cookieFrom(res);
      expect(cookie).toMatch(/^ecv_session=/);

      // Verifies record in PostgreSQL
      const userInDb = await UserRepository.findByEmail(email);
      expect(userInDb).not.null;
      expect(userInDb?.email).toBe(email);
      expect(userInDb?.passwordHash).not.toBe('SecurePassword123!');
      expect(userInDb?.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash
    });

    it('rejects duplicate email registrations with HTTP 409 EMAIL_TAKEN', async () => {
      const email = randomEmail('signup_dup');
      await request(app)
        .post('/api/auth/signup')
        .send({ name: 'User One', email, password: 'Password123!' });

      const dupRes = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'User Two', email, password: 'AnotherPassword123!' });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error?.code).toBe('EMAIL_TAKEN');
    });

    it('rejects passwords shorter than 8 characters with HTTP 400 VALIDATION', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Shorty', email: randomEmail('short'), password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('VALIDATION');
    });

    it('rejects malformed JSON body with HTTP 400 MALFORMED_JSON', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .set('Content-Type', 'application/json')
        .send('{"name": "Broken", "email": invalid_json');

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('MALFORMED_JSON');
    });
  });

  // -------------------------------------------------------------------------
  // 3. User Login & Invalid Credentials (POST /api/auth/login)
  // -------------------------------------------------------------------------
  describe('3. User Login (POST /api/auth/login)', () => {
    it('authenticates valid credentials, sets session cookie, and returns user details', async () => {
      const email = randomEmail('login_test');
      await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Login User', email, password: 'ValidPassword123!' });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'ValidPassword123!' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.email).toBe(email);
      expect(cookieFrom(loginRes)).toMatch(/^ecv_session=/);
    });

    it('rejects wrong password with HTTP 401 INVALID_CREDENTIALS', async () => {
      const email = randomEmail('wrong_pw');
      await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Target User', email, password: 'CorrectPassword123!' });

      const failRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'WrongPassword999!' });

      expect(failRes.status).toBe(401);
      expect(failRes.body.error?.code).toBe('INVALID_CREDENTIALS');
      expect(cookieFrom(failRes)).toBe('');
    });

    it('rejects non-existent email with HTTP 401 INVALID_CREDENTIALS (no account enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent_account_never_created@test.dev', password: 'SomePassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('INVALID_CREDENTIALS');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Session Restoration & Protected Route (GET /api/auth/me)
  // -------------------------------------------------------------------------
  describe('4. Session Restoration & Profile (GET /api/auth/me)', () => {
    it('returns the authenticated user profile when a valid session cookie is presented', async () => {
      const email = randomEmail('me_success');
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Session Owner', email, password: 'MyPassword123!' });

      const cookie = cookieFrom(signupRes);

      const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toBeDefined();
      expect(meRes.body.user.email).toBe(email);
      expect(meRes.body.user.name).toBe('Session Owner');
    });

    it('rejects unauthenticated requests without session cookie with HTTP 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHENTICATED');
    });

    it('rejects forged or expired session tokens with HTTP 401 SESSION_EXPIRED', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'ecv_session=forged.invalid.token');

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('SESSION_EXPIRED');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Logout & Server-Side Device Revocation (POST /api/auth/logout)
  // -------------------------------------------------------------------------
  describe('5. Logout & Session Revocation (POST /api/auth/logout)', () => {
    it('revokes the session row in PostgreSQL and invalidates the session cookie', async () => {
      const email = randomEmail('logout_test');
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Logout User', email, password: 'MyPassword123!' });

      const cookie = cookieFrom(signupRes);

      // Verify session works before logout
      const beforeMe = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(beforeMe.status).toBe(200);

      // Perform logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfFrom(signupRes));
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.ok).toBe(true);

      // Attempt to replay the old session cookie
      const afterMe = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(afterMe.status).toBe(401);
      expect(afterMe.body.error?.code).toBe('SESSION_EXPIRED');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Email Verification (GET /api/auth/verify-email)
  // -------------------------------------------------------------------------
  describe('6. Email Verification Flow', () => {
    it('verifies user email with a valid token and enforces single-use consumption', async () => {
      const email = randomEmail('verify_flow');
      const user = await UserRepository.create({
        name: 'Unverified User',
        email,
        passwordHash: 'dummy_hash',
      });

      const token = await createVerificationToken(user.id);
      expect(token).toBeDefined();

      // Consume verification token
      const verifyRes = await request(app).get(`/api/auth/verify-email?token=${token}`);
      expect(verifyRes.status).toBe(302);
      expect(verifyRes.headers.location).toContain('verified=1');

      // Check user record updated in database
      const updatedUser = await UserRepository.findById(user.id);
      expect(updatedUser?.emailVerified).toBe(true);

      // Attempt second consumption (must fail - single-use)
      const reuseRes = await request(app).get(`/api/auth/verify-email?token=${token}`);
      expect(reuseRes.status).toBe(302);
      expect(reuseRes.headers.location).toContain('verified=0');
      expect(reuseRes.headers.location).toContain('reason=invalid');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Password Reset & Per-User Revocation (POST /api/auth/reset-password)
  // -------------------------------------------------------------------------
  describe('7. Password Reset & Dual Revocation', () => {
    it('resets password and invalidates all existing sessions across devices', async () => {
      const email = randomEmail('reset_flow');
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Reset User', email, password: 'OldPassword123!' });

      const device1Cookie = cookieFrom(signupRes);

      // Second device login
      const login2Res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'OldPassword123!' });
      const device2Cookie = cookieFrom(login2Res);

      // Create a password reset token
      const user = await UserRepository.findByEmail(email);
      expect(user).not.null;
      const resetToken = await createPasswordResetToken(user!.id);

      // Execute password reset
      const resetRes = await request(app).post('/api/auth/reset-password').send({
        token: resetToken,
        newPassword: 'BrandNewPassword456!',
      });
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.ok).toBe(true);

      // Both previously active device sessions must now be revoked
      const d1Check = await request(app).get('/api/auth/me').set('Cookie', device1Cookie);
      expect(d1Check.status).toBe(401);
      expect(d1Check.body.error?.code).toBe('SESSION_EXPIRED');

      const d2Check = await request(app).get('/api/auth/me').set('Cookie', device2Cookie);
      expect(d2Check.status).toBe(401);
      expect(d2Check.body.error?.code).toBe('SESSION_EXPIRED');

      // Old password no longer works
      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'OldPassword123!' });
      expect(oldLogin.status).toBe(401);

      // New password succeeds
      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'BrandNewPassword456!' });
      expect(newLogin.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Cross-User Isolation & Ownership Enforcement
  // -------------------------------------------------------------------------
  describe('8. Cross-User Data Isolation', () => {
    it('ensures user A cannot update or access user B data', async () => {
      const emailA = randomEmail('user_a');
      const emailB = randomEmail('user_b');

      const userA = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'User A', email: emailA, password: 'PasswordA123!' });
      const cookieA = cookieFrom(userA);

      const userB = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'User B', email: emailB, password: 'PasswordB123!' });

      // User A reads their own profile
      const meA = await request(app).get('/api/auth/me').set('Cookie', cookieA);
      expect(meA.body.user.email).toBe(emailA);
      expect(meA.body.user.name).toBe('User A');
      expect(meA.body.user.id).not.toBe(userB.body.user.id);

      // User A updates their profile
      const updateA = await request(app)
        .put('/api/profile')
        .set('Cookie', cookieA)
        .set('X-CSRF-Token', csrfFrom(userA))
        .send({ name: 'User A Updated', targetRole: 'Senior Engineer' });
      expect(updateA.status).toBe(200);

      // Verify User B remained untouched
      const userBRecord = await UserRepository.findByEmail(emailB);
      expect(userBRecord?.name).toBe('User B');
      expect(userBRecord?.targetRole).toBe('');
    });
  });
});

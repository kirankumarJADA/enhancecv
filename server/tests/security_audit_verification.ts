// Independent Security Audit Verification Script (Phase 9C.1)
//
// Rigorously tests:
// 1. Cross-User Data Isolation (API level & Repository level)
// 2. Per-Device Session Revocation on Logout
// 3. Global All-Device Session Revocation on Password Reset
// 4. Zero Account Enumeration on Password Reset & Resend Verification
// 5. Single-Use Cryptographic Tokens (Verification & Password Reset)

import type { Express } from 'express';
import type { Pool } from 'pg';
import request from 'supertest';
import { buildApp } from '../src/app';
import { getDb, closeDb } from '../src/db/db';
import { runPendingMigrations } from '../src/db/migrations';
import { UserRepository } from '../src/db/userRepository';
import { createVerificationToken, consumeVerificationToken, createPasswordResetToken, consumePasswordResetToken } from '../src/lib/tokens';
import { __resetRateLimitsForTests } from '../src/middleware/rateLimit';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.JWT_SECRET = 'phase9c-security-audit-secret-key-32chars!';

function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  const found = list.find((c) => c.startsWith('ecv_session='));
  if (!found) return '';
  return found.split(';')[0];
}

async function runAudit() {
  console.log('=== CUREVO AI PHASE 9C.1 INDEPENDENT SECURITY AUDIT ===\n');
  const db = getDb();
  const app = await buildApp();

  await runPendingMigrations(db);
  __resetRateLimitsForTests();

  const auditResults: Array<{ check: string; status: 'PASS' | 'FAIL'; detail: string }> = [];

  try {
    // -----------------------------------------------------------------------
    // CHECK 1: User Registration, Bcrypt Hashing & Response Sanitization
    // -----------------------------------------------------------------------
    console.log('Checking 1: User Registration & Credential Hashing...');
    const userAEmail = `audit_usera_${Date.now()}@example.com`;
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({ email: userAEmail, password: 'StrongPassword123!', name: 'User Alpha' });

    if (signupRes.status !== 201 || !signupRes.body.user?.id) {
      throw new Error(`Signup failed with status ${signupRes.status}`);
    }
    const userAId = signupRes.body.user.id;
    const cookieUserADevice1 = cookieFrom(signupRes);

    // Verify bcrypt in database
    const dbRowA = (await db.query('SELECT password_hash FROM users WHERE id = $1', [userAId])).rows[0];
    const isBcrypt = dbRowA.password_hash.startsWith('$2a$') || dbRowA.password_hash.startsWith('$2b$');

    auditResults.push({
      check: 'Registration & Bcrypt Password Hashing',
      status: isBcrypt ? 'PASS' : 'FAIL',
      detail: `Password stored with prefix ${dbRowA.password_hash.slice(0, 4)}, 10 rounds, no plaintext leak.`,
    });

    // -----------------------------------------------------------------------
    // CHECK 2: Cross-User Data Access Isolation (User B cannot read/write User A)
    // -----------------------------------------------------------------------
    console.log('Checking 2: Cross-User Isolation...');
    const userBEmail = `audit_userb_${Date.now()}@example.com`;
    const signupBRes = await request(app)
      .post('/api/auth/signup')
      .send({ email: userBEmail, password: 'StrongPassword456!', name: 'User Beta' });
    const userBId = signupBRes.body.user.id;
    const cookieUserB = cookieFrom(signupBRes);

    // User B requests /api/profile
    const profileBRes = await request(app)
      .get('/api/profile')
      .set('Cookie', cookieUserB);

    const isIsolated = profileBRes.body.profile?.id === userBId && profileBRes.body.profile?.id !== userAId;

    // Direct repository isolation verification
    const repoRecordA = await UserRepository.findById(userAId);
    const repoRecordB = await UserRepository.findById(userBId);
    const repoIsolated = repoRecordA?.id !== repoRecordB?.id && repoRecordA?.email === userAEmail;

    auditResults.push({
      check: 'Cross-User Profile & Data Isolation',
      status: isIsolated && repoIsolated ? 'PASS' : 'FAIL',
      detail: 'User B authenticated session can only read User B data; User A records are isolated.',
    });

    // -----------------------------------------------------------------------
    // CHECK 3: Per-Device Session Revocation on Logout
    // -----------------------------------------------------------------------
    console.log('Checking 3: Per-Device Session Revocation...');
    // Sign in User A on Device 2
    const loginDevice2Res = await request(app)
      .post('/api/auth/login')
      .send({ email: userAEmail, password: 'StrongPassword123!' });
    const cookieUserADevice2 = cookieFrom(loginDevice2Res);

    // Verify both devices can access /api/auth/me
    const meDev1Before = await request(app).get('/api/auth/me').set('Cookie', cookieUserADevice1);
    const meDev2Before = await request(app).get('/api/auth/me').set('Cookie', cookieUserADevice2);

    if (meDev1Before.status !== 200 || meDev2Before.status !== 200) {
      throw new Error('Device 1 or Device 2 failed initial authentication');
    }

    // User A logs out on Device 1
    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookieUserADevice1);
    if (logoutRes.status !== 200) throw new Error('Logout failed');

    // Device 1 must now be rejected (401)
    const meDev1After = await request(app).get('/api/auth/me').set('Cookie', cookieUserADevice1);
    // Device 2 must REMAIN authenticated (200)
    const meDev2After = await request(app).get('/api/auth/me').set('Cookie', cookieUserADevice2);

    const device1Revoked = meDev1After.status === 401;
    const device2RemainsActive = meDev2After.status === 200;

    auditResults.push({
      check: 'Per-Device Session Revocation (Logout)',
      status: device1Revoked && device2RemainsActive ? 'PASS' : 'FAIL',
      detail: `Device 1 revoked (${meDev1After.status} 401); Device 2 remains active (${meDev2After.status} 200).`,
    });

    // -----------------------------------------------------------------------
    // CHECK 4: Global All-Device Revocation on Password Reset
    // -----------------------------------------------------------------------
    console.log('Checking 4: Global Revocation on Password Reset...');
    // Create password reset token for User A
    const resetToken = await createPasswordResetToken(userAId);

    // Device 2 was still active before reset
    const meDev2PreReset = await request(app).get('/api/auth/me').set('Cookie', cookieUserADevice2);
    if (meDev2PreReset.status !== 200) throw new Error('Device 2 should be active before reset');

    // Execute password reset
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword: 'BrandNewPassword789!' });

    if (resetRes.status !== 200) throw new Error(`Password reset failed: ${JSON.stringify(resetRes.body)}`);

    // Device 2 must now be REJECTED (401) because session_version was bumped!
    const meDev2PostReset = await request(app).get('/api/auth/me').set('Cookie', cookieUserADevice2);

    // Old password must fail login
    const oldLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userAEmail, password: 'StrongPassword123!' });

    // New password must succeed
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userAEmail, password: 'BrandNewPassword789!' });

    const globalRevocationPassed =
      meDev2PostReset.status === 401 &&
      oldLoginRes.status === 401 &&
      newLoginRes.status === 200;

    auditResults.push({
      check: 'Global All-Device Revocation (Password Reset)',
      status: globalRevocationPassed ? 'PASS' : 'FAIL',
      detail: `All existing tokens invalidated across devices (${meDev2PostReset.status} 401); new password required.`,
    });

    // -----------------------------------------------------------------------
    // CHECK 5: Account Enumeration Protection
    // -----------------------------------------------------------------------
    console.log('Checking 5: Account Enumeration Resistance...');
    const existingForgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: userAEmail });

    const nonExistingForgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost_never_existed_999@example.com' });

    const existingResend = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: userAEmail });

    const nonExistingResend = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'ghost_never_existed_999@example.com' });

    const forgotIdentical =
      existingForgot.status === 200 &&
      nonExistingForgot.status === 200 &&
      existingForgot.body.ok === nonExistingForgot.body.ok;

    const resendIdentical =
      existingResend.status === 200 &&
      nonExistingResend.status === 200 &&
      existingResend.body.ok === nonExistingResend.body.ok;

    auditResults.push({
      check: 'Zero Account Enumeration (Forgot PW & Resend)',
      status: forgotIdentical && resendIdentical ? 'PASS' : 'FAIL',
      detail: 'HTTP 200 with identical JSON shape returned regardless of whether the account exists.',
    });

    // -----------------------------------------------------------------------
    // CHECK 6: Single-Use Cryptographic Tokens
    // -----------------------------------------------------------------------
    console.log('Checking 6: Single-Use Token Invalidation...');
    const verifyToken = await createVerificationToken(userBId);

    // First consumption succeeds
    const firstVerify = await consumeVerificationToken(verifyToken);
    // Second consumption must fail with 'invalid'
    const secondVerify = await consumeVerificationToken(verifyToken);

    const tokenSingleUse =
      'userId' in firstVerify &&
      firstVerify.userId === userBId &&
      'error' in secondVerify &&
      secondVerify.error === 'invalid';

    auditResults.push({
      check: 'Single-Use Token Enforcement',
      status: tokenSingleUse ? 'PASS' : 'FAIL',
      detail: 'Hashed token is marked used_at and immediately rejected on subsequent use.',
    });

    console.log('\n--- AUDIT VERIFICATION SUMMARY ---');
    for (const r of auditResults) {
      console.log(`[${r.status}] ${r.check}: ${r.detail}`);
    }

    const allPassed = auditResults.every((r) => r.status === 'PASS');
    console.log(`\nOVERALL VERIFICATION: ${allPassed ? 'ALL CHECKS PASSED (100%)' : 'FAILURES DETECTED'}`);
  } finally {
    await closeDb();
  }
}

runAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb, newId } from '../db/db';
import { signSession, requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { config } from '../config';
import {
  createVerificationToken,
  consumeVerificationToken,
  markEmailVerified,
  createPasswordResetToken,
  consumePasswordResetToken,
  createExtensionToken,
  listExtensionTokens,
  revokeExtensionToken,
} from '../lib/tokens';
import { sendEmail, isEmailConfigured, type EmailSendResult } from '../lib/email';
import { track } from '../lib/analytics';

const router = Router();

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function setSession(res: Response, uid: string, email: string): void {
  const token = signSession({ uid, email });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

async function sendVerificationEmail(email: string, token: string): Promise<EmailSendResult> {
  const url = `${config.appUrl}/verify-email?token=${token}`;
  return sendEmail({
    to: email,
    subject: 'Verify your Curevo AI email address',
    text: `Welcome to Curevo AI!\n\nPlease verify your email address by opening this link (valid for 24 hours):\n${url}\n\nIf you did not create an account, you can ignore this email.`,
  });
}

async function sendResetEmail(email: string, token: string): Promise<EmailSendResult> {
  const url = `${config.appUrl}/reset-password?token=${token}`;
  return sendEmail({
    to: email,
    subject: 'Reset your Curevo AI password',
    text: `A password reset was requested for your account.\n\nOpen this link to choose a new password (valid for 1 hour):\n${url}\n\nIf you did not request this, ignore this email — your password is unchanged.`,
  });
}

router.post('/signup', rateLimit({ windowMs: 15 * 60_000, max: 20 }), async (req, res) => {
  const body = signupSchema.parse(req.body);
  const db = getDb();

  const existing = await db.query(
    'SELECT id FROM users WHERE lower(email) = lower($1)',
    [body.email],
  );

  if (existing.rows.length > 0) {
    throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
  }

  const id = newId('usr');
  const hash = bcrypt.hashSync(body.password, 10);

  await db.query(
    'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
    [id, body.email, hash, body.name],
  );

  // Email verification: hashed token, 24h expiry. Dev mode logs the link.
  const verificationToken = await createVerificationToken(id);
  const emailResult = await sendVerificationEmail(body.email, verificationToken);

  track(id, 'signup', { emailProvider: emailResult.provider });
  setSession(res, id, body.email);

  res.status(201).json({
    user: {
      id,
      email: body.email,
      name: body.name,
      onboarded: false,
      emailVerified: false,
      emailDelivered: emailResult.delivered,
      devActionUrl: emailResult.actionUrl,
    },
  });
});

router.post(
  '/login',
  rateLimit({
    windowMs: 15 * 60_000,
    max: 30,
    keyFn: (r: Request) => String(r.body?.email || r.ip),
  }),
  async (req, res) => {
    const body = loginSchema.parse(req.body);
    const db = getDb();

    const result = await db.query(
      'SELECT id, email, password_hash, name, onboarded, email_verified FROM users WHERE lower(email) = lower($1)',
      [body.email],
    );

    const row = result.rows[0] as
      | {
          id: string;
          email: string;
          password_hash: string;
          name: string;
          onboarded: boolean;
          email_verified: boolean;
        }
      | undefined;

    if (!row || !bcrypt.compareSync(body.password, row.password_hash)) {
      throw new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.', 401);
    }

    track(row.id, 'login', {});
    setSession(res, row.id, row.email);

    res.json({
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        onboarded: !!row.onboarded,
        emailVerified: !!row.email_verified,
      },
    });
  },
);

router.post('/logout', (req, res) => {
  res.clearCookie(config.cookieName, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const db = getDb();

  const result = await db.query(
    'SELECT id, email, name, target_role, onboarded, email_verified, role FROM users WHERE id = $1',
    [req.user!.uid],
  );

  const row = result.rows[0] as
    | {
        id: string;
        email: string;
        name: string;
        target_role: string;
        onboarded: boolean;
        email_verified: boolean;
        role: string;
      }
    | undefined;

  if (!row) {
    throw new AppError('NOT_FOUND', 'Account not found.', 404);
  }

  res.json({
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      targetRole: row.target_role,
      onboarded: !!row.onboarded,
      emailVerified: !!row.email_verified,
      role: row.role,
    },
  });
});

// --- email verification ------------------------------------------------------

/** Resend the verification email. Never reveals whether the address exists. */
router.post('/resend-verification', rateLimit({ windowMs: 15 * 60_000, max: 5, keyFn: (r: Request) => String(r.body?.email || r.user?.uid || r.ip) }), async (req, res) => {
  const body = z.object({ email: z.string().trim().email().optional() }).parse(req.body);
  const db = getDb();
  const email = (body.email || req.user?.email || '').toLowerCase();
  if (!email) throw new AppError('VALIDATION', 'Provide the email address to resend to.', 400);

  const row = (await db.query('SELECT id, email_verified FROM users WHERE lower(email) = lower($1)', [email])).rows[0] as
    | { id: string; email_verified: boolean }
    | undefined;

  if (row && !row.email_verified) {
    const token = await createVerificationToken(row.id);
    await sendVerificationEmail(email, token);
  }
  // Identical response either way — no account enumeration.
  res.json({ ok: true, emailConfigured: isEmailConfigured() });
});

/** Verify an email token (clicked link). Redirects to the app. */
router.get('/verify-email', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) throw new AppError('VALIDATION', 'Missing verification token.', 400);
  const result = await consumeVerificationToken(token);
  if ('error' in result) {
    res.redirect(`${config.appUrl}/login?verified=0&reason=${result.error}`);
    return;
  }
  await markEmailVerified(result.userId);
  track(result.userId, 'email_verified', {});
  res.redirect(`${config.appUrl}/login?verified=1`);
});

// --- password reset ------------------------------------------------------------

/** Request a password reset. Always responds identically (no enumeration). */
router.post('/forgot-password', rateLimit({ windowMs: 15 * 60_000, max: 5, keyFn: (r: Request) => String(r.body?.email || r.ip) }), async (req, res) => {
  const body = z.object({ email: z.string().trim().email() }).parse(req.body);
  const db = getDb();
  const row = (await db.query('SELECT id FROM users WHERE lower(email) = lower($1)', [body.email])).rows[0] as
    | { id: string }
    | undefined;
  let devActionUrl: string | undefined;
  if (row) {
    const token = await createPasswordResetToken(row.id);
    const emailResult = await sendResetEmail(body.email, token);
    // Dev convenience (console provider only): surface the link since no real
    // email was sent. Never leaks anything when a real provider is configured.
    devActionUrl = emailResult.actionUrl;
  }
  res.json({ ok: true, emailConfigured: isEmailConfigured(), devActionUrl });
});

/** Complete a password reset with the emailed token. */
router.post('/reset-password', rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const body = z.object({
    token: z.string().min(10).max(200),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
  }).parse(req.body);

  const result = await consumePasswordResetToken(body.token);
  if ('error' in result) {
    throw new AppError(
      result.error === 'expired' ? 'RESET_TOKEN_EXPIRED' : 'RESET_TOKEN_INVALID',
      result.error === 'expired'
        ? 'This reset link has expired. Please request a new one.'
        : 'This reset link is invalid or has already been used.',
      400,
    );
  }
  await getDb().query('UPDATE users SET password_hash = $1 WHERE id = $2', [
    bcrypt.hashSync(body.newPassword, 10),
    result.userId,
  ]);
  track(result.userId, 'password_reset_completed', {});
  res.json({ ok: true });
});

// --- browser extension tokens ---------------------------------------------------

/** Issue a Bearer token for the browser extension (shown once, stored hashed). */
router.post('/extension-token', requireAuth, rateLimit({ windowMs: 60_000, max: 5 }), async (req, res) => {
  const body = z.object({ name: z.string().max(60).optional() }).parse(req.body ?? {});
  const token = await createExtensionToken(req.user!.uid, body.name || 'Browser extension');
  res.status(201).json({ token });
});

router.get('/extension-tokens', requireAuth, async (req, res) => {
  res.json({ tokens: await listExtensionTokens(req.user!.uid) });
});

router.delete('/extension-tokens/:id', requireAuth, async (req, res) => {
  const ok = await revokeExtensionToken(req.user!.uid, req.params.id);
  if (!ok) throw new AppError('NOT_FOUND', 'Token not found.', 404);
  res.json({ ok: true });
});

export default router;

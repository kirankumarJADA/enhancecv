import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb, newId } from '../db/db';
import { signSession, requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { config } from '../config';

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

router.post('/signup', rateLimit({ windowMs: 15 * 60_000, max: 20 }), (req, res) => {
  const body = signupSchema.parse(req.body);
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email);
  if (existing) throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
  const id = newId('usr');
  const hash = bcrypt.hashSync(body.password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(id, body.email, hash, body.name);
  setSession(res, id, body.email);
  res.status(201).json({ user: { id, email: body.email, name: body.name, onboarded: false } });
});

router.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 30, keyFn: (r: Request) => String(r.body?.email || r.ip) }), (req, res) => {
  const body = loginSchema.parse(req.body);
  const db = getDb();
  const row = db.prepare('SELECT id, email, password_hash, name, onboarded FROM users WHERE email = ?').get(body.email) as
    | { id: string; email: string; password_hash: string; name: string; onboarded: number }
    | undefined;
  if (!row || !bcrypt.compareSync(body.password, row.password_hash)) {
    throw new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.', 401);
  }
  setSession(res, row.id, row.email);
  res.json({ user: { id: row.id, email: row.email, name: row.name, onboarded: !!row.onboarded } });
});

router.post('/logout', (req, res) => {
  res.clearCookie(config.cookieName, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id, email, name, target_role, onboarded FROM users WHERE id = ?').get(req.user!.uid) as
    | { id: string; email: string; name: string; target_role: string; onboarded: number }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Account not found.', 404);
  res.json({ user: { id: row.id, email: row.email, name: row.name, targetRole: row.target_role, onboarded: !!row.onboarded } });
});

export default router;

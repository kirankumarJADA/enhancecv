import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id, email, name, target_role, created_at FROM users WHERE id = ?').get(req.user!.uid) as
    | { id: string; email: string; name: string; target_role: string; created_at: string }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Account not found.', 404);
  res.json({ profile: { id: row.id, email: row.email, name: row.name, targetRole: row.target_role, memberSince: row.created_at } });
});

router.put('/', requireAuth, (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1).max(80),
    targetRole: z.string().trim().max(120),
  }).parse(req.body);
  const db = getDb();
  db.prepare('UPDATE users SET name = ?, target_role = ? WHERE id = ?').run(body.name, body.targetRole, req.user!.uid);
  res.json({ ok: true });
});

router.put('/password', requireAuth, (req, res) => {
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  }).parse(req.body);
  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.uid) as { password_hash: string } | undefined;
  if (!row || !bcrypt.compareSync(body.currentPassword, row.password_hash)) {
    throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.', 401);
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(body.newPassword, 10), req.user!.uid);
  res.json({ ok: true });
});

export default router;

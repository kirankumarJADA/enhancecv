import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb, TS_TEXT } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const result = await db.query(
    `SELECT id, email, name, target_role, ${TS_TEXT('created_at')} AS created_at
     FROM users
     WHERE id = $1`,
    [req.user!.uid],
  );
  const row = result.rows[0] as
    | { id: string; email: string; name: string; target_role: string; created_at: string }
    | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Account not found.', 404);
  res.json({ profile: { id: row.id, email: row.email, name: row.name, targetRole: row.target_role, memberSince: row.created_at } });
});

router.put('/', requireAuth, async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1).max(80),
    targetRole: z.string().trim().max(120),
  }).parse(req.body);
  const db = getDb();
  await db.query('UPDATE users SET name = $1, target_role = $2 WHERE id = $3', [body.name, body.targetRole, req.user!.uid]);
  res.json({ ok: true });
});

router.put('/password', requireAuth, async (req, res) => {
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  }).parse(req.body);
  const db = getDb();
  const row = (await db.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user!.uid],
  )).rows[0] as { password_hash: string } | undefined;
  if (!row || !bcrypt.compareSync(body.currentPassword, row.password_hash)) {
    throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.', 401);
  }
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(body.newPassword, 10), req.user!.uid]);
  res.json({ ok: true });
});

export default router;

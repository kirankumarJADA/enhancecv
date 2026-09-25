// Secure single-use tokens for email verification and password reset.
//
// - Tokens are generated with crypto.randomBytes (256-bit entropy).
// - ONLY the SHA-256 hash is stored; the raw token exists in the emailed link.
// - Tokens expire and are invalidated after use.

import crypto from 'node:crypto';
import { getDb } from '../db/db';

const VERIFICATION_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newRawToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function insertToken(table: 'email_verification_tokens' | 'password_reset_tokens', userId: string, ttlHours: number): Promise<string> {
  const raw = newRawToken();
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  // Invalidate any previous outstanding tokens for this user.
  await getDb().query(`UPDATE ${table} SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  await getDb().query(
    `INSERT INTO ${table} (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [`tok_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`, userId, hashToken(raw), expiresAt],
  );
  return raw;
}

async function consumeToken(
  table: 'email_verification_tokens' | 'password_reset_tokens',
  raw: string
): Promise<{ userId: string } | { error: 'invalid' | 'expired' }> {
  const res = await getDb().query(
    `SELECT id, user_id, expires_at, used_at FROM ${table} WHERE token_hash = $1 LIMIT 1`,
    [hashToken(raw)],
  );
  const row = res.rows[0] as { id: string; user_id: string; expires_at: string | Date; used_at: string | Date | null } | undefined;
  if (!row || row.used_at) return { error: 'invalid' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { error: 'expired' };
  await getDb().query(`UPDATE ${table} SET used_at = NOW() WHERE id = $1`, [row.id]);
  return { userId: row.user_id };
}

// --- email verification ----------------------------------------------------

export async function createVerificationToken(userId: string): Promise<string> {
  return insertToken('email_verification_tokens', userId, VERIFICATION_TTL_HOURS);
}

export async function consumeVerificationToken(raw: string): Promise<{ userId: string } | { error: 'invalid' | 'expired' }> {
  return consumeToken('email_verification_tokens', raw);
}

export async function markEmailVerified(userId: string): Promise<void> {
  await getDb().query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
}

// --- password reset ----------------------------------------------------------

export async function createPasswordResetToken(userId: string): Promise<string> {
  return insertToken('password_reset_tokens', userId, RESET_TTL_HOURS);
}

export async function consumePasswordResetToken(raw: string): Promise<{ userId: string } | { error: 'invalid' | 'expired' }> {
  return consumeToken('password_reset_tokens', raw);
}

// --- browser extension tokens ------------------------------------------------
// Long-lived (until revoked) tokens used by the browser extension to call the
// API with `Authorization: Bearer <token>`. Stored hashed; shown once.

export async function createExtensionToken(userId: string, name: string): Promise<string> {
  const raw = `cvt_${crypto.randomBytes(32).toString('hex')}`;
  await getDb().query(
    'INSERT INTO extension_tokens (id, user_id, token_hash, name) VALUES ($1, $2, $3, $4)',
    [`ext_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`, userId, hashToken(raw), name.slice(0, 60)],
  );
  return raw;
}

export async function verifyExtensionToken(raw: string): Promise<string | null> {
  const res = await getDb().query(
    'SELECT user_id FROM extension_tokens WHERE token_hash = $1 LIMIT 1',
    [hashToken(raw)],
  );
  const row = res.rows[0] as { user_id: string } | undefined;
  if (!row) return null;
  void getDb().query('UPDATE extension_tokens SET last_used_at = NOW() WHERE token_hash = $1', [hashToken(raw)]).catch(() => {});
  return row.user_id;
}

export async function listExtensionTokens(userId: string): Promise<{ id: string; name: string; created_at: string; last_used_at: string | null }[]> {
  const res = await getDb().query(
    `SELECT id, name, to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS created_at,
            to_char(last_used_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS last_used_at
     FROM extension_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return res.rows as { id: string; name: string; created_at: string; last_used_at: string | null }[];
}

export async function revokeExtensionToken(userId: string, id: string): Promise<boolean> {
  const res = await getDb().query('DELETE FROM extension_tokens WHERE id = $1 AND user_id = $2', [id, userId]);
  return (res.rowCount || 0) > 0;
}

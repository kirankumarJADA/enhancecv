// Per-device session records backing server-side session revocation.
//
// A session JWT carries a `jti` claim identifying exactly ONE device sign-in.
// This module owns the persistent side of that: creating the record on login,
// looking it up on every authenticated request, and revoking it.
//
// Two revocation levels, deliberately independent:
//
//   per-device — revoke a single session id. A normal logout does only this,
//                so signing out on one device leaves the others signed in.
//   per-user   — revoke every session for a user AND bump
//                `users.session_version`. Password reset and password change
//                do this; it is also the primitive behind "log out of all
//                devices". Because the version is bumped as well, a token
//                cannot survive even if its session row was never revoked,
//                so the two mechanisms cover each other.

import crypto from 'node:crypto';
import { getDb, type Queryable } from '../db/db';
import { config } from '../config';

/** The stored state of a presented session. */
export interface SessionState {
  /** users.session_version for the owning user at the time of the lookup. */
  userVersion: number;
  revoked: boolean;
  expired: boolean;
}

function sessionTtlMs(): number {
  return config.sessionDays * 24 * 60 * 60 * 1000;
}

function newSessionId(): string {
  return `sess_${crypto.randomBytes(16).toString('hex')}`;
}

/** Create a session record and return its id, to be carried as the token's `jti`. */
export async function createUserSession(userId: string): Promise<string> {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await getDb().query(
    'INSERT INTO user_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
    [id, userId, expiresAt],
  );
  return id;
}

/**
 * Look up a session by id, scoped to its owner.
 *
 * Returns null when the session does not exist — never issued, or the owning
 * user has since been deleted. Errors deliberately PROPAGATE: the caller must
 * treat "the check could not run" as "cannot authorise", never as "still valid",
 * otherwise a storage outage would silently disable revocation.
 */
export async function getSessionState(sessionId: string, userId: string): Promise<SessionState | null> {
  const res = await getDb().query(
    `SELECT u.session_version AS user_version, s.revoked_at, s.expires_at
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.user_id = $2`,
    [sessionId, userId],
  );

  const row = res.rows[0] as
    | { user_version: number | string; revoked_at: string | Date | null; expires_at: string | Date }
    | undefined;
  if (!row) return null;

  return {
    userVersion: Number(row.user_version),
    revoked: row.revoked_at !== null,
    expired: new Date(row.expires_at).getTime() <= Date.now(),
  };
}

/**
 * Revoke exactly one session (this device) and nothing else.
 *
 * Returns false when there was no live session to revoke, which means it had
 * already been revoked — the desired end state either way. A database failure
 * throws, so the caller can refuse to report a successful sign-out.
 */
export async function revokeSession(sessionId: string, userId: string): Promise<boolean> {
  const res = await getDb().query(
    'UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [sessionId, userId],
  );
  return (res.rowCount || 0) > 0;
}

/**
 * Revoke every session belonging to a user and bump their session version.
 *
 * The "log out of all devices" primitive. Pass a `client` to take part in a
 * caller's transaction, so a credential change and its revocations commit
 * together or not at all.
 */
export async function revokeAllSessions(userId: string, client?: Queryable): Promise<void> {
  const db = client ?? getDb();
  await db.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [userId]);
  await db.query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

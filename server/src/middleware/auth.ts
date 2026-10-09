import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config, getJwtSecret } from '../config';
import { getSessionState, type SessionState } from '../lib/sessions';
import { captureError } from '../lib/monitoring';

export interface AuthPayload {
  uid: string;
  email: string;
}

/**
 * Session claims.
 *
 * REVOCATION MODEL
 * A token is accepted only while BOTH of these still hold:
 *
 *   jti — `user_sessions.id`, identifying exactly one device sign-in. A normal
 *         logout revokes just this row, so other devices stay signed in.
 *   sv  — the owning user's `users.session_version`. A password reset or change
 *         revokes every row for that user AND bumps this counter, so a token
 *         cannot survive even if its own row was somehow left behind.
 *
 * Tokens minted before this model existed carry neither claim and are rejected,
 * so upgrading a deployment signs everybody out once.
 */
interface SessionClaims extends AuthPayload {
  /** user_sessions.id — the single device session this token belongs to. */
  jti: string;
  /** users.session_version at the moment the token was issued. */
  sv: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const SESSION_EXPIRED_BODY = {
  error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' },
} as const;

/**
 * Sign a session token bound to one session record and the user's current
 * session version. Both are required, so every caller has to state them.
 */
export function signSession(payload: AuthPayload, sessionVersion: number, sessionId: string): string {
  const claims: SessionClaims = {
    uid: payload.uid,
    email: payload.email,
    jti: sessionId,
    sv: sessionVersion,
  };
  // Sign with the same validated accessor used for verification below.
  return jwt.sign(claims, getJwtSecret(), { expiresIn: `${config.sessionDays}d` });
}

/**
 * Verify a session token and return its claims, or null when it is malformed,
 * expired, or missing a claim the revocation model depends on.
 */
function readSessionToken(token: string): SessionClaims | null {
  try {
    const claims = jwt.verify(token, getJwtSecret()) as SessionClaims;
    if (!claims) return null;
    if (typeof claims.uid !== 'string' || !claims.uid) return null;
    // No jti ⇒ issued before per-device sessions existed, or hand-crafted.
    if (typeof claims.jti !== 'string' || !claims.jti) return null;
    if (!Number.isFinite(Number(claims.sv))) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * The session a token refers to, for revocation on sign-out.
 *
 * Null for a token that cannot be trusted at all — there is then nothing to
 * revoke, and the cookie is simply discarded.
 */
export function sessionRefFromToken(token: string | undefined): { uid: string; sessionId: string } | null {
  if (!token) return null;
  const claims = readSessionToken(token);
  return claims ? { uid: claims.uid, sessionId: claims.jti } : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[config.cookieName];

  if (!token) {
    // Browser extension path: Authorization: Bearer <extension token>.
    // Extension tokens are a separate credential with their own per-token
    // revocation (DELETE /api/auth/extension-tokens/:id), so device sessions
    // deliberately do not apply to them.
    const header = req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      try {
        const { verifyExtensionToken } = await import('../lib/tokens');
        const uid = await verifyExtensionToken(header.slice(7).trim());
        if (uid) {
          req.user = { uid, email: '' };
          next();
          return;
        }
      } catch (err) {
        // Fall through to 401 rather than leaking storage errors.
        captureError(err, { code: 'EXTENSION_TOKEN_CHECK_FAILED', route: req.path });
      }
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid API token.' } });
      return;
    }
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } });
    return;
  }

  const claims = readSessionToken(token);
  if (!claims) {
    res.status(401).json(SESSION_EXPIRED_BODY);
    return;
  }

  // Server-side revocation check. A storage failure must DENY the request: a
  // check that could not run must never be treated as "session still valid",
  // otherwise an outage would silently disable every revocation mechanism.
  let state: SessionState | null = null;
  try {
    state = await getSessionState(claims.jti, claims.uid);
  } catch (err) {
    captureError(err, { code: 'AUTH_REVOCATION_CHECK_FAILED', route: req.path });
    res.status(503).json({
      error: {
        code: 'AUTH_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable. Please try again.',
      },
    });
    return;
  }

  if (!state || state.revoked || state.expired || Number(claims.sv) !== state.userVersion) {
    res.status(401).json(SESSION_EXPIRED_BODY);
    return;
  }

  req.user = { uid: claims.uid, email: claims.email };
  next();
}

/**
 * Admin authorisation — enforced SERVER-SIDE against the users.role column.
 * Frontend state is never trusted. Normal users receive 403.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const { getDb } = await import('../db/db');
      const row = (await getDb().query('SELECT role FROM users WHERE id = $1', [req.user!.uid])).rows[0] as
        | { role: string }
        | undefined;
      if (!row || row.role !== 'ADMIN') {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Administrator access is required.' } });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  })();
}

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthPayload {
  uid: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signSession(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[config.cookieName];
  if (!token) {
    // Browser extension path: Authorization: Bearer <extension token>
    const header = req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      void (async () => {
        try {
          const { verifyExtensionToken } = await import('../lib/tokens');
          const uid = await verifyExtensionToken(header.slice(7).trim());
          if (uid) {
            req.user = { uid, email: '' };
            next();
            return;
          }
        } catch {
          // fall through to 401
        }
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid API token.' } });
      })();
      return;
    }
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' } });
  }
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

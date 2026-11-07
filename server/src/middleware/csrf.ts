import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errors';
import { config } from '../config';
import { allowedOrigins } from '../lib/cors';

export const CSRF_COOKIE_NAME = 'ecv_csrf';

/**
 * Cookie options for CSRF double-submit token.
 * Needs httpOnly: false so client JS can read it if needed (same-origin).
 * In production cross-site, browsers need sameSite: 'none' and secure: true.
 */
export function csrfCookieOptions(isProd: boolean) {
  return {
    httpOnly: false,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    secure: isProd,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

/**
 * Generate a new cryptographically random 32-byte (64 hex characters) CSRF token.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Constant-time comparison of two strings to prevent timing attacks.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Ensure an ecv_csrf cookie is set on the response, returning the token value.
 */
export function ensureCsrfCookie(req: Request | undefined, res: Response): string {
  // Check if token was already resolved during this request lifecycle
  if (res.locals?.csrfToken) {
    return res.locals.csrfToken;
  }
  const existing = req?.cookies?.[CSRF_COOKIE_NAME];
  if (typeof existing === 'string' && existing.length === 64 && /^[0-9a-fA-F]+$/.test(existing)) {
    if (res.locals) res.locals.csrfToken = existing;
    return existing;
  }
  const newToken = generateCsrfToken();
  if (req) {
    if (!req.cookies) (req as any).cookies = {};
    req.cookies[CSRF_COOKIE_NAME] = newToken;
  }
  if (res.locals) {
    res.locals.csrfToken = newToken;
  }
  res.cookie(CSRF_COOKIE_NAME, newToken, csrfCookieOptions(config.isProd));
  return newToken;
}

/**
 * Validate Origin / Referer against allowedOrigins().
 * Returns true if valid or if neither is present (e.g. non-browser API client).
 * Returns false if present and untrusted.
 */
export function isAllowedOriginOrReferer(req: Request): boolean {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowed = allowedOrigins().map((o) => o.replace(/\/+$/, '').toLowerCase());

  if (origin && typeof origin === 'string') {
    const norm = origin.replace(/\/+$/, '').toLowerCase();
    if (!allowed.includes(norm)) {
      return false;
    }
  } else if (referer && typeof referer === 'string') {
    try {
      const parsed = new URL(referer).origin.toLowerCase();
      if (!allowed.includes(parsed)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * CSRF Protection Middleware.
 *
 * Protects state-changing operations against Cross-Site Request Forgery:
 * 1. Safe HTTP methods (GET, HEAD, OPTIONS) are exempt; they vend/refresh the `ecv_csrf` cookie.
 * 2. If authenticated via `Authorization: Bearer <token>`, cookie CSRF does not apply (bypass).
 * 3. Enforces strict Origin / Referer verification against `allowedOrigins()`.
 * 4. When an ambient cookie session (`ecv_session`) is present, double-submit verification
 *    is enforced: the `X-CSRF-Token` header must match the `ecv_csrf` cookie via `crypto.timingSafeEqual`.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());

  if (isSafeMethod) {
    ensureCsrfCookie(req, res);
    return next();
  }

  // 1. Bearer token authorization bypasses cookie CSRF (non-ambient credential)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return next();
  }

  // 2. Strict Origin / Referer validation for state-changing requests
  if (!isAllowedOriginOrReferer(req)) {
    throw new AppError('CSRF_ERROR', 'Cross-origin request rejected.', 403);
  }

  // 3. Double-submit cookie verification if ambient session cookie is present
  const sessionCookie = req.cookies?.[config.cookieName];
  if (sessionCookie) {
    const headerToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

    if (
      typeof headerToken !== 'string' ||
      typeof cookieToken !== 'string' ||
      !headerToken ||
      !cookieToken ||
      !timingSafeEqualString(headerToken, cookieToken)
    ) {
      throw new AppError('CSRF_ERROR', 'Invalid or missing CSRF token.', 403);
    }
  }

  next();
}

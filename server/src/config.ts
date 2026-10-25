/**
 * Public, development-only session signing fallback.
 *
 * It exists so `npm run dev` works with zero configuration. It is deliberately
 * REJECTED in production: the value is published in this repository, so anyone
 * could forge a session cookie for any account if it ever signed real sessions.
 */
export const DEV_FALLBACK_JWT_SECRET = 'dev-only-secret-change-me-in-production';

/**
 * Documented minimum strength for the production session signing secret.
 *
 * 32 characters is the floor we accept. Generate a real one with something like
 * `openssl rand -base64 48`. Unset, empty, too-short and fallback values are all
 * refused before the production server starts serving requests.
 */
export const MIN_JWT_SECRET_LENGTH = 32;

export type JwtSecretProblem = 'missing' | 'placeholder' | 'too-short';

export interface JwtSecretCheck {
  ok: boolean;
  problem?: JwtSecretProblem;
  /** Safe to log or throw: never contains the secret value itself. */
  message?: string;
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  sessionDays: 7,
  cookieName: 'ecv_session',
  isProd: process.env.NODE_ENV === 'production',
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || String(8 * 1024 * 1024), 10),
  webDist: process.env.WEB_DIST || '',
  // Public base URL of the web app — used to build email verification and
  // password-reset links. Falls back to the API origin in dev. The value is
  // trimmed so a whitespace-only APP_URL can never masquerade as configured;
  // in production the startup gate (assertAppUrlIsSafe) additionally requires
  // a real https frontend URL.
  appUrl: ((process.env.APP_URL || '').trim() || `http://localhost:${process.env.PORT || 5173}`).replace(/\/$/, ''),
};

export type AppUrlProblem = 'missing' | 'invalid' | 'localhost';

export interface AppUrlCheck {
  ok: boolean;
  problem?: AppUrlProblem;
  /** Safe to log or throw: never contains the configured value itself. */
  message?: string;
}

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  );
}

function parseAppUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Pure validation of the public web-app URL.
 *
 * Email verification and password-reset links are built from APP_URL. In
 * production an absent, non-https or localhost value produces links that are
 * useless to the recipient (or leak tokens to a local listener), so it is
 * refused. The configured value itself is never echoed back in `message`.
 */
export function checkAppUrl(raw: string | undefined, isProd: boolean): AppUrlCheck {
  if (!isProd) return { ok: true };

  const value = (raw ?? '').trim();
  if (!value) {
    return {
      ok: false,
      problem: 'missing',
      message: 'APP_URL must be set when NODE_ENV=production — email verification and password-reset links are built from it.',
    };
  }

  const parsed = parseAppUrl(value);
  if (!parsed) {
    return {
      ok: false,
      problem: 'invalid',
      message: 'APP_URL must be a valid absolute https:// URL when NODE_ENV=production.',
    };
  }

  // Diagnose localhost first: "http://localhost:10000" is more precisely a
  // localhost misconfiguration than a plain https violation.
  if (isLocalHostname(parsed.hostname)) {
    return {
      ok: false,
      problem: 'localhost',
      message: 'APP_URL must point to the live frontend, not localhost, when NODE_ENV=production.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      problem: 'invalid',
      message: 'APP_URL must use https:// when NODE_ENV=production — reset links carry single-use tokens.',
    };
  }

  return { ok: true };
}

/**
 * Startup gate. Production refuses to boot when APP_URL is missing, not
 * https, or points to localhost — the same fail-fast convention as the JWT
 * secret gate — so a misconfigured deployment can never silently email
 * unusable (localhost) action links. No-op in development.
 */
export function assertAppUrlIsSafe(): void {
  const check = checkAppUrl(process.env.APP_URL, config.isProd);
  if (!check.ok) {
    throw new Error(`APP_URL configuration error: ${check.message}`);
  }
}

/**
 * Runtime re-check for request paths that create token-bearing emails
 * (defense in depth behind the startup gate): false when production is
 * running with an APP_URL the startup gate would have rejected.
 */
export function isSafeAppUrl(): boolean {
  return checkAppUrl(process.env.APP_URL, config.isProd).ok;
}

/**
 * Pure validation of the session signing secret.
 *
 * Returns a verdict plus a human-readable reason. The secret value is never
 * echoed back in `message`, so it is safe to surface in a startup error or log.
 */
export function checkJwtSecret(raw: string | undefined, isProd: boolean): JwtSecretCheck {
  // Development is unconstrained: the published fallback keeps local flows
  // working with no configuration. Production is the only mode that matters.
  if (!isProd) return { ok: true };

  const secret = (raw ?? '').trim();

  if (!secret) {
    return {
      ok: false,
      problem: 'missing',
      message: 'JWT_SECRET must be set when NODE_ENV=production.',
    };
  }
  if (secret === DEV_FALLBACK_JWT_SECRET) {
    return {
      ok: false,
      problem: 'placeholder',
      message: 'JWT_SECRET must not be the built-in development fallback when NODE_ENV=production.',
    };
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    return {
      ok: false,
      problem: 'too-short',
      message: `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters when NODE_ENV=production.`,
    };
  }
  return { ok: true };
}

/**
 * Startup gate.
 *
 * Call this before serving any request. In production it throws (with a
 * secret-free message) when the session signing key is missing, empty, the
 * published development fallback, or shorter than the documented minimum, so a
 * misconfigured deployment fails fast instead of silently signing sessions with
 * a key an attacker already knows.
 *
 * In development it is a no-op.
 */
export function assertJwtSecretIsSafe(): void {
  const check = checkJwtSecret(process.env.JWT_SECRET, config.isProd);
  if (!check.ok) {
    throw new Error(`JWT configuration error: ${check.message}`);
  }
}

/**
 * The single source of truth for the session signing secret, used by BOTH
 * session signing and session verification.
 *
 * Development returns the configured value or the convenient published
 * fallback. Production re-validates on every call and throws rather than
 * returning an unsafe key, so signing/verification can never run with a secret
 * that the startup gate would have rejected.
 */
export function getJwtSecret(): string {
  if (!config.isProd) {
    return (process.env.JWT_SECRET || '').trim() || DEV_FALLBACK_JWT_SECRET;
  }
  const check = checkJwtSecret(process.env.JWT_SECRET, true);
  if (!check.ok) {
    throw new Error(`JWT configuration error: ${check.message}`);
  }
  return (process.env.JWT_SECRET || '').trim();
}

/** Parse a comma-separated env list. */
export function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

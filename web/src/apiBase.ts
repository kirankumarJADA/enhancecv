// Pure API-base helpers (no DOM, no side effects) — shared by the fetch
// client and unit tests on both sides of the repo.

/**
 * Strip trailing slashes; empty when unconfigured (local development keeps
 * same-origin `/api/...` requests through the Vite dev proxy).
 */
export function resolveApiBase(configuredUrl: string | undefined): string {
  return (configuredUrl ?? '').replace(/\/+$/, '');
}

/**
 * Join the configured base + /api + path without producing '//', '/api/api'
 * or missing slashes (the base is trimmed defensively too). External URLs
 * pass through untouched.
 */
export function apiUrl(path: string, base: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const withoutApiPrefix = cleanPath.replace(/^\/api(?=\/)/i, '');
  return `${cleanBase}/api${withoutApiPrefix}`;
}

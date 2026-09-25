export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me-in-production',
  sessionDays: 7,
  cookieName: 'ecv_session',
  isProd: process.env.NODE_ENV === 'production',
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || String(8 * 1024 * 1024), 10),
  webDist: process.env.WEB_DIST || '',
  // Public base URL of the web app — used to build email verification and
  // password-reset links. Falls back to the API origin in dev.
  appUrl: (process.env.APP_URL || `http://localhost:${process.env.PORT || 5173}`).replace(/\/$/, ''),
};

/** Parse a comma-separated env list. */
export function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

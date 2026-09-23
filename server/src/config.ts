export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me-in-production',
  sessionDays: 7,
  cookieName: 'ecv_session',
  isProd: process.env.NODE_ENV === 'production',
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || String(8 * 1024 * 1024), 10),
  webDist: process.env.WEB_DIST || '',
};

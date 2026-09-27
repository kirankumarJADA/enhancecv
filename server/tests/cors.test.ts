// Production connection tests: credentialed CORS allow-list, cross-site
// session cookies, preflight handling, and full auth flow with Origin set —
// i.e. the Vercel → Render architecture, verified against real PostgreSQL.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app';
import { getDb } from '../src/db/db';
import { sessionCookieOptions } from '../src/routes/auth';
// Mirrors web/src/apiBase.ts (kept in sync; the web vitest suite tests the
// real module — see web/tests/apiBase.test.ts). Duplicated here so the server
// tsconfig rootDir is not violated.
function resolveApiBase(configuredUrl: string | undefined): string {
  return (configuredUrl ?? '').replace(/\/+$/, '');
}
function apiUrl(path: string, base: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const withoutApiPrefix = cleanPath.replace(/^\/api(?=\/)/i, '');
  return `${cleanBase}/api${withoutApiPrefix}`;
}

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://postgres:ecvlocal@localhost:5434/enhancecv_test';
process.env.JWT_SECRET = 'test-secret';
// Production frontend origin — read per-request by the CORS layer.
process.env.FRONTEND_URL = 'https://enhancecv-orpin.vercel.app';

const PROD_ORIGIN = 'https://enhancecv-orpin.vercel.app';
const PROD_ORIGIN_SLASH = 'https://enhancecv-orpin.vercel.app/'; // trailing slash must match too

let app: Express;

beforeAll(async () => {
  app = await buildApp();
  await getDb().query('TRUNCATE users CASCADE');
});

afterAll(() => {
  delete process.env.FRONTEND_URL;
});

describe('CORS allow-list', () => {
  it('reflects the configured frontend origin with credentials on real requests', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', PROD_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('matches the configured origin with a trailing slash', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', PROD_ORIGIN_SLASH);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN_SLASH);
  });

  it('allows local development origins', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('emits NO Access-Control-Allow-Origin for unapproved origins', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('never uses a wildcard origin', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('lets requests without an Origin header through (curl, webhooks)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('CORS preflight', () => {
  it('answers OPTIONS for signup with the required headers', async () => {
    const res = await request(app)
      .options('/api/auth/signup')
      .set('Origin', PROD_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain('content-type');
  });

  it('answers preflight for authenticated requests with the Authorization header', async () => {
    const res = await request(app)
      .options('/api/master')
      .set('Origin', PROD_ORIGIN)
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain('authorization');
  });

  it('rejects preflight from unapproved origins (no ACAO header)', async () => {
    const res = await request(app)
      .options('/api/auth/signup')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Cross-origin auth flow (production cookie semantics)', () => {
  const email = `cors@test.dev`;

  it('signup sets an HttpOnly session cookie usable cross-site', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Origin', PROD_ORIGIN)
      .send({ name: 'CORS Tester', email, password: 'password123' });
    expect(res.status).toBe(201);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax'); // dev/test build → lax; prod build → None (see unit test)
  });

  it('login works with Origin set and the cookie authenticates the next request', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', PROD_ORIGIN)
      .send({ email, password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(login.headers['access-control-allow-credentials']).toBe('true');

    const me = await request(app)
      .get('/api/auth/me')
      .set('Origin', PROD_ORIGIN)
      .set('Cookie', (login.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; '));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
  });

  it('logout works with Origin set', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
    const cookie = (login.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    const out = await request(app)
      .post('/api/auth/logout')
      .set('Origin', PROD_ORIGIN)
      .set('Cookie', cookie);
    expect(out.status).toBe(200);
    expect(out.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
  });

  it('uploads and PDF download still work with Origin + credentials', async () => {
    const a = request.agent(app);
    await a.post('/api/auth/signup').send({ name: 'CORS Upload', email: 'corsup@test.dev', password: 'password123' });

    const cv = Buffer.from(
      'Upload Tester\nup@test.dev\n\nSUMMARY\nBackend engineer with Java experience.\n\nSKILLS\nJava, Git\n',
      'utf8',
    );
    const upload = await a.post('/api/import/resume')
      .set('Origin', PROD_ORIGIN)
      .attach('file', cv, 'cv.txt');
    expect(upload.status).toBe(200);

    const master = await a.put('/api/master').send({ resume: upload.body.resume });
    expect(master.status).toBe(201);

    const pdf = await a.get(`/api/resumes/${master.body.id}/pdf`).set('Origin', PROD_ORIGIN);
    expect(pdf.status).toBe(200);
    expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
  });
});

describe('Production origin without FRONTEND_URL (deployed-failure regression)', () => {
  it('still allows the built-in production origin when FRONTEND_URL is unset', async () => {
    delete process.env.FRONTEND_URL;
    try {
      const res = await request(app)
        .post('/api/auth/signup')
        .set('Origin', PROD_ORIGIN)
        .send({ name: 'Built-in', email: 'builtin@test.dev', password: 'password123' });
      expect([201, 409]).toContain(res.status); // created, or already exists from earlier tests
      expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      process.env.FRONTEND_URL = PROD_ORIGIN;
    }
  });
});

describe('CORS headers on success and error responses', () => {
  it('actual POST /api/auth/signup carries ACAO + credentials', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Origin', PROD_ORIGIN)
      .send({ name: 'CORS POST', email: 'corspost@test.dev', password: 'password123' });
    expect([201, 409]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('API validation-error responses (400) still include ACAO', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Origin', PROD_ORIGIN)
      .send({ name: '', email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('authentication-error responses (401) still include ACAO', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', PROD_ORIGIN)
      .send({ email: 'corspost@test.dev', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('not-found responses (404) still include ACAO', async () => {
    const res = await request(app)
      .get('/api/definitely-not-a-route')
      .set('Origin', PROD_ORIGIN);
    expect(res.status).toBe(404);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
  });
});

describe('Cookie options by environment', () => {
  it('production: SameSite=None + Secure (cross-site Vercel → Render)', () => {
    const opts = sessionCookieOptions(true);
    expect(opts.sameSite).toBe('none');
    expect(opts.secure).toBe(true);
    expect(opts.httpOnly).toBe(true);
  });

  it('development: SameSite=Lax, not forced Secure (same-origin localhost)', () => {
    const opts = sessionCookieOptions(false);
    expect(opts.sameSite).toBe('lax');
    expect(opts.secure).toBe(false);
  });
});

// ------------------------------------------------- frontend base helpers ----

describe('Frontend API base resolution', () => {
  it('local development: empty VITE_API_URL keeps requests same-origin (/api/...)', () => {
    expect(resolveApiBase(undefined)).toBe('');
    expect(resolveApiBase('')).toBe('');
    expect(apiUrl('/auth/signup', '')).toBe('/api/auth/signup');
  });

  it('production: VITE_API_URL prefixes every request', () => {
    expect(resolveApiBase('https://curevo-ai.onrender.com')).toBe('https://curevo-ai.onrender.com');
    expect(apiUrl('/auth/signup', 'https://curevo-ai.onrender.com')).toBe('https://curevo-ai.onrender.com/api/auth/signup');
    expect(apiUrl('/auth/signup', 'https://curevo-ai.onrender.com/')).toBe('https://curevo-ai.onrender.com/api/auth/signup'); // trailing slash trimmed
  });

  it('never produces //, /api/api, or missing slashes', () => {
    expect(apiUrl('/auth/signup', 'https://curevo-ai.onrender.com///')).toBe('https://curevo-ai.onrender.com/api/auth/signup');
    expect(apiUrl('auth/signup', '')).toBe('/api/auth/signup');
    expect(apiUrl('/api/auth/signup', 'https://curevo-ai.onrender.com')).toBe('https://curevo-ai.onrender.com/api/auth/signup'); // no /api/api
  });

  it('passes external URLs through untouched', () => {
    expect(apiUrl('https://external.example.com/file.pdf', 'https://curevo-ai.onrender.com')).toBe('https://external.example.com/file.pdf');
  });
});

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import './middleware/async'; // async route rejections → central errorHandler
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/http';
import { rateLimit } from './middleware/rateLimit';
import { newRequestId } from './lib/monitoring';
import { corsOriginCheck } from './lib/cors';
import { csrfProtection } from './middleware/csrf';
import { getAiProvider } from './ai/provider';
import publicRoutes from './routes/public';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import masterRoutes from './routes/master';
import resumesRoutes from './routes/resumes';

export async function buildApp(): Promise<express.Express> {
  getAiProvider(); // initialise the AI provider singleton from env (when configured)

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: config.isProd ? undefined : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));

  // Correlation id for every request (returned in error responses, used in logs).
  app.use((req, res, next) => {
    (req as express.Request & { requestId?: string }).requestId = newRequestId();
    res.setHeader('X-Request-Id', (req as express.Request & { requestId?: string }).requestId!);
    next();
  });

  // CORS: the production frontend (Vercel) and the API (Render) live on
  // different origins, so browser requests need credentialed CORS. The
  // allow-list comes from FRONTEND_URL plus the local development origins —
  // never '*'. Requests without an Origin header (curl, server-to-server) pass through untouched.
  app.use(cors({
    origin: corsOriginCheck,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    maxAge: 86400,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', rateLimit({ windowMs: 60_000, max: 120 }), (_req, res) => {
    res.json({ ok: true, service: 'curevo-ai', time: new Date().toISOString() });
  });

  // Public stateless resume routes (NVIDIA Nemotron powered, in-memory, no database)
  app.use('/api/public', publicRoutes);

  // Authentication & Identity Foundation (Phase 9C) with CSRF Protection
  app.use('/api/auth', csrfProtection, authRoutes);
  app.use('/api/profile', csrfProtection, profileRoutes);

  // Persistent Master CV, Cloud Autosave & Resume Version History (Phase 9D) with CSRF Protection
  app.use('/api/master', csrfProtection, masterRoutes);
  app.use('/api/resumes', csrfProtection, resumesRoutes);

  // Future database-backed routes safely unmounted until Phase 9D / 9E:
  // - /api/master, /api/resumes, /api/dashboard, /api/ai
  // - /api/billing, /api/applications, /api/templates, /api/admin, /api/interview
  // - /api/jobs, /api/import, /api/analytics
  // These routes safely resolve to 404 NOT FOUND via notFoundHandler without attempting
  // PostgreSQL connection, session verification or account persistence.

  // Serve the built web app in production / combined mode
  if (config.webDist) {
    const dist = path.resolve(config.webDist);
    if (fs.existsSync(dist)) {
      app.use(express.static(dist));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(dist, 'index.html'));
      });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

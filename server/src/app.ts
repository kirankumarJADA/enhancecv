import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import './middleware/async'; // async route rejections → central errorHandler
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/http';
import { newRequestId } from './lib/monitoring';
import { getAiProvider } from './ai/provider';
import authRoutes from './routes/auth';
import masterRoutes from './routes/master';
import jobRoutes from './routes/jobs';
import resumeRoutes from './routes/resumes';
import dashboardRoutes from './routes/dashboard';
import profileRoutes from './routes/profile';
import aiRoutes from './routes/ai';
import billingRoutes from './routes/billing';
import applicationsRoutes from './routes/applications';
import templatesRoutes from './routes/templates';
import adminRoutes from './routes/admin';
import interviewRoutes from './routes/interview';
import discoveryRoutes from './routes/discovery';
import importRoutes from './routes/imports';
import insightsRoutes from './routes/insights';
import { getDb, initializeDatabase } from './db/db';

export async function buildApp(): Promise<express.Express> {
  getAiProvider(); // initialise the AI provider singleton from env
  getDb();
  await initializeDatabase();

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

  // Stripe webhook needs the RAW body for signature verification — mount the
  // raw parser for that path BEFORE the global JSON parser.
  app.use('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'curevo-ai', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/master', masterRoutes);
  app.use('/api/resumes', resumeRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/applications', applicationsRoutes);
  app.use('/api/templates', templatesRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/interview', interviewRoutes);
  app.use('/api/jobs', discoveryRoutes, jobRoutes); // discovery first: /discover, /saved, /import-url must not fall into /:id
  app.use('/api/import', importRoutes);
  app.use('/api/analytics', insightsRoutes);

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

import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/http';
import { initAiProvider } from './ai/provider';
import authRoutes from './routes/auth';
import masterRoutes from './routes/master';
import jobRoutes from './routes/jobs';
import resumeRoutes from './routes/resumes';
import dashboardRoutes from './routes/dashboard';
import profileRoutes from './routes/profile';
import { getDb } from './db/db';

export function buildApp(): express.Express {
  initAiProvider();
  getDb(); // initialise + migrate

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: config.isProd ? undefined : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'enhancecv', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/master', masterRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/resumes', resumeRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/profile', profileRoutes);

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

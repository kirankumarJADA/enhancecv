import fs from 'node:fs';
import path from 'node:path';

// Load .env into process.env if present
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    const cwdEnv = path.resolve(process.cwd(), '.env');
    const localEnv = path.resolve(__dirname, '../.env');
    if (fs.existsSync(cwdEnv)) {
      (process as any).loadEnvFile(cwdEnv);
    } else if (fs.existsSync(localEnv)) {
      (process as any).loadEnvFile(localEnv);
    }
  }
} catch {
  // Ignore in environments without .env
}

import { config, assertJwtSecretIsSafe } from './config';
import { buildApp } from './app';

async function main(): Promise<void> {
  // Validate production JWT secret safety
  assertJwtSecretIsSafe();

  // Curevo AI runs 100% public, anonymous, and client-side storage first.
  // PostgreSQL is completely optional and disabled by default.
  // Schema initialization runs ONLY if ENABLE_DATABASE=true or ENABLE_PERSISTENT_DATABASE=true and DATABASE_URL is set.
  const isDbExplicitlyEnabled =
    (process.env.ENABLE_DATABASE === 'true' || process.env.ENABLE_PERSISTENT_DATABASE === 'true') &&
    Boolean(process.env.DATABASE_URL);

  if (isDbExplicitlyEnabled) {
    try {
      const { initializeDatabase } = await import('./db/db');
      await initializeDatabase();
      console.log('PostgreSQL database initialized and migrations verified successfully.');
    } catch (err: any) {
      console.warn('PostgreSQL initialization warning (public routes remain functional):', err?.message || err);
    }
  } else {
    console.log('Stateless public mode: PostgreSQL initialization skipped (zero remote database dependencies).');
  }

  const app = await buildApp();

  const server = app.listen(config.port, () => {
    console.log(`Curevo AI server listening on http://localhost:${config.port}`);
  });

  let isShuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Received ${signal}. Starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      console.warn('Graceful shutdown timed out (10s limit exceeded). Forcing process exit.');
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    server.close(async () => {
      console.log('HTTP server closed. In-flight requests drained.');
      try {
        if (isDbExplicitlyEnabled) {
          const { closeDb } = await import('./db/db');
          await closeDb();
          console.log('PostgreSQL database pool closed cleanly.');
        }
      } catch (err: any) {
        console.warn('Warning during database pool shutdown:', err?.message || err);
      }
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start Curevo AI server:', err instanceof Error ? err.message : err);
  process.exit(1);
});

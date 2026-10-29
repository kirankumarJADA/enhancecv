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

import { config } from './config';
import { buildApp } from './app';

async function main(): Promise<void> {
  const app = await buildApp();

  app.listen(config.port, () => {
    console.log(`Curevo AI server listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start Curevo AI server:', err instanceof Error ? err.message : err);
  process.exit(1);
});

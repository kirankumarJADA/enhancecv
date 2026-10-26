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

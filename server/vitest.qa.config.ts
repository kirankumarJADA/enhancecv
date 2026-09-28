import { defineConfig } from 'vitest/config';

// QA-only config: runs the real-world resume QA harness without touching the
// regression suite. Usage: npx vitest run --config vitest.qa.config.ts
export default defineConfig({
  test: {
    include: ['tests-qa/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});

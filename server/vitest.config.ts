import { defineConfig } from 'vitest/config';

// Default Vitest configuration: runs all current production suites, stateless API tests,
// ATS audit engine, PDF compiler, and Truth Guard verification.
//
// Legacy PostgreSQL integration suites are separated and run via:
//   npm run test:integration (vitest.integration.config.ts)
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Legacy PostgreSQL-dependent integration suites:
      'tests/api.test.ts',
      'tests/career.test.ts',
      'tests/db-pool.test.ts',
      'tests/features.test.ts',
      'tests/security-reset.test.ts',
      'tests/security-session.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});

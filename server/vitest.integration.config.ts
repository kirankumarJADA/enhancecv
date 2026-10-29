import { defineConfig } from 'vitest/config';

// Dedicated integration test config for legacy PostgreSQL-dependent suites.
// These suites test the stateful user accounts platform (signup, session revocation,
// billing webhooks, PostgreSQL connection pools) which are unmounted in the stateless
// deployment architecture.
//
// Requires local PostgreSQL running on localhost:5434 (see server/.env.example):
//   docker run -d --name ecv-pg -e POSTGRES_PASSWORD=ecvlocal -e POSTGRES_DB=enhancecv_test -p 5434:5432 postgres:15-alpine
//
// Usage: npm run test:integration (or npx vitest run --config vitest.integration.config.ts)
export default defineConfig({
  test: {
    include: [
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

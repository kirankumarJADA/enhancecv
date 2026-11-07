import { defineConfig } from 'vitest/config';

// Dedicated integration test config for PostgreSQL-dependent suites.
// These suites test the user accounts platform (signup, login, session revocation,
// password resets, database connection pools, migrations) against real PostgreSQL.
//
// Requires local PostgreSQL running on localhost:5434 (see server/.env.example):
//   docker run -d --name ecv-pg -e POSTGRES_PASSWORD=ecvlocal -e POSTGRES_DB=enhancecv_test -p 5434:5432 postgres:15-alpine
//
// Usage: npm run test:integration (or npx vitest run --config vitest.integration.config.ts)
export default defineConfig({
  test: {
    include: [
      'tests/phase9c_auth_database.test.ts',
      'tests/security_hardening_rls_csrf.test.ts',
      'tests/phase9d_master_cv.test.ts',
      'tests/security-session.test.ts',
      'tests/security-reset.test.ts',
      'tests/db-pool.test.ts',
      'tests/api.test.ts',
      'tests/career.test.ts',
      'tests/features.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});

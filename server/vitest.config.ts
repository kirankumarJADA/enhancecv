import { defineConfig, type Plugin } from 'vitest/config';

// Vitest 2.x resolves `node:sqlite` as the npm package "sqlite" (it predates
// the built-in module). Force it to stay external so Node requires it natively.
const nodeSqliteExternal: Plugin = {
  name: 'externalize-node-sqlite',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'node:sqlite') {
      return { id, external: true };
    }
    return null;
  },
};

export default defineConfig({
  plugins: [nodeSqliteExternal],
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});

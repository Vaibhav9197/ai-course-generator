import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.js', '**/*.test.js'],
    exclude: ['node_modules/**'],
    // mongodb-memory-server downloads a binary on first run in CI.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

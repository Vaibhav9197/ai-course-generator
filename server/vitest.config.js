import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.js', '**/*.test.js'],
    exclude: ['node_modules/**'],
    testTimeout: 30_000,
    // Generous because mongodb-memory-server downloads a ~600MB MongoDB binary the
    // first time it runs on a machine (and on a cold CI cache). Subsequent runs start
    // in a second or two from the local binary cache.
    hookTimeout: 300_000,
  },
});

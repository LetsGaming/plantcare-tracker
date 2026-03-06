/**
 * vitest.config.ts
 *
 * Vitest configuration for the Plantcare Tracker Backend V2 test suite.
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use jsdom for any DOM-related tests (none currently, but future-proof)
    environment: 'node',

    // Global test helpers (describe, it, expect) available without import
    globals: true,

    // Path aliases — must mirror tsconfig.v2.json paths
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@modules': path.resolve(__dirname, 'src/modules'),
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',
        'src/**/index.ts',  // barrel files
        'src/**/*.test.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },

    // Test file patterns
    include: ['tests/**/*.test.ts'],

    // Timeout per test (ms) — generous for bcrypt operations
    testTimeout: 10_000,

    // Sequential execution for integration tests that share state
    // (session store is in-memory and global)
    pool: 'forks',

    // Reporters
    reporters: ['verbose'],
  },
});

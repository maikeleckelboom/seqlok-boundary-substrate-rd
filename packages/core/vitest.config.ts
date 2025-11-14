import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    reporters: ['default', 'verbose'],
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 70,
        lines: 75,
      },
      exclude: [
        'dist/**',
        'tests/**',
        'src/**/index.ts',
        'src/types/**',
        'src/public/**',
        'src/errors/codes/**',
      ],
    },
  },
});

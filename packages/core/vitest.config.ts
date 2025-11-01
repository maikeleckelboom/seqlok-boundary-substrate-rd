import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.ts'],
    watch: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
    },
  },
});

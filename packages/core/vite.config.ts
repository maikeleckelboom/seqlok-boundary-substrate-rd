import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    sourcemap: false,
    emptyOutDir: true,
    outDir: 'dist',
  },
  plugins: [
    dts({
      tsconfigPath: 'tsconfig.build.json',
      exclude: [
        'tests/**/*',
        'examples/**/*',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vite.config.ts',
        'vitest.config.ts',
      ],
    }),
  ],
});

import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: {
    __SEQLOK_DEV_ASSERTS__: mode === 'development' ? 'true' : 'false',
  },
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        diagnostics: 'src/diagnostics.ts',
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
    },
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        preserveModules: false,
      },
    },
  },
}));

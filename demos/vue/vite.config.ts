import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@griddle/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@griddle/vue': resolve(__dirname, '../../packages/vue/src/index.ts'),
    },
  },
  // Don't pre-bundle our workspace packages — read them straight from source
  // through the alias so edits to packages/core/src/* take effect immediately.
  optimizeDeps: { exclude: ['@griddle/core', '@griddle/vue'] },
  server: { port: 5174, open: true },
});

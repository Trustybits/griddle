import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@griddle/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@griddle/react': resolve(__dirname, '../../packages/react/src/index.ts'),
    },
  },
  // Don't pre-bundle our workspace packages — read them straight from source
  // through the alias so edits to packages/core/src/* take effect immediately.
  optimizeDeps: { exclude: ['@griddle/core', '@griddle/react'] },
  server: { port: 5173, open: true },
});

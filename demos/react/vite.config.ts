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
  server: { port: 5173, open: true },
});

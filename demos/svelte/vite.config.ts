import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import sveltePreprocess from 'svelte-preprocess';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess(),
    }),
  ],
  resolve: {
    alias: {
      '@griddle/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@griddle/svelte': resolve(__dirname, '../../packages/svelte/src/index.ts'),
    },
  },
  // Don't pre-bundle our workspace packages — read them straight from source
  // through the alias so edits to packages/core/src/* take effect immediately.
  optimizeDeps: { exclude: ['@griddle/core', '@griddle/svelte'] },
  server: { port: 5175, open: true },
});

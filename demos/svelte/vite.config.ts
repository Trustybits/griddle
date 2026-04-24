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
  server: { port: 5175, open: true },
});

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Library build for @griddle/vue.
//
// Compiles the SFCs (src/index.ts -> GriddleGrid.vue -> LoopGrid.vue) into a
// single ESM bundle in dist/. `vue` and `@griddle/core` are externalized so
// they are NOT bundled — they resolve to the consumer's own copies (both are
// peer dependencies). Type declarations are emitted separately by `vue-tsc`
// (see the "build" script in package.json), not by Vite.
//
// Kept free of `node:path`/`__dirname` on purpose: this repo installs no
// `@types/node`, and `build.lib.entry` resolves relative to the project root.
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['vue', '@griddle/core'],
    },
    sourcemap: true,
    outDir: 'dist',
  },
});

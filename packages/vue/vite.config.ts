import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Library build for @griddle/vue.
//
// Compiles the SFCs (src/index.ts -> GriddleGrid.vue -> LoopGrid.vue) and keeps
// internal helpers as secondary entries so their behavior can be unit tested
// directly. Only `.` is exposed by package.json, so those files remain private
// package implementation. `vue` and `@griddle/core` are externalized so they
// resolve to the consumer's peer dependencies. Type declarations are emitted
// separately by `vue-tsc`.
//
// Kept free of `node:path`/`__dirname` on purpose: this repo installs no
// `@types/node`, and `build.lib.entry` resolves relative to the project root.
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        animation: 'src/animation.ts',
        interaction: 'src/interaction.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['vue', '@griddle/core'],
    },
    sourcemap: true,
    outDir: 'dist',
  },
});

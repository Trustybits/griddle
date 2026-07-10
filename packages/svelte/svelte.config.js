import sveltePreprocess from 'svelte-preprocess';

// Read by `svelte-package` (and any Svelte tooling). `sveltePreprocess` strips
// TypeScript from `<script lang="ts">` blocks so the packaged components ship as
// plain-JS-script Svelte source that any Svelte 4/5 consumer can compile.
export default {
  preprocess: sveltePreprocess(),
};

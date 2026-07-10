# @griddle/svelte

Svelte bindings for [Griddle](https://github.com/Trustybits/griddle) — a headless,
zero-dependency grid/canvas engine. Provides a `<GriddleGrid />` component and a
`createGriddle()` store factory that wrap [`@griddle/core`](https://www.npmjs.com/package/@griddle/core)
with virtualized rendering, drag/resize handles, and animations.

Works with **Svelte 4 and Svelte 5** (the components are written in the portable
Svelte 4 style that Svelte 5 runs in legacy mode).

## Install

```sh
npm install @griddle/svelte @griddle/core
```

`@griddle/core` and `svelte` are **peer dependencies**. On npm 7+ the peers are
installed automatically; with Yarn or pnpm, add `@griddle/core` yourself (as
shown above). `svelte` (^4 or ^5) is expected to already be in your app.

## Usage

```svelte
<script>
  import { GriddleGrid, createGriddle } from '@griddle/svelte';

  const api = createGriddle({
    config: { cols: 12, rows: 12, unitWidth: 75, unitHeight: 75 },
    tiles: [
      { id: '1', col: 0, row: 0, w: 2, h: 2 },
      { id: '2', col: 2, row: 0, w: 1, h: 1 },
    ],
  });
</script>

<GriddleGrid {api}>
  <div slot="tile" let:tile>#{tile.id}</div>
</GriddleGrid>
```

## Loop mode (infinite gallery)

Enable `loop` in the config and the content repeats endlessly with drag-to-pan
physics — no scrollbars:

```js
const api = createGriddle({
  config: {
    cols: 12, rows: 12, unitWidth: 120, unitHeight: 120,
    loop: { enabled: true, interaction: 'pan' }, // 'pan' = viewer, 'edit' = ghost edit
  },
  tiles,
});
```

See the [main repository](https://github.com/Trustybits/griddle) for full docs.

## License

MIT © Trustybits

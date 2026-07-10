# @griddle/vue

Vue 3 bindings for [Griddle](https://github.com/Trustybits/griddle) — a headless,
zero-dependency grid/canvas engine. Provides a `<GriddleGrid />` component and a
`useGriddle()` composable that wrap [`@griddle/core`](https://www.npmjs.com/package/@griddle/core)
with virtualized rendering, drag/resize handles, and animations.

## Install

```sh
npm install @griddle/vue @griddle/core
```

`@griddle/core` and `vue` are **peer dependencies**. On npm 7+ the peers are
installed automatically; with Yarn or pnpm, add `@griddle/core` yourself (as
shown above). `vue` (>=3.3) is expected to already be in your app.

## Usage

```vue
<script setup>
import { GriddleGrid, useGriddle } from '@griddle/vue';

const api = useGriddle({
  config: { cols: 12, rows: 12, unitWidth: 75, unitHeight: 75 },
  tiles: [
    { id: '1', col: 0, row: 0, w: 2, h: 2 },
    { id: '2', col: 2, row: 0, w: 1, h: 1 },
  ],
});
</script>

<template>
  <GriddleGrid :api="api">
    <template #tile="{ tile, selected }">
      <div :data-selected="selected">#{{ tile.id }}</div>
    </template>
  </GriddleGrid>
</template>
```

## Loop mode (infinite gallery)

Enable `loop` in the config and the content repeats endlessly with drag-to-pan
physics — no scrollbars:

```ts
const api = useGriddle({
  config: {
    cols: 12, rows: 12, unitWidth: 120, unitHeight: 120,
    loop: { enabled: true, interaction: 'pan' }, // 'pan' = viewer, 'edit' = ghost edit
  },
  tiles,
});
```

`<GriddleGrid>` automatically switches to the loop renderer when
`config.loop.enabled` is `true`, so most apps never touch the loop component
directly. For advanced cases where you want to render the loop plane explicitly,
`GriddleLoopGrid` is also exported and takes the same props as `GriddleGrid`:

```js
import { GriddleLoopGrid } from '@griddle/vue';
```

See the [main repository](https://github.com/Trustybits/griddle) for full docs.

## License

MIT © Trustybits

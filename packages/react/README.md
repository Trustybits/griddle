# @griddle/react

React bindings for [Griddle](https://github.com/Trustybits/griddle) — a headless,
zero-dependency grid/canvas engine. Provides a `<GriddleGrid />` component and a
`useGriddle()` hook that wrap [`@griddle/core`](https://www.npmjs.com/package/@griddle/core)
with virtualized rendering, drag/resize handles, and animations.

## Install

```sh
npm install @griddle/react @griddle/core
```

`@griddle/core` and `react` are **peer dependencies**. On npm 7+ the peers are
installed automatically; with Yarn or pnpm, add `@griddle/core` yourself (as
shown above). `react` is expected to already be in your app (>=17).

## Usage

```tsx
import { GriddleGrid, useGriddle } from '@griddle/react';

export default function App() {
  const api = useGriddle({
    config: { cols: 12, rows: 12, unitWidth: 75, unitHeight: 75 },
    tiles: [
      { id: '1', col: 0, row: 0, w: 2, h: 2 },
      { id: '2', col: 2, row: 0, w: 1, h: 1 },
    ],
  });

  return (
    <GriddleGrid
      api={api}
      renderTile={(tile, selected) => (
        <div data-selected={selected}>#{tile.id}</div>
      )}
    />
  );
}
```

## Animation configuration

Tile repositioning and lift animations share `config.animation` with the other
Griddle adapters. Repositioning defaults to a smooth 320 ms ease-out and rapid
repacks continue from each tile's current visual position.

```tsx
const api = useGriddle({
  config: {
    cols: 12, rows: 12, unitWidth: 75, unitHeight: 75,
    animation: {
      repositionDurationMs: 320,
      repositionEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      liftDurationMs: 160,
      liftEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      respectReducedMotion: true,
    },
  },
  tiles,
});
```

Use `animation.enabled: false` to disable all adapter animations. A duration of
`0` disables only that transition.

## Loop mode (infinite gallery)

Enable `loop` in the config and the content repeats endlessly with drag-to-pan
physics — no scrollbars:

```tsx
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

```tsx
import { GriddleLoopGrid } from '@griddle/react';
```

See the [main repository](https://github.com/Trustybits/griddle) for full docs.

## License

MIT © Trustybits

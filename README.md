# Griddle

A zero-dependency grid/canvas system with a headless core and framework adapters for React, Vue, and Svelte.

Griddle separates **logic** (placement, movement, swap/push, compaction, serialization) from **UI** (rendering, drag handles, animations). You can use the core on its own in any environment — the adapters are just a thin presentation layer on top of it.

## Packages

| Package            | Purpose                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| `@griddle/core`    | Headless grid engine — pure TypeScript, no runtime dependencies.                     |
| `@griddle/react`   | React bindings: `<GriddleGrid />`, `useGriddle()`.                                   |
| `@griddle/vue`     | Vue 3 bindings: `<GriddleGrid />`, `useGriddle()`.                                   |
| `@griddle/svelte`  | Svelte bindings: `<GriddleGrid />`.                                                  |

## Concepts

- **Unit**: a fixed `unitWidth × unitHeight` cell (e.g. `75 × 75` px). Once set, never varies.
- **Grid**: `cols × rows`. Either axis can be `Infinity` for an infinite canvas.
- **Tile**: an object placed at `(col, row)` with a footprint of `w × h` units.
- **Repack**: after a drag, tiles resolve collisions via Rules 1–6 (see `docs/movement.md`).
- **Compaction** (gravity): optional backfilling of gaps toward a chosen edge.
- **Loop**: optional infinite-gallery mode — the packed content repeats endlessly in both axes with drag-to-pan physics and wheel panning, no scrollbars (see `docs/loop.md`).

## Quickstart (React)

```tsx
import { GriddleGrid, useGriddle } from '@griddle/react';

const initial = {
  config: {
    cols: 12, rows: 12,
    unitWidth: 75, unitHeight: 75,
    infiniteX: false, infiniteY: true,
    gravity: 'none',
    resizeHandles: ['se'],
    snapDuringDrag: true,
  },
  tiles: [
    { id: '1', col: 0, row: 0, w: 2, h: 2 },
    { id: '2', col: 2, row: 0, w: 1, h: 1 },
  ],
};

export default function App() {
  const api = useGriddle(initial);
  return <GriddleGrid api={api} renderTile={(t) => <div>#{t.id}</div>} />;
}
```

## Loop mode (infinite gallery)

```tsx
const api = useGriddle({
  config: {
    cols: 12, rows: 12, unitWidth: 120, unitHeight: 120,
    loop: { enabled: true, interaction: 'pan' }, // 'pan' = viewer, 'edit' = owner
  },
  tiles,
});
// <GriddleGrid api={api} renderTile={...} onCameraChange={(cam) => ...} />
```

The content repeats infinitely in both directions — drag to pan with momentum
(physics configurable) or use the wheel/trackpad; there is no native scrolling
and no scrollbars. Enabling loop auto-packs tiles into a dense block so the
repeats are seamless. In `'edit'` mode tiles stay drag-n-droppable and drop
positions wrap across the seam. See `docs/loop.md`.

## Headless (core only)

```ts
import { Grid } from '@griddle/core';

const grid = new Grid({ cols: 12, rows: 12, unitWidth: 75, unitHeight: 75 });
grid.addTile({ id: 't1', col: 0, row: 0, w: 2, h: 2 });
grid.moveTile('t1', { col: 4, row: 4 }); // runs rules 1-6
const json = grid.toJSON();
```

See `docs/movement.md` for the full movement ruleset.

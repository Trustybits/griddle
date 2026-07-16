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
- **Reflow**: explicit adaptation to a finite column count while preserving
  valid positions and gaps (see `docs/reflow.md`).
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
    loop: { enabled: true, interaction: 'pan' }, // 'pan' = viewer, 'edit' = ghost edit
  },
  tiles,
});
// <GriddleGrid api={api} renderTile={...} onCameraChange={(cam) => ...} />
```

The content repeats infinitely in both directions — drag to pan with momentum
(physics configurable) or use the wheel/trackpad; there is no native scrolling
and no scrollbars. Enabling loop auto-packs tiles into a dense block so the
repeats are seamless; `pattern: 'brick' | 'drop'` offsets the repeats for
brickwork / half-drop tessellations. In `'edit'` mode the base copy is an
ordinary editable grid while the repeats render as live, non-interactive
ghosts. See `docs/loop.md`.

## Headless (core only)

```ts
import { Grid } from '@griddle/core';

const grid = new Grid({ cols: 12, rows: 12, unitWidth: 75, unitHeight: 75 });
grid.addTile({ id: 't1', col: 0, row: 0, w: 2, h: 2 });
grid.moveTile('t1', { col: 4, row: 4 }); // runs rules 1-6
const json = grid.toJSON();
```

See `docs/movement.md` for the full movement ruleset.

## Explicit reflow

Changing `cols` with `updateConfig()` never relocates tiles. Use the versioned
reflow operation when a finite-width change should also adapt geometry:

```ts
grid.reflow({ cols: 4, strategy: 'griddle-v1' });
```

Griddle does not know about breakpoints; callers choose the target columns and
may provide generic pre-positioned geometry through `placements`. The
`griddle-v1` strategy preserves valid positions and gaps, proportionally scales
tiles that are wider than the target, resolves collisions and horizontal
overflow deterministically, and treats supplied placements as authoritative
geometry. See `docs/reflow.md`.

## Animation configuration

The React, Vue, and Svelte adapters share the same animation settings through
`GridConfig.animation`. Repositioning defaults to a smooth 320 ms ease-out and
rapid repacks continue from each tile's current visual position.

```ts
const grid = new Grid({
  cols: 12,
  rows: 12,
  unitWidth: 75,
  unitHeight: 75,
  animation: {
    enabled: true,
    repositionDurationMs: 320,
    repositionEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    liftDurationMs: 160,
    liftEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    respectReducedMotion: true,
  },
});
```

Set `enabled: false` to disable adapter animations, or set either duration to
`0` to disable only that transition. Reduced-motion preferences are honored by
default and can be opted out of with `respectReducedMotion: false`.

# Explicit Reflow

Reflow adapts ordinary in-flow tiles to a finite column count while preserving
valid geometry where possible. It is an explicit operation: changing
`GridConfig.cols` with `updateConfig()` never moves tiles.

```ts
import { Grid, reflowTiles } from '@griddle/core';

const projected = reflowTiles(tiles, {
  cols: 4,
  strategy: 'preserve-v1',
});

const changed = grid.reflow({
  cols: 4,
  strategy: 'preserve-v1',
});
```

React, Vue, and Svelte expose the same stateful call through their adapter API:

```ts
api.reflow({ cols: 4, strategy: 'preserve-v1' });
```

## Contract

- Griddle has no breakpoint model. The caller chooses when to reflow and which
  finite column count to target.
- Strategy identifiers are immutable algorithm contracts. `preserve-v1` keeps
  valid positions and gaps, resolves collisions and horizontal overflow, and
  proportionally scales tiles that are wider than the target.
- `placements` is a generic map of pre-positioned geometry. It does not imply
  breakpoints or persistence. Matching placements remain authoritative only
  when they are in bounds and mutually non-overlapping; illegal placement maps
  throw before the grid is mutated. Tiles without one are placed around them.
- The pure helper returns new tile objects and preserves consumer data and tile
  capabilities. `Grid.reflow()` operates only on in-flow tiles and leaves
  absolute and fixed tiles untouched.
- `Grid.reflow()` installs columns and geometry before emitting one `reflow`
  event. Its return value reports whether tile geometry changed.

## Reflow, packing, and gravity

These are separate operations with different intent:

- Reflow adapts a layout to an explicit finite width while preserving valid
  positions and gaps.
- `pack()` creates a dense block for loop layouts and can intentionally remove
  gaps.
- Gravity (`compactAll()`) pulls tiles toward the configured gravity target.

Call gravity after reflow when that is the desired product behavior. Reflow
does not apply gravity or dense packing automatically.

# Explicit Reflow

Reflow adapts ordinary in-flow tiles to a finite column count while preserving
valid geometry where possible. It is an explicit operation: changing
`GridConfig.cols` with `updateConfig()` never moves tiles.

```ts
import { Grid, reflowTiles } from '@griddle/core';

const projected = reflowTiles(tiles, {
  cols: 4,
  strategy: 'griddle-v1',
});

const changed = grid.reflow({
  cols: 4,
  strategy: 'griddle-v1',
});
```

React, Vue, and Svelte expose the same stateful call through their adapter API:

```ts
api.reflow({ cols: 4, strategy: 'griddle-v1' });
```

## Contract

- Griddle has no breakpoint model. The caller chooses when to reflow and which
  finite column count to target.
- Strategy identifiers are immutable algorithm contracts.
- `griddle-v1` discards source gaps and positions for automatic tiles, trims
  widths at the finite edge without changing height (the same footprint rule
  used by finite creation and resizing), and runs Griddle's dense exact/greedy
  packer.
- `preserve-v1` remains available as a compatibility strategy. It keeps valid
  positions and gaps, resolves collisions and horizontal overflow, and
  proportionally scales tiles that are wider than the target.
- `placements` is a generic map of pre-positioned geometry. It does not imply
  breakpoints or persistence. Under `griddle-v1`, matching placements are
  immutable anchors: their position and size are installed exactly, while
  automatic tiles are densely packed around them. Anchors must be in bounds and
  mutually non-overlapping; illegal placement maps throw before mutation.
- The pure helper returns new tile objects and preserves consumer data and tile
  capabilities. `Grid.reflow()` operates only on in-flow tiles and leaves
  absolute and fixed tiles untouched.
- `Grid.reflow()` installs columns and geometry before emitting one `reflow`
  event. Its return value reports whether tile geometry changed.

## Why reflow uses packing rather than movement

Movement and collision displacement have a user gesture origin and target;
creation similarly privileges the newly created tile. A breakpoint change has
neither signal, so applying directional push rules would make the result depend
on an invented direction or insertion order. `griddle-v1` therefore reuses the
gesture-independent part of Griddle's behavior: finite-edge footprint trimming
and deterministic dense packing.

When placements are supplied, packing treats them as occupied, immovable cells.
Callers that promise authoritative placements must not run gravity afterward,
because gravity is intentionally allowed to move tiles.

## Reflow, packing, and gravity

These are separate operations with different intent:

- Reflow adapts a layout to an explicit finite width according to its named
  immutable strategy.
- `pack()` creates a dense block for loop layouts and can intentionally remove
  gaps.
- Gravity (`compactAll()`) pulls tiles toward the configured gravity target.

Reflow does not apply gravity automatically. `griddle-v1` incorporates packing;
`preserve-v1` keeps packing as a separate caller choice.

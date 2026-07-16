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
- `griddle-v1` is the sole immutable reflow strategy. It keeps valid positions
  and gaps, resolves collisions and horizontal overflow deterministically, and
  proportionally scales tiles that are wider than the target.
- Automatic tiles are considered by row, then column, then stable tile ID. A
  legal, non-overlapping position is retained. A tile that must move scans
  left-to-right and then downward for the first free position, beginning at its
  current row when its horizontal geometry fits and at row 0 otherwise.
- A tile wider than the target is scaled to the target width. Its height is
  multiplied by `targetWidth / originalWidth`, rounded with `Math.round()`, and
  clamped to at least one row.
- `placements` is a generic map of pre-positioned geometry. It does not imply
  breakpoints or persistence. Matching placements are authoritative: their
  position and size are installed exactly, while missing tiles scan for the
  first free position from row 0 in input order. Unknown placement IDs do not
  create tiles. Anchors must be in bounds and mutually non-overlapping; illegal
  placement maps throw before mutation.
- The pure helper returns new tile objects and preserves consumer data and tile
  capabilities. `Grid.reflow()` operates only on in-flow tiles and leaves
  absolute and fixed tiles untouched.
- `Grid.reflow()` installs columns and geometry before emitting one `reflow`
  event. Its return value reports whether tile geometry changed.

## Why reflow is separate from movement

Movement and collision displacement have a user gesture origin and target;
creation similarly privileges the newly created tile. A breakpoint change has
neither signal, so applying directional push rules would make the result depend
on an invented direction. `griddle-v1` instead follows a deterministic
projection contract that preserves legal source geometry and relocates only
tiles that cannot remain where they are.

When placements are supplied, reflow treats them as occupied, immovable cells.
Callers that promise authoritative placements must not run gravity afterward,
because gravity is intentionally allowed to move tiles.

## Reflow, packing, and gravity

These are separate operations with different intent:

- Reflow adapts a layout to an explicit finite width according to its named
  immutable strategy.
- `pack()` creates a dense block for loop layouts and can intentionally remove
  gaps.
- Gravity (`compactAll()`) pulls tiles toward the configured gravity target.

Reflow does not apply packing or gravity automatically. Callers opt into those
separate operations only when they intentionally want to remove gaps or apply a
gravity policy.

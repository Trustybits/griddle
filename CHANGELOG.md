# Changelog

## Unreleased

## 0.1.8 - 2026-07-16

### Fixed

- Core add and resize operations now trim footprints at finite grid edges
  instead of rejecting an otherwise valid creation or resize.
- Vue draw-to-create and corner-resize previews stop at the last legal grid
  cell, preserving the opposite resize edge rather than snapping back.

### Tests

- Added regressions for finite-edge tile creation and resizing, including
  south-east and north-west Vue resize gestures.

### Compatibility

- `@griddle/react`, `@griddle/vue`, and `@griddle/svelte` 0.1.8 require
  `@griddle/core` 0.1.8 or newer within the 0.1 release line.

## 0.1.7 - 2026-07-16

### Fixed

- Vue pointer deltas are now converted from viewport coordinates into the
  grid's local coordinate space, keeping single-tile, group, pinned, and resize
  gestures aligned when a host applies CSS scaling.
- Scaled `lg` layouts now resolve the same candidate cells as their visual tile
  positions instead of lagging behind the pointer.

### Tests

- Added regressions for transformed interaction coordinates and for dropping a
  smaller tile into the center of a larger tile without overlap or overflow.

### Compatibility

- `@griddle/react`, `@griddle/vue`, and `@griddle/svelte` 0.1.7 require
  `@griddle/core` 0.1.7 or newer within the 0.1 release line.

## 0.1.6 - 2026-07-16

### Changed

- In-flow tile geometry is now a core invariant: construction, direct adds,
  config updates, snapshot loads, reflow placements, and transitions back into
  flow reject out-of-bounds or overlapping layouts atomically.
- `addTileWithDisplacement()` remains the explicit API for inserting a tile at
  an occupied position while moving neighbors into legal slots.

### Fixed

- Negative-row and overlapping explicit reflow placements can no longer enter
  the engine state.

### Compatibility

- `@griddle/react`, `@griddle/vue`, and `@griddle/svelte` 0.1.6 require
  `@griddle/core` 0.1.6 or newer within the 0.1 release line.

## 0.1.5 - 2026-07-15

### Added

- Explicit, breakpoint-agnostic reflow through `reflowTiles()` and
  `Grid.reflow()` in `@griddle/core`.
- The immutable `preserve-v1` strategy, including optional generic
  pre-positioned geometry through `placements`.
- A shared `api.reflow()` method in the React, Vue, and Svelte adapters.
- Reflow API documentation and finite-column demo controls that keep tiles
  renderable when the grid width shrinks.

### Changed

- React adapter revisions now advance monotonically for every completed core
  change, including geometry-only changes.
- Adapter test suites now verify that a completed reflow refreshes tiles,
  config, and version exactly once.

### Compatibility

- `@griddle/react`, `@griddle/vue`, and `@griddle/svelte` 0.1.5 require
  `@griddle/core` 0.1.5 or newer within the 0.1 release line.

## 0.1.4 - 2026-07-14

### Fixed

- Resizing a tile into a contiguous stack now cascade-pushes every downstream
  tile instead of moving the directly overlapped tile past the rest of the
  stack.

### Compatibility

- `@griddle/react`, `@griddle/vue`, and `@griddle/svelte` 0.1.4 require
  `@griddle/core` 0.1.4 or newer within the 0.1 release line.

## 0.1.3 - 2026-07-14

### Fixed

- Vue tile drags now begin only after 12 pixels of pointer movement, preserving
  stationary clicks and native interaction inside editable tile content.

### Compatibility

- `@griddle/react`, `@griddle/vue`, and `@griddle/svelte` 0.1.3 require
  `@griddle/core` 0.1.3 or newer within the 0.1 release line.

## 0.1.2 - 2026-07-14

### Added

- Shared `GridConfig.animation` settings for reposition and lift duration,
  easing, global enablement, and reduced-motion behavior.
- Animation configuration exports from `@griddle/core`.
- Isolated animation-helper regression tests for the React, Vue, and Svelte
  adapters.

### Changed

- Reposition animations now default to a smoother 320 ms ease-out curve.
- Lift opacity and shadow transitions now default to 160 ms using the same
  smoother easing curve.
- Interrupted repacks continue from each tile's current visual position.
- Adapter publish checks now include their animation tests.

### Fixed

- FLIP animations no longer overwrite transforms used by relative tile
  positioning or drag previews.
- Infinite-axis collision cascades no longer push tiles above row zero.

### Compatibility

- `@griddle/react`, `@griddle/vue`, and `@griddle/svelte` 0.1.2 require
  `@griddle/core` 0.1.2 or newer within the 0.1 release line.

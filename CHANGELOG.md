# Changelog

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

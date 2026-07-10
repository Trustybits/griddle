# @griddle/core

Headless grid/canvas engine — pure TypeScript, **zero runtime dependencies**.

`@griddle/core` is the logic half of [Griddle](https://github.com/Trustybits/griddle):
tile placement, movement, swap/push resolution, compaction (gravity),
virtualization, loop/infinite-canvas math, and serialization. It has no
rendering and no framework ties, so you can run it anywhere — in a browser, on a
server, or behind one of the framework adapters.

## Install

```sh
npm install @griddle/core
```

## Usage

```ts
import { Grid } from '@griddle/core';

const grid = new Grid({ cols: 12, rows: 12, unitWidth: 75, unitHeight: 75 });

grid.addTile({ id: 't1', col: 0, row: 0, w: 2, h: 2 });
grid.moveTile('t1', { col: 4, row: 4 }); // resolves collisions via rules 1–6

const json = grid.toJSON(); // serialize
grid.loadJSON(json);        // restore
```

## Concepts

- **Unit** — a fixed `unitWidth × unitHeight` cell.
- **Grid** — `cols × rows`; either axis can be `Infinity` for an infinite canvas.
- **Tile** — an object at `(col, row)` with a `w × h` footprint.
- **Repack** — after a move, tiles resolve collisions via a deterministic ruleset.
- **Compaction** — optional gravity that backfills gaps toward a chosen edge.
- **Loop** — optional infinite-gallery mode with drag-to-pan physics.

## Framework adapters

Thin presentation layers built on this core:

- [`@griddle/react`](https://www.npmjs.com/package/@griddle/react)
- [`@griddle/vue`](https://www.npmjs.com/package/@griddle/vue)
- [`@griddle/svelte`](https://www.npmjs.com/package/@griddle/svelte)

See the [main repository](https://github.com/Trustybits/griddle) for the movement
ruleset (`docs/movement.md`) and loop mode (`docs/loop.md`).

## License

MIT © Trustybits

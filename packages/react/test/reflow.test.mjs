import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '@griddle/core';
import { createGridRevisionStore } from '../dist/useGriddle.js';

function geometry(tiles) {
  return tiles.map(({ id, col, row, w, h }) => ({ id, col, row, w, h }));
}

test('React revision store refreshes once after final reflow state is installed', () => {
  const grid = new Grid(
    { cols: 4, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    [{ id: 'tile', col: 0, row: 5, w: 2, h: 2 }],
  );
  const store = createGridRevisionStore(grid);
  let notifications = 0;
  let observed;
  const off = store.subscribe(() => {
    notifications += 1;
    observed = {
      version: store.getSnapshot(),
      config: grid.config,
      tiles: geometry(grid.tiles),
    };
  });

  grid.reflow({
    cols: 4,
    strategy: 'griddle-v1',
    placements: { tile: { col: 2, row: 1, w: 2, h: 2 } },
  });

  assert.equal(notifications, 1);
  assert.equal(observed.version, 1);
  assert.equal(observed.config.cols, 4);
  assert.deepEqual(observed.tiles, [
    { id: 'tile', col: 2, row: 1, w: 2, h: 2 },
  ]);
  off();
});

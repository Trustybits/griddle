import test from 'node:test';
import assert from 'node:assert/strict';
import { createGriddle } from '../dist/griddleStore.js';

function geometry(tiles) {
  return tiles.map(({ id, col, row, w, h }) => ({ id, col, row, w, h }));
}

test('Svelte API refreshes each store once after reflow', () => {
  const api = createGriddle({
    config: { cols: 12, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    tiles: [{ id: 'tile', col: 8, row: 0, w: 4, h: 2 }],
  });
  const tileValues = [];
  const configValues = [];
  const versionValues = [];
  const offTiles = api.tiles.subscribe((value) => tileValues.push(value));
  const offConfig = api.config.subscribe((value) => configValues.push(value));
  const offVersion = api.version.subscribe((value) => versionValues.push(value));

  const changed = api.reflow({ cols: 4, strategy: 'griddle-v1' });

  assert.equal(changed, true);
  assert.equal(tileValues.length, 2);
  assert.equal(configValues.length, 2);
  assert.deepEqual(versionValues, [0, 1]);
  assert.deepEqual(geometry(tileValues.at(-1)), [
    { id: 'tile', col: 0, row: 0, w: 4, h: 2 },
  ]);
  assert.equal(configValues.at(-1).cols, 4);

  api.destroy();
  api.grid.reflow({ cols: 8, strategy: 'griddle-v1' });
  assert.equal(tileValues.length, 2, 'destroy must remove the listener');
  assert.equal(configValues.length, 2, 'destroy must remove the listener');
  assert.deepEqual(versionValues, [0, 1]);

  offTiles();
  offConfig();
  offVersion();
});

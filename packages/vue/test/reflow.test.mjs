import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope } from 'vue';
import { useGriddle } from '../dist/index.js';

function geometry(tiles) {
  return tiles.map(({ id, col, row, w, h }) => ({ id, col, row, w, h }));
}

test('Vue API refreshes tiles, config, and version once after reflow', () => {
  const scope = effectScope();
  const api = scope.run(() => useGriddle({
    config: { cols: 12, rows: Infinity, unitWidth: 50, unitHeight: 50 },
    tiles: [{ id: 'tile', col: 8, row: 0, w: 4, h: 2 }],
  }));

  const changed = api.reflow({ cols: 4, strategy: 'griddle-v1' });

  assert.equal(changed, true);
  assert.equal(api.version.value, 1);
  assert.equal(api.config.value.cols, 4);
  assert.deepEqual(geometry(api.tiles.value), [
    { id: 'tile', col: 0, row: 0, w: 4, h: 2 },
  ]);

  scope.stop();
  api.grid.reflow({ cols: 8, strategy: 'griddle-v1' });
  assert.equal(api.version.value, 1, 'scope disposal must remove the listener');
});

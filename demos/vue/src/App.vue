<template>
  <div style="display:flex;height:100%">
    <ConfigPanel :api="api" @add="handleAdd" />
    <div style="flex:1;background:#eef1f5;position:relative">
      <GriddleGrid :api="api">
        <template #tile="{ tile }">
          <DemoTile :tile="tile" @remove="handleRemove" />
        </template>
      </GriddleGrid>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GriddleGrid, useGriddle } from '@griddle/vue';
import ConfigPanel from './ConfigPanel.vue';
import DemoTile from './DemoTile.vue';

const api = useGriddle({
  config: {
    cols: 12,
    rows: 12,
    unitWidth: 75,
    unitHeight: 75,
    gap: 4,
    gravity: 'none',
    resizeHandles: ['se'],
    snapDuringDrag: true,
  },
  tiles: [
    { id: '1', col: 0, row: 0, w: 2, h: 2 },
    { id: '2', col: 2, row: 0, w: 1, h: 1 },
    { id: '3', col: 3, row: 0, w: 3, h: 1 },
    { id: '4', col: 6, row: 0, w: 1, h: 2 },
    { id: '5', col: 7, row: 0, w: 2, h: 2 },
    { id: '6', col: 0, row: 2, w: 1, h: 1 },
    { id: '7', col: 1, row: 2, w: 1, h: 1 },
    { id: '8', col: 9, row: 0, w: 1, h: 1 },
    { id: '9', col: 10, row: 0, w: 1, h: 1 },
    { id: '10', col: 2, row: 1, w: 2, h: 1 },
  ],
});

let nextId = 11;

function handleAdd(w: number, h: number) {
  const cfg = api.config.value;
  const maxCol = cfg.cols === Infinity ? 20 : cfg.cols;
  const maxRow = cfg.rows === Infinity ? 40 : cfg.rows;
  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c + w <= maxCol; c++) {
      const hits = api.grid.tilesIn({ col: c, row: r, w, h });
      if (hits.length === 0 && api.grid.rectInBounds({ col: c, row: r, w, h })) {
        api.addTile({ id: String(nextId++), col: c, row: r, w, h });
        return;
      }
    }
  }
  api.addTile({ id: String(nextId++), col: 0, row: 0, w, h });
}
function handleRemove(id: string) {
  api.removeTile(id);
}
</script>

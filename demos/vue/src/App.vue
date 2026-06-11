<template>
  <div style="display:flex;height:100%">
    <ConfigPanel :api="api" :selected-tile-id="selectedTileId" @add="handleAdd" @select-tile="(id) => selectedTileId = id" />
    <div ref="scrollRef" style="flex:1;background:#eef1f5;position:relative;overflow:auto">
      <GriddleGrid :api="api" @draw-create="handleDrawCreate">
        <template #tile="{ tile }">
          <DemoTile
            :tile="tile"
            :selected="tile.id === selectedTileId"
            @remove="handleRemove"
            @select="(id) => selectedTileId = id"
          />
        </template>
      </GriddleGrid>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { GriddleGrid, useGriddle } from '@griddle/vue';
import type { PlacementStrategy } from '@griddle/core';
import ConfigPanel from './ConfigPanel.vue';
import DemoTile from './DemoTile.vue';

const selectedTileId = ref<string>('');
const scrollRef = ref<HTMLDivElement>();

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

function handleAdd(w: number, h: number, strategy: PlacementStrategy, opts: { gravityAware?: boolean; relativeTo?: string }) {
  const scrollEl = scrollRef.value;
  let anchor: { col: number; row: number } | undefined;
  if (scrollEl) {
    const cfg = api.config.value;
    const colSize = cfg.unitWidth + (cfg.gap ?? 0);
    const rowSize = cfg.unitHeight + (cfg.gap ?? 0);
    const centerX = scrollEl.scrollLeft + scrollEl.clientWidth / 2;
    const centerY = scrollEl.scrollTop + scrollEl.clientHeight / 2;
    anchor = {
      col: Math.floor(centerX / colSize),
      row: Math.floor(centerY / rowSize),
    };
  }

  const result = api.grid.addTileAtBestPosition(
    { id: String(nextId++), col: 0, row: 0, w, h },
    {
      strategy,
      anchor,
      gravityAware: opts.gravityAware,
      relativeTo: opts.relativeTo,
    },
  );

  if (result && scrollEl) {
    const cfg = api.config.value;
    const colSize = cfg.unitWidth + (cfg.gap ?? 0);
    const rowSize = cfg.unitHeight + (cfg.gap ?? 0);
    const tileX = result.position.col * colSize;
    const tileY = result.position.row * rowSize;
    const isVisible = (
      tileX >= scrollEl.scrollLeft &&
      tileX < scrollEl.scrollLeft + scrollEl.clientWidth &&
      tileY >= scrollEl.scrollTop &&
      tileY < scrollEl.scrollTop + scrollEl.clientHeight
    );
    if (!isVisible) {
      scrollEl.scrollTo({
        left: tileX - scrollEl.clientWidth / 2 + (w * colSize) / 2,
        top: tileY - scrollEl.clientHeight / 2 + (h * rowSize) / 2,
        behavior: 'smooth',
      });
    }
  }
}
function handleDrawCreate(rect: { col: number; row: number; w: number; h: number }) {
  const id = String(nextId++);
  api.grid.addTileWithDisplacement({ id, ...rect });
}
function handleRemove(id: string) {
  if (selectedTileId.value === id) selectedTileId.value = '';
  api.removeTile(id);
}
</script>

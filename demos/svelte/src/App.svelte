<script lang="ts">
  import { GriddleGrid, createGriddle } from '@griddle/svelte';
  import type { PlacementStrategy } from '@griddle/core';
  import ConfigPanel from './ConfigPanel.svelte';
  import DemoTile from './DemoTile.svelte';

  const api = createGriddle({
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
  let scrollEl: HTMLDivElement;

  function handleAdd(e: CustomEvent<{ w: number; h: number; strategy: string; gravityAware?: boolean; relativeTo?: string }>) {
    const { w, h, strategy, gravityAware, relativeTo } = e.detail;

    let anchor: { col: number; row: number } | undefined;
    if (scrollEl) {
      const cfg = api.grid.config;
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
      { strategy: strategy as PlacementStrategy, anchor, gravityAware, relativeTo },
    );

    if (result && scrollEl) {
      const cfg = api.grid.config;
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
  function handleRemove(e: CustomEvent<string>) {
    api.removeTile(e.detail);
  }
</script>

<div class="layout">
  <ConfigPanel {api} on:add={handleAdd} />
  <div class="canvas" bind:this={scrollEl}>
    <GriddleGrid {api}>
      <svelte:fragment slot="tile" let:tile>
        <DemoTile {tile} on:remove={handleRemove} />
      </svelte:fragment>
    </GriddleGrid>
  </div>
</div>

<style>
  .layout { display: flex; height: 100%; }
  .canvas { flex: 1; background: #eef1f5; position: relative; }
</style>

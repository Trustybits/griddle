<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type { Corner, Tile } from '@griddle/core';
  import { visibleRange, visibleTiles, gridContentSize } from '@griddle/core';
  import type { GriddleApi } from './griddleStore.js';

  export let api: GriddleApi;
  export let height: number | string = '100%';
  export let showGrid = true;

  let scrollEl: HTMLDivElement;
  let viewport = { scrollX: 0, scrollY: 0, width: 1000, height: 800 };

  const cfgStore = api.config;
  const tilesStore = api.tiles;
  const versionStore = api.version;
  $: cfg = $cfgStore;
  $: tilesAll = $tilesStore;
  $: ver = $versionStore;

  $: colSize = cfg.unitWidth + (cfg.gap ?? 0);
  $: rowSize = cfg.unitHeight + (cfg.gap ?? 0);
  $: range = visibleRange(cfg, viewport, 4);
  $: rendered = visibleTiles(tilesAll, range);
  $: contentSize = gridContentSize(cfg, tilesAll);

  interface DragState {
    tileId: string;
    startPointerX: number; startPointerY: number;
    startCol: number; startRow: number;
    previewCol: number; previewRow: number;
  }
  interface ResizeState {
    tileId: string; corner: Corner;
    startPointerX: number; startPointerY: number;
    startW: number; startH: number;
    startCol: number; startRow: number;
    previewW: number; previewH: number;
    previewCol: number; previewRow: number;
  }
  let drag: DragState | null = null;
  let resize: ResizeState | null = null;

  const tileNodes = new Map<string, HTMLDivElement>();
  const prevRects = new Map<string, { x: number; y: number }>();

  // Svelte action: register a node for FLIP animations, keyed by tile id.
  function registerNode(node: HTMLDivElement, id: string) {
    tileNodes.set(id, node);
    return {
      update(newId: string) {
        if (newId !== id) {
          tileNodes.delete(id);
          id = newId;
          tileNodes.set(id, node);
        }
      },
      destroy() {
        tileNodes.delete(id);
      },
    };
  }

  function onTilePointerDown(e: PointerEvent, tile: Tile) {
    if (tile.draggable === false) return;
    if ((e.target as HTMLElement).dataset.griddleHandle) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    drag = {
      tileId: tile.id,
      startPointerX: e.clientX, startPointerY: e.clientY,
      startCol: tile.col, startRow: tile.row,
      previewCol: tile.col, previewRow: tile.row,
    };
    e.stopPropagation();
  }
  function onResizeHandleDown(e: PointerEvent, tile: Tile, c: Corner) {
    if (tile.resizable === false) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    resize = {
      tileId: tile.id, corner: c,
      startPointerX: e.clientX, startPointerY: e.clientY,
      startW: tile.w, startH: tile.h,
      startCol: tile.col, startRow: tile.row,
      previewW: tile.w, previewH: tile.h,
      previewCol: tile.col, previewRow: tile.row,
    };
    e.stopPropagation();
  }
  function onPointerMove(e: PointerEvent) {
    if (drag && cfg.snapDuringDrag !== false) {
      const dx = e.clientX - drag.startPointerX;
      const dy = e.clientY - drag.startPointerY;
      const col = Math.round(drag.startCol + dx / colSize);
      const row = Math.round(drag.startRow + dy / rowSize);
      if (col !== drag.previewCol || row !== drag.previewRow) {
        drag = { ...drag, previewCol: col, previewRow: row };
      }
    }
    if (resize) {
      const dx = e.clientX - resize.startPointerX;
      const dy = e.clientY - resize.startPointerY;
      let dw = 0, dh = 0, dcol = 0, drow = 0;
      const stepsX = Math.round(dx / colSize);
      const stepsY = Math.round(dy / rowSize);
      if (resize.corner === 'se' || resize.corner === 'ne') dw = stepsX;
      if (resize.corner === 'se' || resize.corner === 'sw') dh = stepsY;
      if (resize.corner === 'sw' || resize.corner === 'nw') { dw = -stepsX; dcol = stepsX; }
      if (resize.corner === 'ne' || resize.corner === 'nw') { dh = -stepsY; drow = stepsY; }
      const nW = Math.max(1, resize.startW + dw);
      const nH = Math.max(1, resize.startH + dh);
      const nC = resize.startCol + dcol;
      const nR = resize.startRow + drow;
      if (nW !== resize.previewW || nH !== resize.previewH || nC !== resize.previewCol || nR !== resize.previewRow) {
        resize = { ...resize, previewW: nW, previewH: nH, previewCol: nC, previewRow: nR };
      }
    }
  }
  function onPointerUp() {
    if (drag) {
      const t = api.grid.getTile(drag.tileId);
      if (t && (drag.previewCol !== t.col || drag.previewRow !== t.row)) {
        api.moveTile(drag.tileId, { col: drag.previewCol, row: drag.previewRow });
      }
      drag = null;
    }
    if (resize) {
      const t = api.grid.getTile(resize.tileId);
      if (t) {
        if (resize.previewCol !== t.col || resize.previewRow !== t.row) {
          api.moveTile(resize.tileId, { col: resize.previewCol, row: resize.previewRow });
        }
        if (resize.previewW !== t.w || resize.previewH !== t.h) {
          api.resizeTile(resize.tileId, { w: resize.previewW, h: resize.previewH });
        }
      }
      resize = null;
    }
  }
  function updateViewport() {
    if (!scrollEl) return;
    viewport = {
      scrollX: scrollEl.scrollLeft,
      scrollY: scrollEl.scrollTop,
      width: scrollEl.clientWidth,
      height: scrollEl.clientHeight,
    };
  }

  let ro: ResizeObserver;
  onMount(() => {
    updateViewport();
    scrollEl.addEventListener('scroll', updateViewport, { passive: true });
    ro = new ResizeObserver(updateViewport);
    ro.observe(scrollEl);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });
  onDestroy(() => {
    if (scrollEl) scrollEl.removeEventListener('scroll', updateViewport);
    ro?.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  });

  // FLIP animation on version change
  $: runFlip(ver);
  async function runFlip(_v: number) {
    await tick();
    for (const t of tilesAll) {
      const x = t.col * colSize;
      const y = t.row * rowSize;
      const p = prevRects.get(t.id);
      const node = tileNodes.get(t.id);
      if (p && node) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx !== 0 || dy !== 0) {
          node.style.transition = 'none';
          node.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            node.style.transition = 'transform 220ms cubic-bezier(.2,.7,.2,1)';
            node.style.transform = 'translate(0,0)';
          });
        }
      }
      prevRects.set(t.id, { x, y });
    }
  }

  function tileLeft(tile: Tile): number {
    if (drag?.tileId === tile.id) return drag.previewCol * colSize;
    if (resize?.tileId === tile.id) return resize.previewCol * colSize;
    return tile.col * colSize;
  }
  function tileTop(tile: Tile): number {
    if (drag?.tileId === tile.id) return drag.previewRow * rowSize;
    if (resize?.tileId === tile.id) return resize.previewRow * rowSize;
    return tile.row * rowSize;
  }
  function tileW(tile: Tile): number {
    const w = resize?.tileId === tile.id ? resize.previewW : tile.w;
    return w * cfg.unitWidth + (w - 1) * (cfg.gap ?? 0);
  }
  function tileH(tile: Tile): number {
    const h = resize?.tileId === tile.id ? resize.previewH : tile.h;
    return h * cfg.unitHeight + (h - 1) * (cfg.gap ?? 0);
  }
  function isActive(id: string) { return drag?.tileId === id || resize?.tileId === id; }
</script>

<div
  bind:this={scrollEl}
  class="griddle-scroll"
  style:height={typeof height === 'number' ? height + 'px' : height}
>
  <div
    class="griddle-content"
    class:grid-bg={showGrid}
    style:width={contentSize.width ? contentSize.width + 'px' : '100%'}
    style:height={contentSize.height ? contentSize.height + 'px' : '100%'}
    style:--colsize={colSize + 'px'}
    style:--rowsize={rowSize + 'px'}
  >
    {#each rendered as tile (tile.id)}
      <div
        class="griddle-tile"
        class:griddle-active={isActive(tile.id)}
        data-griddle-tile={tile.id}
        use:registerNode={tile.id}
        on:pointerdown={(e) => onTilePointerDown(e, tile)}
        style:left={tileLeft(tile) + 'px'}
        style:top={tileTop(tile) + 'px'}
        style:width={tileW(tile) + 'px'}
        style:height={tileH(tile) + 'px'}
      >
        <slot name="tile" {tile} />
        {#if tile.resizable !== false}
          {#each (tile.resizeHandles ?? cfg.resizeHandles ?? ['se']) as c (c)}
            <div
              class="griddle-handle griddle-handle-{c}"
              data-griddle-handle={c}
              on:pointerdown={(e) => onResizeHandleDown(e, tile, c)}
            ></div>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .griddle-scroll {
    position: relative;
    overflow: auto;
    touch-action: none;
  }
  .griddle-content {
    position: relative;
    min-width: 100%;
    min-height: 100%;
  }
  .grid-bg {
    background-image:
      linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px);
    background-size: var(--colsize) var(--rowsize);
  }
  .griddle-tile {
    position: absolute;
    box-sizing: border-box;
    cursor: grab;
    user-select: none;
    will-change: transform;
    z-index: 1;
  }
  .griddle-tile.griddle-active {
    z-index: 10;
    opacity: 0.85;
    cursor: grabbing;
  }
  .griddle-handle {
    position: absolute;
    width: 12px;
    height: 12px;
    background: rgba(60,60,60,0.7);
    border: 2px solid white;
    border-radius: 3px;
    touch-action: none;
  }
  .griddle-handle-nw { top: -6px; left: -6px; cursor: nw-resize; }
  .griddle-handle-ne { top: -6px; right: -6px; cursor: ne-resize; }
  .griddle-handle-sw { bottom: -6px; left: -6px; cursor: sw-resize; }
  .griddle-handle-se { bottom: -6px; right: -6px; cursor: se-resize; }
</style>

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type { Corner, Tile } from '@griddle/core';
  import {
    visibleRange,
    visibleTiles,
    gridContentSize,
    DragController,
    computeTileLayout,
    resolveStickyStacking,
    isOutOfFlow,
    pixelsToPin,
  } from '@griddle/core';
  import type { TileLayout } from '@griddle/core';
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
  $: halfGap = (cfg.gap ?? 0) / 2;
  $: range = visibleRange(cfg, viewport, 4);
  $: rendered = visibleTiles(tilesAll, range);
  $: contentSize = gridContentSize(cfg, tilesAll);

  // ---- drag / resize state ---------------------------------------------
  // Drag uses the live-preview state machine in core: as the cursor crosses
  // cell boundaries we rewind any prior preview and re-attempt the move
  // against a snapshot taken at pickup. The dragged tile follows the cursor
  // freely (unsnapped) for the duration of the gesture; a separate drop-
  // indicator div renders at the snapped candidate cell.
  const dragController = new DragController(api.grid);

  interface DragVisual {
    tileId: string;
    /** Pickup cell, in cells. */
    pickupCol: number;
    pickupRow: number;
    /** Cursor delta in raw pixels relative to pickup. */
    deltaX: number;
    deltaY: number;
    /** Snapped indicator cell; null when current candidate is invalid. */
    indicatorCol: number | null;
    indicatorRow: number | null;
  }
  let drag: DragVisual | null = null;
  let dragStartPointerX = 0;
  let dragStartPointerY = 0;

  // Free-pixel drag for `absolute` / `fixed` tiles. The engine doesn't
  // participate — we just translate cursor deltas into `pinned` updates.
  interface PinDragState {
    tileId: string;
    /** Pinned coords at pickup, in pixels (after unit conversion). */
    startPinPx: { x: number; y: number };
    startPointerX: number;
    startPointerY: number;
  }
  let pinDrag: PinDragState | null = null;

  interface ResizeState {
    tileId: string; corner: Corner;
    startPointerX: number; startPointerY: number;
    startW: number; startH: number;
    startCol: number; startRow: number;
    previewW: number; previewH: number;
    previewCol: number; previewRow: number;
  }
  let resize: ResizeState | null = null;

  const tileNodes = new Map<string, HTMLDivElement>();
  const prevRects = new Map<string, { x: number; y: number }>();

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
    // Out-of-flow tiles (absolute/fixed) get free-pixel drag — they don't
    // participate in the rules engine, so we just translate cursor deltas
    // into pinned-coord updates.
    if (cfg.enablePositioning && isOutOfFlow(tile)) {
      const layout = computeTileLayout({
        tile,
        config: cfg,
        scrollX: viewport.scrollX,
        scrollY: viewport.scrollY,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      });
      // For 'fixed', the rendered left/top includes scroll compensation; the
      // raw pinned-pixel start is layout.left/top minus that compensation.
      const startPinPx =
        tile.position === 'fixed'
          ? { x: layout.left - viewport.scrollX, y: layout.top - viewport.scrollY }
          : { x: layout.left, y: layout.top };
      pinDrag = {
        tileId: tile.id,
        startPinPx,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
      };
      e.stopPropagation();
      return;
    }
    if (!dragController.start(tile.id)) return;
    dragStartPointerX = e.clientX;
    dragStartPointerY = e.clientY;
    drag = {
      tileId: tile.id,
      pickupCol: tile.col,
      pickupRow: tile.row,
      deltaX: 0,
      deltaY: 0,
      indicatorCol: tile.col,
      indicatorRow: tile.row,
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
    if (pinDrag) {
      const dx = e.clientX - pinDrag.startPointerX;
      const dy = e.clientY - pinDrag.startPointerY;
      const newPinPx = {
        x: pinDrag.startPinPx.x + dx,
        y: pinDrag.startPinPx.y + dy,
      };
      const newPin = pixelsToPin(newPinPx, cfg);
      api.grid.setTilePinned(pinDrag.tileId, newPin);
    }
    if (drag) {
      const dx = e.clientX - dragStartPointerX;
      const dy = e.clientY - dragStartPointerY;
      const candidateCol = drag.pickupCol + Math.round(dx / colSize);
      const candidateRow = drag.pickupRow + Math.round(dy / rowSize);
      const result = dragController.update({ col: candidateCol, row: candidateRow });
      drag = {
        ...drag,
        deltaX: dx,
        deltaY: dy,
        indicatorCol: result.indicatorCell ? result.indicatorCell.col : null,
        indicatorRow: result.indicatorCell ? result.indicatorCell.row : null,
      };
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
    if (pinDrag) {
      pinDrag = null;
    }
    if (drag) {
      dragController.end();
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

  // FLIP animation on version change. Skip the active dragger — it has its
  // own pixel-level transform driven by the cursor delta and we don't want
  // FLIP to fight with that.
  $: runFlip(ver);
  async function runFlip(_v: number) {
    await tick();
    const draggerId = drag?.tileId ?? null;
    for (const t of tilesAll) {
      const x = t.col * colSize + halfGap;
      const y = t.row * rowSize + halfGap;
      const p = prevRects.get(t.id);
      if (t.id === draggerId) {
        // Keep prevRect synced so the post-drop FLIP doesn't double-jump.
        prevRects.set(t.id, { x, y });
        continue;
      }
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

  // Compute layouts for ALL rendered tiles in one pass so we can run
  // resolveStickyStacking afterward — that helper needs to see every sticky
  // tile to compute how they push each other. Dragger and resize overrides
  // take precedence over the engine's positioning fields.
  $: tileLayouts = (() => {
    const out = new Map<string, TileLayout>();
    const stickyEntries: { tile: Tile; layout: TileLayout }[] = [];
    for (const tile of rendered) {
      let layout: TileLayout;
      if (resize?.tileId === tile.id) {
        const w = resize.previewW;
        const h = resize.previewH;
        layout = {
          left: resize.previewCol * colSize + halfGap,
          top: resize.previewRow * rowSize + halfGap,
          width: w * cfg.unitWidth + (w - 1) * (cfg.gap ?? 0),
          height: h * cfg.unitHeight + (h - 1) * (cfg.gap ?? 0),
          zIndex: 10,
          effective: 'static',
        };
      } else if (drag?.tileId === tile.id) {
        layout = {
          left: drag.pickupCol * colSize + halfGap,
          top: drag.pickupRow * rowSize + halfGap,
          width: tile.w * cfg.unitWidth + (tile.w - 1) * (cfg.gap ?? 0),
          height: tile.h * cfg.unitHeight + (tile.h - 1) * (cfg.gap ?? 0),
          transform: `translate(${drag.deltaX}px, ${drag.deltaY}px)`,
          zIndex: 20,
          effective: 'static',
        };
      } else {
        layout = computeTileLayout({
          tile,
          config: cfg,
          scrollX: viewport.scrollX,
          scrollY: viewport.scrollY,
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
        });
        if (layout.effective === 'sticky') {
          stickyEntries.push({ tile, layout });
        }
      }
      out.set(tile.id, layout);
    }
    if (stickyEntries.length > 1) resolveStickyStacking(stickyEntries);
    return out;
  })();

  function tileLayoutFor(tile: Tile): TileLayout {
    return tileLayouts.get(tile.id) ?? {
      left: 0, top: 0, width: 0, height: 0, zIndex: 1, effective: 'static',
    };
  }

  function isDragging(id: string) { return drag?.tileId === id || pinDrag?.tileId === id; }
  function isResizing(id: string) { return resize?.tileId === id; }

  // Drop indicator size matches the dragger's footprint.
  $: indicatorRect = (() => {
    if (!drag || drag.indicatorCol === null || drag.indicatorRow === null) return null;
    const t = api.grid.getTile(drag.tileId);
    if (!t) return null;
    return {
      left: drag.indicatorCol * colSize + halfGap,
      top: drag.indicatorRow * rowSize + halfGap,
      width: t.w * cfg.unitWidth + (t.w - 1) * (cfg.gap ?? 0),
      height: t.h * cfg.unitHeight + (t.h - 1) * (cfg.gap ?? 0),
    };
  })();
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
    style:--griddle-tile-radius={(cfg.tileRadius ?? 4) + 'px'}
  >
    {#if indicatorRect}
      <div
        class="griddle-drop-indicator"
        style:left={indicatorRect.left + 'px'}
        style:top={indicatorRect.top + 'px'}
        style:width={indicatorRect.width + 'px'}
        style:height={indicatorRect.height + 'px'}
      ></div>
    {/if}
    {#each rendered as tile (tile.id)}
      {@const layout = tileLayoutFor(tile)}
      <div
        class="griddle-tile"
        class:griddle-dragging={isDragging(tile.id)}
        class:griddle-resizing={isResizing(tile.id)}
        class:griddle-relative={layout.effective === 'relative'}
        class:griddle-absolute={layout.effective === 'absolute'}
        class:griddle-fixed={layout.effective === 'fixed'}
        class:griddle-sticky={layout.effective === 'sticky'}
        data-griddle-tile={tile.id}
        data-griddle-position={layout.effective}
        use:registerNode={tile.id}
        on:pointerdown={(e) => onTilePointerDown(e, tile)}
        style:left={layout.left + 'px'}
        style:top={layout.top + 'px'}
        style:width={layout.width + 'px'}
        style:height={layout.height + 'px'}
        style:transform={layout.transform ?? ''}
        style:z-index={layout.zIndex}
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
  .griddle-tile.griddle-resizing {
    z-index: 10;
    opacity: 0.85;
    cursor: grabbing;
  }
  .griddle-tile.griddle-dragging {
    z-index: 20;
    cursor: grabbing;
    opacity: 0.85;
    /* Lift the tile off the grid: drop shadow + subtle scale. The transform
       is set inline (cursor delta), so the scale is folded into a CSS filter
       to avoid clobbering it. */
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.18));
    transition: filter 120ms ease-out, opacity 120ms ease-out;
  }
  .griddle-drop-indicator {
    position: absolute;
    box-sizing: border-box;
    border: 2px dashed rgba(59, 91, 219, 0.55);
    background: rgba(59, 91, 219, 0.08);
    border-radius: var(--griddle-tile-radius, 4px);
    pointer-events: none;
    z-index: 5;
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

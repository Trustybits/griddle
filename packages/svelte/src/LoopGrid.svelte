<script lang="ts">
  // Loop-mode renderer ("object looping") — see @griddle/core loop.ts for the
  // coordinate model. Mirrors the React GriddleLoopGrid.
  import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
  import type { CameraState, CellPos, Corner } from '@griddle/core';
  import {
    DragController,
    PanController,
    loopAnchorScroll,
    loopContentSize,
    loopInstances,
    loopPeriod,
    nearestInstanceOrigin,
    resolveLoop,
    wrapCell,
  } from '@griddle/core';
  import type { LoopTileInstance } from '@griddle/core';
  import type { GriddleApi } from './griddleStore.js';

  export let api: GriddleApi;
  export let height: number | string = '100%';
  export let showGrid = true;

  const dispatch = createEventDispatcher<{
    dragStart: { tileId: string };
    dragEnd: { tileId: string; committed: boolean };
    resizeStart: { tileId: string };
    resizeEnd: { tileId: string; committed: boolean };
    cameraChange: CameraState;
  }>();

  const DEFAULT_DRAG_IGNORE = 'a, button, input, textarea, select, [contenteditable]';
  const PAN_THRESHOLD_PX = 4;

  let scrollEl: HTMLDivElement;

  const cfgStore = api.config;
  const tilesStore = api.tiles;
  const versionStore = api.version;
  $: cfg = $cfgStore;
  $: tilesAll = $tilesStore;
  $: ver = $versionStore;

  $: loop = resolveLoop(cfg);
  $: editable = loop?.interaction === 'edit';
  $: gapPx = cfg.gap ?? 0;
  $: halfGap = gapPx / 2;
  $: colSize = cfg.unitWidth + gapPx;
  $: rowSize = cfg.unitHeight + gapPx;
  $: period = loopPeriod(cfg);

  // ---- camera + scroll plumbing -----------------------------------------
  const pan = new PanController();
  $: if (loop) {
    pan.setPhysics({ friction: loop.friction, ease: loop.ease, maxVelocity: loop.maxVelocity });
  }

  const expectedScroll = { x: -1, y: -1 };
  let view = { sxCell: 0, syCell: 0, kax: 0, kay: 0, vw: 1000, vh: 800 };
  let lastCam: CameraState | null = null;
  let raf = 0;

  function onScroll() {
    if (!scrollEl) return;
    const dx = scrollEl.scrollLeft - expectedScroll.x;
    const dy = scrollEl.scrollTop - expectedScroll.y;
    if (dx !== 0 || dy !== 0) {
      pan.scrollBy(dx, dy);
      expectedScroll.x = scrollEl.scrollLeft;
      expectedScroll.y = scrollEl.scrollTop;
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (!scrollEl) return;
    const st = pan.tick(now);

    const sx = loopAnchorScroll(st.x, period.width);
    const sy = loopAnchorScroll(st.y, period.height);
    if (Math.abs(scrollEl.scrollLeft - sx) > 0.5) {
      scrollEl.scrollLeft = sx;
      expectedScroll.x = scrollEl.scrollLeft;
    }
    if (Math.abs(scrollEl.scrollTop - sy) > 0.5) {
      scrollEl.scrollTop = sy;
      expectedScroll.y = scrollEl.scrollTop;
    }

    const next = {
      sxCell: Math.floor(scrollEl.scrollLeft / colSize),
      syCell: Math.floor(scrollEl.scrollTop / rowSize),
      kax: Math.floor(st.x / period.width),
      kay: Math.floor(st.y / period.height),
      vw: scrollEl.clientWidth,
      vh: scrollEl.clientHeight,
    };
    if (
      next.sxCell !== view.sxCell || next.syCell !== view.syCell ||
      next.kax !== view.kax || next.kay !== view.kay ||
      next.vw !== view.vw || next.vh !== view.vh
    ) {
      view = next;
    }

    if (
      !lastCam || lastCam.x !== st.x || lastCam.y !== st.y ||
      lastCam.isMoving !== st.isMoving || lastCam.isDragging !== st.isDragging
    ) {
      lastCam = st;
      dispatch('cameraChange', st);
    }
  }

  $: contentSize = loopContentSize(cfg, view.vw, view.vh);

  $: instances = (() => {
    void ver; // re-run on grid changes
    const bufX = 2 * colSize;
    const bufY = 2 * rowSize;
    return loopInstances(cfg, tilesAll, {
      x: view.sxCell * colSize - bufX,
      y: view.syCell * rowSize - bufY,
      width: view.vw + colSize + 2 * bufX,
      height: view.vh + rowSize + 2 * bufY,
    });
  })();

  // World-stable key: survives the seam teleport so DOM nodes are reused.
  function worldKey(inst: LoopTileInstance): string {
    return `${inst.tile.id}@${inst.kx + view.kax - 1},${inst.ky + view.kay - 1}`;
  }

  // ---- pan gesture ('pan' interaction) -----------------------------------
  let panGesture: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
  let suppressClick = false;

  function onContainerPointerDown(e: PointerEvent) {
    if (editable) return;
    if (!loop?.dragPan || e.button !== 0) return;
    const ignoreSelector = cfg.dragIgnoreFrom ?? DEFAULT_DRAG_IGNORE;
    if (ignoreSelector && (e.target as HTMLElement).closest(ignoreSelector)) return;
    panGesture = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
  }

  function onClickCapture(e: MouseEvent) {
    if (suppressClick) {
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ---- tile drag / resize ('edit' interaction) ----------------------------
  const dragController = new DragController(api.grid);

  interface LoopDragVisual {
    tileId: string;
    instanceLeft: number;
    instanceTop: number;
    pickupCol: number;
    pickupRow: number;
    deltaX: number;
    deltaY: number;
    indicatorCol: number | null;
    indicatorRow: number | null;
  }
  let drag: LoopDragVisual | null = null;
  let dragStartPointerX = 0;
  let dragStartPointerY = 0;

  interface LoopResizeState {
    tileId: string;
    instanceKey: string;
    instanceDx: number;
    instanceDy: number;
    corner: Corner;
    startPointerX: number;
    startPointerY: number;
    startW: number;
    startH: number;
    startCol: number;
    startRow: number;
    previewW: number;
    previewH: number;
    previewCol: number;
    previewRow: number;
  }
  let resize: LoopResizeState | null = null;

  function onTilePointerDown(e: PointerEvent, inst: LoopTileInstance) {
    if (!editable) return; // pan mode: container pan handler takes it
    const tile = inst.tile;
    if (tile.draggable === false) return;
    if ((e.target as HTMLElement).dataset.griddleHandle) return;
    const ignoreSelector = cfg.dragIgnoreFrom ?? DEFAULT_DRAG_IGNORE;
    if (ignoreSelector && (e.target as HTMLElement).closest(ignoreSelector)) return;

    // No pointer capture: the grabbed instance unmounts (drag renders as an
    // overlay), which would release the capture mid-gesture.
    if (!dragController.start(tile.id)) return;
    dragStartPointerX = e.clientX;
    dragStartPointerY = e.clientY;
    drag = {
      tileId: tile.id,
      instanceLeft: inst.left,
      instanceTop: inst.top,
      pickupCol: tile.col,
      pickupRow: tile.row,
      deltaX: 0,
      deltaY: 0,
      indicatorCol: tile.col,
      indicatorRow: tile.row,
    };
    dispatch('dragStart', { tileId: tile.id });
    e.stopPropagation();
  }

  function onResizeHandleDown(e: PointerEvent, inst: LoopTileInstance, c: Corner) {
    if (!editable) return;
    const tile = inst.tile;
    if (tile.resizable === false) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const baseLeft = tile.col * colSize + halfGap;
    const baseTop = tile.row * rowSize + halfGap;
    resize = {
      tileId: tile.id,
      instanceKey: inst.key,
      instanceDx: inst.left - baseLeft,
      instanceDy: inst.top - baseTop,
      corner: c,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startW: tile.w,
      startH: tile.h,
      startCol: tile.col,
      startRow: tile.row,
      previewW: tile.w,
      previewH: tile.h,
      previewCol: tile.col,
      previewRow: tile.row,
    };
    dispatch('resizeStart', { tileId: tile.id });
    e.stopPropagation();
  }

  function onPointerMove(e: PointerEvent) {
    if (panGesture && e.pointerId === panGesture.pointerId) {
      const now = performance.now();
      if (!panGesture.moved) {
        const dist = Math.hypot(e.clientX - panGesture.startX, e.clientY - panGesture.startY);
        if (dist >= PAN_THRESHOLD_PX) {
          panGesture.moved = true;
          pan.dragStart(panGesture.startX, panGesture.startY, now);
          pan.dragMove(e.clientX, e.clientY, now);
        }
      } else {
        pan.dragMove(e.clientX, e.clientY, now);
      }
      return;
    }

    if (drag) {
      const dx = e.clientX - dragStartPointerX;
      const dy = e.clientY - dragStartPointerY;
      const candidate: CellPos = wrapCell(
        {
          col: drag.pickupCol + Math.round(dx / colSize),
          row: drag.pickupRow + Math.round(dy / rowSize),
        },
        cfg,
      );
      const result = dragController.update(candidate);
      drag = {
        ...drag,
        deltaX: dx,
        deltaY: dy,
        indicatorCol: result.indicatorCell ? result.indicatorCell.col : null,
        indicatorRow: result.indicatorCell ? result.indicatorCell.row : null,
      };
      // restoreTiles() doesn't emit change events; force-sync the local list.
      if (result.changed) tilesAll = api.grid.tiles;
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
      const tile = api.grid.getTile(resize.tileId);
      const minW = tile?.minW ?? 1;
      const minH = tile?.minH ?? 1;
      const maxW = Math.min(tile?.maxW ?? Infinity, cfg.cols);
      const maxH = Math.min(tile?.maxH ?? Infinity, cfg.rows);
      const nW = Math.min(maxW, Math.max(minW, resize.startW + dw));
      const nH = Math.min(maxH, Math.max(minH, resize.startH + dh));
      const nC = resize.startCol + dcol;
      const nR = resize.startRow + drow;
      if (nW !== resize.previewW || nH !== resize.previewH || nC !== resize.previewCol || nR !== resize.previewRow) {
        resize = { ...resize, previewW: nW, previewH: nH, previewCol: nC, previewRow: nR };
      }
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (panGesture && e.pointerId === panGesture.pointerId) {
      if (panGesture.moved) {
        pan.dragEnd(performance.now());
        suppressClick = true;
      }
      panGesture = null;
      return;
    }

    if (drag) {
      const tileId = drag.tileId;
      const { committed } = dragController.end();
      drag = null;
      tilesAll = api.grid.tiles;
      dispatch('dragEnd', { tileId, committed });
    }
    if (resize) {
      const r = resize;
      const t = api.grid.getTile(r.tileId);
      let committed = false;
      if (t) {
        const target = wrapCell({ col: r.previewCol, row: r.previewRow }, cfg);
        if (target.col !== t.col || target.row !== t.row) {
          api.moveTile(r.tileId, target);
        }
        if (r.previewW !== t.w || r.previewH !== t.h) {
          committed = api.resizeTile(r.tileId, { w: r.previewW, h: r.previewH });
        } else {
          committed = r.previewCol !== r.startCol || r.previewRow !== r.startRow
            || r.previewW !== r.startW || r.previewH !== r.startH;
        }
      }
      resize = null;
      dispatch('resizeEnd', { tileId: r.tileId, committed });
    }
  }

  onMount(() => {
    if (scrollEl) {
      expectedScroll.x = scrollEl.scrollLeft;
      expectedScroll.y = scrollEl.scrollTop;
      scrollEl.addEventListener('scroll', onScroll, { passive: true });
    }
    raf = requestAnimationFrame(frame);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });
  onDestroy(() => {
    cancelAnimationFrame(raf);
    if (scrollEl) scrollEl.removeEventListener('scroll', onScroll);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  });

  // ---- FLIP for edit-mode repacks (keyed by world key) --------------------
  const tileNodes = new Map<string, HTMLDivElement>();
  const prevRects = new Map<string, { x: number; y: number }>();

  function registerNode(node: HTMLDivElement, key: string) {
    tileNodes.set(key, node);
    return {
      update(newKey: string) {
        if (newKey !== key) {
          tileNodes.delete(key);
          key = newKey;
          tileNodes.set(key, node);
        }
      },
      destroy() {
        tileNodes.delete(key);
      },
    };
  }

  $: runFlip(ver);
  async function runFlip(_v: number) {
    await tick();
    const draggerId = drag?.tileId ?? null;
    const seen = new Set<string>();
    for (const inst of instances) {
      const key = worldKey(inst);
      seen.add(key);
      const x = inst.left;
      const y = inst.top;
      if (editable && inst.tile.id !== draggerId) {
        const p = prevRects.get(key);
        const node = tileNodes.get(key);
        if (p && node) {
          const dx = p.x - x;
          const dy = p.y - y;
          if (
            (dx !== 0 || dy !== 0) &&
            Math.abs(dx) < period.width / 2 &&
            Math.abs(dy) < period.height / 2
          ) {
            node.style.transition = 'none';
            node.style.transform = `translate(${dx}px, ${dy}px)`;
            requestAnimationFrame(() => {
              node.style.transition = 'transform 220ms cubic-bezier(.2,.7,.2,1)';
              node.style.transform = 'translate(0,0)';
            });
          }
        }
      }
      prevRects.set(key, { x, y });
    }
    for (const key of prevRects.keys()) {
      if (!seen.has(key)) prevRects.delete(key);
    }
  }

  // ---- drop indicator + drag overlay ---------------------------------------
  $: indicatorRect = (() => {
    if (!drag || drag.indicatorCol === null || drag.indicatorRow === null) return null;
    const t = api.grid.getTile(drag.tileId);
    if (!t) return null;
    const origin = nearestInstanceOrigin(
      cfg,
      { col: drag.indicatorCol, row: drag.indicatorRow },
      { x: drag.instanceLeft + drag.deltaX, y: drag.instanceTop + drag.deltaY },
    );
    return {
      left: origin.left,
      top: origin.top,
      width: t.w * cfg.unitWidth + (t.w - 1) * gapPx,
      height: t.h * cfg.unitHeight + (t.h - 1) * gapPx,
    };
  })();

  $: draggedTile = drag ? api.grid.getTile(drag.tileId) ?? null : null;

  function instanceLayout(inst: LoopTileInstance, r: LoopResizeState | null) {
    if (r && r.instanceKey === inst.key) {
      return {
        left: r.previewCol * colSize + halfGap + r.instanceDx,
        top: r.previewRow * rowSize + halfGap + r.instanceDy,
        width: r.previewW * cfg.unitWidth + (r.previewW - 1) * gapPx,
        height: r.previewH * cfg.unitHeight + (r.previewH - 1) * gapPx,
      };
    }
    return { left: inst.left, top: inst.top, width: inst.width, height: inst.height };
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  bind:this={scrollEl}
  class="griddle-scroll"
  class:griddle-pannable={loop?.dragPan}
  style:height={typeof height === 'number' ? height + 'px' : height}
  on:pointerdown={onContainerPointerDown}
  on:click|capture={onClickCapture}
>
  <div
    class="griddle-content"
    class:grid-bg={showGrid}
    style:width={contentSize.width + 'px'}
    style:height={contentSize.height + 'px'}
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
    {#each instances.filter((i) => !(drag && i.tile.id === drag.tileId)) as inst (worldKey(inst))}
      {@const layout = instanceLayout(inst, resize)}
      <div
        class="griddle-tile"
        class:griddle-editable={editable}
        class:griddle-resizing={resize?.instanceKey === inst.key}
        data-griddle-tile={inst.tile.id}
        data-griddle-instance={inst.key}
        use:registerNode={worldKey(inst)}
        on:pointerdown={(e) => onTilePointerDown(e, inst)}
        style:left={layout.left + 'px'}
        style:top={layout.top + 'px'}
        style:width={layout.width + 'px'}
        style:height={layout.height + 'px'}
      >
        <slot name="tile" tile={inst.tile} />
        {#if editable && inst.tile.resizable !== false}
          {#each (inst.tile.resizeHandles ?? cfg.resizeHandles ?? ['se']) as c (c)}
            <div
              class="griddle-handle griddle-handle-{c}"
              data-griddle-handle={c}
              on:pointerdown={(e) => onResizeHandleDown(e, inst, c)}
            ></div>
          {/each}
        {/if}
      </div>
    {/each}
    {#if drag && draggedTile}
      <div
        class="griddle-tile griddle-drag-overlay"
        data-griddle-tile={draggedTile.id}
        style:left={drag.instanceLeft + 'px'}
        style:top={drag.instanceTop + 'px'}
        style:width={draggedTile.w * cfg.unitWidth + (draggedTile.w - 1) * gapPx + 'px'}
        style:height={draggedTile.h * cfg.unitHeight + (draggedTile.h - 1) * gapPx + 'px'}
        style:transform={`translate(${drag.deltaX}px, ${drag.deltaY}px)`}
      >
        <slot name="tile" tile={draggedTile} />
      </div>
    {/if}
  </div>
</div>

<style>
  .griddle-scroll {
    position: relative;
    overflow: auto;
    touch-action: none;
    user-select: none;
  }
  .griddle-scroll.griddle-pannable {
    cursor: grab;
  }
  .griddle-content {
    position: relative;
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
    user-select: none;
    will-change: transform;
    z-index: 1;
    border-radius: var(--griddle-tile-radius, 4px);
  }
  .griddle-tile.griddle-editable {
    cursor: grab;
  }
  .griddle-tile.griddle-resizing {
    z-index: 10;
    opacity: 0.85;
    cursor: grabbing;
  }
  .griddle-tile.griddle-drag-overlay {
    z-index: 20;
    cursor: grabbing;
    opacity: 0.85;
    pointer-events: none;
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.18));
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

<template>
  <GriddleLoopGrid
    v-if="loopOn"
    :api="api"
    :class-name="className"
    :height="height"
    :show-grid="showGrid"
    :selection="props.selection"
    @selection-change="(s) => emit('selectionChange', s)"
    @drag-start="(id) => emit('dragStart', id)"
    @drag-end="(id, c) => emit('dragEnd', id, c)"
    @resize-start="(id) => emit('resizeStart', id)"
    @resize-end="(id, c) => emit('resizeEnd', id, c)"
    @camera-change="(cam) => emit('cameraChange', cam)"
  >
    <template #tile="slotProps">
      <slot name="tile" v-bind="slotProps" />
    </template>
  </GriddleLoopGrid>
  <div
    v-else
    ref="scrollEl"
    :class="className"
    :style="scrollStyle"
    @pointerdown="onBackgroundPointerDown"
  >
    <div :style="contentStyle">
      <div
        v-if="indicatorRect"
        class="griddle-drop-indicator"
        :style="{
          position: 'absolute',
          left: indicatorRect.left + 'px',
          top: indicatorRect.top + 'px',
          width: indicatorRect.width + 'px',
          height: indicatorRect.height + 'px',
          boxSizing: 'border-box',
          border: '2px dashed rgba(59, 91, 219, 0.55)',
          background: 'rgba(59, 91, 219, 0.08)',
          borderRadius: (config.tileRadius ?? 4) + 'px',
          pointerEvents: 'none',
          zIndex: 5,
        }"
      ></div>
      <div
        v-if="drawGhostRect"
        class="griddle-draw-ghost"
        :style="{
          position: 'absolute',
          left: drawGhostRect.left + 'px',
          top: drawGhostRect.top + 'px',
          width: drawGhostRect.width + 'px',
          height: drawGhostRect.height + 'px',
          boxSizing: 'border-box',
          border: '2px dashed rgba(59, 91, 219, 0.55)',
          background: 'rgba(59, 91, 219, 0.08)',
          borderRadius: (config.tileRadius ?? 4) + 'px',
          pointerEvents: 'none',
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: '600',
          color: 'rgba(59, 91, 219, 0.8)',
          userSelect: 'none',
        }"
      >{{ drawGhostRect.label }}</div>
      <div
        v-for="tile in rendered"
        :key="tile.id"
        :data-griddle-tile="tile.id"
        :class="['griddle-tile', {
          'griddle-dragging': drag?.tileId === tile.id || pinDrag?.tileId === tile.id || (groupDrag !== null && groupDragSet.has(tile.id)),
          'griddle-resizing': resize?.tileId === tile.id,
          'griddle-selected': selection.has(tile.id),
        }]"
        :style="tileStyle(tile)"
        @pointerdown="(e) => onTilePointerDown(e, tile)"
        :ref="(el) => registerNode(tile.id, el as HTMLDivElement | null)"
      >
        <slot name="tile" :tile="tile" :selected="selection.has(tile.id)" />
        <template v-if="tile.resizable !== false">
          <div
            v-for="c in tileHandles(tile)"
            :key="c"
            :data-griddle-handle="c"
            :style="handleStyle(c)"
            @pointerdown="(e) => onResizeHandleDown(e, tile, c)"
          ></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import type { CameraState, Corner, Tile } from '@griddle/core';
import GriddleLoopGrid from './LoopGrid.vue';
import {
  visibleRange,
  visibleTiles,
  gridContentSize,
  DragController,
  GroupDragController,
  computeTileLayout,
  resolveStickyStacking,
  isOutOfFlow,
  pixelsToPin,
} from '@griddle/core';
import type { TileLayout } from '@griddle/core';
import type { GriddleApi } from './useGriddle.js';
import { animateReposition, liftTransition } from './animation.js';

const props = defineProps<{
  api: GriddleApi;
  className?: string;
  height?: number | string;
  showGrid?: boolean;
  /** Controlled selection. If omitted, managed internally. */
  selection?: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'selectionChange', selection: Set<string>): void;
  (e: 'drawCreate', rect: { col: number; row: number; w: number; h: number }): void;
  (e: 'dragStart', tileId: string): void;
  (e: 'dragEnd', tileId: string, committed: boolean): void;
  (e: 'resizeStart', tileId: string): void;
  (e: 'resizeEnd', tileId: string, committed: boolean): void;
  (e: 'cameraChange', camera: CameraState): void;
}>();

/** Loop mode delegates rendering to GriddleLoopGrid. */
const loopOn = computed(() => props.api.config.value.loop?.enabled === true);

const scrollEl = ref<HTMLDivElement | null>(null);
const viewport = ref({ scrollX: 0, scrollY: 0, width: 1000, height: 800 });

const config = computed(() => props.api.config.value);
const gap = computed(() => config.value.gap ?? 0);
const halfGap = computed(() => gap.value / 2);
const colSize = computed(() => config.value.unitWidth + gap.value);
const rowSize = computed(() => config.value.unitHeight + gap.value);

const range = computed(() => visibleRange(config.value, viewport.value, 4));
const rendered = computed(() => visibleTiles(props.api.tiles.value, range.value));
const contentSize = computed(() => gridContentSize(config.value, props.api.tiles.value));

const scrollStyle = computed(() => {
  // 'none' scroll mode: the grid sizes to content and lets the host page own
  // scrolling/panning — no internal scroll box, no touch-action lock.
  const contained = config.value.scroll !== 'none';
  const style: Record<string, string | number> = {
    position: 'relative',
    overflow: contained ? 'auto' : 'visible',
    height: contained ? (props.height ?? '100%') : (props.height ?? 'auto'),
  };
  if (contained) style.touchAction = 'none';
  return style;
});

const contentStyle = computed(() => {
  const showGrid = props.showGrid !== false;
  const bg = showGrid
    ? {
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)`,
        backgroundSize: `${colSize.value}px ${rowSize.value}px`,
      }
    : {};
  return {
    position: 'relative' as const,
    width: contentSize.value.width || '100%',
    height: contentSize.value.height || '100%',
    minWidth: '100%',
    minHeight: '100%',
    // Expose tile radius as a CSS variable so user tile content can pick it up.
    ['--griddle-tile-radius' as string]: (config.value.tileRadius ?? 4) + 'px',
    ...bg,
  };
});

// Selection state
const internalSelection = ref<Set<string>>(new Set());
const selection = computed(() => props.selection ?? internalSelection.value);
const groupDragSet = computed(() => new Set(groupDrag.value?.tileIds ?? []));
function setSelection(next: Set<string>) {
  if (!props.selection) internalSelection.value = next;
  emit('selectionChange', next);
}

const DEFAULT_DRAG_IGNORE = 'a, button, input, textarea, select, [contenteditable]';
const DRAG_START_THRESHOLD_PX = 12;

const dragController = new DragController(props.api.grid);
const groupDragController = new GroupDragController(props.api.grid);

interface DragVisual {
  tileId: string;
  pickupCol: number;
  pickupRow: number;
  deltaX: number;
  deltaY: number;
  indicatorCol: number | null;
  indicatorRow: number | null;
}
const drag = ref<DragVisual | null>(null);
let dragStartPointerX = 0;
let dragStartPointerY = 0;

interface GroupDragVisual {
  tileIds: string[];
  deltaX: number;
  deltaY: number;
  committedDcol: number;
  committedDrow: number;
}
const groupDrag = ref<GroupDragVisual | null>(null);

interface PinDragState {
  tileId: string;
  startPinPx: { x: number; y: number };
  startPointerX: number;
  startPointerY: number;
}
const pinDrag = ref<PinDragState | null>(null);

interface ResizeState {
  tileId: string;
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
const resize = ref<ResizeState | null>(null);

interface DrawState {
  anchorCol: number;
  anchorRow: number;
  currentCol: number;
  currentRow: number;
}
const drawState = ref<DrawState | null>(null);

interface PendingDragState {
  pointerId: number;
  tileId: string;
  tileElement: HTMLDivElement;
  startPointerX: number;
  startPointerY: number;
  mode: 'pin' | 'group' | 'single';
  groupTileIds: string[];
}
let pendingDrag: PendingDragState | null = null;

function beginPendingDrag(pending: PendingDragState): boolean {
  const tile = props.api.grid.getTile(pending.tileId);
  if (!tile) return false;

  // Capture only once movement proves this is a drag. Capturing on
  // pointer-down retargets pointer-up away from editable descendants and turns
  // ordinary clicks into drag start/end cycles.
  try {
    pending.tileElement.setPointerCapture(pending.pointerId);
  } catch {
    // The pointer may already have ended or the tile may have unmounted.
    return false;
  }

  dragStartPointerX = pending.startPointerX;
  dragStartPointerY = pending.startPointerY;

  if (pending.mode === 'pin') {
    const layout = computeTileLayout({
      tile,
      config: config.value,
      scrollX: viewport.value.scrollX,
      scrollY: viewport.value.scrollY,
      viewportWidth: viewport.value.width,
      viewportHeight: viewport.value.height,
    });
    const startPinPx =
      tile.position === 'fixed'
        ? { x: layout.left - viewport.value.scrollX, y: layout.top - viewport.value.scrollY }
        : { x: layout.left, y: layout.top };
    pinDrag.value = {
      tileId: tile.id,
      startPinPx,
      startPointerX: pending.startPointerX,
      startPointerY: pending.startPointerY,
    };
    emit('dragStart', tile.id);
    return true;
  }

  if (pending.mode === 'group') {
    if (!groupDragController.start(pending.groupTileIds)) return false;
    groupDrag.value = {
      tileIds: pending.groupTileIds,
      deltaX: 0,
      deltaY: 0,
      committedDcol: 0,
      committedDrow: 0,
    };
    emit('dragStart', tile.id);
    return true;
  }

  if (!dragController.start(tile.id)) return false;
  drag.value = {
    tileId: tile.id,
    pickupCol: tile.col,
    pickupRow: tile.row,
    deltaX: 0,
    deltaY: 0,
    indicatorCol: tile.col,
    indicatorRow: tile.row,
  };
  emit('dragStart', tile.id);
  return true;
}

function onTilePointerDown(e: PointerEvent, tile: Tile) {
  if (e.button !== 0) return;
  if (tile.draggable === false) return;
  if ((e.target as HTMLElement).dataset.griddleHandle) return;

  const ignoreSelector = config.value.dragIgnoreFrom ?? DEFAULT_DRAG_IGNORE;
  if (ignoreSelector && (e.target as HTMLElement).closest(ignoreSelector)) return;

  const metaKey = e.metaKey || e.ctrlKey;

  // Out-of-flow tiles get free-pixel drag (no selection).
  if (config.value.enablePositioning && isOutOfFlow(tile)) {
    pendingDrag = {
      pointerId: e.pointerId,
      tileId: tile.id,
      tileElement: e.currentTarget as HTMLDivElement,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      mode: 'pin',
      groupTileIds: [],
    };
    e.stopPropagation();
    return;
  }

  // Cmd/Ctrl+click toggles selection without starting a drag.
  if (metaKey) {
    e.preventDefault();
    const next = new Set(selection.value);
    if (next.has(tile.id)) {
      next.delete(tile.id);
    } else {
      next.add(tile.id);
    }
    setSelection(next);
    e.stopPropagation();
    return;
  }

  const tileIsSelected = selection.value.has(tile.id);

  if (!tileIsSelected) {
    setSelection(new Set([tile.id]));
  }

  // Defer capture and drag state until the pointer crosses the movement
  // threshold. A stationary pointer-down/up remains a normal click, including
  // when it starts inside contenteditable tile content.
  const effectiveSelection = tileIsSelected ? selection.value : new Set([tile.id]);
  const groupTileIds = Array.from(effectiveSelection);
  pendingDrag = {
    pointerId: e.pointerId,
    tileId: tile.id,
    tileElement: e.currentTarget as HTMLDivElement,
    startPointerX: e.clientX,
    startPointerY: e.clientY,
    mode: groupTileIds.length > 1 ? 'group' : 'single',
    groupTileIds,
  };
  e.stopPropagation();
}

function onBackgroundPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('[data-griddle-tile]')) return;
  // Draw-to-create is gated by config (default on). When disabled, empty-space
  // pointer-downs are a no-op so the host page keeps its native scroll/pan.
  if (config.value.interactive?.drawToCreate === false) return;
  setSelection(new Set());

  const el = scrollEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = e.clientX - rect.left + el.scrollLeft;
  const y = e.clientY - rect.top + el.scrollTop;
  const col = Math.floor(x / colSize.value);
  const row = Math.floor(y / rowSize.value);
  drawState.value = { anchorCol: col, anchorRow: row, currentCol: col, currentRow: row };
  (el as HTMLDivElement).setPointerCapture(e.pointerId);
}

function onResizeHandleDown(e: PointerEvent, tile: Tile, c: Corner) {
  if (tile.resizable === false) return;
  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  resize.value = {
    tileId: tile.id,
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
  emit('resizeStart', tile.id);
  e.stopPropagation();
}

function onPointerMove(e: PointerEvent) {
  if (drawState.value) {
    const el = scrollEl.value;
    if (el) {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft;
      const y = e.clientY - rect.top + el.scrollTop;
      const col = Math.max(0, Math.floor(x / colSize.value));
      const row = Math.max(0, Math.floor(y / rowSize.value));
      drawState.value = { ...drawState.value, currentCol: col, currentRow: row };
    }
    return;
  }

  const pending = pendingDrag;
  if (pending && e.pointerId === pending.pointerId) {
    const distance = Math.hypot(
      e.clientX - pending.startPointerX,
      e.clientY - pending.startPointerY,
    );
    if (distance <= DRAG_START_THRESHOLD_PX) return;

    pendingDrag = null;
    if (!beginPendingDrag(pending)) return;
    e.preventDefault();
  }

  const pd = pinDrag.value;
  const gd = groupDrag.value;
  const d = drag.value;
  const r = resize.value;
  if (pd) {
    const dx = e.clientX - pd.startPointerX;
    const dy = e.clientY - pd.startPointerY;
    const newPinPx = { x: pd.startPinPx.x + dx, y: pd.startPinPx.y + dy };
    const newPin = pixelsToPin(newPinPx, config.value);
    props.api.grid.setTilePinned(pd.tileId, newPin);
  }
  if (gd) {
    const dx = e.clientX - dragStartPointerX;
    const dy = e.clientY - dragStartPointerY;
    const dcol = Math.round(dx / colSize.value);
    const drow = Math.round(dy / rowSize.value);
    const result = groupDragController.update({ dcol, drow });
    groupDrag.value = {
      ...gd,
      deltaX: dx,
      deltaY: dy,
      committedDcol: result.indicatorDelta?.dcol ?? gd.committedDcol,
      committedDrow: result.indicatorDelta?.drow ?? gd.committedDrow,
    };
    if (result.changed) syncTiles();
  }
  if (d) {
    const dx = e.clientX - dragStartPointerX;
    const dy = e.clientY - dragStartPointerY;
    const candidateCol = d.pickupCol + Math.round(dx / colSize.value);
    const candidateRow = d.pickupRow + Math.round(dy / rowSize.value);
    const result = dragController.update({ col: candidateCol, row: candidateRow });
    drag.value = {
      ...d,
      deltaX: dx,
      deltaY: dy,
      indicatorCol: result.indicatorCell ? result.indicatorCell.col : null,
      indicatorRow: result.indicatorCell ? result.indicatorCell.row : null,
    };
    // DragController.restoreTiles() doesn't emit change events, so when the
    // candidate cell changes (especially returning to pickup), force-sync the
    // reactive tiles ref so the FLIP animation picks up displaced tile resets.
    if (result.changed) syncTiles();
  }
  if (r) {
    const dx = e.clientX - r.startPointerX;
    const dy = e.clientY - r.startPointerY;
    let dw = 0, dh = 0, dcol = 0, drow = 0;
    const stepsX = Math.round(dx / colSize.value);
    const stepsY = Math.round(dy / rowSize.value);
    if (r.corner === 'se' || r.corner === 'ne') dw = stepsX;
    if (r.corner === 'se' || r.corner === 'sw') dh = stepsY;
    if (r.corner === 'sw' || r.corner === 'nw') { dw = -stepsX; dcol = stepsX; }
    if (r.corner === 'ne' || r.corner === 'nw') { dh = -stepsY; drow = stepsY; }
    const tile = props.api.grid.getTile(r.tileId);
    const minW = tile?.minW ?? 1;
    const minH = tile?.minH ?? 1;
    const maxW = tile?.maxW ?? Infinity;
    const maxH = tile?.maxH ?? Infinity;
    const nW = Math.min(maxW, Math.max(minW, r.startW + dw));
    const nH = Math.min(maxH, Math.max(minH, r.startH + dh));
    const nC = r.startCol + dcol;
    const nR = r.startRow + drow;
    if (nW !== r.previewW || nH !== r.previewH || nC !== r.previewCol || nR !== r.previewRow) {
      resize.value = { ...r, previewW: nW, previewH: nH, previewCol: nC, previewRow: nR };
    }
  }
}

function syncTiles() {
  // DragController/GroupDragController may restore grid snapshots without
  // emitting change events. Force-sync the reactive tiles ref so the UI
  // reflects the grid's true state after a drag ends.
  props.api.tiles.value = props.api.grid.tiles;
  props.api.version.value++;
}

function onPointerUp(e: PointerEvent) {
  if (pendingDrag?.pointerId === e.pointerId) {
    pendingDrag = null;
    return;
  }
  if (drawState.value) {
    const ds = drawState.value;
    const col = Math.min(ds.anchorCol, ds.currentCol);
    const row = Math.min(ds.anchorRow, ds.currentRow);
    const w = Math.max(1, Math.abs(ds.currentCol - ds.anchorCol) + 1);
    const h = Math.max(1, Math.abs(ds.currentRow - ds.anchorRow) + 1);
    drawState.value = null;
    emit('drawCreate', { col, row, w, h });
    return;
  }
  if (pinDrag.value) {
    const tileId = pinDrag.value.tileId;
    pinDrag.value = null;
    emit('dragEnd', tileId, true);
  }
  if (groupDrag.value) {
    const tileIds = groupDrag.value.tileIds;
    const { committed } = groupDragController.end();
    groupDrag.value = null;
    syncTiles();
    const firstId = tileIds[0];
    if (firstId !== undefined) emit('dragEnd', firstId, committed);
  }
  if (drag.value) {
    const tileId = drag.value.tileId;
    const { committed } = dragController.end();
    drag.value = null;
    syncTiles();
    emit('dragEnd', tileId, committed);
  }
  const r = resize.value;
  if (r) {
    const t = props.api.grid.getTile(r.tileId);
    let committed = false;
    if (t) {
      if (r.previewCol !== t.col || r.previewRow !== t.row) {
        props.api.moveTile(r.tileId, { col: r.previewCol, row: r.previewRow });
      }
      if (r.previewW !== t.w || r.previewH !== t.h) {
        committed = props.api.resizeTile(r.tileId, { w: r.previewW, h: r.previewH });
      } else {
        committed = r.previewCol !== r.startCol || r.previewRow !== r.startRow
          || r.previewW !== r.startW || r.previewH !== r.startH;
      }
    }
    resize.value = null;
    emit('resizeEnd', r.tileId, committed);
  }
}

function updateViewport() {
  const el = scrollEl.value;
  if (!el) return;
  viewport.value = {
    scrollX: el.scrollLeft,
    scrollY: el.scrollTop,
    width: el.clientWidth,
    height: el.clientHeight,
  };
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') setSelection(new Set());
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  updateViewport();
  // scrollEl is absent while loop mode delegates to GriddleLoopGrid.
  const el = scrollEl.value;
  if (el) {
    el.addEventListener('scroll', updateViewport, { passive: true });
    ro = new ResizeObserver(updateViewport);
    ro.observe(el);
  }
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
  pendingDrag = null;
  const el = scrollEl.value;
  if (el) el.removeEventListener('scroll', updateViewport);
  ro?.disconnect();
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  window.removeEventListener('keydown', onKeyDown);
});

const tileNodes = new Map<string, HTMLDivElement>();
const prevRects = new Map<string, { x: number; y: number }>();
function registerNode(id: string, el: HTMLDivElement | null) {
  if (el) tileNodes.set(id, el);
  else tileNodes.delete(id);
}

watch(() => props.api.version.value, async () => {
  await nextTick();
  const draggerId = drag.value?.tileId ?? null;
  const gdSet = groupDragSet.value;
  for (const t of props.api.tiles.value) {
    const x = t.col * colSize.value + halfGap.value;
    const y = t.row * rowSize.value + halfGap.value;
    if (t.id === draggerId || gdSet.has(t.id)) {
      prevRects.set(t.id, { x, y });
      continue;
    }
    const p = prevRects.get(t.id);
    const node = tileNodes.get(t.id);
    if (p && node) {
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx !== 0 || dy !== 0) {
        animateReposition(node, dx, dy, config.value.animation);
      }
    }
    prevRects.set(t.id, { x, y });
  }
});

// Compute layouts for all rendered tiles in one pass so resolveStickyStacking
// can see every sticky tile and adjust them as a group. Recomputes whenever
// rendered, config, viewport, drag, resize, or pinDrag change.
const tileLayouts = computed(() => {
  const out = new Map<string, TileLayout>();
  const stickyEntries: { tile: Tile; layout: TileLayout }[] = [];
  const gd = groupDrag.value;
  const gdIds = groupDragSet.value;
  for (const tile of rendered.value) {
    let layout: TileLayout;
    if (resize.value?.tileId === tile.id) {
      const w = resize.value.previewW;
      const h = resize.value.previewH;
      layout = {
        left: resize.value.previewCol * colSize.value + halfGap.value,
        top: resize.value.previewRow * rowSize.value + halfGap.value,
        width: w * config.value.unitWidth + (w - 1) * gap.value,
        height: h * config.value.unitHeight + (h - 1) * gap.value,
        zIndex: 10,
        effective: 'static',
      };
    } else if (drag.value?.tileId === tile.id) {
      const d = drag.value;
      layout = {
        left: d.pickupCol * colSize.value + halfGap.value,
        top: d.pickupRow * rowSize.value + halfGap.value,
        width: tile.w * config.value.unitWidth + (tile.w - 1) * gap.value,
        height: tile.h * config.value.unitHeight + (tile.h - 1) * gap.value,
        transform: `translate(${d.deltaX}px, ${d.deltaY}px)`,
        zIndex: 20,
        effective: 'static',
      };
    } else if (gd && gdIds.has(tile.id)) {
      const pickup = groupDragController.pickupCell(tile.id);
      const left = (pickup ? pickup.col * colSize.value : tile.col * colSize.value) + halfGap.value;
      const top = (pickup ? pickup.row * rowSize.value : tile.row * rowSize.value) + halfGap.value;
      layout = {
        left,
        top,
        width: tile.w * config.value.unitWidth + (tile.w - 1) * gap.value,
        height: tile.h * config.value.unitHeight + (tile.h - 1) * gap.value,
        transform: `translate(${gd.deltaX}px, ${gd.deltaY}px)`,
        zIndex: 20,
        effective: 'static',
      };
    } else {
      layout = computeTileLayout({
        tile,
        config: config.value,
        scrollX: viewport.value.scrollX,
        scrollY: viewport.value.scrollY,
        viewportWidth: viewport.value.width,
        viewportHeight: viewport.value.height,
      });
      if (layout.effective === 'sticky') {
        stickyEntries.push({ tile, layout });
      }
    }
    out.set(tile.id, layout);
  }
  if (stickyEntries.length > 1) resolveStickyStacking(stickyEntries);
  return out;
});

function tileStyle(tile: Tile) {
  const isDragging = drag.value?.tileId === tile.id;
  const isGroupDragging = groupDragSet.value.has(tile.id) && groupDrag.value !== null;
  const isPinDragging = pinDrag.value?.tileId === tile.id;
  const isResizing = resize.value?.tileId === tile.id;
  const isSelected = selection.value.has(tile.id);
  const layout = tileLayouts.value.get(tile.id) ?? {
    left: 0, top: 0, width: 0, height: 0, zIndex: 1, effective: 'static' as const,
  };
  const lifted = isDragging || isPinDragging || isGroupDragging;
  return {
    position: 'absolute' as const,
    left: layout.left + 'px',
    top: layout.top + 'px',
    width: layout.width + 'px',
    height: layout.height + 'px',
    boxSizing: 'border-box' as const,
    cursor: lifted ? 'grabbing' : 'grab',
    userSelect: 'none' as const,
    zIndex: layout.zIndex,
    opacity: lifted || isResizing ? 0.85 : 1,
    willChange: 'transform, translate',
    transform: layout.transform ?? '',
    filter: lifted ? 'drop-shadow(0 8px 16px rgba(0,0,0,0.18))' : '',
    transition: lifted ? liftTransition(config.value.animation) : '',
    boxShadow: isSelected
      ? '0 0 0 3px rgba(59, 91, 219, 0.85), inset 0 0 0 1px rgba(59, 91, 219, 0.3)'
      : '',
    borderRadius: (config.value.tileRadius ?? 4) + 'px',
  };
}


const indicatorRect = computed(() => {
  const d = drag.value;
  if (!d || d.indicatorCol === null || d.indicatorRow === null) return null;
  const t = props.api.grid.getTile(d.tileId);
  if (!t) return null;
  return {
    left: d.indicatorCol * colSize.value + halfGap.value,
    top: d.indicatorRow * rowSize.value + halfGap.value,
    width: t.w * config.value.unitWidth + (t.w - 1) * gap.value,
    height: t.h * config.value.unitHeight + (t.h - 1) * gap.value,
  };
});

const drawGhostRect = computed(() => {
  const ds = drawState.value;
  if (!ds) return null;
  const col = Math.min(ds.anchorCol, ds.currentCol);
  const row = Math.min(ds.anchorRow, ds.currentRow);
  const w = Math.max(1, Math.abs(ds.currentCol - ds.anchorCol) + 1);
  const h = Math.max(1, Math.abs(ds.currentRow - ds.anchorRow) + 1);
  return {
    left: col * colSize.value + halfGap.value,
    top: row * rowSize.value + halfGap.value,
    width: w * config.value.unitWidth + (w - 1) * gap.value,
    height: h * config.value.unitHeight + (h - 1) * gap.value,
    label: `${w}×${h}`,
  };
});

function tileHandles(tile: Tile): Corner[] {
  return tile.resizeHandles ?? config.value.resizeHandles ?? ['se'];
}

function handleStyle(c: Corner) {
  const size = 12;
  const base = {
    position: 'absolute' as const,
    width: size + 'px',
    height: size + 'px',
    background: 'rgba(60,60,60,0.7)',
    border: '2px solid white',
    borderRadius: '3px',
    cursor: `${c}-resize`,
    touchAction: 'none' as const,
  } as Record<string, unknown>;
  if (c === 'nw') return { ...base, top: -size / 2 + 'px', left: -size / 2 + 'px' };
  if (c === 'ne') return { ...base, top: -size / 2 + 'px', right: -size / 2 + 'px' };
  if (c === 'sw') return { ...base, bottom: -size / 2 + 'px', left: -size / 2 + 'px' };
  return { ...base, bottom: -size / 2 + 'px', right: -size / 2 + 'px' };
}

const className = computed(() => props.className ?? '');
</script>

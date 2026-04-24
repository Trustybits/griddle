<template>
  <div
    ref="scrollEl"
    :class="className"
    :style="scrollStyle"
  >
    <div :style="contentStyle">
      <div
        v-for="tile in rendered"
        :key="tile.id"
        :data-griddle-tile="tile.id"
        :style="tileStyle(tile)"
        @pointerdown="(e) => onTilePointerDown(e, tile)"
        :ref="(el) => registerNode(tile.id, el as HTMLDivElement | null)"
      >
        <slot name="tile" :tile="tile" />
        <template v-if="tile.resizable !== false">
          <div
            v-for="c in (tile.resizeHandles ?? config.resizeHandles ?? ['se'])"
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
import type { Corner, Tile } from '@griddle/core';
import { visibleRange, visibleTiles, gridContentSize } from '@griddle/core';
import type { GriddleApi } from './useGriddle.js';

const props = defineProps<{
  api: GriddleApi;
  className?: string;
  height?: number | string;
  showGrid?: boolean;
}>();

const scrollEl = ref<HTMLDivElement | null>(null);
const viewport = ref({ scrollX: 0, scrollY: 0, width: 1000, height: 800 });

const config = computed(() => props.api.config.value);
const colSize = computed(() => config.value.unitWidth + (config.value.gap ?? 0));
const rowSize = computed(() => config.value.unitHeight + (config.value.gap ?? 0));

const range = computed(() => visibleRange(config.value, viewport.value, 4));
const rendered = computed(() => visibleTiles(props.api.tiles.value, range.value));
const contentSize = computed(() => gridContentSize(config.value, props.api.tiles.value));

const scrollStyle = computed(() => ({
  position: 'relative' as const,
  overflow: 'auto' as const,
  height: props.height ?? '100%',
  touchAction: 'none' as const,
}));

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
    ...bg,
  };
});

// --- drag / resize state ---
interface DragState {
  tileId: string;
  startPointerX: number;
  startPointerY: number;
  startCol: number;
  startRow: number;
  previewCol: number;
  previewRow: number;
}
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

const drag = ref<DragState | null>(null);
const resize = ref<ResizeState | null>(null);

function onTilePointerDown(e: PointerEvent, tile: Tile) {
  if (tile.draggable === false) return;
  if ((e.target as HTMLElement).dataset.griddleHandle) return;
  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  drag.value = {
    tileId: tile.id,
    startPointerX: e.clientX,
    startPointerY: e.clientY,
    startCol: tile.col,
    startRow: tile.row,
    previewCol: tile.col,
    previewRow: tile.row,
  };
  e.stopPropagation();
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
  e.stopPropagation();
}

function onPointerMove(e: PointerEvent) {
  const d = drag.value;
  const r = resize.value;
  if (d && config.value.snapDuringDrag !== false) {
    const dx = e.clientX - d.startPointerX;
    const dy = e.clientY - d.startPointerY;
    const col = Math.round(d.startCol + dx / colSize.value);
    const row = Math.round(d.startRow + dy / rowSize.value);
    if (col !== d.previewCol || row !== d.previewRow) {
      drag.value = { ...d, previewCol: col, previewRow: row };
    }
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
    const nW = Math.max(1, r.startW + dw);
    const nH = Math.max(1, r.startH + dh);
    const nC = r.startCol + dcol;
    const nR = r.startRow + drow;
    if (nW !== r.previewW || nH !== r.previewH || nC !== r.previewCol || nR !== r.previewRow) {
      resize.value = { ...r, previewW: nW, previewH: nH, previewCol: nC, previewRow: nR };
    }
  }
}

function onPointerUp() {
  const d = drag.value;
  const r = resize.value;
  if (d) {
    const t = props.api.grid.getTile(d.tileId);
    if (t && (d.previewCol !== t.col || d.previewRow !== t.row)) {
      props.api.moveTile(d.tileId, { col: d.previewCol, row: d.previewRow });
    }
    drag.value = null;
  }
  if (r) {
    const t = props.api.grid.getTile(r.tileId);
    if (t) {
      if (r.previewCol !== t.col || r.previewRow !== t.row) {
        props.api.moveTile(r.tileId, { col: r.previewCol, row: r.previewRow });
      }
      if (r.previewW !== t.w || r.previewH !== t.h) {
        props.api.resizeTile(r.tileId, { w: r.previewW, h: r.previewH });
      }
    }
    resize.value = null;
  }
}

// --- virtualization hooks ---
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

let ro: ResizeObserver | null = null;
onMounted(() => {
  updateViewport();
  const el = scrollEl.value!;
  el.addEventListener('scroll', updateViewport, { passive: true });
  ro = new ResizeObserver(updateViewport);
  ro.observe(el);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
});
onBeforeUnmount(() => {
  const el = scrollEl.value;
  if (el) el.removeEventListener('scroll', updateViewport);
  ro?.disconnect();
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
});

// --- FLIP animations ---
const tileNodes = new Map<string, HTMLDivElement>();
const prevRects = new Map<string, { x: number; y: number }>();
function registerNode(id: string, el: HTMLDivElement | null) {
  if (el) tileNodes.set(id, el);
  else tileNodes.delete(id);
}

watch(() => props.api.version.value, async () => {
  await nextTick();
  for (const t of props.api.tiles.value) {
    const x = t.col * colSize.value;
    const y = t.row * rowSize.value;
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
});

function tileStyle(tile: Tile) {
  const isDragging = drag.value?.tileId === tile.id;
  const isResizing = resize.value?.tileId === tile.id;
  const dC = isDragging ? drag.value!.previewCol : isResizing ? resize.value!.previewCol : tile.col;
  const dR = isDragging ? drag.value!.previewRow : isResizing ? resize.value!.previewRow : tile.row;
  const dW = isResizing ? resize.value!.previewW : tile.w;
  const dH = isResizing ? resize.value!.previewH : tile.h;
  return {
    position: 'absolute' as const,
    left: dC * colSize.value + 'px',
    top: dR * rowSize.value + 'px',
    width: (dW * config.value.unitWidth + (dW - 1) * (config.value.gap ?? 0)) + 'px',
    height: (dH * config.value.unitHeight + (dH - 1) * (config.value.gap ?? 0)) + 'px',
    boxSizing: 'border-box' as const,
    cursor: isDragging ? 'grabbing' : 'grab',
    userSelect: 'none' as const,
    zIndex: isDragging || isResizing ? 10 : 1,
    opacity: isDragging ? 0.85 : 1,
    willChange: 'transform',
  };
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

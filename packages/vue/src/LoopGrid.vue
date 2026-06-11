<template>
  <div
    ref="scrollEl"
    :class="className"
    :style="scrollStyle"
    @pointerdown="onContainerPointerDown"
    @click.capture="onClickCapture"
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
      <template v-for="inst in instances" :key="worldKey(inst)">
        <div
          v-if="!(drag && inst.tile.id === drag.tileId)"
          :data-griddle-tile="inst.tile.id"
          :data-griddle-instance="inst.key"
          :class="['griddle-tile', {
            'griddle-resizing': resize?.instanceKey === inst.key,
            'griddle-selected': editable && selection.has(inst.tile.id),
          }]"
          :style="instanceStyle(inst)"
          :ref="(el) => registerNode(worldKey(inst), el as HTMLDivElement | null)"
          @pointerdown="(e) => onTilePointerDown(e, inst)"
        >
          <slot name="tile" :tile="inst.tile" :selected="editable && selection.has(inst.tile.id)" />
          <template v-if="editable && inst.tile.resizable !== false">
            <div
              v-for="c in tileHandles(inst.tile)"
              :key="c"
              :data-griddle-handle="c"
              :style="handleStyle(c)"
              @pointerdown="(e) => onResizeHandleDown(e, inst, c)"
            ></div>
          </template>
        </div>
      </template>
      <div
        v-if="drag && draggedTile"
        :data-griddle-tile="draggedTile.id"
        class="griddle-tile griddle-dragging"
        :style="dragOverlayStyle"
      >
        <slot name="tile" :tile="draggedTile" :selected="selection.has(draggedTile.id)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Loop-mode renderer ("object looping") — see @griddle/core loop.ts for the
// coordinate model. Mirrors the React GriddleLoopGrid.
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import type { CameraState, CellPos, Corner, Tile } from '@griddle/core';
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
import type { GriddleApi } from './useGriddle.js';

const props = defineProps<{
  api: GriddleApi;
  className?: string;
  height?: number | string;
  showGrid?: boolean;
  selection?: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'selectionChange', selection: Set<string>): void;
  (e: 'dragStart', tileId: string): void;
  (e: 'dragEnd', tileId: string, committed: boolean): void;
  (e: 'resizeStart', tileId: string): void;
  (e: 'resizeEnd', tileId: string, committed: boolean): void;
  (e: 'cameraChange', camera: CameraState): void;
}>();

const DEFAULT_DRAG_IGNORE = 'a, button, input, textarea, select, [contenteditable]';
const PAN_THRESHOLD_PX = 4;

const scrollEl = ref<HTMLDivElement | null>(null);

const config = computed(() => props.api.config.value);
const loop = computed(() => resolveLoop(config.value));
const editable = computed(() => loop.value?.interaction === 'edit');
const gap = computed(() => config.value.gap ?? 0);
const halfGap = computed(() => gap.value / 2);
const colSize = computed(() => config.value.unitWidth + gap.value);
const rowSize = computed(() => config.value.unitHeight + gap.value);
const period = computed(() => loopPeriod(config.value));

// ---- camera + scroll plumbing -------------------------------------------
const pan = new PanController();
watch(loop, (l) => {
  if (l) pan.setPhysics({ friction: l.friction, ease: l.ease, maxVelocity: l.maxVelocity });
}, { immediate: true });

const expectedScroll = { x: -1, y: -1 };
const view = ref({ sxCell: 0, syCell: 0, kax: 0, kay: 0, vw: 1000, vh: 800 });
let lastCam: CameraState | null = null;
let raf = 0;

function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  const dx = el.scrollLeft - expectedScroll.x;
  const dy = el.scrollTop - expectedScroll.y;
  if (dx !== 0 || dy !== 0) {
    pan.scrollBy(dx, dy);
    expectedScroll.x = el.scrollLeft;
    expectedScroll.y = el.scrollTop;
  }
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const el = scrollEl.value;
  if (!el) return;
  const st = pan.tick(now);

  const sx = loopAnchorScroll(st.x, period.value.width);
  const sy = loopAnchorScroll(st.y, period.value.height);
  if (Math.abs(el.scrollLeft - sx) > 0.5) {
    el.scrollLeft = sx;
    expectedScroll.x = el.scrollLeft;
  }
  if (Math.abs(el.scrollTop - sy) > 0.5) {
    el.scrollTop = sy;
    expectedScroll.y = el.scrollTop;
  }

  const next = {
    sxCell: Math.floor(el.scrollLeft / colSize.value),
    syCell: Math.floor(el.scrollTop / rowSize.value),
    kax: Math.floor(st.x / period.value.width),
    kay: Math.floor(st.y / period.value.height),
    vw: el.clientWidth,
    vh: el.clientHeight,
  };
  const cur = view.value;
  if (
    next.sxCell !== cur.sxCell || next.syCell !== cur.syCell ||
    next.kax !== cur.kax || next.kay !== cur.kay ||
    next.vw !== cur.vw || next.vh !== cur.vh
  ) {
    view.value = next;
  }

  if (
    !lastCam || lastCam.x !== st.x || lastCam.y !== st.y ||
    lastCam.isMoving !== st.isMoving || lastCam.isDragging !== st.isDragging
  ) {
    lastCam = st;
    emit('cameraChange', st);
  }
}

const contentSize = computed(() =>
  loopContentSize(config.value, view.value.vw, view.value.vh),
);

const instances = computed(() => {
  void props.api.version.value; // re-run on grid changes
  const bufX = 2 * colSize.value;
  const bufY = 2 * rowSize.value;
  return loopInstances(config.value, props.api.tiles.value, {
    x: view.value.sxCell * colSize.value - bufX,
    y: view.value.syCell * rowSize.value - bufY,
    width: view.value.vw + colSize.value + 2 * bufX,
    height: view.value.vh + rowSize.value + 2 * bufY,
  });
});

// World-stable key: survives the seam teleport so DOM nodes are reused.
function worldKey(inst: LoopTileInstance): string {
  return `${inst.tile.id}@${inst.kx + view.value.kax - 1},${inst.ky + view.value.kay - 1}`;
}

// ---- pan gesture ('pan' interaction) -------------------------------------
let panGesture: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
let suppressClick = false;

function onContainerPointerDown(e: PointerEvent) {
  const onTile = !!(e.target as HTMLElement).closest('[data-griddle-tile]');
  if (editable.value) {
    if (!onTile) setSelection(new Set());
    return;
  }
  if (!loop.value?.dragPan || e.button !== 0) return;
  const ignoreSelector = config.value.dragIgnoreFrom ?? DEFAULT_DRAG_IGNORE;
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

// ---- selection ('edit' interaction) ---------------------------------------
const internalSelection = ref<Set<string>>(new Set());
const selection = computed(() => props.selection ?? internalSelection.value);
function setSelection(next: Set<string>) {
  if (!props.selection) internalSelection.value = next;
  emit('selectionChange', next);
}

// ---- tile drag / resize ('edit' interaction) ------------------------------
const dragController = new DragController(props.api.grid);

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
const drag = ref<LoopDragVisual | null>(null);
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
const resize = ref<LoopResizeState | null>(null);

function syncTiles() {
  props.api.tiles.value = props.api.grid.tiles;
  props.api.version.value++;
}

function onTilePointerDown(e: PointerEvent, inst: LoopTileInstance) {
  if (!editable.value) return; // pan mode: container pan handler takes it
  const tile = inst.tile;
  if (tile.draggable === false) return;
  if ((e.target as HTMLElement).dataset.griddleHandle) return;
  const ignoreSelector = config.value.dragIgnoreFrom ?? DEFAULT_DRAG_IGNORE;
  if (ignoreSelector && (e.target as HTMLElement).closest(ignoreSelector)) return;

  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    const next = new Set(selection.value);
    if (next.has(tile.id)) next.delete(tile.id);
    else next.add(tile.id);
    setSelection(next);
    e.stopPropagation();
    return;
  }
  setSelection(new Set([tile.id]));

  // No pointer capture: the grabbed instance unmounts (drag renders as an
  // overlay), which would release the capture mid-gesture.
  if (!dragController.start(tile.id)) return;
  dragStartPointerX = e.clientX;
  dragStartPointerY = e.clientY;
  drag.value = {
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
  emit('dragStart', tile.id);
  e.stopPropagation();
}

function onResizeHandleDown(e: PointerEvent, inst: LoopTileInstance, c: Corner) {
  if (!editable.value) return;
  const tile = inst.tile;
  if (tile.resizable === false) return;
  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  const baseLeft = tile.col * colSize.value + halfGap.value;
  const baseTop = tile.row * rowSize.value + halfGap.value;
  resize.value = {
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
  emit('resizeStart', tile.id);
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

  const d = drag.value;
  if (d) {
    const dx = e.clientX - dragStartPointerX;
    const dy = e.clientY - dragStartPointerY;
    const candidate: CellPos = wrapCell(
      {
        col: d.pickupCol + Math.round(dx / colSize.value),
        row: d.pickupRow + Math.round(dy / rowSize.value),
      },
      config.value,
    );
    const result = dragController.update(candidate);
    drag.value = {
      ...d,
      deltaX: dx,
      deltaY: dy,
      indicatorCol: result.indicatorCell ? result.indicatorCell.col : null,
      indicatorRow: result.indicatorCell ? result.indicatorCell.row : null,
    };
    if (result.changed) syncTiles();
  }

  const r = resize.value;
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
    const maxW = Math.min(tile?.maxW ?? Infinity, config.value.cols);
    const maxH = Math.min(tile?.maxH ?? Infinity, config.value.rows);
    const nW = Math.min(maxW, Math.max(minW, r.startW + dw));
    const nH = Math.min(maxH, Math.max(minH, r.startH + dh));
    const nC = r.startCol + dcol;
    const nR = r.startRow + drow;
    if (nW !== r.previewW || nH !== r.previewH || nC !== r.previewCol || nR !== r.previewRow) {
      resize.value = { ...r, previewW: nW, previewH: nH, previewCol: nC, previewRow: nR };
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
      const target = wrapCell({ col: r.previewCol, row: r.previewRow }, config.value);
      if (target.col !== t.col || target.row !== t.row) {
        props.api.moveTile(r.tileId, target);
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

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && editable.value) setSelection(new Set());
}

onMounted(() => {
  const el = scrollEl.value;
  if (el) {
    expectedScroll.x = el.scrollLeft;
    expectedScroll.y = el.scrollTop;
    el.addEventListener('scroll', onScroll, { passive: true });
  }
  raf = requestAnimationFrame(frame);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  scrollEl.value?.removeEventListener('scroll', onScroll);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  window.removeEventListener('keydown', onKeyDown);
});

// ---- FLIP for edit-mode repacks (keyed by world key) ----------------------
const tileNodes = new Map<string, HTMLDivElement>();
const prevRects = new Map<string, { x: number; y: number }>();
function registerNode(key: string, el: HTMLDivElement | null) {
  if (el) tileNodes.set(key, el);
  else tileNodes.delete(key);
}

watch(() => props.api.version.value, async () => {
  await nextTick();
  const draggerId = drag.value?.tileId ?? null;
  const seen = new Set<string>();
  for (const inst of instances.value) {
    const key = worldKey(inst);
    seen.add(key);
    const x = inst.left;
    const y = inst.top;
    if (editable.value && inst.tile.id !== draggerId) {
      const p = prevRects.get(key);
      const node = tileNodes.get(key);
      if (p && node) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (
          (dx !== 0 || dy !== 0) &&
          Math.abs(dx) < period.value.width / 2 &&
          Math.abs(dy) < period.value.height / 2
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
});

// ---- styles ----------------------------------------------------------------
const scrollStyle = computed(() => ({
  position: 'relative' as const,
  overflow: 'auto' as const,
  height: typeof props.height === 'number' ? props.height + 'px' : (props.height ?? '100%'),
  touchAction: 'none' as const,
  userSelect: 'none' as const,
  cursor: loop.value?.dragPan ? 'grab' : undefined,
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
    width: contentSize.value.width + 'px',
    height: contentSize.value.height + 'px',
    ['--griddle-tile-radius' as string]: (config.value.tileRadius ?? 4) + 'px',
    ...bg,
  };
});

function instanceStyle(inst: LoopTileInstance) {
  const r = resize.value;
  const isResizingInst = r?.instanceKey === inst.key;
  let left = inst.left;
  let top = inst.top;
  let width = inst.width;
  let heightPx = inst.height;
  if (isResizingInst && r) {
    left = r.previewCol * colSize.value + halfGap.value + r.instanceDx;
    top = r.previewRow * rowSize.value + halfGap.value + r.instanceDy;
    width = r.previewW * config.value.unitWidth + (r.previewW - 1) * gap.value;
    heightPx = r.previewH * config.value.unitHeight + (r.previewH - 1) * gap.value;
  }
  const isSelected = editable.value && selection.value.has(inst.tile.id);
  return {
    position: 'absolute' as const,
    left: left + 'px',
    top: top + 'px',
    width: width + 'px',
    height: heightPx + 'px',
    boxSizing: 'border-box' as const,
    cursor: editable.value ? 'grab' : undefined,
    userSelect: 'none' as const,
    zIndex: isResizingInst ? 10 : 1,
    opacity: isResizingInst ? 0.85 : 1,
    willChange: 'transform',
    boxShadow: isSelected
      ? '0 0 0 3px rgba(59, 91, 219, 0.85), inset 0 0 0 1px rgba(59, 91, 219, 0.3)'
      : '',
    borderRadius: (config.value.tileRadius ?? 4) + 'px',
  };
}

const draggedTile = computed<Tile | null>(() =>
  drag.value ? props.api.grid.getTile(drag.value.tileId) ?? null : null,
);

const dragOverlayStyle = computed(() => {
  const d = drag.value;
  const t = draggedTile.value;
  if (!d || !t) return {};
  return {
    position: 'absolute' as const,
    left: d.instanceLeft + 'px',
    top: d.instanceTop + 'px',
    width: t.w * config.value.unitWidth + (t.w - 1) * gap.value + 'px',
    height: t.h * config.value.unitHeight + (t.h - 1) * gap.value + 'px',
    boxSizing: 'border-box' as const,
    cursor: 'grabbing',
    userSelect: 'none' as const,
    zIndex: 20,
    opacity: 0.85,
    transform: `translate(${d.deltaX}px, ${d.deltaY}px)`,
    filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.18))',
    borderRadius: (config.value.tileRadius ?? 4) + 'px',
    pointerEvents: 'none' as const,
  };
});

const indicatorRect = computed(() => {
  const d = drag.value;
  if (!d || d.indicatorCol === null || d.indicatorRow === null) return null;
  const t = props.api.grid.getTile(d.tileId);
  if (!t) return null;
  const origin = nearestInstanceOrigin(
    config.value,
    { col: d.indicatorCol, row: d.indicatorRow },
    { x: d.instanceLeft + d.deltaX, y: d.instanceTop + d.deltaY },
  );
  return {
    left: origin.left,
    top: origin.top,
    width: t.w * config.value.unitWidth + (t.w - 1) * gap.value,
    height: t.h * config.value.unitHeight + (t.h - 1) * gap.value,
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

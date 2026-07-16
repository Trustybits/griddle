<template>
  <div
    ref="viewportEl"
    :class="className"
    :style="viewportStyle"
    @pointerdown="onContainerPointerDown"
    @click.capture="onClickCapture"
  >
    <div ref="planeEl" :style="planeStyle">
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
      <template v-for="inst in instances" :key="inst.key">
        <div
          v-if="!(drag && inst.tile.id === drag.tileId)"
          :data-griddle-tile="inst.tile.id"
          :data-griddle-instance="inst.key"
          :data-griddle-ghost="isGhost(inst) ? '' : undefined"
          :aria-hidden="isBase(inst) ? undefined : true"
          :class="['griddle-tile', {
            'griddle-resizing': resize?.instanceKey === inst.key,
            'griddle-selected': editable && isBase(inst) && selection.has(inst.tile.id),
          }]"
          :style="instanceStyle(inst)"
          :ref="(el) => registerNode(inst.key, el as HTMLDivElement | null)"
          @pointerdown="(e) => onTilePointerDown(e, inst)"
        >
          <slot name="tile" :tile="inst.tile" :selected="editable && isBase(inst) && selection.has(inst.tile.id)" />
          <template v-if="editable && isBase(inst) && inst.tile.resizable !== false">
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
// coordinate model. Mirrors the React GriddleLoopGrid: an overflow-hidden
// viewport, a transform-translated plane driven by an unbounded camera, and
// NO native scrolling (wheel deltas feed the camera directly).
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import type { CameraState, CellPos, Corner, Tile } from '@griddle/core';
import {
  DragController,
  PanController,
  loopInstances,
  loopPeriod,
  resolveLoop,
} from '@griddle/core';
import type { LoopTileInstance } from '@griddle/core';
import type { GriddleApi } from './useGriddle.js';
import { animateReposition } from './animation.js';
import { resolveResizePreview } from './interaction.js';

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

const viewportEl = ref<HTMLDivElement | null>(null);
const planeEl = ref<HTMLDivElement | null>(null);

const config = computed(() => props.api.config.value);
const loop = computed(() => resolveLoop(config.value));
const editable = computed(() => loop.value?.interaction === 'edit');
const gap = computed(() => config.value.gap ?? 0);
const halfGap = computed(() => gap.value / 2);
const colSize = computed(() => config.value.unitWidth + gap.value);
const rowSize = computed(() => config.value.unitHeight + gap.value);
const period = computed(() => loopPeriod(config.value, props.api.tiles.value));

// ---- camera plumbing ------------------------------------------------------
const pan = new PanController();
watch(loop, (l) => {
  if (l) pan.setPhysics({ friction: l.friction, ease: l.ease, maxVelocity: l.maxVelocity });
}, { immediate: true });

const view = ref({ cxCell: 0, cyCell: 0, vw: 1000, vh: 800 });
let lastCam: CameraState | null = null;
let raf = 0;
let resizeObserver: ResizeObserver | null = null;

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
  pan.scrollBy(e.deltaX * k, e.deltaY * k);
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const st = pan.tick(now);

  const plane = planeEl.value;
  if (plane) {
    plane.style.transform = `translate3d(${-st.x}px, ${-st.y}px, 0)`;
  }
  const el = viewportEl.value;
  if (el && props.showGrid !== false) {
    el.style.backgroundPosition = `${-st.x % colSize.value}px ${-st.y % rowSize.value}px`;
  }

  const cxCell = Math.floor(st.x / colSize.value);
  const cyCell = Math.floor(st.y / rowSize.value);
  const cur = view.value;
  if (cxCell !== cur.cxCell || cyCell !== cur.cyCell) {
    view.value = { ...cur, cxCell, cyCell };
  }

  if (
    !lastCam || lastCam.x !== st.x || lastCam.y !== st.y ||
    lastCam.isMoving !== st.isMoving || lastCam.isDragging !== st.isDragging
  ) {
    lastCam = st;
    emit('cameraChange', st);
  }
}

const instances = computed(() => {
  void props.api.version.value; // re-run on grid changes
  const bufX = 2 * colSize.value;
  const bufY = 2 * rowSize.value;
  return loopInstances(config.value, props.api.tiles.value, {
    x: view.value.cxCell * colSize.value - bufX,
    y: view.value.cyCell * rowSize.value - bufY,
    width: view.value.vw + colSize.value + 2 * bufX,
    height: view.value.vh + rowSize.value + 2 * bufY,
  });
});

// ---- pan gesture ----------------------------------------------------------
let panGesture: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
let suppressClick = false;

function onContainerPointerDown(e: PointerEvent) {
  const onTile = !!(e.target as HTMLElement).closest('[data-griddle-tile]');
  if (editable.value && !onTile) setSelection(new Set());
  // Tiles that start drags stopPropagation, so reaching here from a tile
  // means it was not draggable — panning is the right fallback.
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

function isBase(inst: LoopTileInstance): boolean {
  return inst.kx === 0 && inst.ky === 0;
}
function isGhost(inst: LoopTileInstance): boolean {
  return editable.value && !isBase(inst);
}

function onTilePointerDown(e: PointerEvent, inst: LoopTileInstance) {
  if (!editable.value) return; // pan mode: container pan handler takes it
  if (!isBase(inst)) return; // ghosts are display-only
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
    // Ghost edit: plain grid semantics in the base copy — no wrapping.
    const dx = e.clientX - dragStartPointerX;
    const dy = e.clientY - dragStartPointerY;
    const candidate: CellPos = {
      col: d.pickupCol + Math.round(dx / colSize.value),
      row: d.pickupRow + Math.round(dy / rowSize.value),
    };
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
    const stepsX = Math.round(dx / colSize.value);
    const stepsY = Math.round(dy / rowSize.value);
    const tile = props.api.grid.getTile(r.tileId);
    const preview = resolveResizePreview({
      corner: r.corner,
      startCol: r.startCol,
      startRow: r.startRow,
      startW: r.startW,
      startH: r.startH,
      stepsX,
      stepsY,
      minW: tile?.minW ?? 1,
      minH: tile?.minH ?? 1,
      maxW: tile?.maxW ?? Infinity,
      maxH: tile?.maxH ?? Infinity,
      cols: config.value.cols,
      rows: config.value.rows,
      infiniteX: config.value.infiniteX ?? config.value.cols === Infinity,
      infiniteY: config.value.infiniteY ?? config.value.rows === Infinity,
    });
    const nW = preview.w;
    const nH = preview.h;
    const nC = preview.col;
    const nR = preview.row;
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
      const target = { col: r.previewCol, row: r.previewRow };
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
  const el = viewportEl.value;
  if (el) {
    el.addEventListener('wheel', onWheel, { passive: false });
    const measure = () => {
      const cur = view.value;
      if (el.clientWidth !== cur.vw || el.clientHeight !== cur.vh) {
        view.value = { ...cur, vw: el.clientWidth, vh: el.clientHeight };
      }
    };
    measure();
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
  }
  raf = requestAnimationFrame(frame);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  viewportEl.value?.removeEventListener('wheel', onWheel);
  resizeObserver?.disconnect();
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
    const key = inst.key;
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
          animateReposition(node, dx, dy, config.value.animation);
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
const viewportStyle = computed(() => {
  const showGrid = props.showGrid !== false;
  const bg = showGrid
    ? {
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)`,
        backgroundSize: `${colSize.value}px ${rowSize.value}px`,
        backgroundPosition: '0 0',
      }
    : {};
  return {
    position: 'relative' as const,
    overflow: 'hidden' as const,
    height: typeof props.height === 'number' ? props.height + 'px' : (props.height ?? '100%'),
    touchAction: 'none' as const,
    userSelect: 'none' as const,
    willChange: 'translate',
    cursor: !editable.value && loop.value?.dragPan ? 'grab' : undefined,
    ['--griddle-tile-radius' as string]: (config.value.tileRadius ?? 4) + 'px',
    ...bg,
  };
});

const planeStyle = computed(() => ({
  position: 'absolute' as const,
  top: '0',
  left: '0',
  width: '0',
  height: '0',
  willChange: 'transform',
}));

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
  const ghost = isGhost(inst);
  const isSelected = editable.value && isBase(inst) && selection.value.has(inst.tile.id);
  return {
    position: 'absolute' as const,
    left: left + 'px',
    top: top + 'px',
    width: width + 'px',
    height: heightPx + 'px',
    boxSizing: 'border-box' as const,
    cursor: editable.value && isBase(inst) ? 'grab' : undefined,
    userSelect: 'none' as const,
    // Ghosts are display-only: pointer-transparent (so the gesture falls
    // through to drag-pan) and dimmed to mark the editable copy.
    pointerEvents: ghost ? ('none' as const) : undefined,
    zIndex: isResizingInst ? 10 : 1,
    opacity: isResizingInst ? 0.85 : ghost ? 0.55 : 1,
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

// Drop indicator: rendered in the base copy (ghost edit is plain-grid).
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

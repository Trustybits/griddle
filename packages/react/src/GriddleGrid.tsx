// GriddleGrid: the React rendering + interaction layer.
// - Virtualized tile rendering (only visible tiles are mounted)
// - Live-preview drag: as the cursor crosses cell boundaries the engine
//   continuously rewinds and re-attempts the move, so victims animate into
//   their new positions while the user is still dragging. The dragged tile
//   itself follows the cursor freely (no snap); a separate drop indicator
//   renders at the snapped candidate cell.
// - Corner resize handles
// - FLIP animations for repack — skipped for the active dragger.

import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { GriddleApi } from './useGriddle.js';
import type { CameraState, Corner, Tile } from '@griddle/core';
import { GriddleLoopGrid } from './LoopGrid.js';
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
import { useGridVersion } from './useGriddle.js';

export interface GriddleGridProps {
  api: GriddleApi;
  renderTile: (tile: Tile, selected: boolean) => ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Optional container height; default '100%'. */
  height?: number | string;
  /** Whether to render the background grid lines. Default true. */
  showGrid?: boolean;
  /** Controlled selection state. If omitted, selection is managed internally. */
  selection?: Set<string>;
  /** Called whenever the selection changes. */
  onSelectionChange?: (selection: Set<string>) => void;
  /** Called when the user draw-creates a new tile rect on empty space. */
  onDrawCreate?: (rect: { col: number; row: number; w: number; h: number }) => void;
  /** Called when a drag gesture begins (pointer down on a tile). */
  onDragStart?: (tileId: string) => void;
  /** Called when a drag gesture ends. `committed` is true if the tile moved. */
  onDragEnd?: (tileId: string, committed: boolean) => void;
  /** Called when a resize gesture begins (pointer down on a handle). */
  onResizeStart?: (tileId: string) => void;
  /** Called when a resize gesture ends. `committed` is true if the tile resized. */
  onResizeEnd?: (tileId: string, committed: boolean) => void;
  /**
   * Loop mode only: fires whenever the camera moves (offset, velocity,
   * isMoving, isDragging). Use it to drive velocity-based visual effects.
   * Called from the render loop — keep the handler cheap.
   */
  onCameraChange?: (camera: CameraState) => void;
}

interface DragVisual {
  tileId: string;
  pickupCol: number;
  pickupRow: number;
  deltaX: number;
  deltaY: number;
  indicatorCol: number | null;
  indicatorRow: number | null;
}

interface PinDragState {
  tileId: string;
  startPinPx: { x: number; y: number };
  startPointerX: number;
  startPointerY: number;
}

interface GroupDragVisual {
  tileIds: string[];
  /** Pixel delta from pointer pickup */
  deltaX: number;
  deltaY: number;
  /** Last committed cell delta (for drop indicators) */
  committedDcol: number;
  committedDrow: number;
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

interface DrawState {
  anchorCol: number;
  anchorRow: number;
  currentCol: number;
  currentRow: number;
}

const DEFAULT_DRAG_IGNORE = 'a, button, input, textarea, select, [contenteditable]';

/**
 * Renders the grid. When `config.loop.enabled` is set, delegates to the
 * loop-mode renderer (infinitely repeating plane); otherwise renders the
 * standard scrollable grid. Toggling loop at runtime remounts the surface.
 */
export function GriddleGrid(props: GriddleGridProps) {
  const loopOn = useSyncExternalStore(
    (cb) => props.api.grid.changes.on(() => cb()),
    () => props.api.config.loop?.enabled === true,
    () => props.api.config.loop?.enabled === true,
  );
  if (loopOn) return <GriddleLoopGrid {...props} />;
  return <GriddleStaticGrid {...props} />;
}

function GriddleStaticGrid(props: GriddleGridProps) {
  const {
    api, renderTile, className, style, height = '100%', showGrid = true,
    selection: controlledSelection, onSelectionChange, onDrawCreate,
    onDragStart, onDragEnd, onResizeStart, onResizeEnd,
  } = props;
  const config = api.config;
  const version = useGridVersion(api.grid);

  // Selection state (internal or controlled)
  const [internalSelection, setInternalSelection] = useState<Set<string>>(new Set());
  const selection = controlledSelection ?? internalSelection;
  const setSelection = useCallback((next: Set<string>) => {
    if (!controlledSelection) setInternalSelection(next);
    onSelectionChange?.(next);
  }, [controlledSelection, onSelectionChange]);

  // Virtualization viewport
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ scrollX: 0, scrollY: 0, width: 1000, height: 800 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setViewport({
        scrollX: el.scrollLeft,
        scrollY: el.scrollTop,
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const tiles = api.tiles;
  const _ = version; // subscribe

  const range = useMemo(() => visibleRange(config, viewport, 4), [config, viewport]);
  const rendered = useMemo(() => visibleTiles(tiles, range), [tiles, range]);
  const contentSize = useMemo(() => gridContentSize(config, tiles), [config, tiles]);

  const gap = config.gap ?? 0;
  const halfGap = gap / 2;
  const colSize = config.unitWidth + gap;
  const rowSize = config.unitHeight + gap;

  // Drag controller (lives across drags) + ephemeral visual state
  const dragControllerRef = useRef<DragController | null>(null);
  if (!dragControllerRef.current) {
    dragControllerRef.current = new DragController(api.grid);
  }
  const groupDragControllerRef = useRef<GroupDragController | null>(null);
  if (!groupDragControllerRef.current) {
    groupDragControllerRef.current = new GroupDragController(api.grid);
  }
  const [drag, setDrag] = useState<DragVisual | null>(null);
  const [groupDrag, setGroupDrag] = useState<GroupDragVisual | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [pinDrag, setPinDrag] = useState<PinDragState | null>(null);
  const dragRef = useRef<DragVisual | null>(null);
  const groupDragRef = useRef<GroupDragVisual | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const pinDragRef = useRef<PinDragState | null>(null);
  dragRef.current = drag;
  groupDragRef.current = groupDrag;
  resizeRef.current = resize;
  pinDragRef.current = pinDrag;
  const dragStartPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const drawStateRef = useRef<DrawState | null>(null);
  drawStateRef.current = drawState;

  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const onResizeStartRef = useRef(onResizeStart);
  onResizeStartRef.current = onResizeStart;
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeEndRef.current = onResizeEnd;

  // FLIP animation state: previousRects by id. Skip the dragger during drag —
  // it has its own cursor-driven inline transform.
  const prevRectsRef = useRef(new Map<string, { x: number; y: number; w: number; h: number }>());
  const tileNodes = useRef(new Map<string, HTMLDivElement>());

  useLayoutEffect(() => {
    const prev = prevRectsRef.current;
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    const draggerId = dragRef.current?.tileId ?? null;
    const groupDragIds = new Set(groupDragRef.current?.tileIds ?? []);
    for (const t of tiles) {
      const x = t.col * colSize + halfGap;
      const y = t.row * rowSize + halfGap;
      const w = t.w * config.unitWidth + (t.w - 1) * gap;
      const h = t.h * config.unitHeight + (t.h - 1) * gap;
      next.set(t.id, { x, y, w, h });
      if (t.id === draggerId || groupDragIds.has(t.id)) continue;
      const p = prev.get(t.id);
      const node = tileNodes.current.get(t.id);
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
    }
    prevRectsRef.current = next;
  }, [tiles, version, colSize, rowSize, config.unitWidth, config.unitHeight, config.gap]);

  // --- drag handlers ---
  const onTilePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, tile: Tile) => {
      if (tile.draggable === false) return;
      if ((e.target as HTMLElement).dataset.griddleHandle) return;

      const ignoreSelector = config.dragIgnoreFrom ?? DEFAULT_DRAG_IGNORE;
      if (ignoreSelector && (e.target as HTMLElement).closest(ignoreSelector)) return;

      const metaKey = e.metaKey || e.ctrlKey;

      // Out-of-flow tiles get free-pixel drag (no selection behavior).
      if (config.enablePositioning && isOutOfFlow(tile)) {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        const layout = computeTileLayout({
          tile,
          config,
          scrollX: viewport.scrollX,
          scrollY: viewport.scrollY,
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
        });
        const startPinPx =
          tile.position === 'fixed'
            ? { x: layout.left - viewport.scrollX, y: layout.top - viewport.scrollY }
            : { x: layout.left, y: layout.top };
        setPinDrag({
          tileId: tile.id,
          startPinPx,
          startPointerX: e.clientX,
          startPointerY: e.clientY,
        });
        onDragStartRef.current?.(tile.id);
        e.stopPropagation();
        return;
      }

      // Cmd/Ctrl+click toggles the tile in/out of the selection without
      // starting any drag. No pointer capture needed.
      if (metaKey) {
        e.preventDefault();
        const next = new Set(selection);
        if (next.has(tile.id)) {
          next.delete(tile.id);
        } else {
          next.add(tile.id);
        }
        setSelection(next);
        e.stopPropagation();
        return;
      }

      const tileIsSelected = selection.has(tile.id);

      if (!tileIsSelected) {
        setSelection(new Set([tile.id]));
      }

      // Capture pointer only when starting a drag.
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

      // Determine if this should be a group drag (2+ selected tiles including this one).
      const effectiveSelection = tileIsSelected ? selection : new Set([tile.id]);
      if (effectiveSelection.size > 1) {
        const ids = Array.from(effectiveSelection);
        const ctrl = groupDragControllerRef.current!;
        if (!ctrl.start(ids)) return;
        dragStartPointerRef.current = { x: e.clientX, y: e.clientY };
        setGroupDrag({
          tileIds: ids,
          deltaX: 0,
          deltaY: 0,
          committedDcol: 0,
          committedDrow: 0,
        });
        onDragStartRef.current?.(tile.id);
        e.stopPropagation();
        return;
      }

      // Single tile drag.
      const ctrl = dragControllerRef.current!;
      if (!ctrl.start(tile.id)) return;
      dragStartPointerRef.current = { x: e.clientX, y: e.clientY };
      setDrag({
        tileId: tile.id,
        pickupCol: tile.col,
        pickupRow: tile.row,
        deltaX: 0,
        deltaY: 0,
        indicatorCol: tile.col,
        indicatorRow: tile.row,
      });
      onDragStartRef.current?.(tile.id);
      e.stopPropagation();
    },
    [config, viewport, selection, setSelection],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (drawStateRef.current) {
        const el = scrollRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const x = e.clientX - rect.left + el.scrollLeft;
          const y = e.clientY - rect.top + el.scrollTop;
          const col = Math.max(0, Math.floor(x / colSize));
          const row = Math.max(0, Math.floor(y / rowSize));
          setDrawState({ ...drawStateRef.current, currentCol: col, currentRow: row });
        }
        return;
      }
      const pd = pinDragRef.current;
      const d = dragRef.current;
      const gd = groupDragRef.current;
      const r = resizeRef.current;
      if (pd) {
        const dx = e.clientX - pd.startPointerX;
        const dy = e.clientY - pd.startPointerY;
        const newPinPx = {
          x: pd.startPinPx.x + dx,
          y: pd.startPinPx.y + dy,
        };
        const newPin = pixelsToPin(newPinPx, config);
        api.grid.setTilePinned(pd.tileId, newPin);
      }
      if (gd) {
        const dx = e.clientX - dragStartPointerRef.current.x;
        const dy = e.clientY - dragStartPointerRef.current.y;
        const dcol = Math.round(dx / colSize);
        const drow = Math.round(dy / rowSize);
        const result = groupDragControllerRef.current!.update({ dcol, drow });
        setGroupDrag({
          ...gd,
          deltaX: dx,
          deltaY: dy,
          committedDcol: result.indicatorDelta?.dcol ?? gd.committedDcol,
          committedDrow: result.indicatorDelta?.drow ?? gd.committedDrow,
        });
      }
      if (d) {
        const dx = e.clientX - dragStartPointerRef.current.x;
        const dy = e.clientY - dragStartPointerRef.current.y;
        const candidateCol = d.pickupCol + Math.round(dx / colSize);
        const candidateRow = d.pickupRow + Math.round(dy / rowSize);
        const result = dragControllerRef.current!.update({
          col: candidateCol,
          row: candidateRow,
        });
        setDrag({
          ...d,
          deltaX: dx,
          deltaY: dy,
          indicatorCol: result.indicatorCell ? result.indicatorCell.col : null,
          indicatorRow: result.indicatorCell ? result.indicatorCell.row : null,
        });
      }
      if (r) {
        const dx = e.clientX - r.startPointerX;
        const dy = e.clientY - r.startPointerY;
        let dw = 0, dh = 0, dcol = 0, drow = 0;
        const stepsX = Math.round(dx / colSize);
        const stepsY = Math.round(dy / rowSize);
        if (r.corner === 'se' || r.corner === 'ne') dw = stepsX;
        if (r.corner === 'se' || r.corner === 'sw') dh = stepsY;
        if (r.corner === 'sw' || r.corner === 'nw') { dw = -stepsX; dcol = stepsX; }
        if (r.corner === 'ne' || r.corner === 'nw') { dh = -stepsY; drow = stepsY; }
        const tile = api.grid.getTile(r.tileId);
        const minW = tile?.minW ?? 1;
        const minH = tile?.minH ?? 1;
        const maxW = tile?.maxW ?? Infinity;
        const maxH = tile?.maxH ?? Infinity;
        const newW = Math.min(maxW, Math.max(minW, r.startW + dw));
        const newH = Math.min(maxH, Math.max(minH, r.startH + dh));
        const newCol = r.startCol + dcol;
        const newRow = r.startRow + drow;
        if (newW !== r.previewW || newH !== r.previewH || newCol !== r.previewCol || newRow !== r.previewRow) {
          setResize({ ...r, previewW: newW, previewH: newH, previewCol: newCol, previewRow: newRow });
        }
      }
    },
    [colSize, rowSize, api, config],
  );

  const onDrawCreateRef = useRef(onDrawCreate);
  onDrawCreateRef.current = onDrawCreate;

  const onPointerUp = useCallback(() => {
    if (drawStateRef.current) {
      const ds = drawStateRef.current;
      const col = Math.min(ds.anchorCol, ds.currentCol);
      const row = Math.min(ds.anchorRow, ds.currentRow);
      const w = Math.max(1, Math.abs(ds.currentCol - ds.anchorCol) + 1);
      const h = Math.max(1, Math.abs(ds.currentRow - ds.anchorRow) + 1);
      setDrawState(null);
      onDrawCreateRef.current?.({ col, row, w, h });
      return;
    }
    const pd = pinDragRef.current;
    const d = dragRef.current;
    const gd = groupDragRef.current;
    const r = resizeRef.current;
    if (pd) {
      const tileId = pd.tileId;
      setPinDrag(null);
      onDragEndRef.current?.(tileId, true);
    }
    if (gd) {
      const primaryId = gd.tileIds[0];
      const { committed } = groupDragControllerRef.current!.end();
      setGroupDrag(null);
      if (primaryId) onDragEndRef.current?.(primaryId, committed);
    }
    if (d) {
      const tileId = d.tileId;
      const { committed } = dragControllerRef.current!.end();
      setDrag(null);
      onDragEndRef.current?.(tileId, committed);
    }
    if (r) {
      const tile = api.grid.getTile(r.tileId);
      let committed = false;
      if (tile) {
        if (r.previewCol !== tile.col || r.previewRow !== tile.row) {
          api.moveTile(r.tileId, { col: r.previewCol, row: r.previewRow });
        }
        if (r.previewW !== tile.w || r.previewH !== tile.h) {
          committed = api.resizeTile(r.tileId, { w: r.previewW, h: r.previewH });
        } else {
          committed = r.previewCol !== r.startCol || r.previewRow !== r.startRow
            || r.previewW !== r.startW || r.previewH !== r.startH;
        }
      }
      setResize(null);
      onResizeEndRef.current?.(r.tileId, committed);
    }
  }, [api]);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  // Escape key clears selection.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection(new Set());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSelection]);

  // Click on empty space clears selection and starts draw-to-create.
  const onBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-griddle-tile]')) return;
      // Draw-to-create is gated by config (default on). When disabled, empty-
      // space pointer-downs are a no-op so the host page keeps native scroll/pan.
      if (config.interactive?.drawToCreate === false) return;
      setSelection(new Set());

      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft;
      const y = e.clientY - rect.top + el.scrollTop;
      const col = Math.floor(x / colSize);
      const row = Math.floor(y / rowSize);
      setDrawState({ anchorCol: col, anchorRow: row, currentCol: col, currentRow: row });
      el.setPointerCapture(e.pointerId);
    },
    [setSelection, colSize, rowSize, config],
  );

  const onResizeHandleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, tile: Tile, corner: Corner) => {
      if (tile.resizable === false) return;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setResize({
        tileId: tile.id,
        corner,
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
      });
      onResizeStartRef.current?.(tile.id);
      e.stopPropagation();
    },
    [],
  );

  // Background grid lines via CSS
  const bgStyle: CSSProperties = showGrid
    ? {
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)`,
        backgroundSize: `${colSize}px ${rowSize}px`,
        backgroundPosition: '0 0',
      }
    : {};

  const handles = config.resizeHandles ?? ['se'];

  // 'none' scroll mode: the grid sizes to content and lets the host page own
  // scrolling/panning — no internal scroll box, no touch-action lock.
  const contained = config.scroll !== 'none';

  // Compute layouts for all rendered tiles in one pass so resolveStickyStacking
  // can see every sticky tile and adjust them as a group. Recomputes whenever
  // the relevant inputs change.
  const groupDragSet = useMemo(
    () => new Set(groupDrag?.tileIds ?? []),
    [groupDrag?.tileIds],
  );
  const tileLayouts = useMemo(() => {
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
          width: w * config.unitWidth + (w - 1) * gap,
          height: h * config.unitHeight + (h - 1) * gap,
          zIndex: 10,
          effective: 'static',
        };
      } else if (drag?.tileId === tile.id) {
        layout = {
          left: drag.pickupCol * colSize + halfGap,
          top: drag.pickupRow * rowSize + halfGap,
          width: tile.w * config.unitWidth + (tile.w - 1) * gap,
          height: tile.h * config.unitHeight + (tile.h - 1) * gap,
          transform: `translate(${drag.deltaX}px, ${drag.deltaY}px)`,
          zIndex: 20,
          effective: 'static',
        };
      } else if (groupDrag && groupDragSet.has(tile.id)) {
        const pickup = groupDragControllerRef.current!.pickupCell(tile.id);
        const left = (pickup ? pickup.col * colSize : tile.col * colSize) + halfGap;
        const top = (pickup ? pickup.row * rowSize : tile.row * rowSize) + halfGap;
        layout = {
          left,
          top,
          width: tile.w * config.unitWidth + (tile.w - 1) * gap,
          height: tile.h * config.unitHeight + (tile.h - 1) * gap,
          transform: `translate(${groupDrag.deltaX}px, ${groupDrag.deltaY}px)`,
          zIndex: 20,
          effective: 'static',
        };
      } else {
        layout = computeTileLayout({
          tile,
          config,
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
  }, [rendered, drag, groupDrag, groupDragSet, resize, config, viewport, colSize, rowSize]);

  // Drop indicator rect (snapped to candidate cell, sized to dragger).
  let indicatorRect: { left: number; top: number; width: number; height: number } | null = null;
  if (drag && drag.indicatorCol !== null && drag.indicatorRow !== null) {
    const t = api.grid.getTile(drag.tileId);
    if (t) {
      indicatorRect = {
        left: drag.indicatorCol * colSize + halfGap,
        top: drag.indicatorRow * rowSize + halfGap,
        width: t.w * config.unitWidth + (t.w - 1) * gap,
        height: t.h * config.unitHeight + (t.h - 1) * gap,
      };
    }
  }

  // Draw-to-create ghost rect.
  let drawGhost: { left: number; top: number; width: number; height: number; label: string } | null = null;
  if (drawState) {
    const col = Math.min(drawState.anchorCol, drawState.currentCol);
    const row = Math.min(drawState.anchorRow, drawState.currentRow);
    const w = Math.max(1, Math.abs(drawState.currentCol - drawState.anchorCol) + 1);
    const h = Math.max(1, Math.abs(drawState.currentRow - drawState.anchorRow) + 1);
    drawGhost = {
      left: col * colSize + halfGap,
      top: row * rowSize + halfGap,
      width: w * config.unitWidth + (w - 1) * gap,
      height: h * config.unitHeight + (h - 1) * gap,
      label: `${w}\u00d7${h}`,
    };
  }

  return (
    <div
      ref={scrollRef}
      className={className}
      onPointerDown={onBackgroundPointerDown}
      style={{
        position: 'relative',
        overflow: contained ? 'auto' : 'visible',
        height: contained ? height : (props.height ?? 'auto'),
        ...(contained ? { touchAction: 'none' as const } : {}),
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: contentSize.width || '100%',
          height: contentSize.height || '100%',
          minWidth: '100%',
          minHeight: '100%',
          // Expose the tile radius as a CSS var so user tile components can
          // read it with var(--griddle-tile-radius) and stay in sync.
          ['--griddle-tile-radius' as never]: `${config.tileRadius ?? 4}px`,
          ...bgStyle,
        }}
      >
        {indicatorRect && (
          <div
            style={{
              position: 'absolute',
              left: indicatorRect.left,
              top: indicatorRect.top,
              width: indicatorRect.width,
              height: indicatorRect.height,
              boxSizing: 'border-box',
              border: '2px dashed rgba(59, 91, 219, 0.55)',
              background: 'rgba(59, 91, 219, 0.08)',
              borderRadius: config.tileRadius ?? 4,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        )}
        {drawGhost && (
          <div
            style={{
              position: 'absolute',
              left: drawGhost.left,
              top: drawGhost.top,
              width: drawGhost.width,
              height: drawGhost.height,
              boxSizing: 'border-box',
              border: '2px dashed rgba(59, 91, 219, 0.55)',
              background: 'rgba(59, 91, 219, 0.08)',
              borderRadius: config.tileRadius ?? 4,
              pointerEvents: 'none',
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 600,
              color: 'rgba(59, 91, 219, 0.8)',
              userSelect: 'none',
            }}
          >
            {drawGhost.label}
          </div>
        )}
        {rendered.map((tile) => {
          const isDragging = drag?.tileId === tile.id;
          const isGroupDragging = groupDragSet.has(tile.id);
          const isPinDragging = pinDrag?.tileId === tile.id;
          const isResizing = resize?.tileId === tile.id;
          const isSelected = selection.has(tile.id);
          const tileHandles = tile.resizeHandles ?? handles;

          const layout = tileLayouts.get(tile.id) ?? {
            left: 0, top: 0, width: 0, height: 0, zIndex: 1, effective: 'static' as const,
          };
          const left = layout.left;
          const top = layout.top;
          const width = layout.width;
          const heightPx = layout.height;
          const transform = layout.transform;
          const zIndex = layout.zIndex;

          const lifted = isDragging || isPinDragging || (isGroupDragging && groupDrag !== null);
          const tileStyle: CSSProperties = {
            position: 'absolute',
            left,
            top,
            width,
            height: heightPx,
            boxSizing: 'border-box',
            cursor: lifted ? 'grabbing' : 'grab',
            userSelect: 'none',
            zIndex,
            opacity: lifted || isResizing ? 0.85 : 1,
            willChange: 'transform',
            transform,
            filter: lifted ? 'drop-shadow(0 8px 16px rgba(0,0,0,0.18))' : undefined,
            transition: lifted ? 'filter 120ms ease-out, opacity 120ms ease-out' : undefined,
            boxShadow: isSelected
              ? '0 0 0 3px rgba(59, 91, 219, 0.85), inset 0 0 0 1px rgba(59, 91, 219, 0.3)'
              : undefined,
            borderRadius: config.tileRadius ?? 4,
          };

          return (
            <div
              key={tile.id}
              ref={(el) => {
                if (el) tileNodes.current.set(tile.id, el);
                else tileNodes.current.delete(tile.id);
              }}
              data-griddle-tile={tile.id}
              onPointerDown={(e) => onTilePointerDown(e, tile)}
              style={tileStyle}
            >
              {renderTile(tile, isSelected)}
              {tile.resizable !== false &&
                tileHandles.map((c) => (
                  <div
                    key={c}
                    data-griddle-handle={c}
                    onPointerDown={(e) => onResizeHandleDown(e, tile, c)}
                    style={handleStyle(c)}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function handleStyle(c: Corner): CSSProperties {
  const size = 12;
  const base: CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    background: 'rgba(60,60,60,0.7)',
    border: '2px solid white',
    borderRadius: 3,
    cursor: `${c}-resize`,
    touchAction: 'none',
  };
  if (c === 'nw') return { ...base, top: -size / 2, left: -size / 2 };
  if (c === 'ne') return { ...base, top: -size / 2, right: -size / 2 };
  if (c === 'sw') return { ...base, bottom: -size / 2, left: -size / 2 };
  return { ...base, bottom: -size / 2, right: -size / 2 };
}

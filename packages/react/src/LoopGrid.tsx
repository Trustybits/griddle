// GriddleLoopGrid: loop-mode renderer ("object looping").
//
// The packed content (bounding box of the in-flow tiles) repeats infinitely
// in both axes. There is NO native scrolling: the viewport is an
// overflow-hidden box and an unbounded PanController camera translates a
// zero-sized "plane" element via CSS transform. Wheel deltas and (optionally)
// drag-to-pan feed the camera. Because nothing has scrollable overflow, no
// scrollbars appear and the component can never affect page layout.
//
// Interactions:
// - 'pan'  — drag anywhere pans the camera with configurable physics. Tiles
//            are view-only (no drag / resize / selection / draw-create).
// - 'edit' — "ghost edit": only the base copy (kx=0, ky=0) is interactive,
//            with ordinary non-wrapped grid semantics (drag, resize,
//            selection). The surrounding repeats render live but are
//            pointer-transparent ghosts (data-griddle-ghost, dimmed), so
//            seams preview in real time while editing stays plain-grid.
//            Wheel pans, and dragging anywhere outside the base copy pans.

import {
  CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Corner, Tile, CameraState, LoopTileInstance } from '@griddle/core';
import {
  DragController,
  PanController,
  loopInstances,
  loopPeriod,
  resolveLoop,
} from '@griddle/core';
import type { GriddleGridProps } from './GriddleGrid.js';
import { useGridVersion } from './useGriddle.js';

const DEFAULT_DRAG_IGNORE = 'a, button, input, textarea, select, [contenteditable]';
const PAN_THRESHOLD_PX = 4;

interface LoopView {
  /** Quantized camera position, in whole cells (world space). */
  cxCell: number;
  cyCell: number;
  /** Viewport pixel size. */
  vw: number;
  vh: number;
}

interface LoopDragVisual {
  tileId: string;
  /** World-space origin of the grabbed instance at pickup. */
  instanceLeft: number;
  instanceTop: number;
  pickupCol: number;
  pickupRow: number;
  deltaX: number;
  deltaY: number;
  indicatorCol: number | null;
  indicatorRow: number | null;
}

interface LoopResizeState {
  tileId: string;
  /** Key of the grabbed instance — only this copy previews live. */
  instanceKey: string;
  /** World-space period offset of the grabbed instance. */
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

export function GriddleLoopGrid(props: GriddleGridProps) {
  const {
    api, renderTile, className, style, height = '100%', showGrid = true,
    selection: controlledSelection, onSelectionChange,
    onDragStart, onDragEnd, onResizeStart, onResizeEnd, onCameraChange,
  } = props;
  const config = api.config;
  const version = useGridVersion(api.grid);
  const loop = useMemo(() => resolveLoop(config), [config]);
  const interaction = loop?.interaction ?? 'pan';
  const editable = interaction === 'edit';

  const gap = config.gap ?? 0;
  const halfGap = gap / 2;
  const colSize = config.unitWidth + gap;
  const rowSize = config.unitHeight + gap;

  const tiles = api.tiles;
  const _ = version; // subscribe
  const period = useMemo(() => loopPeriod(config, tiles), [config, tiles]);
  const periodRef = useRef(period);
  periodRef.current = period;

  // Selection (edit mode only).
  const [internalSelection, setInternalSelection] = useState<Set<string>>(new Set());
  const selection = controlledSelection ?? internalSelection;
  const setSelection = useCallback((next: Set<string>) => {
    if (!controlledSelection) setInternalSelection(next);
    onSelectionChange?.(next);
  }, [controlledSelection, onSelectionChange]);

  // Camera plumbing: the PanController is the single source of truth; the
  // rAF loop applies it to the plane transform imperatively (no re-render)
  // and publishes a cell-quantized view for virtualization.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<PanController | null>(null);
  if (!panRef.current) panRef.current = new PanController();
  const [view, setView] = useState<LoopView>({ cxCell: 0, cyCell: 0, vw: 1000, vh: 800 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  const lastCamRef = useRef<CameraState | null>(null);

  useEffect(() => {
    if (loop) {
      panRef.current!.setPhysics({
        friction: loop.friction,
        ease: loop.ease,
        maxVelocity: loop.maxVelocity,
      });
    }
  }, [loop]);

  // Wheel pans the camera ("native scroll" feel without scroll).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      panRef.current!.scrollBy(e.deltaX * k, e.deltaY * k);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Track viewport size.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      const cur = viewRef.current;
      if (vw !== cur.vw || vh !== cur.vh) setView({ ...cur, vw, vh });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // rAF loop: advance physics, move the plane, publish the quantized view.
  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const pan = panRef.current!;
      const st = pan.tick(now);

      const plane = planeRef.current;
      if (plane) {
        plane.style.transform = `translate3d(${-st.x}px, ${-st.y}px, 0)`;
      }
      const el = viewportRef.current;
      if (el && showGrid) {
        el.style.backgroundPosition = `${-st.x % colSize}px ${-st.y % rowSize}px`;
      }

      const cxCell = Math.floor(st.x / colSize);
      const cyCell = Math.floor(st.y / rowSize);
      const cur = viewRef.current;
      if (cxCell !== cur.cxCell || cyCell !== cur.cyCell) {
        setView({ ...cur, cxCell, cyCell });
      }

      const last = lastCamRef.current;
      if (
        !last || last.x !== st.x || last.y !== st.y ||
        last.isMoving !== st.isMoving || last.isDragging !== st.isDragging
      ) {
        lastCamRef.current = st;
        onCameraChangeRef.current?.(st);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [colSize, rowSize, showGrid]);

  // Visible instances: camera window padded by a 2-cell buffer.
  const instances = useMemo(() => {
    const bufX = 2 * colSize;
    const bufY = 2 * rowSize;
    return loopInstances(config, tiles, {
      x: view.cxCell * colSize - bufX,
      y: view.cyCell * rowSize - bufY,
      width: view.vw + colSize + 2 * bufX,
      height: view.vh + rowSize + 2 * bufY,
    });
  }, [config, tiles, view, colSize, rowSize, version]);

  // ---- pan gesture --------------------------------------------------------
  const panGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const onContainerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!loop?.dragPan) return;
      if (e.button !== 0) return;
      const ignoreSelector = config.dragIgnoreFrom ?? DEFAULT_DRAG_IGNORE;
      if (ignoreSelector && (e.target as HTMLElement).closest(ignoreSelector)) return;
      panGestureRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
    },
    [loop?.dragPan, config.dragIgnoreFrom],
  );

  const onContainerClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  // ---- tile drag / resize ('edit' interaction) ----------------------------
  const dragControllerRef = useRef<DragController | null>(null);
  if (!dragControllerRef.current) dragControllerRef.current = new DragController(api.grid);
  const [drag, setDrag] = useState<LoopDragVisual | null>(null);
  const [resize, setResize] = useState<LoopResizeState | null>(null);
  const dragRef = useRef<LoopDragVisual | null>(null);
  const resizeRef = useRef<LoopResizeState | null>(null);
  dragRef.current = drag;
  resizeRef.current = resize;
  const dragStartPointerRef = useRef({ x: 0, y: 0 });

  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const onResizeStartRef = useRef(onResizeStart);
  onResizeStartRef.current = onResizeStart;
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeEndRef.current = onResizeEnd;

  const onTilePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, inst: LoopTileInstance) => {
      if (!editable) return; // pan mode: bubble up to the container pan handler
      if (inst.kx !== 0 || inst.ky !== 0) return; // ghosts are display-only
      const tile = inst.tile;
      if (tile.draggable === false) return;
      if ((e.target as HTMLElement).dataset.griddleHandle) return;
      const ignoreSelector = config.dragIgnoreFrom ?? DEFAULT_DRAG_IGNORE;
      if (ignoreSelector && (e.target as HTMLElement).closest(ignoreSelector)) return;

      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const next = new Set(selection);
        if (next.has(tile.id)) next.delete(tile.id);
        else next.add(tile.id);
        setSelection(next);
        e.stopPropagation();
        return;
      }
      setSelection(new Set([tile.id]));

      // No pointer capture here: the grabbed instance unmounts (the drag
      // renders as an overlay), which would release the capture mid-gesture.
      // Window-level listeners track the pointer instead.
      const ctrl = dragControllerRef.current!;
      if (!ctrl.start(tile.id)) return;
      dragStartPointerRef.current = { x: e.clientX, y: e.clientY };
      setDrag({
        tileId: tile.id,
        instanceLeft: inst.left,
        instanceTop: inst.top,
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
    [editable, config, selection, setSelection],
  );

  const onResizeHandleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, inst: LoopTileInstance, corner: Corner) => {
      if (!editable) return;
      const tile = inst.tile;
      if (tile.resizable === false) return;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      const baseLeft = tile.col * colSize + halfGap;
      const baseTop = tile.row * rowSize + halfGap;
      setResize({
        tileId: tile.id,
        instanceKey: inst.key,
        instanceDx: inst.left - baseLeft,
        instanceDy: inst.top - baseTop,
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
    [editable, colSize, rowSize, halfGap],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const pg = panGestureRef.current;
      if (pg && e.pointerId === pg.pointerId) {
        const now = performance.now();
        const pan = panRef.current!;
        if (!pg.moved) {
          const dist = Math.hypot(e.clientX - pg.startX, e.clientY - pg.startY);
          if (dist >= PAN_THRESHOLD_PX) {
            pg.moved = true;
            pan.dragStart(pg.startX, pg.startY, now);
            pan.dragMove(e.clientX, e.clientY, now);
          }
        } else {
          pan.dragMove(e.clientX, e.clientY, now);
        }
        return;
      }

      const d = dragRef.current;
      if (d) {
        // Ghost edit: plain grid semantics in the base copy — no wrapping.
        const dx = e.clientX - dragStartPointerRef.current.x;
        const dy = e.clientY - dragStartPointerRef.current.y;
        const candidate = {
          col: d.pickupCol + Math.round(dx / colSize),
          row: d.pickupRow + Math.round(dy / rowSize),
        };
        const result = dragControllerRef.current!.update(candidate);
        setDrag({
          ...d,
          deltaX: dx,
          deltaY: dy,
          indicatorCol: result.indicatorCell ? result.indicatorCell.col : null,
          indicatorRow: result.indicatorCell ? result.indicatorCell.row : null,
        });
      }

      const r = resizeRef.current;
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
        const maxW = Math.min(tile?.maxW ?? Infinity, config.cols);
        const maxH = Math.min(tile?.maxH ?? Infinity, config.rows);
        const newW = Math.min(maxW, Math.max(minW, r.startW + dw));
        const newH = Math.min(maxH, Math.max(minH, r.startH + dh));
        const newCol = r.startCol + dcol;
        const newRow = r.startRow + drow;
        if (newW !== r.previewW || newH !== r.previewH || newCol !== r.previewCol || newRow !== r.previewRow) {
          setResize({ ...r, previewW: newW, previewH: newH, previewCol: newCol, previewRow: newRow });
        }
      }
    },
    [colSize, rowSize, config, api],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const pg = panGestureRef.current;
      if (pg && e.pointerId === pg.pointerId) {
        if (pg.moved) {
          panRef.current!.dragEnd(performance.now());
          suppressClickRef.current = true;
        }
        panGestureRef.current = null;
        return;
      }

      const d = dragRef.current;
      if (d) {
        const tileId = d.tileId;
        const { committed } = dragControllerRef.current!.end();
        setDrag(null);
        onDragEndRef.current?.(tileId, committed);
      }
      const r = resizeRef.current;
      if (r) {
        const tile = api.grid.getTile(r.tileId);
        let committed = false;
        if (tile) {
          const target = { col: r.previewCol, row: r.previewRow };
          if (target.col !== tile.col || target.row !== tile.row) {
            api.moveTile(r.tileId, target);
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
    },
    [api, config],
  );

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

  useEffect(() => {
    if (!editable) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(new Set());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editable, setSelection]);

  const onBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-griddle-tile]')) return;
      if (editable) setSelection(new Set());
    },
    [editable, setSelection],
  );

  // FLIP for edit-mode repacks, keyed by world key. Skips the active dragger
  // (overlay) and any apparent jump of >= half a period (period-size changes
  // can re-home instances).
  const prevRectsRef = useRef(new Map<string, { x: number; y: number }>());
  const tileNodes = useRef(new Map<string, HTMLDivElement>());

  useLayoutEffect(() => {
    const prev = prevRectsRef.current;
    const next = new Map<string, { x: number; y: number }>();
    const draggerId = dragRef.current?.tileId ?? null;
    for (const inst of instances) {
      const key = inst.key;
      next.set(key, { x: inst.left, y: inst.top });
      if (!editable || inst.tile.id === draggerId) continue;
      const p = prev.get(key);
      const node = tileNodes.current.get(key);
      if (p && node) {
        const dx = p.x - inst.left;
        const dy = p.y - inst.top;
        if (
          (dx !== 0 || dy !== 0) &&
          Math.abs(dx) < periodRef.current.width / 2 &&
          Math.abs(dy) < periodRef.current.height / 2
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
    prevRectsRef.current = next;
  }, [instances, editable]);

  // Drop indicator: rendered in the base copy (ghost edit is plain-grid).
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

  // Dragged tile renders as a single overlay copy following the cursor; its
  // grid instances are hidden while the gesture is live (avoids key churn as
  // the live preview wraps its cell across the seam).
  const draggedTile = drag ? api.grid.getTile(drag.tileId) : null;

  const bgStyle: CSSProperties = showGrid
    ? {
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)`,
        backgroundSize: `${colSize}px ${rowSize}px`,
        backgroundPosition: '0 0',
      }
    : {};

  const handles = config.resizeHandles ?? ['se'];

  return (
    <div
      ref={viewportRef}
      className={className}
      onPointerDown={(e) => {
        onContainerPointerDown(e);
        onBackgroundPointerDown(e);
      }}
      onClickCapture={onContainerClickCapture}
      style={{
        position: 'relative',
        overflow: 'hidden',
        height,
        touchAction: 'none',
        userSelect: 'none',
        cursor: !editable && loop?.dragPan ? 'grab' : undefined,
        ['--griddle-tile-radius' as never]: `${config.tileRadius ?? 4}px`,
        ...bgStyle,
        ...style,
      }}
    >
      <div
        ref={planeRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          willChange: 'transform',
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
        {instances.map((inst) => {
          const tile = inst.tile;
          if (drag && tile.id === drag.tileId) return null;
          const key = inst.key;
          const isBase = inst.kx === 0 && inst.ky === 0;
          const isGhost = editable && !isBase;
          const isResizingInst = resize?.instanceKey === inst.key;
          const isSelected = editable && isBase && selection.has(tile.id);
          const tileHandles = tile.resizeHandles ?? handles;

          let left = inst.left;
          let top = inst.top;
          let width = inst.width;
          let heightPx = inst.height;
          if (isResizingInst && resize) {
            left = resize.previewCol * colSize + halfGap + resize.instanceDx;
            top = resize.previewRow * rowSize + halfGap + resize.instanceDy;
            width = resize.previewW * config.unitWidth + (resize.previewW - 1) * gap;
            heightPx = resize.previewH * config.unitHeight + (resize.previewH - 1) * gap;
          }

          const tileStyle: CSSProperties = {
            position: 'absolute',
            left,
            top,
            width,
            height: heightPx,
            boxSizing: 'border-box',
            cursor: editable && isBase ? 'grab' : undefined,
            userSelect: 'none',
            // Ghosts are display-only: pointer-transparent (so the gesture
            // falls through to drag-pan) and dimmed to mark the editable copy.
            pointerEvents: isGhost ? 'none' : undefined,
            zIndex: isResizingInst ? 10 : 1,
            opacity: isResizingInst ? 0.85 : isGhost ? 0.55 : 1,
            boxShadow: isSelected
              ? '0 0 0 3px rgba(59, 91, 219, 0.85), inset 0 0 0 1px rgba(59, 91, 219, 0.3)'
              : undefined,
            borderRadius: config.tileRadius ?? 4,
          };

          return (
            <div
              key={key}
              ref={(el) => {
                if (el) tileNodes.current.set(key, el);
                else tileNodes.current.delete(key);
              }}
              data-griddle-tile={tile.id}
              data-griddle-instance={key}
              data-griddle-ghost={isGhost ? '' : undefined}
              aria-hidden={isBase ? undefined : true}
              onPointerDown={(e) => onTilePointerDown(e, inst)}
              style={tileStyle}
            >
              {renderTile(tile, isSelected)}
              {editable && isBase && tile.resizable !== false &&
                tileHandles.map((c) => (
                  <div
                    key={c}
                    data-griddle-handle={c}
                    onPointerDown={(e) => onResizeHandleDown(e, inst, c)}
                    style={handleStyle(c)}
                  />
                ))}
            </div>
          );
        })}
        {drag && draggedTile && (
          <div
            data-griddle-tile={draggedTile.id}
            style={{
              position: 'absolute',
              left: drag.instanceLeft,
              top: drag.instanceTop,
              width: draggedTile.w * config.unitWidth + (draggedTile.w - 1) * gap,
              height: draggedTile.h * config.unitHeight + (draggedTile.h - 1) * gap,
              boxSizing: 'border-box',
              cursor: 'grabbing',
              userSelect: 'none',
              zIndex: 20,
              opacity: 0.85,
              transform: `translate(${drag.deltaX}px, ${drag.deltaY}px)`,
              filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.18))',
              borderRadius: config.tileRadius ?? 4,
              pointerEvents: 'none',
            }}
          >
            {renderTile(draggedTile, selection.has(draggedTile.id))}
          </div>
        )}
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

// GriddleLoopGrid: loop-mode renderer ("object looping").
//
// The finite cols x rows grid repeats infinitely in both axes. The scroll
// content spans N periods; the native scroll position is kept anchored inside
// the second period and teleported back by exactly one period when the camera
// crosses a seam (invisible, because the rendered instances are
// period-translated copies). An unbounded PanController camera is the single
// source of truth; native scroll deltas feed into it, and (in 'pan'
// interaction) drag-to-pan with momentum drives it.
//
// Interactions:
// - 'pan'  — drag anywhere pans the camera with configurable physics. Tiles
//            are view-only (no drag / resize / selection / draw-create).
// - 'edit' — tiles drag-n-drop as usual; drop cells wrap across the seam.
//            The camera moves via native scroll/wheel only.

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
  loopAnchorScroll,
  loopContentSize,
  loopInstances,
  loopPeriod,
  nearestInstanceOrigin,
  resolveLoop,
  wrapCell,
} from '@griddle/core';
import type { GriddleGridProps } from './GriddleGrid.js';
import { useGridVersion } from './useGriddle.js';

const DEFAULT_DRAG_IGNORE = 'a, button, input, textarea, select, [contenteditable]';
const PAN_THRESHOLD_PX = 4;

interface LoopView {
  /** Quantized scroll position, in whole cells (content space). */
  sxCell: number;
  syCell: number;
  /** Anchor period index per axis: floor(camera / period). */
  kax: number;
  kay: number;
  /** Viewport pixel size. */
  vw: number;
  vh: number;
}

interface LoopDragVisual {
  tileId: string;
  /** Content-space origin of the grabbed instance at pickup. */
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
  /** Content-space period offset of the grabbed instance. */
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
  const period = useMemo(() => loopPeriod(config), [config]);

  // Selection (edit mode only).
  const [internalSelection, setInternalSelection] = useState<Set<string>>(new Set());
  const selection = controlledSelection ?? internalSelection;
  const setSelection = useCallback((next: Set<string>) => {
    if (!controlledSelection) setInternalSelection(next);
    onSelectionChange?.(next);
  }, [controlledSelection, onSelectionChange]);

  // Camera + scroll plumbing.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<PanController | null>(null);
  if (!panRef.current) panRef.current = new PanController();
  const expectedScrollRef = useRef({ x: -1, y: -1 });
  const [view, setView] = useState<LoopView>({ sxCell: 0, syCell: 0, kax: 0, kay: 0, vw: 1000, vh: 800 });
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

  // Native scroll deltas feed the camera. Programmatic anchor writes are
  // excluded via expectedScrollRef.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    expectedScrollRef.current = { x: el.scrollLeft, y: el.scrollTop };
    const onScroll = () => {
      const dx = el.scrollLeft - expectedScrollRef.current.x;
      const dy = el.scrollTop - expectedScrollRef.current.y;
      if (dx !== 0 || dy !== 0) {
        panRef.current!.scrollBy(dx, dy);
        expectedScrollRef.current = { x: el.scrollLeft, y: el.scrollTop };
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // rAF loop: advance physics, anchor the scroll position (teleporting across
  // seams), and publish the quantized view used for rendering.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const pan = panRef.current!;
      const st = pan.tick(now);

      const sx = loopAnchorScroll(st.x, period.width);
      const sy = loopAnchorScroll(st.y, period.height);
      if (Math.abs(el.scrollLeft - sx) > 0.5) {
        el.scrollLeft = sx;
        expectedScrollRef.current.x = el.scrollLeft;
      }
      if (Math.abs(el.scrollTop - sy) > 0.5) {
        el.scrollTop = sy;
        expectedScrollRef.current.y = el.scrollTop;
      }

      const next: LoopView = {
        sxCell: Math.floor(el.scrollLeft / colSize),
        syCell: Math.floor(el.scrollTop / rowSize),
        kax: Math.floor(st.x / period.width),
        kay: Math.floor(st.y / period.height),
        vw: el.clientWidth,
        vh: el.clientHeight,
      };
      const cur = viewRef.current;
      if (
        next.sxCell !== cur.sxCell || next.syCell !== cur.syCell ||
        next.kax !== cur.kax || next.kay !== cur.kay ||
        next.vw !== cur.vw || next.vh !== cur.vh
      ) {
        setView(next);
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
  }, [period.width, period.height, colSize, rowSize]);

  const tiles = api.tiles;
  const _ = version; // subscribe

  const contentSize = useMemo(
    () => loopContentSize(config, view.vw, view.vh),
    [config, view.vw, view.vh],
  );

  // Visible instances, padded by a 2-cell buffer.
  const instances = useMemo(() => {
    const bufX = 2 * colSize;
    const bufY = 2 * rowSize;
    return loopInstances(config, tiles, {
      x: view.sxCell * colSize - bufX,
      y: view.syCell * rowSize - bufY,
      width: view.vw + colSize + 2 * bufX,
      height: view.vh + rowSize + 2 * bufY,
    });
  }, [config, tiles, view, colSize, rowSize, version]);

  // World-stable key: content period index + anchor period index. Survives
  // the seam teleport (content kx shifts by -1 exactly when kax shifts by +1)
  // so DOM nodes are reused instead of remounted.
  const worldKey = useCallback(
    (inst: LoopTileInstance) =>
      `${inst.tile.id}@${inst.kx + view.kax - 1},${inst.ky + view.kay - 1}`,
    [view.kax, view.kay],
  );

  // ---- pan gesture ('pan' interaction) -----------------------------------
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
        const dx = e.clientX - dragStartPointerRef.current.x;
        const dy = e.clientY - dragStartPointerRef.current.y;
        const candidate = wrapCell(
          {
            col: d.pickupCol + Math.round(dx / colSize),
            row: d.pickupRow + Math.round(dy / rowSize),
          },
          config,
        );
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
          const target = wrapCell({ col: r.previewCol, row: r.previewRow }, config);
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
  // (overlay) and any apparent jump of >= half a period (seam wrap artifacts).
  const prevRectsRef = useRef(new Map<string, { x: number; y: number }>());
  const tileNodes = useRef(new Map<string, HTMLDivElement>());

  useLayoutEffect(() => {
    const prev = prevRectsRef.current;
    const next = new Map<string, { x: number; y: number }>();
    const draggerId = dragRef.current?.tileId ?? null;
    for (const inst of instances) {
      const key = worldKey(inst);
      next.set(key, { x: inst.left, y: inst.top });
      if (!editable || inst.tile.id === draggerId) continue;
      const p = prev.get(key);
      const node = tileNodes.current.get(key);
      if (p && node) {
        const dx = p.x - inst.left;
        const dy = p.y - inst.top;
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
    prevRectsRef.current = next;
  }, [instances, worldKey, editable, period.width, period.height]);

  // Drop indicator: rendered at the period copy nearest the dragged instance.
  let indicatorRect: { left: number; top: number; width: number; height: number } | null = null;
  if (drag && drag.indicatorCol !== null && drag.indicatorRow !== null) {
    const t = api.grid.getTile(drag.tileId);
    if (t) {
      const origin = nearestInstanceOrigin(
        config,
        { col: drag.indicatorCol, row: drag.indicatorRow },
        { x: drag.instanceLeft + drag.deltaX, y: drag.instanceTop + drag.deltaY },
      );
      indicatorRect = {
        left: origin.left,
        top: origin.top,
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
      ref={scrollRef}
      className={className}
      onPointerDown={(e) => {
        onContainerPointerDown(e);
        onBackgroundPointerDown(e);
      }}
      onClickCapture={onContainerClickCapture}
      style={{
        position: 'relative',
        overflow: 'auto',
        height,
        touchAction: 'none',
        userSelect: 'none',
        cursor: loop?.dragPan ? 'grab' : undefined,
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: contentSize.width,
          height: contentSize.height,
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
        {instances.map((inst) => {
          const tile = inst.tile;
          if (drag && tile.id === drag.tileId) return null;
          const key = worldKey(inst);
          const isResizingInst = resize?.instanceKey === inst.key;
          const isSelected = editable && selection.has(tile.id);
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
            cursor: editable ? 'grab' : undefined,
            userSelect: 'none',
            zIndex: isResizingInst ? 10 : 1,
            opacity: isResizingInst ? 0.85 : 1,
            willChange: 'transform',
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
              onPointerDown={(e) => onTilePointerDown(e, inst)}
              style={tileStyle}
            >
              {renderTile(tile, isSelected)}
              {editable && tile.resizable !== false &&
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

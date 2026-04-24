// GriddleGrid: the React rendering + interaction layer.
// - Virtualized tile rendering (only visible tiles are mounted)
// - Pointer-event drag with snap-during-drag preview
// - Corner resize handles
// - FLIP animations for repack

import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GriddleApi } from './useGriddle.js';
import type { Corner, Tile } from '@griddle/core';
import { visibleRange, visibleTiles, gridContentSize } from '@griddle/core';
import { useGridVersion } from './useGriddle.js';

export interface GriddleGridProps {
  api: GriddleApi;
  renderTile: (tile: Tile) => ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Optional container height; default '100%'. */
  height?: number | string;
  /** Whether to render the background grid lines. Default true. */
  showGrid?: boolean;
}

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

export function GriddleGrid(props: GriddleGridProps) {
  const { api, renderTile, className, style, height = '100%', showGrid = true } = props;
  const config = api.config;
  const version = useGridVersion(api.grid);

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

  const colSize = config.unitWidth + (config.gap ?? 0);
  const rowSize = config.unitHeight + (config.gap ?? 0);

  // Drag & resize state
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  dragRef.current = drag;
  resizeRef.current = resize;

  // FLIP animation state: previousRects by id
  const prevRectsRef = useRef(new Map<string, { x: number; y: number; w: number; h: number }>());
  const tileNodes = useRef(new Map<string, HTMLDivElement>());

  useLayoutEffect(() => {
    const prev = prevRectsRef.current;
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const t of tiles) {
      const x = t.col * colSize;
      const y = t.row * rowSize;
      const w = t.w * config.unitWidth + (t.w - 1) * (config.gap ?? 0);
      const h = t.h * config.unitHeight + (t.h - 1) * (config.gap ?? 0);
      next.set(t.id, { x, y, w, h });
      const p = prev.get(t.id);
      const node = tileNodes.current.get(t.id);
      if (p && node) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx !== 0 || dy !== 0) {
          node.style.transition = 'none';
          node.style.transform = `translate(${dx}px, ${dy}px)`;
          // next frame → animate to 0
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
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      const state: DragState = {
        tileId: tile.id,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startCol: tile.col,
        startRow: tile.row,
        previewCol: tile.col,
        previewRow: tile.row,
      };
      setDrag(state);
      e.stopPropagation();
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      const r = resizeRef.current;
      if (d && api.config.snapDuringDrag !== false) {
        const dx = e.clientX - d.startPointerX;
        const dy = e.clientY - d.startPointerY;
        const col = Math.round(d.startCol + dx / colSize);
        const row = Math.round(d.startRow + dy / rowSize);
        if (col !== d.previewCol || row !== d.previewRow) {
          setDrag({ ...d, previewCol: col, previewRow: row });
        }
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
        const newW = Math.max(1, r.startW + dw);
        const newH = Math.max(1, r.startH + dh);
        const newCol = r.startCol + dcol;
        const newRow = r.startRow + drow;
        if (newW !== r.previewW || newH !== r.previewH || newCol !== r.previewCol || newRow !== r.previewRow) {
          setResize({ ...r, previewW: newW, previewH: newH, previewCol: newCol, previewRow: newRow });
        }
      }
    },
    [api, colSize, rowSize],
  );

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    const r = resizeRef.current;
    if (d) {
      const tile = api.grid.getTile(d.tileId);
      if (tile && (d.previewCol !== tile.col || d.previewRow !== tile.row)) {
        const ok = api.moveTile(d.tileId, { col: d.previewCol, row: d.previewRow });
        if (!ok) {
          // Snap-back: no-op, preview ghost disappears
        }
      }
      setDrag(null);
    }
    if (r) {
      const tile = api.grid.getTile(r.tileId);
      if (tile) {
        // If origin shifted (nw/ne/sw), move first, then resize.
        if (r.previewCol !== tile.col || r.previewRow !== tile.row) {
          api.moveTile(r.tileId, { col: r.previewCol, row: r.previewRow });
        }
        if (r.previewW !== tile.w || r.previewH !== tile.h) {
          api.resizeTile(r.tileId, { w: r.previewW, h: r.previewH });
        }
      }
      setResize(null);
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

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'auto',
        height,
        touchAction: 'none',
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
          ...bgStyle,
        }}
      >
        {rendered.map((tile) => {
          const isDragging = drag?.tileId === tile.id;
          const isResizing = resize?.tileId === tile.id;
          const displayCol = isDragging ? drag!.previewCol : isResizing ? resize!.previewCol : tile.col;
          const displayRow = isDragging ? drag!.previewRow : isResizing ? resize!.previewRow : tile.row;
          const displayW = isResizing ? resize!.previewW : tile.w;
          const displayH = isResizing ? resize!.previewH : tile.h;
          const left = displayCol * colSize;
          const top = displayRow * rowSize;
          const width = displayW * config.unitWidth + (displayW - 1) * (config.gap ?? 0);
          const height = displayH * config.unitHeight + (displayH - 1) * (config.gap ?? 0);
          const tileHandles = tile.resizeHandles ?? handles;

          return (
            <div
              key={tile.id}
              ref={(el) => {
                if (el) tileNodes.current.set(tile.id, el);
                else tileNodes.current.delete(tile.id);
              }}
              data-griddle-tile={tile.id}
              onPointerDown={(e) => onTilePointerDown(e, tile)}
              style={{
                position: 'absolute',
                left,
                top,
                width,
                height,
                boxSizing: 'border-box',
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                zIndex: isDragging || isResizing ? 10 : 1,
                opacity: isDragging ? 0.85 : 1,
                willChange: 'transform',
              }}
            >
              {renderTile(tile)}
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

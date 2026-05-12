// Virtualization helpers. Given a viewport (px) and scroll offset (px), compute
// the range of cells that are visible plus a buffer. The adapters use this to
// decide which tiles to actually render.

import type { CellRect, GridConfig, Tile } from './types.js';
import { rectsOverlap } from './geometry.js';

export interface Viewport {
  /** Pixel offset of the viewport relative to the grid origin (0,0 cell). */
  scrollX: number;
  scrollY: number;
  /** Pixel size of the viewport. */
  width: number;
  height: number;
}

export interface VisibleRange extends CellRect {}

/** Compute the visible cell rect for a given viewport, padded by `buffer` cells. */
export function visibleRange(
  config: GridConfig,
  vp: Viewport,
  buffer = 2,
): VisibleRange {
  const colSize = config.unitWidth + (config.gap ?? 0);
  const rowSize = config.unitHeight + (config.gap ?? 0);
  const col0 = Math.max(0, Math.floor(vp.scrollX / colSize) - buffer);
  const row0 = Math.max(0, Math.floor(vp.scrollY / rowSize) - buffer);
  const col1 = Math.ceil((vp.scrollX + vp.width) / colSize) + buffer;
  const row1 = Math.ceil((vp.scrollY + vp.height) / rowSize) + buffer;

  const maxCol = config.infiniteX || config.cols === Infinity ? col1 : Math.min(col1, config.cols);
  const maxRow = config.infiniteY || config.rows === Infinity ? row1 : Math.min(row1, config.rows);

  return {
    col: col0,
    row: row0,
    w: Math.max(0, maxCol - col0),
    h: Math.max(0, maxRow - row0),
  };
}

/**
 * Filter tiles to only those overlapping the visible range. Tiles that are NOT
 * laid out by their grid cell (`absolute`, `fixed`, `sticky`) are always
 * included — their on-screen position is independent of their `col/row`, so
 * filtering by cell-overlap would incorrectly cull them when the user scrolls
 * past their natural cell.
 */
export function visibleTiles(tiles: Tile[], range: VisibleRange): Tile[] {
  return tiles.filter((t) => {
    if (t.position && t.position !== 'static' && t.position !== 'relative') {
      return true;
    }
    return rectsOverlap({ col: t.col, row: t.row, w: t.w, h: t.h }, range);
  });
}

/** Compute the total pixel size of the grid content (for scroll container sizing). */
export function gridContentSize(
  config: GridConfig,
  tiles: Tile[],
): { width: number; height: number } {
  const gap = config.gap ?? 0;
  const colSize = config.unitWidth + gap;
  const rowSize = config.unitHeight + gap;
  let maxCol = config.infiniteX || config.cols === Infinity ? 0 : config.cols;
  let maxRow = config.infiniteY || config.rows === Infinity ? 0 : config.rows;
  for (const t of tiles) {
    maxCol = Math.max(maxCol, t.col + t.w + 2);
    maxRow = Math.max(maxRow, t.row + t.h + 2);
  }
  return {
    width: maxCol * colSize,
    height: maxRow * rowSize,
  };
}

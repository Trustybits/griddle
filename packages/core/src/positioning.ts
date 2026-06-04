// Positioning helpers — pure functions, no state.
//
// Tiles can opt out of grid flow by setting `position: 'absolute'` or `'fixed'`.
// Out-of-flow tiles keep their `col/row/w/h` fields (so they can fall back to
// in-flow if the user toggles position back to 'static') but the layout engine
// ignores them — they don't displace neighbors and they don't get displaced.
//
// Coordinate translation between the configured unit space (pixels / subcell /
// cells) and raw pixels lives here so adapters and engine share one source of
// truth.

import type { GridConfig, Tile } from './types.js';

/**
 * Whether a tile participates in grid layout. `static`, `relative`, `sticky`,
 * and tiles with no `position` set are all in flow. `absolute` and `fixed`
 * tiles are not.
 */
export function isInFlow(tile: Tile): boolean {
  const p = tile.position;
  return !p || p === 'static' || p === 'relative' || p === 'sticky';
}

/** True for tiles that the engine should ignore for collisions and displacement. */
export function isOutOfFlow(tile: Tile): boolean {
  return !isInFlow(tile);
}

/**
 * Convert `pinned` (in the configured `pinUnits`) to raw pixels. Used by
 * adapters to compute `left/top` for absolute and fixed tiles.
 */
export function pinnedToPixels(
  pinned: { x: number; y: number },
  config: GridConfig,
): { x: number; y: number } {
  const colSize = config.unitWidth + (config.gap ?? 0);
  const rowSize = config.unitHeight + (config.gap ?? 0);
  switch (config.pinUnits ?? 'pixels') {
    case 'pixels':
      return { x: pinned.x, y: pinned.y };
    case 'subcell':
      return { x: pinned.x * colSize, y: pinned.y * rowSize };
    case 'cells':
      return { x: Math.round(pinned.x) * colSize, y: Math.round(pinned.y) * rowSize };
  }
}

/** Inverse of `pinnedToPixels`. Convert pixels back to the configured pin-unit space. */
export function pixelsToPin(
  pixels: { x: number; y: number },
  config: GridConfig,
): { x: number; y: number } {
  const colSize = config.unitWidth + (config.gap ?? 0);
  const rowSize = config.unitHeight + (config.gap ?? 0);
  switch (config.pinUnits ?? 'pixels') {
    case 'pixels':
      return { x: pixels.x, y: pixels.y };
    case 'subcell':
      return { x: pixels.x / colSize, y: pixels.y / rowSize };
    case 'cells':
      return { x: Math.round(pixels.x / colSize), y: Math.round(pixels.y / rowSize) };
  }
}

/**
 * Convert `offset` (in the configured `relativeUnits`) to raw pixels. Used by
 * adapters to compute the visual nudge for `relative` tiles.
 */
export function offsetToPixels(
  offset: { x: number; y: number },
  config: GridConfig,
): { x: number; y: number } {
  const colSize = config.unitWidth + (config.gap ?? 0);
  const rowSize = config.unitHeight + (config.gap ?? 0);
  if ((config.relativeUnits ?? 'pixels') === 'pixels') {
    return { x: offset.x, y: offset.y };
  }
  return { x: offset.x * colSize, y: offset.y * rowSize };
}

/** Inverse of `offsetToPixels`. */
export function pixelsToOffset(
  pixels: { x: number; y: number },
  config: GridConfig,
): { x: number; y: number } {
  const colSize = config.unitWidth + (config.gap ?? 0);
  const rowSize = config.unitHeight + (config.gap ?? 0);
  if ((config.relativeUnits ?? 'pixels') === 'pixels') {
    return { x: pixels.x, y: pixels.y };
  }
  return { x: pixels.x / colSize, y: pixels.y / rowSize };
}

/**
 * Inputs to `computeTileLayout`. The adapter supplies live viewport/scroll
 * values so sticky and fixed tiles can react to scrolling.
 */
export interface TileLayoutInput {
  tile: { col: number; row: number; w: number; h: number; position?: import('./types.js').TilePosition; pinned?: { x: number; y: number }; offset?: { x: number; y: number }; sticky?: import('./types.js').StickyConfig };
  config: import('./types.js').GridConfig;
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface TileLayout {
  /** Left edge in pixels relative to the scroll content origin. */
  left: number;
  /** Top edge in pixels relative to the scroll content origin. */
  top: number;
  /** Rendered width in pixels (derived from w + cellSize + gap). */
  width: number;
  /** Rendered height in pixels. */
  height: number;
  /** Optional CSS transform — currently used for `relative` offsets. */
  transform?: string;
  /** Stacking hint. Static tiles 1, sticky 40, absolute 30, fixed 50. */
  zIndex: number;
  /**
   * The effective position mode that was applied (after honoring
   * `enablePositioning`). Useful for adapters that want to add classes.
   */
  effective: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
}

/**
 * Compute where a tile should render in the scroll content, given current
 * scroll/viewport state. Encapsulates the math for relative offsets, absolute
 * pinned coords (in the configured pinUnits), fixed (anchored to the
 * scrollable viewport via `pinned + scroll` math), and sticky (pins at an
 * edge once scrolled past `threshold`). When `GridConfig.enablePositioning`
 * is false, every tile is treated as `static`.
 */
export function computeTileLayout(input: TileLayoutInput): TileLayout {
  const { tile, config, scrollX, scrollY, viewportWidth, viewportHeight } = input;
  const gap = config.gap ?? 0;
  const halfGap = gap / 2;
  const colSize = config.unitWidth + gap;
  const rowSize = config.unitHeight + gap;
  const width = tile.w * config.unitWidth + (tile.w - 1) * gap;
  const height = tile.h * config.unitHeight + (tile.h - 1) * gap;
  const enabled = config.enablePositioning ?? false;
  const pos = enabled ? (tile.position ?? 'static') : 'static';

  if (pos === 'absolute') {
    const px = pinnedToPixels(tile.pinned ?? { x: 0, y: 0 }, config);
    return { left: px.x, top: px.y, width, height, zIndex: 30, effective: 'absolute' };
  }
  if (pos === 'fixed') {
    const px = pinnedToPixels(tile.pinned ?? { x: 0, y: 0 }, config);
    return {
      left: px.x + scrollX,
      top: px.y + scrollY,
      width,
      height,
      zIndex: 50,
      effective: 'fixed',
    };
  }
  if (pos === 'sticky') {
    const sticky = tile.sticky ?? { edge: 'top', threshold: 0 };
    const threshold = sticky.threshold ?? 0;
    let left = tile.col * colSize + halfGap;
    let top = tile.row * rowSize + halfGap;
    if (sticky.edge === 'top') {
      const stickyTop = scrollY + threshold;
      if (top < stickyTop) top = stickyTop;
    } else if (sticky.edge === 'bottom') {
      const stickyBottom = scrollY + viewportHeight - height - threshold;
      if (top > stickyBottom) top = stickyBottom;
    } else if (sticky.edge === 'left') {
      const stickyLeft = scrollX + threshold;
      if (left < stickyLeft) left = stickyLeft;
    } else if (sticky.edge === 'right') {
      const stickyRight = scrollX + viewportWidth - width - threshold;
      if (left > stickyRight) left = stickyRight;
    }
    return { left, top, width, height, zIndex: 40, effective: 'sticky' };
  }
  // static / relative — tile is centered in its cell with halfGap inset
  const baseLeft = tile.col * colSize + halfGap;
  const baseTop = tile.row * rowSize + halfGap;
  if (pos === 'relative' && tile.offset) {
    const off = offsetToPixels(tile.offset, config);
    return {
      left: baseLeft,
      top: baseTop,
      width,
      height,
      transform: `translate(${off.x}px, ${off.y}px)`,
      zIndex: 1,
      effective: 'relative',
    };
  }
  return { left: baseLeft, top: baseTop, width, height, zIndex: 1, effective: 'static' };
}

/**
 * Adjust pre-computed layouts so multiple sticky tiles pinned to the same edge
 * stack instead of overlapping — the natural CSS-sticky behavior where, as you
 * scroll, a later sticky element pushes the previous one off-screen by taking
 * its pinned spot.
 *
 * Pass the array of {tile, layout} pairs (in any order); this mutates the
 * `layout.left`/`layout.top` values for sticky tiles in place. Run it AFTER
 * `computeTileLayout` and BEFORE rendering. Non-sticky entries are skipped.
 */
export function resolveStickyStacking(
  entries: { tile: TileLayoutInput['tile']; layout: TileLayout }[],
): void {
  const tops: { tile: TileLayoutInput['tile']; layout: TileLayout }[] = [];
  const bots: { tile: TileLayoutInput['tile']; layout: TileLayout }[] = [];
  const lefts: { tile: TileLayoutInput['tile']; layout: TileLayout }[] = [];
  const rights: { tile: TileLayoutInput['tile']; layout: TileLayout }[] = [];
  for (const e of entries) {
    if (e.layout.effective !== 'sticky') continue;
    const edge = e.tile.sticky?.edge ?? 'top';
    if (edge === 'top') tops.push(e);
    else if (edge === 'bottom') bots.push(e);
    else if (edge === 'left') lefts.push(e);
    else rights.push(e);
  }

  // Top: sort by natural row ascending. A later (larger-row) sticky whose
  // current rendered top intrudes on an earlier one pushes it up off-screen.
  tops.sort((a, b) => a.tile.row - b.tile.row);
  for (let i = 0; i < tops.length; i++) {
    const a = tops[i];
    if (!a) continue;
    for (let j = i + 1; j < tops.length; j++) {
      const b = tops[j];
      if (!b) continue;
      const aBottom = a.layout.top + a.layout.height;
      if (b.layout.top < aBottom) {
        a.layout.top = b.layout.top - a.layout.height;
        break;
      }
    }
  }

  // Bottom: mirror of top — sort by natural row descending.
  bots.sort((a, b) => b.tile.row - a.tile.row);
  for (let i = 0; i < bots.length; i++) {
    const a = bots[i];
    if (!a) continue;
    for (let j = i + 1; j < bots.length; j++) {
      const b = bots[j];
      if (!b) continue;
      const aTop = a.layout.top;
      const bBottom = b.layout.top + b.layout.height;
      if (bBottom > aTop) {
        a.layout.top = bBottom;
        break;
      }
    }
  }

  // Left: mirror of top along the col axis.
  lefts.sort((a, b) => a.tile.col - b.tile.col);
  for (let i = 0; i < lefts.length; i++) {
    const a = lefts[i];
    if (!a) continue;
    for (let j = i + 1; j < lefts.length; j++) {
      const b = lefts[j];
      if (!b) continue;
      const aRight = a.layout.left + a.layout.width;
      if (b.layout.left < aRight) {
        a.layout.left = b.layout.left - a.layout.width;
        break;
      }
    }
  }

  // Right: mirror of bottom along the col axis.
  rights.sort((a, b) => b.tile.col - a.tile.col);
  for (let i = 0; i < rights.length; i++) {
    const a = rights[i];
    if (!a) continue;
    for (let j = i + 1; j < rights.length; j++) {
      const b = rights[j];
      if (!b) continue;
      const aLeft = a.layout.left;
      const bRight = b.layout.left + b.layout.width;
      if (bRight > aLeft) {
        a.layout.left = bRight;
        break;
      }
    }
  }
}

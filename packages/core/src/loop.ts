// Loop mode ("object looping") — pure wrap math, no DOM, no state.
//
// The *packed content* (the bounding box of the in-flow tiles, not the
// configured cols x rows) is one period of an infinite plane. Adapters render
// *tile instances*: copies of each tile offset by whole periods so that
// wherever the camera is, the plane appears endless with no dead space
// between repeats.
//
// Rendering model (no native scroll):
// - The viewport is an overflow-hidden box. A zero-sized "plane" element
//   inside it carries `transform: translate(-cameraX, -cameraY)`.
// - The camera is an unbounded PanController offset fed by wheel deltas and
//   (optionally) drag-to-pan. Nothing ever has scrollable overflow, so there
//   are no scrollbars to grow and no layout feedback with the page.
// - Instances are virtualized: only copies intersecting the camera window
//   (plus a small buffer) are rendered, keyed by their world period indices.

import type { CellPos, GridConfig, LoopConfig, Tile } from './types.js';
import { isInFlow } from './positioning.js';

/** Cell-space size of the loop period: the content's bounding box. */
export interface LoopBounds {
  cols: number;
  rows: number;
}

/** True when loop mode is on. */
export function loopEnabled(config: GridConfig): boolean {
  return config.loop?.enabled === true;
}

/** Effective interaction mode for a loop config. Default 'pan'. */
export function loopInteraction(config: GridConfig): 'pan' | 'edit' {
  return config.loop?.interaction ?? 'pan';
}

/**
 * Validate that a config can loop. Loop mode needs a finite grid to derive
 * its period from — it is incompatible with infiniteX/infiniteY.
 */
export function assertLoopable(config: GridConfig): void {
  if (!loopEnabled(config)) return;
  if (
    config.infiniteX ||
    config.infiniteY ||
    !Number.isFinite(config.cols) ||
    !Number.isFinite(config.rows)
  ) {
    throw new Error(
      'Griddle: loop mode requires finite cols/rows and is incompatible with infiniteX/infiniteY',
    );
  }
}

/** Positive modulo: wraps `v` into [0, period). */
export function wrapValue(v: number, period: number): number {
  const m = v % period;
  return m < 0 ? m + period : m;
}

/** Wrap a cell position into the base period [0,cols) x [0,rows). */
export function wrapCell(pos: CellPos, bounds: LoopBounds): CellPos {
  return {
    col: wrapValue(pos.col, bounds.cols),
    row: wrapValue(pos.row, bounds.rows),
  };
}

/**
 * The loop period in cells: the bounding box of the in-flow tiles. Deriving
 * the period from content (rather than the configured cols x rows) is what
 * makes repeats butt up against each other instead of repeating the empty
 * remainder of the grid.
 */
export function loopBounds(tiles: Tile[]): LoopBounds {
  let cols = 0;
  let rows = 0;
  for (const t of tiles) {
    if (!isInFlow(t)) continue;
    cols = Math.max(cols, t.col + t.w);
    rows = Math.max(rows, t.row + t.h);
  }
  return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
}

/** Pixel size of one period (the packed content, gaps included). */
export function loopPeriod(
  config: GridConfig,
  tiles: Tile[],
): { width: number; height: number } {
  const b = loopBounds(tiles);
  const gap = config.gap ?? 0;
  return {
    width: b.cols * (config.unitWidth + gap),
    height: b.rows * (config.unitHeight + gap),
  };
}

/** One rendered copy of a tile, offset by (kx, ky) whole periods. */
export interface LoopTileInstance {
  tile: Tile;
  /** World-stable key for this copy: `${tile.id}@${kx},${ky}`. */
  key: string;
  /** World period indices (0 = the base copy at the origin). */
  kx: number;
  ky: number;
  /** World-space pixel layout (gap-aware, same math as static layout). */
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Compute the tile instances visible in `view` (a world-space pixel rect,
 * typically the camera window padded by a small buffer). Each in-flow tile
 * yields one instance per period copy that intersects the view — the same
 * tile can appear more than once when the view is larger than the period.
 *
 * Out-of-flow tiles (`absolute`/`fixed`/`sticky`) do not loop; they are
 * excluded here and should be layered by the adapter as usual.
 */
export function loopInstances(
  config: GridConfig,
  tiles: Tile[],
  view: { x: number; y: number; width: number; height: number },
): LoopTileInstance[] {
  const gap = config.gap ?? 0;
  const halfGap = gap / 2;
  const colSize = config.unitWidth + gap;
  const rowSize = config.unitHeight + gap;
  const period = loopPeriod(config, tiles);

  const out: LoopTileInstance[] = [];
  for (const tile of tiles) {
    if (!isInFlow(tile)) continue;
    const baseLeft = tile.col * colSize + halfGap;
    const baseTop = tile.row * rowSize + halfGap;
    const width = tile.w * config.unitWidth + (tile.w - 1) * gap;
    const height = tile.h * config.unitHeight + (tile.h - 1) * gap;

    // Period indices whose copy [baseLeft + kx*pw, +width) intersects the
    // half-open view rect: smallest k with copyRight > view.x and largest k
    // with copyLeft < view.x + view.width (strict, hence ceil - 1).
    const kx0 = Math.floor((view.x - baseLeft - width) / period.width) + 1;
    const kx1 = Math.ceil((view.x + view.width - baseLeft) / period.width) - 1;
    const ky0 = Math.floor((view.y - baseTop - height) / period.height) + 1;
    const ky1 = Math.ceil((view.y + view.height - baseTop) / period.height) - 1;

    for (let ky = ky0; ky <= ky1; ky++) {
      for (let kx = kx0; kx <= kx1; kx++) {
        out.push({
          tile,
          key: `${tile.id}@${kx},${ky}`,
          kx,
          ky,
          left: baseLeft + kx * period.width,
          top: baseTop + ky * period.height,
          width,
          height,
        });
      }
    }
  }
  return out;
}

/**
 * World-space pixel position of the period copy of cell `pos` nearest to
 * the world-space point `near`. Used to render drop indicators next to the
 * instance the user is actually dragging rather than in the base period.
 */
export function nearestInstanceOrigin(
  config: GridConfig,
  tiles: Tile[],
  pos: CellPos,
  near: { x: number; y: number },
): { left: number; top: number } {
  const gap = config.gap ?? 0;
  const halfGap = gap / 2;
  const colSize = config.unitWidth + gap;
  const rowSize = config.unitHeight + gap;
  const bounds = loopBounds(tiles);
  const period = loopPeriod(config, tiles);
  const baseLeft = wrapValue(pos.col, bounds.cols) * colSize + halfGap;
  const baseTop = wrapValue(pos.row, bounds.rows) * rowSize + halfGap;
  const kx = Math.round((near.x - baseLeft) / period.width);
  const ky = Math.round((near.y - baseTop) / period.height);
  return {
    left: baseLeft + kx * period.width,
    top: baseTop + ky * period.height,
  };
}

/** Resolved loop settings with defaults applied. */
export interface ResolvedLoop {
  interaction: 'pan' | 'edit';
  dragPan: boolean;
  friction: number;
  ease: number;
  maxVelocity: number;
}

/**
 * Apply defaults to a LoopConfig. Returns null when loop mode is off.
 *
 * `dragPan` defaults to true in both interactions: in 'edit' mode tiles
 * capture their own pointerdown (drag-n-drop), so drag-to-pan only engages
 * from the background — without it, touch users couldn't move the plane at
 * all since there is no native scrolling in loop mode.
 */
export function resolveLoop(config: GridConfig): ResolvedLoop | null {
  const loop: LoopConfig | undefined = config.loop;
  if (!loop?.enabled) return null;
  return {
    interaction: loop.interaction ?? 'pan',
    dragPan: loop.physics?.dragPan ?? true,
    friction: loop.physics?.friction ?? 4,
    ease: loop.physics?.ease ?? 12,
    maxVelocity: loop.physics?.maxVelocity ?? 6000,
  };
}

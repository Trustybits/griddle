// Loop mode ("object looping") — pure wrap math, no DOM, no state.
//
// The finite cols x rows grid is treated as one *period* of an infinite plane.
// Adapters render *tile instances*: copies of each tile offset by whole
// periods so that wherever the camera is, the plane appears endless. The seam
// is invisible because wrapping always happens outside the viewport.
//
// Coordinate model used by the adapters:
// - "content space" is the pixel space of the scroll container's content,
//   sized to an integer number of periods (>= 3 per axis, more when the
//   viewport is larger than a period).
// - The native scroll position is kept inside the second period
//   ([period, 2*period)) by `loopAnchorScroll`, which maps the unbounded
//   camera offset onto it. Crossing a period boundary teleports the scroll
//   position back by exactly one period — seamless, because the rendered
//   instances are period-translated copies.

import type { CellPos, GridConfig, LoopConfig, Tile } from './types.js';
import { isInFlow } from './positioning.js';

/** True when loop mode is on. */
export function loopEnabled(config: GridConfig): boolean {
  return config.loop?.enabled === true;
}

/** Effective interaction mode for a loop config. Default 'pan'. */
export function loopInteraction(config: GridConfig): 'pan' | 'edit' {
  return config.loop?.interaction ?? 'pan';
}

/**
 * Validate that a config can loop. Loop mode needs a finite period on both
 * axes — it is incompatible with infiniteX/infiniteY.
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
export function wrapCell(pos: CellPos, config: GridConfig): CellPos {
  return {
    col: wrapValue(pos.col, config.cols),
    row: wrapValue(pos.row, config.rows),
  };
}

/** Pixel size of one period (the full finite grid, gaps included). */
export function loopPeriod(config: GridConfig): { width: number; height: number } {
  const gap = config.gap ?? 0;
  return {
    width: config.cols * (config.unitWidth + gap),
    height: config.rows * (config.unitHeight + gap),
  };
}

/**
 * Number of periods the scroll content must span per axis so the anchored
 * scroll window ([period, 2*period) + viewport) always fits with one period
 * of slack: content >= 2*period + viewport.
 */
export function loopContentPeriods(
  config: GridConfig,
  viewportWidth: number,
  viewportHeight: number,
): { nx: number; ny: number } {
  const p = loopPeriod(config);
  const nx = Math.max(3, Math.ceil(viewportWidth / p.width) + 2);
  const ny = Math.max(3, Math.ceil(viewportHeight / p.height) + 2);
  return { nx, ny };
}

/** Pixel size of the loop scroll content. */
export function loopContentSize(
  config: GridConfig,
  viewportWidth: number,
  viewportHeight: number,
): { width: number; height: number } {
  const p = loopPeriod(config);
  const { nx, ny } = loopContentPeriods(config, viewportWidth, viewportHeight);
  return { width: nx * p.width, height: ny * p.height };
}

/**
 * Map an unbounded camera offset to the anchored scroll position inside the
 * content: always within [period, 2*period). Writing this to
 * scrollLeft/scrollTop is the "teleport" that makes the loop seamless.
 */
export function loopAnchorScroll(camera: number, period: number): number {
  return period + wrapValue(camera, period);
}

/** One rendered copy of a tile, offset by (kx, ky) whole periods. */
export interface LoopTileInstance {
  tile: Tile;
  /** Stable key for this copy: `${tile.id}@${kx},${ky}`. */
  key: string;
  /** Period indices within the content (0-based). */
  kx: number;
  ky: number;
  /** Content-space pixel layout (gap-aware, same math as static layout). */
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Compute the tile instances visible in `view` (a content-space pixel rect,
 * typically the scroll viewport padded by a small buffer). Each in-flow tile
 * yields one instance per period copy that intersects the view — the same
 * tile can appear more than once when the view spans a seam.
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
  const period = loopPeriod(config);

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
 * Content-space pixel position of the period copy of cell `pos` nearest to
 * the content-space point `near`. Used to render drop indicators next to the
 * instance the user is actually dragging rather than in the base period.
 */
export function nearestInstanceOrigin(
  config: GridConfig,
  pos: CellPos,
  near: { x: number; y: number },
): { left: number; top: number } {
  const gap = config.gap ?? 0;
  const halfGap = gap / 2;
  const colSize = config.unitWidth + gap;
  const rowSize = config.unitHeight + gap;
  const period = loopPeriod(config);
  const baseLeft = wrapValue(pos.col, config.cols) * colSize + halfGap;
  const baseTop = wrapValue(pos.row, config.rows) * rowSize + halfGap;
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

/** Apply defaults to a LoopConfig. Returns null when loop mode is off. */
export function resolveLoop(config: GridConfig): ResolvedLoop | null {
  const loop: LoopConfig | undefined = config.loop;
  if (!loop?.enabled) return null;
  const interaction = loop.interaction ?? 'pan';
  return {
    interaction,
    dragPan: interaction === 'pan' && (loop.physics?.dragPan ?? true),
    friction: loop.physics?.friction ?? 4,
    ease: loop.physics?.ease ?? 12,
    maxVelocity: loop.physics?.maxVelocity ?? 6000,
  };
}

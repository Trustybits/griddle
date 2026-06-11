// Tile placement strategies. Pure functions that search a grid for valid
// positions matching a requested footprint.

import type {
  CellPos,
  CellRect,
  FindPositionOptions,
  Footprint,
  Gravity,
  PlacementResult,
  Tile,
} from './types.js';
import type { Grid } from './grid.js';
import { rectsOverlap, tileRect } from './geometry.js';
import { isInFlow } from './positioning.js';

// ---------------------------------------------------------------------------
// Gravity helpers
// ---------------------------------------------------------------------------

/** Derive the default adjacent direction from gravity (90 deg clockwise). */
export function defaultAdjacentPrefer(
  gravity: Gravity,
): 'below' | 'right' | 'above' | 'left' {
  if (gravity === 'top') return 'right';
  if (gravity === 'bottom') return 'left';
  if (gravity === 'left') return 'above';
  if (gravity === 'right') return 'below';
  // anchor or 'none'
  return 'right';
}

/** Simulate gravity compaction on a virtual tile to find where it rests. */
function simulateGravityResting(
  grid: Grid,
  pos: CellPos,
  footprint: Footprint,
): CellPos {
  const gravity = grid.config.gravity ?? 'none';
  if (gravity === 'none') return pos;

  // On infinite axes, use content extent as the wall so the simulation
  // converges instead of running to infinity.
  let wallBottom = grid.config.rows;
  let wallRight = grid.config.cols;
  if (grid.config.infiniteY) {
    wallBottom = 0;
    for (const t of grid.tiles) wallBottom = Math.max(wallBottom, t.row + t.h);
    wallBottom = Math.max(wallBottom, pos.row + footprint.h);
  }
  if (grid.config.infiniteX) {
    wallRight = 0;
    for (const t of grid.tiles) wallRight = Math.max(wallRight, t.col + t.w);
    wallRight = Math.max(wallRight, pos.col + footprint.w);
  }

  let cur = { ...pos };

  for (let iter = 0; iter < 10_000; iter++) {
    const step = gravityStep(cur, footprint, gravity, wallRight, wallBottom);
    if (!step) break;
    const nextPos: CellPos = { col: cur.col + step.dx, row: cur.row + step.dy };
    const rect: CellRect = { col: nextPos.col, row: nextPos.row, w: footprint.w, h: footprint.h };
    if (!grid.rectInBounds(rect)) break;
    const blocked = grid.tilesIn(rect);
    if (blocked.length > 0) break;
    cur = nextPos;
  }

  return cur;
}

function gravityStep(
  pos: CellPos,
  footprint: Footprint,
  gravity: Gravity,
  wallRight: number,
  wallBottom: number,
): { dx: number; dy: number } | null {
  if (gravity === 'none') return null;
  if (gravity === 'top') return pos.row > 0 ? { dx: 0, dy: -1 } : null;
  if (gravity === 'left') return pos.col > 0 ? { dx: -1, dy: 0 } : null;
  if (gravity === 'bottom') return pos.row + footprint.h < wallBottom ? { dx: 0, dy: 1 } : null;
  if (gravity === 'right') return pos.col + footprint.w < wallRight ? { dx: 1, dy: 0 } : null;
  // anchor
  const dx = Math.sign(gravity.col - pos.col);
  const dy = Math.sign(gravity.row - pos.row);
  if (dx === 0 && dy === 0) return null;
  const adx = Math.abs(gravity.col - pos.col);
  const ady = Math.abs(gravity.row - pos.row);
  if (adx >= ady && dx !== 0) return { dx, dy: 0 };
  if (dy !== 0) return { dx: 0, dy };
  if (dx !== 0) return { dx, dy: 0 };
  return null;
}

function cellDist(a: CellPos, b: CellPos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

// ---------------------------------------------------------------------------
// Strategy: nearest
// ---------------------------------------------------------------------------

export function findNearest(
  grid: Grid,
  footprint: Footprint,
  opts: FindPositionOptions,
): PlacementResult | null {
  const anchor = opts.anchor ?? { col: 0, row: 0 };
  const maxRadius = opts.maxSearchRadius ?? 200;
  const gravityAware = opts.gravityAware ?? false;
  const gravity = grid.config.gravity ?? 'none';

  const visited = new Set<string>();
  const queue: CellPos[] = [{ col: anchor.col, row: anchor.row }];

  while (queue.length > 0) {
    const p = queue.shift()!;
    const key = `${p.col},${p.row}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (cellDist(p, anchor) > maxRadius) continue;

    const rect: CellRect = { col: p.col, row: p.row, w: footprint.w, h: footprint.h };
    if (grid.rectInBounds(rect) && grid.tilesIn(rect).length === 0) {
      if (gravityAware && gravity !== 'none') {
        const resting = simulateGravityResting(grid, p, footprint);
        if (cellDist(resting, anchor) <= maxRadius) {
          return { position: resting, displaces: false };
        }
        // This open spot would fall too far away; skip it and keep searching
      } else {
        return { position: p, displaces: false };
      }
    }

    // BFS neighbors — 4-directional
    queue.push({ col: p.col + 1, row: p.row });
    queue.push({ col: p.col - 1, row: p.row });
    queue.push({ col: p.col, row: p.row + 1 });
    queue.push({ col: p.col, row: p.row - 1 });
  }

  // Fallback: no open spot found. Place at anchor with displacement.
  const anchorRect: CellRect = {
    col: anchor.col,
    row: anchor.row,
    w: footprint.w,
    h: footprint.h,
  };
  // Clamp to grid bounds if needed
  const clamped = clampToGrid(grid, anchorRect);
  if (gravityAware && gravity !== 'none') {
    const resting = simulateGravityResting(grid, clamped, footprint);
    return { position: resting, displaces: true };
  }
  return { position: clamped, displaces: true };
}

/** Clamp a position so the footprint stays in bounds. */
function clampToGrid(grid: Grid, rect: CellRect): CellPos {
  const { cols, rows, infiniteX, infiniteY } = grid.config;
  let col = Math.max(0, rect.col);
  let row = Math.max(0, rect.row);
  if (!infiniteX && col + rect.w > cols) col = Math.max(0, cols - rect.w);
  if (!infiniteY && row + rect.h > rows) row = Math.max(0, rows - rect.h);
  return { col, row };
}

// ---------------------------------------------------------------------------
// Strategy: adjacent
// ---------------------------------------------------------------------------

type AdjDir = 'below' | 'right' | 'above' | 'left';

const CLOCKWISE_ORDER: AdjDir[] = ['right', 'below', 'left', 'above'];

function clockwiseFrom(start: AdjDir): AdjDir[] {
  const idx = CLOCKWISE_ORDER.indexOf(start);
  const result: AdjDir[] = [];
  for (let i = 0; i < 4; i++) {
    result.push(CLOCKWISE_ORDER[(idx + i) % 4]!);
  }
  return result;
}

export function findAdjacent(
  grid: Grid,
  footprint: Footprint,
  opts: FindPositionOptions,
): PlacementResult | null {
  if (!opts.relativeTo) return null;
  const refTile = grid.getTile(opts.relativeTo);
  if (!refTile) return null;

  const gravity = grid.config.gravity ?? 'none';
  const prefer = opts.prefer ?? defaultAdjacentPrefer(gravity);
  const gravityAware = opts.gravityAware ?? false;
  const directions = clockwiseFrom(prefer);

  for (const dir of directions) {
    const candidates = adjacentCandidates(refTile, footprint, dir);
    for (const pos of candidates) {
      const rect: CellRect = { col: pos.col, row: pos.row, w: footprint.w, h: footprint.h };
      if (!grid.rectInBounds(rect)) continue;
      if (grid.tilesIn(rect).length > 0) continue;

      if (gravityAware && gravity !== 'none') {
        const resting = simulateGravityResting(grid, pos, footprint);
        // For adjacent, we accept the resting position as long as it's reasonable
        return { position: resting, displaces: false };
      }
      return { position: pos, displaces: false };
    }
  }

  // No adjacent position found — fall back to nearest using ref tile center as anchor
  const centerCol = Math.floor(refTile.col + refTile.w / 2);
  const centerRow = Math.floor(refTile.row + refTile.h / 2);
  return findNearest(grid, footprint, {
    ...opts,
    strategy: 'nearest',
    anchor: { col: centerCol, row: centerRow },
  });
}

/**
 * Generate candidate positions along a face of the reference tile.
 * Only positions directly aligned with the face are returned — the new tile
 * must share at least one row (for left/right) or column (for above/below)
 * with the reference tile.
 */
function adjacentCandidates(
  ref: Tile,
  footprint: Footprint,
  dir: AdjDir,
): CellPos[] {
  const positions: CellPos[] = [];

  switch (dir) {
    case 'right': {
      const col = ref.col + ref.w;
      for (let r = ref.row; r <= ref.row + ref.h - footprint.h; r++) {
        positions.push({ col, row: r });
      }
      break;
    }
    case 'left': {
      const col = ref.col - footprint.w;
      for (let r = ref.row; r <= ref.row + ref.h - footprint.h; r++) {
        positions.push({ col, row: r });
      }
      break;
    }
    case 'below': {
      const row = ref.row + ref.h;
      for (let c = ref.col; c <= ref.col + ref.w - footprint.w; c++) {
        positions.push({ col: c, row });
      }
      break;
    }
    case 'above': {
      const row = ref.row - footprint.h;
      for (let c = ref.col; c <= ref.col + ref.w - footprint.w; c++) {
        positions.push({ col: c, row });
      }
      break;
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Strategy: append
// ---------------------------------------------------------------------------

export function findAppend(
  grid: Grid,
  footprint: Footprint,
  opts: FindPositionOptions,
): PlacementResult | null {
  const gravity = grid.config.gravity ?? 'none';
  const tiles = grid.tiles.filter((t) => isInFlow(t));

  if (tiles.length === 0) {
    return { position: { col: 0, row: 0 }, displaces: false };
  }

  if (gravity === 'none' || gravity === 'top') {
    // Place after the bottom-most tile
    let maxBottom = 0;
    for (const t of tiles) {
      maxBottom = Math.max(maxBottom, t.row + t.h);
    }
    // Scan left-to-right on row maxBottom for first fit
    const maxCol = grid.config.cols === Infinity ? 20 : grid.config.cols;
    for (let c = 0; c + footprint.w <= maxCol; c++) {
      const rect: CellRect = { col: c, row: maxBottom, w: footprint.w, h: footprint.h };
      if (grid.rectInBounds(rect) && grid.tilesIn(rect).length === 0) {
        return { position: { col: c, row: maxBottom }, displaces: false };
      }
    }
    // No room on the append row? Try one row further
    return {
      position: { col: 0, row: maxBottom },
      displaces: false,
    };
  }

  if (gravity === 'bottom') {
    let minTop = Infinity;
    for (const t of tiles) {
      minTop = Math.min(minTop, t.row);
    }
    const appendRow = minTop - footprint.h;
    const maxCol = grid.config.cols === Infinity ? 20 : grid.config.cols;
    for (let c = 0; c + footprint.w <= maxCol; c++) {
      const rect: CellRect = { col: c, row: appendRow, w: footprint.w, h: footprint.h };
      if (grid.rectInBounds(rect) && grid.tilesIn(rect).length === 0) {
        return { position: { col: c, row: appendRow }, displaces: false };
      }
    }
    return { position: { col: 0, row: appendRow }, displaces: false };
  }

  if (gravity === 'left') {
    let maxRight = 0;
    for (const t of tiles) {
      maxRight = Math.max(maxRight, t.col + t.w);
    }
    const maxRow = grid.config.rows === Infinity ? 40 : grid.config.rows;
    for (let r = 0; r + footprint.h <= maxRow; r++) {
      const rect: CellRect = { col: maxRight, row: r, w: footprint.w, h: footprint.h };
      if (grid.rectInBounds(rect) && grid.tilesIn(rect).length === 0) {
        return { position: { col: maxRight, row: r }, displaces: false };
      }
    }
    return { position: { col: maxRight, row: 0 }, displaces: false };
  }

  if (gravity === 'right') {
    let minLeft = Infinity;
    for (const t of tiles) {
      minLeft = Math.min(minLeft, t.col);
    }
    const appendCol = minLeft - footprint.w;
    const maxRow = grid.config.rows === Infinity ? 40 : grid.config.rows;
    for (let r = 0; r + footprint.h <= maxRow; r++) {
      const rect: CellRect = { col: appendCol, row: r, w: footprint.w, h: footprint.h };
      if (grid.rectInBounds(rect) && grid.tilesIn(rect).length === 0) {
        return { position: { col: appendCol, row: r }, displaces: false };
      }
    }
    return { position: { col: appendCol, row: 0 }, displaces: false };
  }

  // Anchor gravity: append radially outward
  const anchorGravity = gravity as { col: number; row: number };
  let maxDist = 0;
  for (const t of tiles) {
    const d = Math.abs(t.col - anchorGravity.col) + Math.abs(t.row - anchorGravity.row);
    maxDist = Math.max(maxDist, d);
  }
  // BFS outward from anchor at maxDist+1
  return findNearest(grid, footprint, {
    strategy: 'nearest',
    anchor: anchorGravity,
    maxSearchRadius: maxDist + footprint.w + footprint.h + 10,
  });
}

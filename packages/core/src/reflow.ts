// Explicit, versioned tile reflow.
//
// Reflow is separate from dense packing and gravity. It preserves valid
// geometry where possible while adapting in-flow tiles to a finite column
// count. Strategy identifiers are immutable compatibility contracts.

import { rectsOverlap, tileRect } from './geometry.js';
import type { CellRect, Tile } from './types.js';

/** Immutable identifier for a supported reflow algorithm. */
export type ReflowStrategy = 'preserve-v1';

/** Options for a single explicit reflow operation. */
export interface ReflowOptions {
  /** Positive finite target column count. */
  cols: number;
  /** Immutable algorithm identifier. */
  strategy: ReflowStrategy;
  /** Optional caller-supplied geometry; authoritative when legal. */
  placements?: Readonly<Record<string, CellRect>>;
}

function assertOptions(options: ReflowOptions): void {
  if (!Number.isFinite(options.cols) || !Number.isInteger(options.cols) || options.cols <= 0) {
    throw new RangeError('Griddle: reflow cols must be a positive finite integer');
  }
  if (options.strategy !== 'preserve-v1') {
    throw new RangeError(`Griddle: unsupported reflow strategy "${String(options.strategy)}"`);
  }
}

function scaleTileToFit(tile: Tile, cols: number): Tile {
  if (!Number.isInteger(tile.w) || tile.w <= 0 || !Number.isInteger(tile.h) || tile.h <= 0) {
    throw new RangeError(`Griddle: tile "${tile.id}" footprint must use positive integer cells`);
  }
  if (tile.w <= cols) return { ...tile };
  const scale = cols / tile.w;
  return {
    ...tile,
    w: cols,
    h: Math.max(1, Math.round(tile.h * scale)),
  };
}

function assertFiniteLayout(tiles: readonly Tile[], cols: number): void {
  const placed: Tile[] = [];
  for (const tile of tiles) {
    if (
      !Number.isInteger(tile.col) ||
      !Number.isInteger(tile.row) ||
      !Number.isInteger(tile.w) ||
      !Number.isInteger(tile.h) ||
      tile.col < 0 ||
      tile.row < 0 ||
      tile.w <= 0 ||
      tile.h <= 0 ||
      tile.col + tile.w > cols
    ) {
      throw new RangeError(`Griddle: reflow placement for tile "${tile.id}" is outside the grid bounds`);
    }
    const collision = placed.find((other) => rectsOverlap(tileRect(other), tileRect(tile)));
    if (collision) {
      throw new RangeError(
        `Griddle: reflow placements for tiles "${collision.id}" and "${tile.id}" overlap`,
      );
    }
    placed.push(tile);
  }
}

function findFirstAvailableSpot(
  placed: readonly Tile[],
  width: number,
  height: number,
  cols: number,
  startRow = 0,
): { col: number; row: number } {
  const candidate: CellRect = {
    col: 0,
    row: Math.max(0, startRow),
    w: width,
    h: height,
  };

  while (true) {
    for (let col = 0; col <= cols - width; col += 1) {
      candidate.col = col;
      if (!placed.some((tile) => rectsOverlap(tileRect(tile), candidate))) {
        return { col, row: candidate.row };
      }
    }
    candidate.row += 1;
  }
}

function reflowWithoutPlacements(tiles: readonly Tile[], cols: number): Tile[] {
  const ordered = [...tiles].sort((left, right) => {
    if (left.row !== right.row) return left.row - right.row;
    if (left.col !== right.col) return left.col - right.col;
    return left.id.localeCompare(right.id);
  });
  const placed: Tile[] = [];

  for (const tile of ordered) {
    const scaled = scaleTileToFit(tile, cols);
    const withinBounds =
      Number.isInteger(scaled.col) &&
      Number.isInteger(scaled.row) &&
      scaled.col >= 0 &&
      scaled.row >= 0 &&
      scaled.col + scaled.w <= cols;
    const canKeepPosition =
      withinBounds &&
      !placed.some((other) => rectsOverlap(tileRect(other), tileRect(scaled)));

    if (canKeepPosition) {
      placed.push(scaled);
      continue;
    }

    const position = findFirstAvailableSpot(
      placed,
      scaled.w,
      scaled.h,
      cols,
      withinBounds ? scaled.row : 0,
    );
    placed.push({ ...scaled, ...position });
  }

  const placedById = new Map(placed.map((tile) => [tile.id, tile]));
  const result = tiles.map((tile) => placedById.get(tile.id) ?? { ...tile });
  assertFiniteLayout(result, cols);
  return result;
}

function reflowWithPlacements(
  tiles: readonly Tile[],
  cols: number,
  placements: Readonly<Record<string, CellRect>>,
): Tile[] {
  const positioned: Tile[] = [];
  const missing: Tile[] = [];

  for (const tile of tiles) {
    const placement = placements[tile.id];
    if (placement) {
      positioned.push(scaleTileToFit({ ...tile, ...placement }, cols));
    } else {
      missing.push(scaleTileToFit(tile, cols));
    }
  }

  // Explicit placements are authoritative, but they are not allowed to break
  // the core layout invariant. Reject them before placing missing tiles so an
  // invalid width cannot make the open-slot scan run forever.
  assertFiniteLayout(positioned, cols);

  const projected = [...positioned];
  for (const tile of missing) {
    const position = findFirstAvailableSpot(
      projected,
      tile.w,
      tile.h,
      cols,
    );
    projected.push({ ...tile, ...position });
  }
  assertFiniteLayout(projected, cols);
  return projected;
}

/**
 * Reflow tiles with an explicit immutable strategy. The input is never
 * mutated, and every non-geometry tile property is preserved.
 */
export function reflowTiles(
  tiles: readonly Tile[],
  options: ReflowOptions,
): Tile[] {
  assertOptions(options);
  const placements = options.placements;
  return placements && Object.keys(placements).length > 0
    ? reflowWithPlacements(tiles, options.cols, placements)
    : reflowWithoutPlacements(tiles, options.cols);
}

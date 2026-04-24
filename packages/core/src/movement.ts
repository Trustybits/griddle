// Movement engine — implements Rules 1-6 of the drag/drop spec.
//
// The engine works on a copy-on-write "virtual grid" built from the parent Grid.
// If the engine succeeds, the virtual state is committed back onto the real grid.
// If it fails, nothing is committed.

import type { CellPos, CellRect, Direction8, Tile } from './types.js';
import type { Grid } from './grid.js';
import {
  directionStep,
  faceClosestToOrigin,
  footprintEquals,
  priorityDirections,
  rectsAdjacent,
  rectsOverlap,
  tileRect,
} from './geometry.js';
import { solvePushBFS } from './repack.js';

export interface MoveOptions {
  /**
   * Use this rect as the "origin" when computing priorities, instead of the tile's
   * actual origin. Used during resize to push out neighbors from the resized rect.
   */
  forceFromRect?: CellRect;
}

/**
 * Attempt to move `tileId` to `target` position. Mutates `grid` in place on success.
 * Returns true on success, false on rejection.
 */
export function moveTile(
  grid: Grid,
  tileId: string,
  target: CellPos,
  opts: MoveOptions = {},
): boolean {
  const tile = grid.getTile(tileId);
  if (!tile) return false;

  const originRect: CellRect = opts.forceFromRect ?? tileRect(tile);
  const targetRect: CellRect = { col: target.col, row: target.row, w: tile.w, h: tile.h };

  if (!grid.rectInBounds(targetRect)) return false;

  const overlap = grid.tilesIn(targetRect, new Set([tileId]));

  // Rule 1: empty space
  if (overlap.length === 0) {
    grid._setTilePos(tileId, target);
    return true;
  }

  // Rule 2: adjacent same-footprint swap
  if (
    overlap.length === 1 &&
    rectsAdjacent(originRect, tileRect(overlap[0]!)) &&
    footprintEquals(overlap[0]!, tile)
  ) {
    const other = overlap[0]!;
    const otherPos: CellPos = { col: other.col, row: other.row };
    const originPos: CellPos = { col: originRect.col, row: originRect.row };
    grid._setTilePos(tileId, otherPos);
    grid._setTilePos(other.id, originPos);
    return true;
  }

  // Rule 3-5: try to displace each overlapper via priority directions (face then corner)
  //   (each overlapper independently — the dragging tile's rect is the priority origin)
  const snapshot = grid.snapshotTiles();
  const dirs = priorityDirections(originRect, targetRect);

  const displaced = new Set<string>([tileId]);
  let allPlaced = true;
  for (const victim of overlap) {
    const moved = tryDisplaceOneCell(grid, victim.id, dirs, originRect, displaced);
    if (!moved) {
      allPlaced = false;
      break;
    }
    displaced.add(victim.id);
  }

  if (allPlaced) {
    grid._setTilePos(tileId, target);
    return true;
  }

  // Rule 3-5 failed — restore and try Rule 6
  grid.restoreTiles(snapshot);

  // Rule 6: push chain
  const primaryDir = faceClosestToOrigin(originRect, targetRect);
  const infiniteDir = isInfiniteDirection(grid, primaryDir);

  if (infiniteDir) {
    // Cascade: while any overlap, shift every overlapping tile by primaryDir and recurse.
    if (pushChainInfinite(grid, tileId, target, primaryDir)) {
      return true;
    }
    grid.restoreTiles(snapshot);
    return false;
  }

  // Fixed grid — 0-1 BFS fallback
  const solved = solvePushBFS(grid, tileId, target, originRect);
  if (!solved) {
    grid.restoreTiles(snapshot);
    return false;
  }
  return true;
}

/** Try to move `victimId` one cell in any of the priority directions. */
function tryDisplaceOneCell(
  grid: Grid,
  victimId: string,
  priorityDirs: Direction8[],
  originRect: CellRect,
  ignore: ReadonlySet<string>,
): boolean {
  const victim = grid.getTile(victimId);
  if (!victim) return false;
  const victimRect = tileRect(victim);

  for (const dir of priorityDirs) {
    const { dx, dy } = directionStep(dir);
    const candidate: CellRect = {
      col: victimRect.col + dx,
      row: victimRect.row + dy,
      w: victim.w,
      h: victim.h,
    };
    if (!grid.rectInBounds(candidate)) continue;
    // cell must be empty (ignoring self and the dragging tile)
    const blockIds = new Set(ignore);
    blockIds.add(victimId);
    const hits = grid.tilesIn(candidate, blockIds);
    if (hits.length === 0) {
      grid._setTilePos(victimId, { col: candidate.col, row: candidate.row });
      return true;
    }
  }
  // Also consider: the priority direction may point AWAY from where the origin IS;
  // but per spec, we already encode that. Move silently to try "leave origin" direction.
  // (No-op here — spec only lists face/corner priorities, nothing further.)
  _markUnused(originRect);
  return false;
}

function _markUnused(_r: CellRect): void {
  // placeholder so linters don't flag unused param; keeps signature aligned
}

function isInfiniteDirection(grid: Grid, dir: Direction8): boolean {
  const { dx, dy } = directionStep(dir);
  if (dx !== 0 && !grid.config.infiniteX) return false;
  if (dy !== 0 && !grid.config.infiniteY) return false;
  // At least one axis of motion must be on an infinite axis. For cardinal dirs this is simple:
  if (dx !== 0 && grid.config.infiniteX) return true;
  if (dy !== 0 && grid.config.infiniteY) return true;
  return false;
}

/**
 * On an infinite axis, push every overlapper one cell in `dir`, repeatedly, until the
 * target rect is free. A tile being pushed may in turn push others it collides with.
 */
function pushChainInfinite(
  grid: Grid,
  tileId: string,
  target: CellPos,
  dir: Direction8,
): boolean {
  const dragger = grid.getTile(tileId);
  if (!dragger) return false;
  const targetRect: CellRect = {
    col: target.col,
    row: target.row,
    w: dragger.w,
    h: dragger.h,
  };
  const { dx, dy } = directionStep(dir);

  const safety = 10_000; // guard against pathological infinite loops
  for (let iter = 0; iter < safety; iter++) {
    const overlap = grid.tilesIn(targetRect, new Set([tileId]));
    if (overlap.length === 0) {
      grid._setTilePos(tileId, target);
      return true;
    }
    // Push each overlapper by (dx, dy). Cascading pushes may be needed — any tile the
    // shoved tile now collides with must also be shoved. Loop until stable for this round.
    const queue: Tile[] = overlap.map((t) => ({ ...t }));
    while (queue.length > 0) {
      const victim = queue.shift()!;
      const cur = grid.getTile(victim.id);
      if (!cur) continue;
      const newRect: CellRect = {
        col: cur.col + dx,
        row: cur.row + dy,
        w: cur.w,
        h: cur.h,
      };
      grid._setTilePos(victim.id, { col: newRect.col, row: newRect.row });
      // Anyone we now collide with (other than self, the dragging tile, or the target)?
      const collides = grid.tilesIn(newRect, new Set([victim.id, tileId]));
      for (const c of collides) {
        if (!queue.find((q) => q.id === c.id)) queue.push(c);
      }
    }
  }
  return false;
}

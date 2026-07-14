// Movement engine — implements Rules 1-6 of the drag/drop spec.
//
// The engine mutates the grid in place during attempts but takes a snapshot at
// each rule boundary so it can roll back on failure. If every rule rejects the
// move (and the BFS fallback can't repack), the original grid is restored and
// moveTile returns false.
//
// Rule overview:
//   1. Empty target          — drop straight in.
//   2. Same-footprint swap   — adjacent partner with identical w×h: swap them.
//   3-5. Single-step displace — push each overlapping victim by enough cells
//        along a priority direction to clear the dragger's full footprint.
//        Each victim is placed independently; if any victim has no legal slot
//        the rule rejects and we fall through.
//   6. Cascade push          — push the victim AND any blockers it runs into
//        along a priority direction. On infinite axes this loops until the
//        target rect is clear (tiles slide off into space). On fixed grids,
//        the cascade may run out of room — the move falls through to the 0-1
//        BFS repack solver as a last resort.

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
   * Use this rect as the "origin" when computing priority directions, instead of
   * the tile's actual current position. Used by resize, where the resized rect
   * acts as the origin so neighbors are pushed away from the grown footprint.
   */
  forceFromRect?: CellRect;
}

/**
 * Push tiles out of a resized tile's footprint, cascading through any occupied
 * cells instead of skipping over them. Resize grows in place, so the first
 * displacement direction points from the resized footprint toward the first
 * victim (away from the resized tile). Remaining directions retain the normal
 * priority order as fallbacks for bounded grids.
 */
export function displaceResizeOverlaps(
  grid: Grid,
  resizedId: string,
  resizedRect: CellRect,
): boolean {
  const overlap = grid.tilesIn(resizedRect, new Set([resizedId]));
  if (overlap.length === 0) return true;

  const snapshot = grid.snapshotTiles();
  const dirs = priorityDirections(tileRect(overlap[0]!), resizedRect);

  for (const dir of dirs) {
    if (cascadePushOverlap(grid, resizedId, resizedRect, dir)) return true;
    grid.restoreTiles(snapshot);
  }

  return false;
}

/**
 * Attempt to move `tileId` to `target`. On success, the grid is mutated in
 * place and `true` is returned. On failure, the grid is left unchanged and
 * `false` is returned.
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

  // Rule 3-5: try independent single-displacement of each overlapper.
  //
  // Each victim is placed in turn against the live grid. The ONLY tile we
  // ignore when checking for collisions is the dragger itself — it still
  // sits at originRect at this point and shouldn't block the displacement
  // search. Any victim already moved into its new slot DOES block the next
  // victim's candidate; otherwise two displaced tiles can land on the same
  // cell (visible to the user as one tile "only moving 1 unit" because the
  // overlap collapses two tiles into the same rendered position).
  const snapshot = grid.snapshotTiles();
  const dirs = priorityDirections(originRect, targetRect);
  const draggerOnly: ReadonlySet<string> = new Set([tileId]);

  let allPlaced = true;
  for (const victim of overlap) {
    const moved = tryDisplaceVictim(grid, victim.id, dirs, targetRect, draggerOnly);
    if (!moved) { allPlaced = false; break; }
  }

  if (allPlaced) {
    grid._setTilePos(tileId, target);
    return true;
  }

  grid.restoreTiles(snapshot);

  // Rule 6: try cascading push along each priority direction.
  // First: if the primary direction is on an infinite axis, use unbounded chain push.
  // Otherwise: try minimum-clearance cascade push along each priority direction in turn.
  const primaryDir = faceClosestToOrigin(originRect, targetRect);
  if (isInfiniteDirection(grid, primaryDir)) {
    if (pushChainInfinite(grid, tileId, target, primaryDir)) return true;
    grid.restoreTiles(snapshot);
  }

  for (const dir of dirs) {
    if (cascadePushOverlap(grid, tileId, targetRect, dir)) {
      grid._setTilePos(tileId, target);
      return true;
    }
    grid.restoreTiles(snapshot);
  }

  // Final fallback: 0-1 BFS on fixed grid.
  const solved = solvePushBFS(grid, tileId, target, originRect);
  if (!solved) {
    grid.restoreTiles(snapshot);
    return false;
  }
  return true;
}

/**
 * Displace `victimId` by the minimum cell count along one of `priorityDirs`
 * such that it no longer overlaps `targetRect`, stays in bounds, and lands clear.
 * Cardinal: clear on the moving axis. Diagonal: min(kxClear, kyClear) cells.
 */
function tryDisplaceVictim(
  grid: Grid,
  victimId: string,
  priorityDirs: Direction8[],
  targetRect: CellRect,
  ignore: ReadonlySet<string>,
): boolean {
  const victim = grid.getTile(victimId);
  if (!victim) return false;
  const victimRect = tileRect(victim);

  for (const dir of priorityDirs) {
    const { dx, dy } = directionStep(dir);

    let kxClear = Infinity;
    if (dx > 0) {
      kxClear = Math.max(1, targetRect.col + targetRect.w - victimRect.col);
    } else if (dx < 0) {
      kxClear = Math.max(1, victimRect.col + victimRect.w - targetRect.col);
    }
    let kyClear = Infinity;
    if (dy > 0) {
      kyClear = Math.max(1, targetRect.row + targetRect.h - victimRect.row);
    } else if (dy < 0) {
      kyClear = Math.max(1, victimRect.row + victimRect.h - targetRect.row);
    }

    let k: number;
    if (dx === 0 && dy === 0) continue;
    else if (dx === 0) k = kyClear;
    else if (dy === 0) k = kxClear;
    else k = Math.min(kxClear, kyClear);

    if (!isFinite(k)) continue;

    const candidate: CellRect = {
      col: victimRect.col + k * dx,
      row: victimRect.row + k * dy,
      w: victim.w,
      h: victim.h,
    };
    if (!grid.rectInBounds(candidate)) continue;
    const blockIds = new Set(ignore);
    blockIds.add(victimId);
    const hits = grid.tilesIn(candidate, blockIds);
    if (hits.length === 0) {
      grid._setTilePos(victimId, { col: candidate.col, row: candidate.row });
      return true;
    }
  }
  return false;
}

function isInfiniteDirection(grid: Grid, dir: Direction8): boolean {
  const { dx, dy } = directionStep(dir);
  // Infinite axes grow toward positive coordinates only. The grid origin is a
  // hard lower bound, so west/north (and diagonals containing either) must use
  // the bounded cascade/BFS paths instead of the unbounded fast path.
  if (dx < 0 || dy < 0) return false;
  if (dx !== 0 && !grid.config.infiniteX) return false;
  if (dy !== 0 && !grid.config.infiniteY) return false;
  if (dx !== 0 && grid.config.infiniteX) return true;
  if (dy !== 0 && grid.config.infiniteY) return true;
  return false;
}

/**
 * Push every tile that overlaps `targetRect` by enough cells along `dir` to clear it,
 * cascading through any tiles those pushes collide with. Aborts if any chained push
 * would go out of bounds. Mutates the grid; caller restores on failure.
 *
 * For cardinal `dir`: each victim moves k = enough-to-clear cells.
 * For diagonal `dir`: same logic — k = min cell count to clear via either axis.
 */
function cascadePushOverlap(
  grid: Grid,
  draggerId: string,
  targetRect: CellRect,
  dir: Direction8,
): boolean {
  const { dx, dy } = directionStep(dir);
  if (dx === 0 && dy === 0) return false;

  const initialOverlap = grid.tilesIn(targetRect, new Set([draggerId]));
  if (initialOverlap.length === 0) return true; // already clear

  // Build the per-tile shift map. Each tile shifts by some multiple of (dx,dy).
  // Start with the overlappers — each needs enough k to clear targetRect.
  const shift = new Map<string, number>(); // tileId -> k cells along (dx,dy)
  const queue: { id: string; k: number }[] = [];

  function neededKForClearing(victim: Tile, blockRect: CellRect): number {
    let kx = Infinity;
    if (dx > 0) kx = Math.max(1, blockRect.col + blockRect.w - victim.col);
    else if (dx < 0) kx = Math.max(1, victim.col + victim.w - blockRect.col);
    let ky = Infinity;
    if (dy > 0) ky = Math.max(1, blockRect.row + blockRect.h - victim.row);
    else if (dy < 0) ky = Math.max(1, victim.row + victim.h - blockRect.row);
    if (dx === 0) return ky;
    if (dy === 0) return kx;
    return Math.min(kx, ky);
  }

  for (const v of initialOverlap) {
    const k = neededKForClearing(v, targetRect);
    if (!isFinite(k)) return false;
    shift.set(v.id, k);
    queue.push({ id: v.id, k });
  }

  // Helper: where will tile `id` end up given current shift map?
  function shiftedRect(t: Tile): CellRect {
    const k = shift.get(t.id) ?? 0;
    return { col: t.col + k * dx, row: t.row + k * dy, w: t.w, h: t.h };
  }

  const safety = 1000;
  let iters = 0;
  while (queue.length > 0) {
    if (iters++ > safety) return false;
    const { id } = queue.shift()!;
    const tile = grid.getTile(id);
    if (!tile) continue;
    const newRect = shiftedRect(tile);
    if (!grid.rectInBounds(newRect)) return false;
    // Find any non-dragger tiles that this push collides with.
    for (const other of grid.tiles) {
      if (other.id === id || other.id === draggerId) continue;
      const otherShifted = shiftedRect(other);
      if (rectsOverlap(newRect, otherShifted)) {
        // Need to push `other` further along dir to clear newRect.
        const additional = neededKForClearing(other, newRect);
        if (!isFinite(additional)) return false;
        const prevK = shift.get(other.id) ?? 0;
        // The other tile is currently shifted by prevK. After moving `tile` by k,
        // other must be shifted relative to its CURRENT position by `additional` more.
        // But neededKForClearing is computed against `other`'s ORIGINAL position…
        // we need to use its currently-shifted position. Recompute:
        const movedOther: Tile = {
          ...other,
          col: other.col + prevK * dx,
          row: other.row + prevK * dy,
        };
        const extra = neededKForClearing(movedOther, newRect);
        if (!isFinite(extra)) return false;
        const newK = prevK + extra;
        if (newK <= prevK) continue; // no progress, would loop
        shift.set(other.id, newK);
        queue.push({ id: other.id, k: newK });
      }
    }
  }

  // Validate all final positions in bounds and pairwise non-overlapping (against
  // each other and against the dragger's targetRect — which now must be free).
  const finalById = new Map<string, CellRect>();
  for (const t of grid.tiles) {
    if (t.id === draggerId) continue;
    finalById.set(t.id, shiftedRect(t));
  }
  for (const [id, rect] of finalById) {
    if (!grid.rectInBounds(rect)) return false;
    if (rectsOverlap(rect, targetRect)) return false;
    for (const [otherId, otherRect] of finalById) {
      if (otherId === id) continue;
      if (rectsOverlap(rect, otherRect)) return false;
    }
  }

  // Commit.
  for (const [id, rect] of finalById) {
    grid._setTilePos(id, { col: rect.col, row: rect.row });
  }
  return true;
}

/**
 * Infinite-axis push chain. While anything overlaps `target`, shove every
 * overlapper one cell along `dir`; any tile a shoved tile then collides with
 * gets queued and shoved on the same pass. The grid grows infinitely along
 * `dir`, so this always terminates with a clear target — though it may slide
 * tiles arbitrarily far. Caller restores the snapshot on failure (e.g. if the
 * safety limit trips).
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

  const safety = 10_000;
  for (let iter = 0; iter < safety; iter++) {
    const overlap = grid.tilesIn(targetRect, new Set([tileId]));
    if (overlap.length === 0) {
      grid._setTilePos(tileId, target);
      return true;
    }
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
      // Keep the same invariant as every other movement path. This is also a
      // defensive guard if a future caller reaches the fast path with a
      // direction that approaches the grid's non-negative origin.
      if (!grid.rectInBounds(newRect)) return false;
      grid._setTilePos(victim.id, { col: newRect.col, row: newRect.row });
      const collides = grid.tilesIn(newRect, new Set([victim.id, tileId]));
      for (const c of collides) {
        if (!queue.find((q) => q.id === c.id)) queue.push(c);
      }
    }
  }
  return false;
}

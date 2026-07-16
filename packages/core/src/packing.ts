// packing.ts — dense repacking for loop mode.
//
// Loop mode repeats the content's bounding box, so any hole inside it repeats
// too. `computePack` arranges tiles into the tightest layout it can find:
//
// 1. Exact search: for each candidate width W (widest first) whose W x H
//    rectangle exactly matches the total tile area, run a bounded
//    backtracking tiler (cover the topmost-leftmost empty cell at each step).
//    If it succeeds the layout has ZERO holes.
// 2. Fallback: a gap-filling greedy — walk cells in reading order and drop
//    the largest remaining tile that fits at each empty cell. Minimizes holes
//    but cannot always reach zero (not every tile mix tiles a rectangle).
//
// Rectangle packing is NP-hard in general; the exact search is capped by a
// node budget so worst-case inputs degrade to the greedy instead of hanging.

import type { CellPos } from './types.js';

export interface PackTile {
  id: string;
  w: number;
  h: number;
}

export interface AnchoredPackTile extends PackTile, CellPos {}

export interface PackComputation {
  placements: Map<string, CellPos>;
  /** Bounding box of the packed layout, in cells. */
  width: number;
  height: number;
  /** Empty cells left inside the bounding box (0 = perfectly dense). */
  holes: number;
}

const EXACT_NODE_BUDGET = 50_000;

export function computePack(tiles: PackTile[], maxCols: number): PackComputation | null {
  if (tiles.length === 0 || maxCols <= 0) return null;
  const area = tiles.reduce((s, t) => s + t.w * t.h, 0);
  const maxW = Math.max(...tiles.map((t) => t.w));
  const maxH = Math.max(...tiles.map((t) => t.h));

  for (let w = Math.min(maxCols, area); w >= maxW; w--) {
    if (area % w !== 0) continue;
    const h = area / w;
    if (h < maxH) continue;
    const exact = exactPack(tiles, w, h);
    if (exact) return { placements: exact, width: w, height: h, holes: 0 };
  }

  return greedyPack(tiles, Math.min(maxCols, area));
}

/**
 * Densely pack tiles around caller-owned anchors. Anchors are installed
 * verbatim and never moved; remaining tiles use the same largest-first,
 * top-left scan as Griddle's greedy pack fallback. This is the fixed-geometry
 * counterpart to `computePack()` for layouts with deliberate placements.
 */
export function computePackAround(
  tiles: PackTile[],
  maxCols: number,
  anchors: AnchoredPackTile[],
): PackComputation | null {
  if ((tiles.length === 0 && anchors.length === 0) || maxCols <= 0) return null;

  const remaining = [...tiles].sort(
    (a, b) => b.w * b.h - a.w * a.h || b.h - a.h,
  );
  const placements = new Map<string, CellPos>();
  const occ: boolean[][] = [];

  const fits = (c: number, r: number, tw: number, th: number): boolean => {
    if (c < 0 || r < 0 || c + tw > maxCols) return false;
    for (let y = r; y < r + th; y++) {
      const row = occ[y];
      if (!row) continue;
      for (let x = c; x < c + tw; x++) {
        if (row[x]) return false;
      }
    }
    return true;
  };
  const mark = (c: number, r: number, tw: number, th: number): void => {
    for (let y = r; y < r + th; y++) {
      let row = occ[y];
      if (!row) {
        row = new Array<boolean>(maxCols).fill(false);
        occ[y] = row;
      }
      for (let x = c; x < c + tw; x++) row[x] = true;
    }
  };

  for (const anchor of anchors) {
    placements.set(anchor.id, { col: anchor.col, row: anchor.row });
    mark(anchor.col, anchor.row, anchor.w, anchor.h);
  }

  let idx = 0;
  while (remaining.length > 0) {
    const col = idx % maxCols;
    const row = (idx - col) / maxCols;
    if (!occ[row]?.[col]) {
      const tileIndex = remaining.findIndex((tile) =>
        fits(col, row, tile.w, tile.h),
      );
      if (tileIndex >= 0) {
        const tile = remaining.splice(tileIndex, 1)[0]!;
        placements.set(tile.id, { col, row });
        mark(col, row, tile.w, tile.h);
      }
    }
    idx++;
  }

  let width = 0;
  let height = 0;
  let area = 0;
  for (const tile of [...anchors, ...tiles]) {
    const placement = placements.get(tile.id)!;
    width = Math.max(width, placement.col + tile.w);
    height = Math.max(height, placement.row + tile.h);
    area += tile.w * tile.h;
  }
  return { placements, width, height, holes: width * height - area };
}

/**
 * Bounded backtracking tiler: every step covers the topmost-leftmost empty
 * cell, trying each distinct unused tile size there. Returns null when no
 * complete tiling is found (or the node budget runs out).
 */
function exactPack(tiles: PackTile[], w: number, h: number): Map<string, CellPos> | null {
  const order = [...tiles].sort((a, b) => b.w * b.h - a.w * a.h || b.h - a.h);
  const n = order.length;
  const occ = new Uint8Array(w * h);
  const used = new Array<boolean>(n).fill(false);
  const placements = new Map<string, CellPos>();
  let nodes = 0;

  const fits = (c: number, r: number, tw: number, th: number): boolean => {
    if (c + tw > w || r + th > h) return false;
    for (let y = r; y < r + th; y++) {
      for (let x = c; x < c + tw; x++) {
        if (occ[y * w + x]) return false;
      }
    }
    return true;
  };
  const mark = (c: number, r: number, tw: number, th: number, v: number): void => {
    for (let y = r; y < r + th; y++) {
      for (let x = c; x < c + tw; x++) occ[y * w + x] = v;
    }
  };

  const rec = (scanFrom: number): boolean => {
    if (++nodes > EXACT_NODE_BUDGET) return false;
    let idx = scanFrom;
    while (idx < w * h && occ[idx]) idx++;
    if (idx >= w * h) return true;
    const c = idx % w;
    const r = (idx - c) / w;
    // Identical-size tiles are interchangeable; trying one per size is enough.
    const triedSizes = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const t = order[i]!;
      const sizeKey = `${t.w}x${t.h}`;
      if (triedSizes.has(sizeKey)) continue;
      triedSizes.add(sizeKey);
      if (!fits(c, r, t.w, t.h)) continue;
      used[i] = true;
      mark(c, r, t.w, t.h, 1);
      placements.set(t.id, { col: c, row: r });
      if (rec(idx + 1)) return true;
      used[i] = false;
      mark(c, r, t.w, t.h, 0);
      placements.delete(t.id);
    }
    return false;
  };

  return rec(0) ? placements : null;
}

/**
 * Gap-filling greedy: walk cells in reading order; at each empty cell place
 * the largest remaining tile that fits, otherwise leave the cell as a hole
 * and move on. Never widens the layout to skip a fillable gap.
 */
function greedyPack(tiles: PackTile[], w: number): PackComputation {
  const remaining = [...tiles].sort((a, b) => b.w * b.h - a.w * a.h || b.h - a.h);
  const placements = new Map<string, CellPos>();
  const occ: boolean[][] = [];

  const fits = (c: number, r: number, tw: number, th: number): boolean => {
    if (c + tw > w) return false;
    for (let y = r; y < r + th; y++) {
      const row = occ[y];
      if (!row) continue;
      for (let x = c; x < c + tw; x++) {
        if (row[x]) return false;
      }
    }
    return true;
  };
  const mark = (c: number, r: number, tw: number, th: number): void => {
    for (let y = r; y < r + th; y++) {
      let row = occ[y];
      if (!row) {
        row = new Array<boolean>(w).fill(false);
        occ[y] = row;
      }
      for (let x = c; x < c + tw; x++) row[x] = true;
    }
  };

  let idx = 0;
  while (remaining.length > 0) {
    const c = idx % w;
    const r = (idx - c) / w;
    if (!occ[r]?.[c]) {
      const i = remaining.findIndex((t) => fits(c, r, t.w, t.h));
      if (i >= 0) {
        const t = remaining.splice(i, 1)[0]!;
        placements.set(t.id, { col: c, row: r });
        mark(c, r, t.w, t.h);
      }
      // else: unfillable hole — leave it and keep scanning.
    }
    idx++;
  }

  let width = 0;
  let height = 0;
  let area = 0;
  for (const t of tiles) {
    const p = placements.get(t.id)!;
    width = Math.max(width, p.col + t.w);
    height = Math.max(height, p.row + t.h);
    area += t.w * t.h;
  }
  return { placements, width, height, holes: width * height - area };
}

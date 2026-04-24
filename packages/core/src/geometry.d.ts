import type { CellPos, CellRect, Direction8, Face, Footprint, Tile } from './types.js';
/** Does rect `a` overlap rect `b`? */
export declare function rectsOverlap(a: CellRect, b: CellRect): boolean;
/** Does rect `outer` fully contain rect `inner`? */
export declare function rectContains(outer: CellRect, inner: CellRect): boolean;
export declare function rectEquals(a: CellRect, b: CellRect): boolean;
/** Two tiles are "adjacent" if their rects share at least a corner touch (8-neighbor). */
export declare function rectsAdjacent(a: CellRect, b: CellRect): boolean;
export declare function tileRect(t: Tile): CellRect;
/** Face closest to origin from target's perspective. */
export declare function faceClosestToOrigin(origin: CellRect, target: CellRect): Face;
/** Opposite face. */
export declare function oppositeFace(f: Face): Face;
/** Classify origin -> target geometry. */
export type OriginKind = 'horizontal' | 'vertical' | 'corner';
export declare function classifyOrigin(origin: CellRect, target: CellRect): OriginKind;
/**
 * Return the 8 displacement directions for a tile at `target` being pushed
 * by a drag originating at `origin`, ordered by the priority spec.
 */
export declare function priorityDirections(origin: CellRect, target: CellRect): Direction8[];
/** Translate a rect by a direction (one unit). */
export declare function translateRect(r: CellRect, dir: Direction8): CellRect;
/** Translate by arbitrary cell offset. */
export declare function offsetRect(r: CellRect, dcol: number, drow: number): CellRect;
/** Stepwise offset for a direction (dx, dy in cells, -1..1). */
export declare function directionStep(dir: Direction8): {
    dx: number;
    dy: number;
};
export declare function footprintEquals(a: Footprint, b: Footprint): boolean;
export declare function clonePos(p: CellPos): CellPos;
//# sourceMappingURL=geometry.d.ts.map
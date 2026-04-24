import type { CellPos, CellRect } from './types.js';
import type { Grid } from './grid.js';
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
export declare function moveTile(grid: Grid, tileId: string, target: CellPos, opts?: MoveOptions): boolean;
//# sourceMappingURL=movement.d.ts.map
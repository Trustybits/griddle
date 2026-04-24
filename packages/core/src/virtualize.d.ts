import type { CellRect, GridConfig, Tile } from './types.js';
export interface Viewport {
    /** Pixel offset of the viewport relative to the grid origin (0,0 cell). */
    scrollX: number;
    scrollY: number;
    /** Pixel size of the viewport. */
    width: number;
    height: number;
}
export interface VisibleRange extends CellRect {
}
/** Compute the visible cell rect for a given viewport, padded by `buffer` cells. */
export declare function visibleRange(config: GridConfig, vp: Viewport, buffer?: number): VisibleRange;
/** Filter tiles to only those overlapping the visible range. */
export declare function visibleTiles(tiles: Tile[], range: VisibleRange): Tile[];
/** Compute the total pixel size of the grid content (for scroll container sizing). */
export declare function gridContentSize(config: GridConfig, tiles: Tile[]): {
    width: number;
    height: number;
};
//# sourceMappingURL=virtualize.d.ts.map
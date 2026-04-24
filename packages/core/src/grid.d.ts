import type { CellPos, CellRect, Footprint, GridChangeEvent, GridConfig, GridSnapshot, Tile } from './types.js';
import { Emitter } from './events.js';
export declare class Grid {
    config: GridConfig;
    private tilesById;
    readonly changes: Emitter<GridChangeEvent>;
    constructor(config: GridConfig, initialTiles?: Tile[]);
    updateConfig(patch: Partial<GridConfig>): void;
    get tiles(): Tile[];
    getTile(id: string): Tile | undefined;
    tilesIn(rect: CellRect, exclude?: ReadonlySet<string>): Tile[];
    rectInBounds(rect: CellRect): boolean;
    addTile(tile: Tile): void;
    removeTile(id: string): void;
    _setTilePos(id: string, pos: CellPos): void;
    _setTileRect(id: string, rect: CellRect): void;
    moveTile(id: string, target: CellPos): boolean;
    resizeTile(id: string, size: Footprint): boolean;
    snapshotTiles(): Map<string, Tile>;
    restoreTiles(snap: Map<string, Tile>): void;
    compactAll(): void;
    toJSON(): GridSnapshot;
    static fromJSON(snap: GridSnapshot): Grid;
}
//# sourceMappingURL=grid.d.ts.map
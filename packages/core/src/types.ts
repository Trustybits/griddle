// Griddle core types
// Zero runtime dependencies. Everything consumers touch is plain JSON-serializable.

/** A corner identifier, used for resize handles. */
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Face direction. */
export type Face = 'n' | 's' | 'e' | 'w';

/** Priority slot direction returned by movement priority calc. */
export type Direction8 = Face | Corner;

/** Compaction / gravity target. */
export type Gravity =
  | 'none'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | { col: number; row: number };

/** A grid position in cells. */
export interface CellPos {
  col: number;
  row: number;
}

/** Footprint of a tile in cells. */
export interface Footprint {
  w: number;
  h: number;
}

/** Tile state stored in the grid. */
export interface Tile extends CellPos, Footprint {
  /** Stable, unique string id. */
  id: string;
  /** Arbitrary consumer payload — not interpreted by core. */
  data?: unknown;
  /** If set, overrides the grid-level resize handles for this tile. */
  resizeHandles?: Corner[];
  /** If false, the tile cannot be dragged. Defaults to true. */
  draggable?: boolean;
  /** If false, the tile cannot be resized. Defaults to true. */
  resizable?: boolean;
  /** Min/max footprint clamps for resize. */
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

/** Grid configuration. */
export interface GridConfig {
  /** Columns. Use `Infinity` for horizontally infinite canvas. */
  cols: number;
  /** Rows. Use `Infinity` for vertically infinite canvas. */
  rows: number;
  /** Width of one cell, in CSS pixels. */
  unitWidth: number;
  /** Height of one cell, in CSS pixels. */
  unitHeight: number;
  /** Explicit infinite flags (auto-inferred from cols/rows === Infinity otherwise). */
  infiniteX?: boolean;
  infiniteY?: boolean;
  /** Optional pixel gap between cells (purely visual — logic treats them as adjacent). */
  gap?: number;
  /** Compaction / gravity target. Default `'none'`. */
  gravity?: Gravity;
  /** Default corner handles shown on tiles. Default `['se']`. */
  resizeHandles?: Corner[];
  /** Whether the tile snaps to grid cells during drag. Default `true`. */
  snapDuringDrag?: boolean;
  /** Max hops for the 0-1 BFS repack fallback on fixed grids. Default 64. */
  maxRepackHops?: number;
}

/** A rectangle in cells (inclusive col,row; exclusive col+w,row+h). */
export interface CellRect extends CellPos, Footprint {}

/** Event payload for change notifications. */
export interface GridChangeEvent {
  type:
    | 'config'
    | 'add'
    | 'remove'
    | 'move'
    | 'resize'
    | 'repack'
    | 'compact'
    | 'load';
  /** Tile ids affected by this event (for animation diffing). */
  tileIds: string[];
}

/** Serialized grid snapshot. */
export interface GridSnapshot {
  version: 1;
  config: GridConfig;
  tiles: Tile[];
}

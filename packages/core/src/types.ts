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

/**
 * CSS-like positioning mode for a tile. Default 'static'.
 *
 * - static   - normal grid tile; participates in displacement and compaction.
 * - relative - keeps its grid slot; renders with a visual offset that doesn't
 *              affect layout. Other tiles still treat its grid cell as taken.
 * - absolute - out of grid flow. Pinned at coordinates given by 'pinned'.
 *              Other tiles can occupy its col/row. Engine ignores it.
 * - fixed    - like absolute but anchored to the scrollable container's
 *              viewport, so it stays put when the grid scrolls.
 * - sticky   - in flow normally, but pins to a viewport edge once scrolled
 *              past the configured threshold.
 *
 * Requires GridConfig.enablePositioning = true to take effect; otherwise
 * adapters render every tile as static.
 */
export type TilePosition =
  | 'static'
  | 'relative'
  | 'absolute'
  | 'fixed'
  | 'sticky';

/** Edge a sticky tile pins to. */
export type StickyEdge = 'top' | 'bottom' | 'left' | 'right';

export interface StickyConfig {
  /** Edge of the scroll viewport to stick to. */
  edge: StickyEdge;
  /** Distance from the edge in CSS pixels. Default 0. */
  threshold?: number;
}

/** Tile state stored in the grid. */
export interface Tile extends CellPos, Footprint {
  /** Stable, unique string id. */
  id: string;
  /** Arbitrary consumer payload - not interpreted by core. */
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
  /** CSS-like positioning mode. Defaults to 'static'. */
  position?: TilePosition;
  /** For absolute/fixed: pinned coordinates (units per GridConfig.pinUnits). */
  pinned?: { x: number; y: number };
  /** For relative: visual offset that does NOT affect layout (units per GridConfig.relativeUnits). */
  offset?: { x: number; y: number };
  /** For sticky: edge + pixel threshold from that edge. */
  sticky?: StickyConfig;
}

/** Grid configuration. */
export interface GridConfig {
  /** Columns. Use Infinity for horizontally infinite canvas. */
  cols: number;
  /** Rows. Use Infinity for vertically infinite canvas. */
  rows: number;
  /** Width of one cell, in CSS pixels. */
  unitWidth: number;
  /** Height of one cell, in CSS pixels. */
  unitHeight: number;
  /** Explicit infinite flags (auto-inferred from cols/rows === Infinity otherwise). */
  infiniteX?: boolean;
  infiniteY?: boolean;
  /** Optional pixel gap between cells (purely visual). */
  gap?: number;
  /** Compaction / gravity target. Default 'none'. */
  gravity?: Gravity;
  /** Default corner handles shown on tiles. Default ['se']. */
  resizeHandles?: Corner[];
  /** Whether the tile snaps to grid cells during drag. Default true. */
  snapDuringDrag?: boolean;
  /** Max hops for the 0-1 BFS repack fallback on fixed grids. Default 64. */
  maxRepackHops?: number;
  /**
   * Border radius applied to each tile (and the drop indicator), in CSS
   * pixels. Default 4. The adapter exposes this on the content container as
   * the CSS custom property `--griddle-tile-radius`, so tile content
   * components can read it with `var(--griddle-tile-radius)` to stay in sync.
   */
  tileRadius?: number;
  /**
   * Master switch for CSS-like tile positioning. When true, tiles can use
   * the 'position' field (and 'pinned' / 'offset' / 'sticky'). When false
   * (the default), adapters render every tile in static grid flow regardless
   * of any 'position' value set on the tile data.
   */
  enablePositioning?: boolean;
  /**
   * Coordinate units used by 'pinned' on absolute / fixed tiles. Default
   * 'pixels'. 'subcell' measures in cells with float precision (e.g.
   * { x: 3.5, y: 2.25 }); 'cells' measures in whole-cell coordinates.
   */
  pinUnits?: 'pixels' | 'subcell' | 'cells';
  /**
   * Units used by 'offset' on relative tiles. Default 'pixels'. 'subcell'
   * measures in cells with float precision so the offset scales with cell size.
   */
  relativeUnits?: 'pixels' | 'subcell';
  /**
   * CSS selector string passed to `Element.closest()` on the pointer-down
   * target. If the target matches, the drag is suppressed so the element's
   * native interaction (click, focus, text selection, etc.) works normally.
   *
   * Default: `'a, button, input, textarea, select, [contenteditable]'`
   *
   * Set to `''` to disable (entire tile surface starts a drag). Consumers
   * can extend the default with app-specific selectors, e.g.
   * `'a, button, input, textarea, select, [contenteditable], .my-caption'`.
   */
  dragIgnoreFrom?: string;
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

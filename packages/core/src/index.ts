// @griddle/core public API.

export { Grid } from './grid.js';
export type {
  CellPos,
  CellRect,
  Corner,
  Direction8,
  Face,
  FindPositionOptions,
  Footprint,
  Gravity,
  GridChangeEvent,
  GridConfig,
  GridSnapshot,
  PlacementResult,
  PlacementStrategy,
  StickyConfig,
  StickyEdge,
  Tile,
  TilePosition,
} from './types.js';
export {
  rectsOverlap,
  rectsAdjacent,
  rectContains,
  rectEquals,
  priorityDirections,
  faceClosestToOrigin,
  oppositeFace,
  classifyOrigin,
  translateRect,
  offsetRect,
  directionStep,
  tileRect,
  footprintEquals,
} from './geometry.js';
export {
  visibleRange,
  visibleTiles,
  gridContentSize,
  type Viewport,
  type VisibleRange,
} from './virtualize.js';
export { Emitter } from './events.js';
export { DragController, type DragUpdateResult } from './drag.js';
export { GroupDragController, type GroupDragUpdateResult } from './group-drag.js';
export {
  isInFlow,
  isOutOfFlow,
  pinnedToPixels,
  pixelsToPin,
  offsetToPixels,
  pixelsToOffset,
  computeTileLayout,
  resolveStickyStacking,
} from './positioning.js';
export type { TileLayout, TileLayoutInput } from './positioning.js';

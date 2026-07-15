// @griddle/core public API.

export { Grid } from './grid.js';
export { reflowTiles } from './reflow.js';
export type { ReflowOptions, ReflowStrategy } from './reflow.js';
export type {
  CellPos,
  CellRect,
  Corner,
  Direction8,
  Face,
  Footprint,
  Gravity,
  GridChangeEvent,
  GridAnimationConfig,
  GridConfig,
  GridSnapshot,
  LoopConfig,
  LoopPhysicsConfig,
  StickyConfig,
  StickyEdge,
  Tile,
  TilePosition,
} from './types.js';
export {
  DEFAULT_ANIMATION_CONFIG,
  resolveAnimationConfig,
  type ResolvedGridAnimationConfig,
} from './animation.js';
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
export {
  loopEnabled,
  loopInteraction,
  assertLoopable,
  wrapValue,
  wrapCell,
  loopBounds,
  loopPeriod,
  loopShift,
  loopInstances,
  resolveLoop,
  type LoopBounds,
  type LoopPattern,
  type LoopTileInstance,
  type ResolvedLoop,
} from './loop.js';
export {
  PanController,
  type CameraState,
  type PanPhysicsOptions,
} from './pan.js';
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

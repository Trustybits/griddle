export interface InteractionScale {
  x: number;
  y: number;
}

export interface ResizePreviewInput {
  corner: 'nw' | 'ne' | 'sw' | 'se';
  startCol: number;
  startRow: number;
  startW: number;
  startH: number;
  stepsX: number;
  stepsY: number;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  cols: number;
  rows: number;
  infiniteX: boolean;
  infiniteY: boolean;
}

export interface ResizePreview {
  col: number;
  row: number;
  w: number;
  h: number;
}

type MeasurableElement = Pick<
  HTMLElement,
  'getBoundingClientRect' | 'offsetWidth' | 'offsetHeight'
>;

function validScale(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Measure how CSS transforms map an element's local coordinate space into
 * viewport pixels. PointerEvent.clientX/clientY are viewport coordinates,
 * while Griddle's cells and inline transforms use the element's local CSS
 * pixels, so drag math must cross this boundary explicitly.
 */
export function measureInteractionScale(
  element: MeasurableElement | null,
): InteractionScale {
  if (!element) return { x: 1, y: 1 };

  const rect = element.getBoundingClientRect();
  const measuredX = validScale(
    element.offsetWidth > 0 ? rect.width / element.offsetWidth : NaN,
  );
  const measuredY = validScale(
    element.offsetHeight > 0 ? rect.height / element.offsetHeight : NaN,
  );

  // A content-sized grid can temporarily report a zero height while mounting.
  // Prefer the other measured axis before falling back to an unscaled value;
  // this also handles the common uniform transform: scale(...) host.
  return {
    x: measuredX ?? measuredY ?? 1,
    y: measuredY ?? measuredX ?? 1,
  };
}

/** Convert a viewport-space pointer delta into the grid's local CSS pixels. */
export function toLocalInteractionDelta(
  dx: number,
  dy: number,
  scale: InteractionScale,
): { dx: number; dy: number } {
  return {
    dx: dx / scale.x,
    dy: dy / scale.y,
  };
}

function clamp(value: number, lower: number, upper: number): number {
  if (upper < lower) return upper;
  return Math.min(upper, Math.max(lower, value));
}

/**
 * Resolve a corner resize while preserving the opposite edges and trimming
 * the dragged edges at finite grid bounds.
 */
export function resolveResizePreview({
  corner,
  startCol,
  startRow,
  startW,
  startH,
  stepsX,
  stepsY,
  minW,
  minH,
  maxW,
  maxH,
  cols,
  rows,
  infiniteX,
  infiniteY,
}: ResizePreviewInput): ResizePreview {
  const startRight = startCol + startW;
  const startBottom = startRow + startH;
  const east = corner === 'ne' || corner === 'se';
  const south = corner === 'se' || corner === 'sw';

  let col = startCol;
  let right = startRight;
  if (east) {
    const maxRight = Math.min(
      startCol + maxW,
      infiniteX ? Infinity : cols,
    );
    right = clamp(startRight + stepsX, startCol + minW, maxRight);
  } else {
    const minLeft = Math.max(startRight - maxW, 0);
    col = clamp(startCol + stepsX, minLeft, startRight - minW);
  }

  let row = startRow;
  let bottom = startBottom;
  if (south) {
    const maxBottom = Math.min(
      startRow + maxH,
      infiniteY ? Infinity : rows,
    );
    bottom = clamp(startBottom + stepsY, startRow + minH, maxBottom);
  } else {
    const minTop = Math.max(startBottom - maxH, 0);
    row = clamp(startRow + stepsY, minTop, startBottom - minH);
  }

  return {
    col,
    row,
    w: right - col,
    h: bottom - row,
  };
}

/** Clamp a pointer-derived cell index to the cells addressable by the grid. */
export function clampInteractionCell(
  cell: number,
  extent: number,
  infinite: boolean,
): number {
  const nonNegative = Math.max(0, cell);
  return infinite ? nonNegative : Math.min(extent - 1, nonNegative);
}

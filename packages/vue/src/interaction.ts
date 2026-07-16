export interface InteractionScale {
  x: number;
  y: number;
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

import {
  resolveAnimationConfig,
  type GridAnimationConfig,
} from '@griddle/core';

const pendingFrames = new WeakMap<HTMLElement, number>();

function reducedMotionRequested(config: GridAnimationConfig | undefined): boolean {
  const animation = resolveAnimationConfig(config);
  return animation.respectReducedMotion &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function currentTranslation(node: HTMLElement): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  const translate = window.getComputedStyle(node).translate;
  if (!translate || translate === 'none') return { x: 0, y: 0 };
  const [x = '0', y = '0'] = translate.split(/\s+/);
  return { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 };
}

/**
 * Run an interruption-safe FLIP transition. The currently rendered transform
 * is folded into the new inverse so rapid repacks continue from the tile's
 * visible position instead of snapping back to its last logical position.
 */
export function animateReposition(
  node: HTMLElement,
  deltaX: number,
  deltaY: number,
  config?: GridAnimationConfig,
): void {
  const pending = pendingFrames.get(node);
  if (pending !== undefined) cancelAnimationFrame(pending);

  const animation = resolveAnimationConfig(config);
  if (!animation.enabled || animation.repositionDurationMs === 0 || reducedMotionRequested(config)) {
    node.style.transition = 'none';
    node.style.translate = '0px 0px';
    pendingFrames.delete(node);
    return;
  }

  const current = currentTranslation(node);
  const x = deltaX + current.x;
  const y = deltaY + current.y;
  node.style.transition = 'none';
  node.style.translate = `${x}px ${y}px`;
  // Commit the inverse before scheduling the play phase. This prevents the
  // browser from coalescing both writes and skipping the transition.
  void node.offsetWidth;

  const frame = requestAnimationFrame(() => {
    pendingFrames.delete(node);
    node.style.transition =
      `translate ${animation.repositionDurationMs}ms ${animation.repositionEasing}`;
    node.style.translate = '0px 0px';
  });
  pendingFrames.set(node, frame);
}

export function liftTransition(config?: GridAnimationConfig): string {
  const animation = resolveAnimationConfig(config);
  const duration = !animation.enabled || reducedMotionRequested(config)
    ? 0
    : animation.liftDurationMs;
  return `filter ${duration}ms ${animation.liftEasing}, opacity ${duration}ms ${animation.liftEasing}`;
}

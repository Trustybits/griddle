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

/** Continue rapid repacks from the tile's current visual position. */
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
  node.style.transition = 'none';
  node.style.translate = `${deltaX + current.x}px ${deltaY + current.y}px`;
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

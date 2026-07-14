import type { GridAnimationConfig } from './types.js';

export type ResolvedGridAnimationConfig = Required<GridAnimationConfig>;

/** Shared defaults used by all framework adapters. */
export const DEFAULT_ANIMATION_CONFIG: Readonly<ResolvedGridAnimationConfig> = Object.freeze({
  enabled: true,
  repositionDurationMs: 320,
  repositionEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  liftDurationMs: 160,
  liftEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  respectReducedMotion: true,
});

function duration(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

function easing(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Fill optional animation settings and sanitize invalid durations/easings. */
export function resolveAnimationConfig(
  config?: GridAnimationConfig,
): ResolvedGridAnimationConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_ANIMATION_CONFIG.enabled,
    repositionDurationMs: duration(
      config?.repositionDurationMs,
      DEFAULT_ANIMATION_CONFIG.repositionDurationMs,
    ),
    repositionEasing: easing(
      config?.repositionEasing,
      DEFAULT_ANIMATION_CONFIG.repositionEasing,
    ),
    liftDurationMs: duration(
      config?.liftDurationMs,
      DEFAULT_ANIMATION_CONFIG.liftDurationMs,
    ),
    liftEasing: easing(config?.liftEasing, DEFAULT_ANIMATION_CONFIG.liftEasing),
    respectReducedMotion:
      config?.respectReducedMotion ?? DEFAULT_ANIMATION_CONFIG.respectReducedMotion,
  };
}

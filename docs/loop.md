# Loop mode

Loop mode makes a finite `cols × rows` grid repeat infinitely in both axes —
the "infinite gallery" effect: drag or scroll in any direction forever and the
same tiles keep wrapping around the camera. It is a config toggle, like
gravity.

```ts
const grid = new Grid({
  cols: 12, rows: 12,
  unitWidth: 120, unitHeight: 120,
  loop: {
    enabled: true,
    interaction: 'pan',          // 'pan' (viewer) | 'edit' (owner). Default 'pan'.
    physics: {                   // pan physics, all optional
      friction: 4,               // inertia decay after release (1/s)
      ease: 12,                  // camera approach rate (1/s)
      maxVelocity: 6000,         // fling clamp (px/s)
      dragPan: true,             // drag-to-pan on/off ('pan' mode only)
    },
  },
});
```

Constraints:

- Loop mode requires **finite** `cols`/`rows`; combining it with
  `infiniteX`/`infiniteY` throws.
- Both axes always wrap together (the repeating unit is the whole grid plane).
- Out-of-flow tiles (`position: 'absolute' | 'fixed' | 'sticky'`) do not loop
  and are not rendered by the loop surface.
- Group drag and draw-to-create are disabled while looping.

## Interaction modes

| | `'pan'` (viewer) | `'edit'` (owner) |
|---|---|---|
| Drag on tiles / background | Pans the camera (momentum fling on release) | Drags the tile; drop cells wrap across the seam |
| Native scroll / wheel | Moves the camera | Moves the camera |
| Resize handles | Hidden | Shown; resize clamped to the period size |
| Selection | Off | Click / Cmd-click as usual |

Flip the mode from your app's auth state — griddle has no concept of users:

```ts
grid.updateConfig({ loop: { enabled: true, interaction: isOwner ? 'edit' : 'pan' } });
```

## How it works ("object looping")

The finite grid is one **period** of an infinite plane. Adapters render *tile
instances* — copies of each tile offset by whole periods — for whatever window
the camera can see, so the same tile may appear twice when the viewport spans
a seam.

Native scroll stays real: the scroll content spans a few periods and the
scroll position is kept anchored inside the middle one. When the camera
crosses a period boundary the scroll position teleports back by exactly one
period — invisible, because every rendered instance is a period-translated
copy.

The camera itself is an unbounded offset owned by a `PanController`
(headless, zero-dependency): native scroll deltas feed into it, and in `'pan'`
mode pointer drags drive it through the configurable physics above.

## Camera state for custom effects

The adapters expose the camera each frame so you can build velocity-based
effects (scale, skew, blur…) yourself; griddle ships none.

```tsx
// React
<GriddleGrid api={api} renderTile={renderTile}
  onCameraChange={(cam) => {
    // cam: { x, y, vx, vy, isMoving, isDragging }
  }} />
```

```html
<!-- Vue -->
<GriddleGrid :api="api" @camera-change="onCamera" />

<!-- Svelte -->
<GriddleGrid {api} on:cameraChange={(e) => onCamera(e.detail)} />
```

## Headless use

All the loop math is exported from `@griddle/core`:

```ts
import {
  loopPeriod,          // pixel size of one period
  loopInstances,       // visible tile copies for a view rect
  loopAnchorScroll,    // camera -> anchored scroll position
  loopContentSize,     // scroll content size for a viewport
  wrapCell, wrapValue, // modulo helpers
  resolveLoop,         // LoopConfig + defaults
  PanController,       // unbounded camera with drag/inertia physics
} from '@griddle/core';
```

A custom renderer (canvas, WebGL, …) only needs `PanController` for the camera
and `loopInstances` to know what to draw where.

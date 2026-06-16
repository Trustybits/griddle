# Loop mode

Loop mode makes the grid's content repeat infinitely in both axes — the
"infinite gallery" effect: drag or scroll in any direction forever and the
same tiles keep wrapping around the camera. It is a config toggle, like
gravity.

```ts
const grid = new Grid({
  cols: 12, rows: 12,
  unitWidth: 120, unitHeight: 120,
  loop: {
    enabled: true,
    interaction: 'pan',          // 'pan' (viewer) | 'edit' (ghost edit). Default 'pan'.
    pattern: 'grid',             // 'grid' | 'brick' | 'drop'. Default 'grid'.
    offset: 0.5,                 // brick/drop shift fraction (0..1). Default 0.5.
    repack: 'toggle',            // 'toggle' | 'structural'. Default 'toggle'.
    physics: {                   // pan physics, all optional
      friction: 4,               // inertia decay after release (1/s)
      ease: 12,                  // camera approach rate (1/s)
      maxVelocity: 6000,         // fling clamp (px/s)
      dragPan: true,             // drag-to-pan on/off
    },
  },
});
```

The repeating unit (the **period**) is the *content* — the bounding box of the
in-flow tiles — not the configured `cols × rows`. Repeats butt up directly
against the content with no dead space between them. To keep holes from
repeating too, **enabling loop mode auto-packs the layout** (`grid.pack()`,
also callable directly):

1. A layout that is already perfectly dense is left exactly as arranged
   (translated to the origin if offset) — manual packing is never undone.
2. Otherwise an exact tiler searches for a hole-free rectangle arrangement
   (bounded backtracking over candidate widths, widest first).
3. If no perfect tiling exists (or the search budget runs out), a gap-filling
   greedy places the largest remaining tile at each empty cell in reading
   order, minimizing holes.

By default packing is a **one-shot action on the loop off→on toggle** and is
fully independent of every other layout strategy. It never runs when moving,
dragging, dropping, resizing, or creating tiles (with or without loop
active), when loading a snapshot, or when toggling loop off. The packed
result persists after loop is disabled — it overwrites the previous layout —
but it never influences subsequent interactions.

### `repack: 'structural'`

Opting in to `repack: 'structural'` additionally re-runs the same packer
after **structural** changes while looping — resize, add, remove — so the
period stays hole-free as you edit. Plain moves still never repack:
arrangements made by dragging are kept exactly as dropped. `grid.pack()` is
also public if you want to wire an explicit "Repack" button instead.

## Repeat patterns

`pattern` controls how copies are placed relative to each other:

- `'grid'` — copies aligned in both axes (default).
- `'brick'` — each successive repeat **row** shifts horizontally by
  `offset` × period width (running-bond brickwork).
- `'drop'` — each successive repeat **column** shifts vertically by
  `offset` × period height (half-drop wallpaper).

`offset` is a fraction of the period (rounded to whole cells so gaps stay
aligned). `0.5` gives the classic half-brick / half-drop; other fractions
accumulate into staircase / diagonal tessellations that realign every
`1/offset` repeats. Offset patterns also make the seam much harder to spot,
since adjacent repeats no longer line up. The base copy (`kx = 0, ky = 0`)
is always unshifted, so editing and patterns compose cleanly.

Constraints:

- Loop mode requires **finite** `cols`/`rows`; combining it with
  `infiniteX`/`infiniteY` throws.
- Both axes always wrap together.
- Out-of-flow tiles (`position: 'absolute' | 'fixed' | 'sticky'`) do not loop
  and are not rendered by the loop surface.
- Group drag and draw-to-create are disabled while looping.
- A perfectly hole-free tiling may not exist for every mix of tile sizes
  (e.g. a single 3×3 plus a single 1×1 can never fill a rectangle); in that
  case `pack()` minimizes holes and any residual holes show the background.

## No native scroll

The loop surface renders an overflow-hidden viewport with a single
transform-translated plane inside it — there are **no scrollbars and no
scrollable overflow**, so loop mode can never grow the page or fight the
browser's scroll position. Wheel/trackpad input is intercepted and fed into
the camera, so scrolling still feels native; drag-to-pan (with momentum) is
on by default and configurable via `physics.dragPan`.

## Interaction modes

`'edit'` is **ghost edit**: only the base copy of the content is interactive,
with ordinary (non-wrapped) grid semantics. The surrounding repeats render
live — you see seams and patterns update as you arrange — but they are
pointer-transparent, dimmed, and marked with `data-griddle-ghost` for custom
styling. Dragging a ghost pans the camera, exactly like the background.

| | `'pan'` (viewer) | `'edit'` (ghost edit) |
|---|---|---|
| Drag on base-copy tiles | Pans the camera (momentum fling on release) | Drags the tile (plain grid semantics) |
| Drag on ghost repeats | Pans the camera | Pans the camera |
| Drag on background | Pans the camera | Pans the camera (and clears selection) |
| Wheel / trackpad | Moves the camera | Moves the camera |
| Resize handles | Hidden | Shown on the base copy only |
| Selection | Off | Click / Cmd-click on the base copy |

Flip the mode from your app's auth state — griddle has no concept of users:

```ts
grid.updateConfig({ loop: { enabled: true, interaction: isOwner ? 'edit' : 'pan' } });
```

## How it works ("object looping")

The packed content is one **period** of an infinite plane. Adapters render
*tile instances* — copies of each tile offset by whole periods (plus the
pattern shift for brick/drop) — for whatever window the camera can see, so
the same tile may appear more than once when the viewport is larger than the
period.

The camera is an unbounded offset owned by a `PanController` (headless,
zero-dependency). Each animation frame the adapter:

1. ticks the controller (drag follow + inertia / ease physics),
2. writes `transform: translate3d(-x, -y, 0)` to the plane element,
3. re-virtualizes instances when the camera crosses a cell boundary.

Instance keys are world-stable (`tileId@kx,ky` period indices), so DOM nodes
are reused while panning instead of remounting.

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
  loopBounds,          // content bounding box in cells (the period)
  loopPeriod,          // pixel size of one period
  loopShift,           // brick/drop pattern shift per repeat (px)
  loopInstances,       // visible tile copies for a view rect (pattern-aware)
  wrapCell, wrapValue, // modulo helpers
  resolveLoop,         // LoopConfig + defaults
  PanController,       // unbounded camera with drag/inertia physics
} from '@griddle/core';
```

A custom renderer (canvas, WebGL, …) only needs `PanController` for the camera
and `loopInstances` to know what to draw where.

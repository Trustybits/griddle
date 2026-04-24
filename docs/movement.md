# Movement ruleset

When a tile is dragged and released over a target position, Griddle evaluates the drop in this order.

## Rule 1 — empty space
If every cell the tile would occupy at the target is empty (or only overlapped by the tile itself), place it there. No other tiles move.

## Rule 2 — swap on adjacent same-footprint
If the target overlaps exactly one other tile, and that tile is **adjacent** to the dragging tile's **origin** (8-neighbor), and both tiles have the **same footprint** (`w × h`), swap their positions. This is the only swap condition.

## Rule 3 — non-adjacent occupied target
If the target is occupied but the origin is not adjacent, the occupying tile(s) must yield. For each occupier, try priorities 4 → 5 → 6 in turn.

## Priority order

Let `origin` be the dragged tile's starting position and `target` be the drop position. For each occupier we compute a ranked list of 8 neighboring slots:

| Rank | Direction                                                              |
| ---- | ---------------------------------------------------------------------- |
| 1    | **Face** closest to origin                                             |
| 2    | **Face** opposite of rank 1                                            |
| 3    | Upwards face if origin is horizontal; right face if vertical/corner    |
| 4    | The remaining face                                                     |
| 5,6  | **Corners** closest to origin                                          |
| 7,8  | **Corners** furthest from origin                                       |

## Rule 4 — face displacement
Walk ranks 1–4. For each, if the neighboring slot at that face (with the occupier's footprint) is empty, move the occupier there. Stop.

## Rule 5 — corner displacement
If no face worked, walk ranks 5–8 (corners). If the diagonal neighbor slot is empty, move there. Stop.

## Rule 6 — push chain
If no neighbor slot is empty:
- **On an infinite axis**: push all tiles in the priority-1 direction by one unit until the target is clear.
- **On a fixed grid (no infinite axis)**: run a bounded **0-1 BFS** that searches for a sequence of single-cell displacements (edges cost 0 when moving into empty space, 1 when colliding into another tile) that frees the target. The lowest-cost solution wins. If no solution exists within `maxRepackHops` (default 64) or at all, the move is rejected and the tile snaps back to origin.

## Compaction (gravity)

If `gravity` is set (`'top' | 'bottom' | 'left' | 'right' | { col,row } | 'none'`), after any successful move each tile that has an empty cell between it and the gravity anchor is pulled toward the anchor until it either hits another tile or the edge/anchor.

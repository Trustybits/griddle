// Compaction (gravity) — pull tiles toward a configured edge or anchor cell.
//
// Runs after moves/adds/removes when gravity is not 'none'. Iteratively moves
// each tile one step toward the gravity anchor until no tile can move any closer.
import { rectsOverlap, tileRect } from './geometry.js';
export function compact(grid) {
    const gravity = grid.config.gravity ?? 'none';
    if (gravity === 'none')
        return [];
    const moved = new Set();
    // Iteratively move tiles one cell toward anchor; stop when no tile moves.
    for (let iter = 0; iter < 10000; iter++) {
        let anyMoved = false;
        // Order tiles so that those closest to the anchor move first — otherwise
        // a further tile may try to move into a cell not yet vacated by the closer one.
        const ordered = [...grid.tiles].sort((a, b) => distanceToAnchor(a, gravity) - distanceToAnchor(b, gravity));
        for (const t of ordered) {
            const step = stepToward(t, gravity);
            if (!step)
                continue;
            const newRect = {
                col: t.col + step.dx,
                row: t.row + step.dy,
                w: t.w,
                h: t.h,
            };
            if (!grid.rectInBounds(newRect))
                continue;
            const overlap = grid.tiles.filter((o) => o.id !== t.id && rectsOverlap(tileRect(o), newRect));
            if (overlap.length > 0)
                continue;
            grid._setTilePos(t.id, { col: newRect.col, row: newRect.row });
            moved.add(t.id);
            anyMoved = true;
        }
        if (!anyMoved)
            break;
    }
    return Array.from(moved);
}
function stepToward(t, gravity) {
    if (gravity === 'none')
        return null;
    if (gravity === 'top')
        return t.row > 0 ? { dx: 0, dy: -1 } : null;
    if (gravity === 'left')
        return t.col > 0 ? { dx: -1, dy: 0 } : null;
    if (gravity === 'bottom')
        return { dx: 0, dy: 1 };
    if (gravity === 'right')
        return { dx: 1, dy: 0 };
    // Anchor cell
    const dx = Math.sign(gravity.col - t.col);
    const dy = Math.sign(gravity.row - t.row);
    // Move along the axis with the greater distance first so we take the shortest path.
    const adx = Math.abs(gravity.col - t.col);
    const ady = Math.abs(gravity.row - t.row);
    if (adx === 0 && dy === 0)
        return null;
    if (adx >= ady && dx !== 0)
        return { dx, dy: 0 };
    if (dy !== 0)
        return { dx: 0, dy };
    if (dx !== 0)
        return { dx, dy: 0 };
    return null;
}
function distanceToAnchor(t, gravity) {
    if (gravity === 'none')
        return 0;
    if (gravity === 'top')
        return t.row;
    if (gravity === 'bottom')
        return -t.row;
    if (gravity === 'left')
        return t.col;
    if (gravity === 'right')
        return -t.col;
    // Manhattan distance to anchor cell
    return Math.abs(gravity.col - t.col) + Math.abs(gravity.row - t.row);
}
//# sourceMappingURL=compaction.js.map
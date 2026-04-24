// 0-1 BFS repack solver.
//
// Called when Rules 1-5 fail and the grid has no infinite axis available for
// the Rule-6 push direction. We search for a sequence of single-cell tile moves
// that frees `target` for the dragged tile, preferring sequences with the fewest
// total displacements (0-1 BFS: an edge that moves a tile into a previously-empty
// cell costs 0, an edge that displaces another tile costs 1).
//
// This is bounded by `config.maxRepackHops` — if we can't solve within budget,
// the move is rejected.
//
// Search state is the full positions-map of all tiles. To keep it manageable we:
//   - only move tiles that are in the "affected set" (tiles we've had to touch)
//   - limit move-candidate directions per tile to the 8 priority directions
//   - use a stringified key of the positions of the affected set for visited checks.
import { directionStep, priorityDirections, rectsOverlap, } from './geometry.js';
export function solvePushBFS(grid, tileId, target, originRect) {
    const drag = grid.getTile(tileId);
    if (!drag)
        return false;
    const tilesArr = grid.tiles;
    const byId = new Map(tilesArr.map((t) => [t.id, t]));
    const targetRect = {
        col: target.col,
        row: target.row,
        w: drag.w,
        h: drag.h,
    };
    const priorityDirs = priorityDirections(originRect, targetRect);
    const maxHops = grid.config.maxRepackHops ?? 64;
    // Initial state: real grid positions.
    const initial = {
        positions: new Map(tilesArr.map((t) => [t.id, { col: t.col, row: t.row }])),
        touched: new Set(),
        cost: 0,
    };
    const visited = new Map(); // key -> best cost
    // 0-1 BFS uses a deque: 0-cost edges push_front, 1-cost edges push_back.
    const deque = [initial];
    const goalSatisfied = (s) => {
        for (const [id, pos] of s.positions) {
            if (id === tileId)
                continue;
            const t = byId.get(id);
            const rect = { col: pos.col, row: pos.row, w: t.w, h: t.h };
            if (rectsOverlap(rect, targetRect))
                return false;
        }
        return true;
    };
    while (deque.length > 0) {
        const s = deque.shift();
        const key = stateKey(s.positions, s.touched);
        const prev = visited.get(key);
        if (prev !== undefined && prev <= s.cost)
            continue;
        visited.set(key, s.cost);
        if (goalSatisfied(s)) {
            // Commit. Apply all positions back to the grid, then move the dragger.
            for (const [id, pos] of s.positions) {
                if (id === tileId)
                    continue;
                grid._setTilePos(id, pos);
            }
            grid._setTilePos(tileId, target);
            return true;
        }
        if (s.cost >= maxHops)
            continue;
        // Find an overlapper on targetRect — that's what we must dislodge this step.
        let occupier = null;
        for (const [id, pos] of s.positions) {
            if (id === tileId)
                continue;
            const t = byId.get(id);
            const rect = { col: pos.col, row: pos.row, w: t.w, h: t.h };
            if (rectsOverlap(rect, targetRect)) {
                occupier = t;
                break;
            }
        }
        if (!occupier)
            continue;
        // Try priority directions on the occupier.
        for (const dir of priorityDirs) {
            const child = tryMoveInState(s, occupier.id, dir, byId, grid, tileId);
            if (!child)
                continue;
            const wasTouched = s.touched.has(occupier.id);
            const edgeCost = wasTouched ? 0 : 1;
            const newCost = s.cost + edgeCost;
            const nextKey = stateKey(child.positions, child.touched);
            const prevBest = visited.get(nextKey);
            if (prevBest !== undefined && prevBest <= newCost)
                continue;
            child.cost = newCost;
            if (edgeCost === 0)
                deque.unshift(child);
            else
                deque.push(child);
        }
        // Also allow moving a *chain* overlapper — if the occupier can't be moved directly,
        // try pushing a neighbor tile to free up its destination. Iterate all touched or
        // occupier-adjacent tiles and try each in a priority direction.
        const candidates = new Set([occupier.id, ...s.touched]);
        for (const candId of candidates) {
            if (candId === tileId)
                continue;
            for (const dir of priorityDirs) {
                const child = tryMoveInState(s, candId, dir, byId, grid, tileId);
                if (!child)
                    continue;
                const wasTouched = s.touched.has(candId);
                const edgeCost = wasTouched ? 0 : 1;
                const newCost = s.cost + edgeCost;
                const nextKey = stateKey(child.positions, child.touched);
                const prevBest = visited.get(nextKey);
                if (prevBest !== undefined && prevBest <= newCost)
                    continue;
                child.cost = newCost;
                if (edgeCost === 0)
                    deque.unshift(child);
                else
                    deque.push(child);
            }
        }
    }
    return false;
}
/**
 * Attempt to move `moveId` one cell in `dir` in the given state. Returns a new
 * state on success or null if the move is blocked (out of bounds or would overlap
 * a non-moveable tile). For simplicity we only allow a single tile move per step;
 * if another tile is in the way, that becomes the next BFS node to address rather
 * than being recursively pushed here.
 */
function tryMoveInState(s, moveId, dir, byId, grid, draggerId) {
    const pos = s.positions.get(moveId);
    if (!pos)
        return null;
    const t = byId.get(moveId);
    const { dx, dy } = directionStep(dir);
    const newRect = {
        col: pos.col + dx,
        row: pos.row + dy,
        w: t.w,
        h: t.h,
    };
    if (!grid.rectInBounds(newRect))
        return null;
    // Must not overlap any other tile (except self and the dragger's original spot — dragger is "floating")
    for (const [id, p] of s.positions) {
        if (id === moveId || id === draggerId)
            continue;
        const ot = byId.get(id);
        const oRect = { col: p.col, row: p.row, w: ot.w, h: ot.h };
        if (rectsOverlap(oRect, newRect))
            return null;
    }
    const nextPositions = new Map(s.positions);
    nextPositions.set(moveId, { col: newRect.col, row: newRect.row });
    const nextTouched = new Set(s.touched);
    nextTouched.add(moveId);
    return {
        positions: nextPositions,
        touched: nextTouched,
        cost: s.cost, // caller sets
    };
}
function stateKey(positions, touched) {
    const parts = [];
    const ids = Array.from(positions.keys()).sort();
    for (const id of ids) {
        const p = positions.get(id);
        parts.push(`${id}:${p.col},${p.row}`);
    }
    return parts.join('|') + '#' + Array.from(touched).sort().join(',');
}
//# sourceMappingURL=repack.js.map
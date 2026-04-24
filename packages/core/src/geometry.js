// Rect / footprint / priority math. Pure functions only — no state.
/** Does rect `a` overlap rect `b`? */
export function rectsOverlap(a, b) {
    return (a.col < b.col + b.w &&
        a.col + a.w > b.col &&
        a.row < b.row + b.h &&
        a.row + a.h > b.row);
}
/** Does rect `outer` fully contain rect `inner`? */
export function rectContains(outer, inner) {
    return (inner.col >= outer.col &&
        inner.row >= outer.row &&
        inner.col + inner.w <= outer.col + outer.w &&
        inner.row + inner.h <= outer.row + outer.h);
}
export function rectEquals(a, b) {
    return a.col === b.col && a.row === b.row && a.w === b.w && a.h === b.h;
}
/** Two tiles are "adjacent" if their rects share at least a corner touch (8-neighbor). */
export function rectsAdjacent(a, b) {
    if (rectsOverlap(a, b))
        return false;
    const horizTouch = (a.col + a.w === b.col || b.col + b.w === a.col) &&
        a.row < b.row + b.h &&
        a.row + a.h > b.row;
    const vertTouch = (a.row + a.h === b.row || b.row + b.h === a.row) &&
        a.col < b.col + b.w &&
        a.col + a.w > b.col;
    const cornerTouch = (a.col + a.w === b.col || b.col + b.w === a.col) &&
        (a.row + a.h === b.row || b.row + b.h === a.row);
    return horizTouch || vertTouch || cornerTouch;
}
export function tileRect(t) {
    return { col: t.col, row: t.row, w: t.w, h: t.h };
}
/** Delta from origin's center to target's center, both as cell centers. */
function centerDelta(origin, target) {
    const ox = origin.col + origin.w / 2;
    const oy = origin.row + origin.h / 2;
    const tx = target.col + target.w / 2;
    const ty = target.row + target.h / 2;
    return { dx: tx - ox, dy: ty - oy };
}
/** Face closest to origin from target's perspective. */
export function faceClosestToOrigin(origin, target) {
    const { dx, dy } = centerDelta(origin, target);
    // target->origin: negate
    const ox = -dx;
    const oy = -dy;
    if (Math.abs(ox) >= Math.abs(oy)) {
        return ox >= 0 ? 'e' : 'w';
    }
    return oy >= 0 ? 's' : 'n';
}
/** Opposite face. */
export function oppositeFace(f) {
    if (f === 'n')
        return 's';
    if (f === 's')
        return 'n';
    if (f === 'e')
        return 'w';
    return 'e';
}
export function classifyOrigin(origin, target) {
    const { dx, dy } = centerDelta(origin, target);
    const horiz = Math.abs(dx) > 1e-9;
    const vert = Math.abs(dy) > 1e-9;
    if (horiz && vert)
        return 'corner';
    if (horiz)
        return 'horizontal';
    return 'vertical';
}
/** Is corner `c` on the side of origin? */
function cornerDistToOrigin(origin, target, c) {
    // Corner position as the center of the 1x1 slot diagonally adjacent.
    const cx = c === 'nw' || c === 'sw'
        ? target.col - 0.5
        : target.col + target.w + 0.5;
    const cy = c === 'nw' || c === 'ne'
        ? target.row - 0.5
        : target.row + target.h + 0.5;
    const ox = origin.col + origin.w / 2;
    const oy = origin.row + origin.h / 2;
    const dx = cx - ox;
    const dy = cy - oy;
    return dx * dx + dy * dy;
}
/**
 * Return the 8 displacement directions for a tile at `target` being pushed
 * by a drag originating at `origin`, ordered by the priority spec.
 */
export function priorityDirections(origin, target) {
    const faceClosest = faceClosestToOrigin(origin, target);
    const faceOpposite = oppositeFace(faceClosest);
    const kind = classifyOrigin(origin, target);
    // 3rd priority: upwards face if origin horizontal, right face otherwise
    // but excluding already-chosen faces
    const allFaces = ['n', 's', 'e', 'w'];
    const used = new Set([faceClosest, faceOpposite]);
    let third;
    if (kind === 'horizontal') {
        third = used.has('n') ? pickRemaining(allFaces, used) : 'n';
    }
    else {
        third = used.has('e') ? pickRemaining(allFaces, used) : 'e';
    }
    used.add(third);
    const fourth = pickRemaining(allFaces, used);
    // Corners: rank closest-2 then furthest-2
    const corners = ['nw', 'ne', 'sw', 'se'];
    const cornerRanked = corners
        .map((c) => ({ c, d: cornerDistToOrigin(origin, target, c) }))
        .sort((a, b) => a.d - b.d);
    const closeCorners = cornerRanked.slice(0, 2).map((x) => x.c);
    const farCorners = cornerRanked.slice(2).map((x) => x.c);
    return [
        faceClosest,
        faceOpposite,
        third,
        fourth,
        closeCorners[0],
        closeCorners[1],
        farCorners[0],
        farCorners[1],
    ];
}
function pickRemaining(all, used) {
    for (const f of all)
        if (!used.has(f))
            return f;
    return all[0];
}
/** Translate a rect by a direction (one unit). */
export function translateRect(r, dir) {
    let dcol = 0;
    let drow = 0;
    if (dir === 'n' || dir === 'nw' || dir === 'ne')
        drow = -1;
    if (dir === 's' || dir === 'sw' || dir === 'se')
        drow = 1;
    if (dir === 'w' || dir === 'nw' || dir === 'sw')
        dcol = -1;
    if (dir === 'e' || dir === 'ne' || dir === 'se')
        dcol = 1;
    return { col: r.col + dcol, row: r.row + drow, w: r.w, h: r.h };
}
/** Translate by arbitrary cell offset. */
export function offsetRect(r, dcol, drow) {
    return { col: r.col + dcol, row: r.row + drow, w: r.w, h: r.h };
}
/** Stepwise offset for a direction (dx, dy in cells, -1..1). */
export function directionStep(dir) {
    const r = translateRect({ col: 0, row: 0, w: 0, h: 0 }, dir);
    return { dx: r.col, dy: r.row };
}
export function footprintEquals(a, b) {
    return a.w === b.w && a.h === b.h;
}
export function clonePos(p) {
    return { col: p.col, row: p.row };
}
//# sourceMappingURL=geometry.js.map
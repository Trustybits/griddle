// Grid: the central state holder. Holds config + tiles and exposes a mutation API.
// All geometry/movement/compaction logic lives in sibling modules; Grid just orchestrates.
import { Emitter } from './events.js';
import { directionStep, priorityDirections, rectsOverlap, tileRect, } from './geometry.js';
import { moveTile as moveEngine } from './movement.js';
import { compact as compactEngine } from './compaction.js';
function defaultConfig(c) {
    return {
        infiniteX: c.infiniteX ?? c.cols === Infinity,
        infiniteY: c.infiniteY ?? c.rows === Infinity,
        gap: c.gap ?? 0,
        gravity: c.gravity ?? 'none',
        resizeHandles: c.resizeHandles ?? ['se'],
        snapDuringDrag: c.snapDuringDrag ?? true,
        maxRepackHops: c.maxRepackHops ?? 64,
        ...c,
    };
}
function findNearestFreeCell(grid, victim, avoid, selfId) {
    const visited = new Set();
    const queue = [{ col: victim.col, row: victim.row }];
    let iters = 0;
    while (queue.length > 0 && iters++ < 512) {
        const p = queue.shift();
        const key = `${p.col},${p.row}`;
        if (visited.has(key))
            continue;
        visited.add(key);
        const rect = { col: p.col, row: p.row, w: victim.w, h: victim.h };
        if (grid.rectInBounds(rect)) {
            const hits = grid.tilesIn(rect, new Set([victim.id, selfId]));
            if (hits.length === 0 && !rectsOverlap(rect, avoid)) {
                return p;
            }
        }
        queue.push({ col: p.col + 1, row: p.row });
        queue.push({ col: p.col - 1, row: p.row });
        queue.push({ col: p.col, row: p.row + 1 });
        queue.push({ col: p.col, row: p.row - 1 });
    }
    return null;
}
export class Grid {
    constructor(config, initialTiles = []) {
        this.tilesById = new Map();
        this.changes = new Emitter();
        this.config = defaultConfig(config);
        for (const t of initialTiles)
            this.tilesById.set(t.id, { ...t });
    }
    // ---- config -------------------------------------------------------------
    updateConfig(patch) {
        this.config = defaultConfig({ ...this.config, ...patch });
        this.changes.emit({ type: 'config', tileIds: [] });
    }
    // ---- tile queries -------------------------------------------------------
    get tiles() {
        return Array.from(this.tilesById.values());
    }
    getTile(id) {
        return this.tilesById.get(id);
    }
    tilesIn(rect, exclude = new Set()) {
        const out = [];
        for (const t of this.tilesById.values()) {
            if (exclude.has(t.id))
                continue;
            if (rectsOverlap(rect, tileRect(t)))
                out.push(t);
        }
        return out;
    }
    rectInBounds(rect) {
        const { cols, rows, infiniteX, infiniteY } = this.config;
        if (!infiniteX) {
            if (rect.col < 0 || rect.col + rect.w > cols)
                return false;
        }
        else {
            if (rect.col < 0)
                return false;
        }
        if (!infiniteY) {
            if (rect.row < 0 || rect.row + rect.h > rows)
                return false;
        }
        else {
            if (rect.row < 0)
                return false;
        }
        return true;
    }
    // ---- mutations ---------------------------------------------------------
    addTile(tile) {
        if (this.tilesById.has(tile.id)) {
            throw new Error(`Griddle: duplicate tile id "${tile.id}"`);
        }
        this.tilesById.set(tile.id, { ...tile });
        this.changes.emit({ type: 'add', tileIds: [tile.id] });
        if (this.config.gravity && this.config.gravity !== 'none') {
            this.compactAll();
        }
    }
    removeTile(id) {
        if (!this.tilesById.has(id))
            return;
        this.tilesById.delete(id);
        this.changes.emit({ type: 'remove', tileIds: [id] });
        if (this.config.gravity && this.config.gravity !== 'none') {
            this.compactAll();
        }
    }
    _setTilePos(id, pos) {
        const t = this.tilesById.get(id);
        if (!t)
            return;
        t.col = pos.col;
        t.row = pos.row;
    }
    _setTileRect(id, rect) {
        const t = this.tilesById.get(id);
        if (!t)
            return;
        t.col = rect.col;
        t.row = rect.row;
        t.w = rect.w;
        t.h = rect.h;
    }
    moveTile(id, target) {
        const tile = this.tilesById.get(id);
        if (!tile)
            return false;
        if (tile.col === target.col && tile.row === target.row)
            return true;
        const ok = moveEngine(this, id, target);
        if (ok) {
            this.changes.emit({ type: 'move', tileIds: this.tiles.map((t) => t.id) });
            if (this.config.gravity && this.config.gravity !== 'none') {
                this.compactAll();
            }
        }
        return ok;
    }
    resizeTile(id, size) {
        const tile = this.tilesById.get(id);
        if (!tile)
            return false;
        const clamped = {
            w: Math.max(tile.minW ?? 1, Math.min(tile.maxW ?? 1000000, Math.floor(size.w))),
            h: Math.max(tile.minH ?? 1, Math.min(tile.maxH ?? 1000000, Math.floor(size.h))),
        };
        if (clamped.w === tile.w && clamped.h === tile.h)
            return true;
        const newRect = {
            col: tile.col,
            row: tile.row,
            w: clamped.w,
            h: clamped.h,
        };
        if (!this.rectInBounds(newRect))
            return false;
        const snapshot = this.snapshotTiles();
        tile.w = clamped.w;
        tile.h = clamped.h;
        const overlapping = this.tilesIn(newRect, new Set([id]));
        for (const victim of overlapping) {
            const priorityDirs = priorityDirections(newRect, tileRect(victim));
            const steps = priorityDirs.map(directionStep);
            let placed = false;
            // Walk each priority direction outward; the first legal placement wins.
            for (const step of steps) {
                if (step.dx === 0 && step.dy === 0)
                    continue;
                let cursor = { col: victim.col, row: victim.row };
                for (let k = 0; k < 128 && !placed; k++) {
                    cursor = { col: cursor.col + step.dx, row: cursor.row + step.dy };
                    const rect = {
                        col: cursor.col,
                        row: cursor.row,
                        w: victim.w,
                        h: victim.h,
                    };
                    if (!this.rectInBounds(rect))
                        break;
                    const blocked = this.tilesIn(rect, new Set([victim.id, id]));
                    if (blocked.length === 0 && !rectsOverlap(rect, newRect)) {
                        this._setTilePos(victim.id, cursor);
                        placed = true;
                    }
                }
                if (placed)
                    break;
            }
            if (!placed) {
                // Fallback: find nearest free cell anywhere.
                const fallback = findNearestFreeCell(this, victim, newRect, id);
                if (fallback) {
                    this._setTilePos(victim.id, fallback);
                    placed = true;
                }
            }
            if (!placed) {
                this.restoreTiles(snapshot);
                return false;
            }
        }
        this.changes.emit({ type: 'resize', tileIds: [id] });
        if (this.config.gravity && this.config.gravity !== 'none')
            this.compactAll();
        return true;
    }
    // ---- snapshots ---------------------------------------------------------
    snapshotTiles() {
        const m = new Map();
        for (const [id, t] of this.tilesById)
            m.set(id, { ...t });
        return m;
    }
    restoreTiles(snap) {
        this.tilesById.clear();
        for (const [id, t] of snap)
            this.tilesById.set(id, { ...t });
    }
    // ---- compaction -------------------------------------------------------
    compactAll() {
        const moved = compactEngine(this);
        if (moved.length > 0) {
            this.changes.emit({ type: 'compact', tileIds: moved });
        }
    }
    // ---- serialization ----------------------------------------------------
    toJSON() {
        return {
            version: 1,
            config: { ...this.config },
            tiles: this.tiles.map((t) => ({ ...t })),
        };
    }
    static fromJSON(snap) {
        if (snap.version !== 1) {
            throw new Error(`Griddle: unsupported snapshot version ${snap.version}`);
        }
        const g = new Grid(snap.config, snap.tiles);
        g.changes.emit({ type: 'load', tileIds: g.tiles.map((t) => t.id) });
        return g;
    }
}
//# sourceMappingURL=grid.js.map